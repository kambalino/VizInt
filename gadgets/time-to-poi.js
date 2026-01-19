/*
 * $VER: Time to POI Gadget v0.2.0 (2026-01-18)
 * $DESCRIPTION:
 * Multi-instance gadget that displays live “time-to-drive” estimates from an origin to configured POIs.
 * v0.2.0 adds:
 *  - TomTom provider (routing + geocoding) when key is present
 *  - Address-first POI editor with auto-geocoding on Save
 *  - Routing guard: never routes unresolved POIs (prevents 0,0 / 400 spam)
 *  - Clear degraded states: OFFLINE / BLOCKED / NEEDS CONFIG / RATE LIMITED / UNRESOLVED
 *
 * $HISTORY:
 * 2026/01/18  0.2.0  TomTom-first (when key present) + address-first POIs + auto-geocode + routing guard.
 * 2026/01/16  0.1.0  OSRM-first baseline.
 */

(function () {
  "use strict";

  const manifest = {
    _api: "1.0",
    _class: "time-to-poi",
    _type: "multi",
    _id: "default",
    _ver: "0.2.0",
    label: "Time to POI",
    iconEmoji: "🚗",
    capabilities: ["network", "atlas"],
    supportsSettings: true,
    verBlurb: "TomTom-first when key present; address-first POIs with auto-geocoding; OSRM fallback.",
  };

  // Per-instance runtime state (no global singletons)
  const STATE = new WeakMap();

  function nowMs() { return Date.now(); }

  function clamp(n, lo, hi) {
    n = Number(n);
    if (!isFinite(n)) return lo;
    return Math.max(lo, Math.min(hi, n));
  }

  function safeJsonClone(x) {
    try { return JSON.parse(JSON.stringify(x)); }
    catch (_) { return x; }
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function defaultSettings() {
    return {
      // Stored provider is advisory; effective provider is resolved per-instance (TomTom if key present)
      provider: "osrm", // "osrm" | "tomtom" | "custom" (custom is OSRM-compatible URL)
      refreshSeconds: 300,
      paused: false,

      endpoints: {
        osrmBaseUrl: "https://router.project-osrm.org",
        tomtomBaseUrl: "https://api.tomtom.com",
        nominatimUrl: "https://nominatim.openstreetmap.org/search",
      },

      origin: {
        mode: "currentLocation",
        label: "Current location",
        fixed: { lat: null, lon: null },
      },

      pois: [],

      display: {
        maxItems: 6,
        sort: "asEntered", // "asEntered" | "shortestETA" | "alpha"
        showLastUpdated: true,
      },

      privacy: {
        allowLocation: true,
        redactExactCoordsInUI: false,
      },

      // Interim secret storage (explicitly allowed by user for now): store TomTom key here.
      // Future VizInt secrets support could resolve apiKeyRef instead.
      auth: {
        apiKeyRef: "",
        apiKey: {
          tomtom: "",
        },
      },

      _cache: {
        lastUpdatedMs: 0,
        resultsByPoiId: {},
      },
    };
  }

  function deepMergeDefaults(obj, def) {
    if (obj == null || typeof obj !== "object") return safeJsonClone(def);
    const out = Array.isArray(def) ? (Array.isArray(obj) ? obj : []) : obj;
    for (const k in def) {
      const dv = def[k];
      const ov = out[k];
      if (ov === undefined) {
        out[k] = safeJsonClone(dv);
      } else if (dv && typeof dv === "object" && !Array.isArray(dv)) {
        out[k] = deepMergeDefaults(ov, dv);
      }
    }
    return out;
  }

  function getSettings(ctx) {
    const def = defaultSettings();
    const s = ctx.getSettings ? ctx.getSettings("settings", def) : def;
    return deepMergeDefaults(safeJsonClone(s), def);
  }

  function setSettings(ctx, nextSettings) {
    if (!ctx.setSettings) return;
    ctx.setSettings({ settings: nextSettings });
  }

  function formatMins(etaSeconds) {
    if (!isFinite(etaSeconds)) return "—";
    const mins = Math.round(etaSeconds / 60);
    return String(mins);
  }

  function formatKm(distanceMeters) {
    if (!isFinite(distanceMeters)) return "";
    const km = distanceMeters / 1000;
    const s = (km < 10) ? km.toFixed(1) : km.toFixed(0);
    return s + " km";
  }

  function parseCtxDisplayName(ctx) {
    const n = (ctx && ctx.name) ? String(ctx.name) : "";
    const parts = n.split(":");
    if (parts.length >= 3) return parts.slice(2).join(":");
    return manifest.label;
  }

  function mkEl(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === "class") el.className = attrs[k];
        else if (k === "style") el.setAttribute("style", attrs[k]);
        else if (k.startsWith("on") && typeof attrs[k] === "function") {
          el.addEventListener(k.slice(2), attrs[k]);
        } else {
          el.setAttribute(k, attrs[k]);
        }
      }
    }
    if (children != null) {
      if (Array.isArray(children)) children.forEach(c => appendChild(el, c));
      else appendChild(el, children);
    }
    return el;
  }

  function appendChild(parent, child) {
    if (child == null) return;
    if (typeof child === "string") parent.appendChild(document.createTextNode(child));
    else parent.appendChild(child);
  }

  function setText(el, s) {
    el.textContent = (s == null) ? "" : String(s);
  }

  function isProbablyFileProtocol() {
    try { return (location && location.protocol === "file:"); }
    catch (_) { return false; }
  }

  function mkBadge(text, kind) {
    const cls = "ttpt-badge " + (kind ? ("ttpt-" + kind) : "");
    return mkEl("span", { class: cls }, text);
  }

  function classifyFetchError(err) {
    if (!err) return { kind: "error", label: "ERROR" };
    const msg = String(err && err.message ? err.message : err);
    if (msg.toLowerCase().includes("failed to fetch") || err.name === "TypeError") {
      return { kind: "blocked", label: "BLOCKED (CORS/NETWORK)" };
    }
    return { kind: "error", label: "ERROR" };
  }

  function trimTrailingSlash(s) {
    s = String(s || "");
    while (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  }

  // --- Provider priority resolver (per instance) ---
  function getTomTomKey(settings, ctx) {
    // Interim: key stored in settings
    const direct = settings && settings.auth && settings.auth.apiKey && settings.auth.apiKey.tomtom;
    const directKey = direct ? String(direct).trim() : "";
    if (directKey) return directKey;

    // Future-proof: allow a secret resolver if VizInt adds it
    const ref = settings && settings.auth && settings.auth.apiKeyRef ? String(settings.auth.apiKeyRef).trim() : "";
    if (ref && ctx && typeof ctx.getSecret === "function") {
      try {
        const v = ctx.getSecret(ref);
        if (v) return String(v).trim();
      } catch (_) {}
    }

    return "";
  }

  function resolveEffectiveProvider(settings, ctx) {
    const key = getTomTomKey(settings, ctx);
    if (key) return "tomtom";
    // Keep old behavior: default to osrm even if broken (user asked to fix later)
    const p = (settings && settings.provider) ? String(settings.provider) : "osrm";
    return p || "osrm";
  }

  // ---- Geocoding ----
  // Nominatim requires a User-Agent. Keep short; replace if you have a VizInt standard.
  async function geocodeNominatimOne(query, nominatimUrl, timeoutMs) {
    const url = (nominatimUrl || "https://nominatim.openstreetmap.org/search")
      + "?format=json&limit=1&q=" + encodeURIComponent(query);

    const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    const t = timeoutMs ? setTimeout(() => { try { ctrl && ctrl.abort(); } catch {} }, timeoutMs) : null;

    try {
      const resp = await fetch(url, {
        signal: ctrl ? ctrl.signal : undefined,
        headers: {
          "User-Agent": "VizInt-TimeToPOI/0.2 (no-email)",
        },
      });

      if (!resp.ok) return { ok: false, code: resp.status, lat: null, lon: null };
      const data = await resp.json();
      if (!data || !data.length) return { ok: false, code: 404, lat: null, lon: null };
      const lat = Number(data[0].lat);
      const lon = Number(data[0].lon);
      if (!isFinite(lat) || !isFinite(lon)) return { ok: false, code: 422, lat: null, lon: null };
      return { ok: true, code: 200, lat, lon };
    } catch (e) {
      return { ok: false, code: 0, lat: null, lon: null };
    } finally {
      if (t) clearTimeout(t);
    }
  }

  async function geocodeTomTomOne(query, tomtomBaseUrl, apiKey, timeoutMs) {
    const base = trimTrailingSlash(tomtomBaseUrl || "https://api.tomtom.com");
    const url = base + "/search/2/geocode/" + encodeURIComponent(query) + ".json?limit=1&key=" + encodeURIComponent(apiKey);

    const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
    const t = timeoutMs ? setTimeout(() => { try { ctrl && ctrl.abort(); } catch {} }, timeoutMs) : null;

    try {
      const resp = await fetch(url, { signal: ctrl ? ctrl.signal : undefined, method: "GET" });
      if (!resp.ok) return { ok: false, code: resp.status, lat: null, lon: null };
      const data = await resp.json();
      const r0 = data && data.results && data.results[0];
      const pos = r0 && r0.position;
      const lat = pos ? Number(pos.lat) : NaN;
      const lon = pos ? Number(pos.lon) : NaN;
      if (!isFinite(lat) || !isFinite(lon)) return { ok: false, code: 404, lat: null, lon: null };
      return { ok: true, code: 200, lat, lon };
    } catch (e) {
      return { ok: false, code: 0, lat: null, lon: null };
    } finally {
      if (t) clearTimeout(t);
    }
  }

  async function geocodeOne(settings, ctx, query) {
    const q = String(query || "").trim();
    if (!q) return { ok: false, code: 400, lat: null, lon: null, provider: "none" };

    const key = getTomTomKey(settings, ctx);
    const endpoints = (settings && settings.endpoints) ? settings.endpoints : {};
    const tomtomBaseUrl = endpoints.tomtomBaseUrl || "https://api.tomtom.com";
    const nominatimUrl = endpoints.nominatimUrl || "https://nominatim.openstreetmap.org/search";

    // Prefer TomTom geocoder if key present, else Nominatim
    if (key) {
      const r = await geocodeTomTomOne(q, tomtomBaseUrl, key, 8000);
      return { ...r, provider: "tomtom" };
    }

    const r = await geocodeNominatimOne(q, nominatimUrl, 8000);
    return { ...r, provider: "nominatim" };
  }

  // ---- Origin resolution ----
  async function bestEffortGeo(ctx, settings) {
    const o = settings.origin || {};
    const privacy = settings.privacy || {};
    const allowLoc = !!privacy.allowLocation;

    if (o.mode === "fixed") {
      const f = o.fixed || {};
      if (isFinite(f.lat) && isFinite(f.lon)) return { lat: Number(f.lat), lon: Number(f.lon), source: "fixed" };
      return null;
    }

    if (allowLoc && navigator.geolocation && typeof navigator.geolocation.getCurrentPosition === "function") {
      const pos = await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (p) => resolve({ ok: true, p }),
          (e) => resolve({ ok: false, e }),
          { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
        );
      });
      if (pos && pos.ok && pos.p && pos.p.coords) {
        const lat = Number(pos.p.coords.latitude);
        const lon = Number(pos.p.coords.longitude);
        if (isFinite(lat) && isFinite(lon)) return { lat, lon, source: "geolocation" };
      }
    }

    try {
      if (ctx && ctx.libs && ctx.libs.Atlas && ctx.libs.Atlas.ready) {
        await ctx.libs.Atlas.ready;
        const geo = ctx.libs.Atlas.getBestGeo ? ctx.libs.Atlas.getBestGeo() : null;
        const lat = geo && (geo.lat ?? (geo.coords && geo.coords.lat));
        const lon = geo && (geo.lon ?? geo.lng ?? (geo.coords && (geo.coords.lon ?? geo.coords.lng)));
        if (isFinite(lat) && isFinite(lon)) return { lat: Number(lat), lon: Number(lon), source: "atlas" };
      }
    } catch (_) {}

    const f = (o.fixed || {});
    if (isFinite(f.lat) && isFinite(f.lon)) return { lat: Number(f.lat), lon: Number(f.lon), source: "fixed" };
    return null;
  }

  // ---- Routing providers ----
  function osrmRouteUrl(baseUrl, origin, dest) {
    const o = origin.lon + "," + origin.lat;
    const d = dest.lon + "," + dest.lat;
    const path = "/route/v1/driving/" + o + ";" + d;
    const qs = "?overview=false&alternatives=false&steps=false&annotations=false";
    return trimTrailingSlash(baseUrl) + path + qs;
  }

  function tomtomRouteUrl(tomtomBaseUrl, origin, dest, apiKey) {
    const base = trimTrailingSlash(tomtomBaseUrl || "https://api.tomtom.com");
    // TomTom expects lat,lon:lat,lon
    const loc = origin.lat + "," + origin.lon + ":" + dest.lat + "," + dest.lon;
    // traffic=true uses live traffic where available
    return base + "/routing/1/calculateRoute/" + encodeURIComponent(loc) + "/json?traffic=true&key=" + encodeURIComponent(apiKey);
  }

  async function routeOne(settings, ctx, origin, dest) {
    const effProvider = resolveEffectiveProvider(settings, ctx);
    const endpoints = settings.endpoints || {};
    const osrmBaseUrl = endpoints.osrmBaseUrl || "https://router.project-osrm.org";
    const tomtomBaseUrl = endpoints.tomtomBaseUrl || "https://api.tomtom.com";
    const tomtomKey = getTomTomKey(settings, ctx);

    if (effProvider === "tomtom") {
      if (!tomtomKey) return { status: "needsConfig", etaSeconds: NaN, distanceMeters: NaN };
      const url = tomtomRouteUrl(tomtomBaseUrl, origin, dest, tomtomKey);
      let resp;
      try {
        resp = await fetch(url, { method: "GET" });
      } catch (e) {
        const c = classifyFetchError(e);
        return { status: c.kind, etaSeconds: NaN, distanceMeters: NaN };
      }
      if (resp.status === 429) return { status: "rateLimited", etaSeconds: NaN, distanceMeters: NaN };
      if (!resp.ok) {
        const kind = (resp.status === 401 || resp.status === 403) ? "needsConfig" : "error";
        return { status: kind, etaSeconds: NaN, distanceMeters: NaN };
      }
      let data = null;
      try { data = await resp.json(); } catch (_) {}
      const r0 = data && data.routes && data.routes[0];
      const sum = r0 && r0.summary;
      const eta = sum && isFinite(sum.travelTimeInSeconds) ? Number(sum.travelTimeInSeconds) : NaN;
      const dist = sum && isFinite(sum.lengthInMeters) ? Number(sum.lengthInMeters) : NaN;
      if (isFinite(eta)) return { status: "ok", etaSeconds: eta, distanceMeters: dist };
      return { status: "error", etaSeconds: NaN, distanceMeters: NaN };
    }

    // OSRM fallback
    const url = osrmRouteUrl(osrmBaseUrl, origin, dest);
    let resp;
    try {
      resp = await fetch(url, { method: "GET" });
    } catch (e) {
      const c = classifyFetchError(e);
      return { status: c.kind, etaSeconds: NaN, distanceMeters: NaN };
    }
    if (resp.status === 429) return { status: "rateLimited", etaSeconds: NaN, distanceMeters: NaN };
    if (!resp.ok) return { status: "error", etaSeconds: NaN, distanceMeters: NaN };

    let data = null;
    try { data = await resp.json(); } catch (_) {}
    const route = data && data.routes && data.routes[0];
    if (route && isFinite(route.duration)) {
      return {
        status: "ok",
        etaSeconds: Number(route.duration),
        distanceMeters: isFinite(route.distance) ? Number(route.distance) : NaN,
      };
    }
    return { status: "error", etaSeconds: NaN, distanceMeters: NaN };
  }

  function sortPois(pois, resultsByPoiId, sortMode) {
    const list = pois.slice();
    if (sortMode === "alpha") {
      list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
      return list;
    }
    if (sortMode === "shortestETA") {
      list.sort((a, b) => {
        const ra = resultsByPoiId[a.id] || {};
        const rb = resultsByPoiId[b.id] || {};
        const ea = isFinite(ra.etaSeconds) ? ra.etaSeconds : 1e18;
        const eb = isFinite(rb.etaSeconds) ? rb.etaSeconds : 1e18;
        if (ea !== eb) return ea - eb;
        return String(a.name || "").localeCompare(String(b.name || ""));
      });
      return list;
    }
    return list;
  }

  function getDestLatLon(poi) {
    const d = poi && poi.destination ? poi.destination : null;
    if (!d) return null;
    const lat = Number(d.lat);
    const lon = Number(d.lon);
    if (!isFinite(lat) || !isFinite(lon)) return null;
    if (lat === 0 && lon === 0) return null;
    return { lat, lon };
  }

  function render(host, ctx) {
    const st = STATE.get(ctx);
    if (!st) return;

    const settings = getSettings(ctx);
    st.settings = settings;

    host.innerHTML = "";
    host.classList.add("ttpt-root");

    const title = parseCtxDisplayName(ctx);
    const headerLeft = mkEl("div", { class: "ttpt-title" }, title);

    const statusLine = mkEl("div", { class: "ttpt-statusline" });
    const badges = mkEl("div", { class: "ttpt-badges" });

    const btnRefresh = mkEl("button", {
      class: "ttpt-btn",
      type: "button",
      onclick: () => refreshNow(ctx, { reason: "manual" })
    }, "↻");

    const btnSettings = mkEl("button", {
      class: "ttpt-btn",
      type: "button",
      onclick: () => openSettings(ctx)
    }, "⚙");

    const btnPause = mkEl("button", {
      class: "ttpt-btn",
      type: "button",
      onclick: () => togglePaused(ctx)
    }, settings.paused ? "▶" : "⏸");

    const headerRight = mkEl("div", { class: "ttpt-actions" }, [btnRefresh, btnPause, btnSettings]);
    const header = mkEl("div", { class: "ttpt-header" }, [headerLeft, headerRight]);

    const body = mkEl("div", { class: "ttpt-body" });
    const list = mkEl("div", { class: "ttpt-list" });
    const foot = mkEl("div", { class: "ttpt-foot" });

    // Connectivity badge
    badges.appendChild(!navigator.onLine ? mkBadge("OFFLINE", "warn") : mkBadge("ONLINE", "ok"));
    if (isProbablyFileProtocol()) badges.appendChild(mkBadge("file://", "muted"));

    const enabledPois = (settings.pois || []).filter(p => p && p.enabled !== false);
    if (!enabledPois.length) badges.appendChild(mkBadge("NEEDS POIs", "warn"));

    const originMode = (settings.origin && settings.origin.mode) || "currentLocation";
    const fixedOk = settings.origin && settings.origin.fixed && isFinite(settings.origin.fixed.lat) && isFinite(settings.origin.fixed.lon);
    if (originMode === "fixed" && !fixedOk) badges.appendChild(mkBadge("NEEDS ORIGIN", "warn"));

    // Provider badge (effective)
    const effProvider = resolveEffectiveProvider(settings, ctx);
    badges.appendChild(mkBadge(String(effProvider).toUpperCase(), "muted"));

    // Last updated
    const lu = settings._cache && settings._cache.lastUpdatedMs ? settings._cache.lastUpdatedMs : 0;
    if (settings.display && settings.display.showLastUpdated) {
      setText(statusLine, lu ? ("Updated: " + new Date(lu).toLocaleTimeString()) : "Not updated yet");
    }

    // Render POIs
    const maxItems = clamp(settings.display && settings.display.maxItems, 1, 50);
    const resultsByPoiId = (settings._cache && settings._cache.resultsByPoiId) ? settings._cache.resultsByPoiId : {};
    const sortMode = (settings.display && settings.display.sort) || "asEntered";

    const shown = sortPois(enabledPois, resultsByPoiId, sortMode).slice(0, maxItems);

    if (shown.length === 0) {
      list.appendChild(mkEl("div", { class: "ttpt-empty" }, "Configure POIs in ⚙ settings."));
    } else {
      shown.forEach((poi) => {
        const row = mkEl("div", { class: "ttpt-row" });

        const left = mkEl("div", { class: "ttpt-row-left" });
        const name = mkEl("div", { class: "ttpt-poi-name" }, poi.name || "(Unnamed POI)");

        const destLL = getDestLatLon(poi);
        const dq = poi && poi.destination ? String(poi.destination.query || poi.destination.address || "").trim() : "";
        if (!destLL) {
          name.appendChild(mkBadge(dq ? "UNRESOLVED" : "NEEDS ADDRESS", "warn"));
        }
        left.appendChild(name);

        const right = mkEl("div", { class: "ttpt-row-right" });
        const r = resultsByPoiId[poi.id] || {};

        if (r.status === "ok") {
          right.appendChild(mkEl("div", { class: "ttpt-eta" }, formatMins(r.etaSeconds) + " min"));
          right.appendChild(mkEl("div", { class: "ttpt-sub" }, formatKm(r.distanceMeters)));
        } else if (r.status === "unresolved") {
          right.appendChild(mkEl("div", { class: "ttpt-eta" }, "—"));
          right.appendChild(mkEl("div", { class: "ttpt-sub" }, "UNRESOLVED"));
        } else if (r.status === "needsConfig") {
          right.appendChild(mkEl("div", { class: "ttpt-eta" }, "—"));
          right.appendChild(mkEl("div", { class: "ttpt-sub" }, "NEEDS CONFIG"));
        } else if (r.status === "rateLimited") {
          right.appendChild(mkEl("div", { class: "ttpt-eta" }, "—"));
          right.appendChild(mkEl("div", { class: "ttpt-sub" }, "RATE LIMITED"));
        } else if (r.status === "blocked") {
          right.appendChild(mkEl("div", { class: "ttpt-eta" }, "—"));
          right.appendChild(mkEl("div", { class: "ttpt-sub" }, "BLOCKED"));
        } else if (r.status === "error") {
          right.appendChild(mkEl("div", { class: "ttpt-eta" }, "—"));
          right.appendChild(mkEl("div", { class: "ttpt-sub" }, "ERROR"));
        } else {
          right.appendChild(mkEl("div", { class: "ttpt-eta" }, "—"));
          right.appendChild(mkEl("div", { class: "ttpt-sub" }, "Not fetched"));
        }

        row.appendChild(left);
        row.appendChild(right);
        list.appendChild(row);
      });
    }

    if (settings.paused) badges.appendChild(mkBadge("PAUSED", "muted"));

    body.appendChild(badges);
    body.appendChild(statusLine);
    body.appendChild(list);

    const hint = mkEl("div", { class: "ttpt-hint" });
    hint.appendChild(mkEl("div", null,
      "Tip: If requests are BLOCKED under file://, use a CORS-friendly endpoint or a VizInt proxy (if available)."));
    foot.appendChild(hint);

    host.appendChild(styleTag());
    host.appendChild(header);
    host.appendChild(body);
    host.appendChild(foot);
  }

  function styleTag() {
    return mkEl("style", null, `
      .ttpt-root{font:13px/1.3 system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;}
      .ttpt-header{display:flex;align-items:center;justify-content:space-between;padding:8px 8px 6px;}
      .ttpt-title{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:70%;}
      .ttpt-actions{display:flex;gap:6px;}
      .ttpt-btn{border:1px solid rgba(127,127,127,.35);background:transparent;border-radius:8px;padding:4px 8px;cursor:pointer}
      .ttpt-btn:hover{border-color:rgba(127,127,127,.7)}
      .ttpt-body{padding:0 8px 6px;}
      .ttpt-badges{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
      .ttpt-badge{font-size:11px;border-radius:999px;padding:2px 8px;border:1px solid rgba(127,127,127,.35);opacity:.95}
      .ttpt-warn{border-color:rgba(200,150,60,.6)}
      .ttpt-muted{opacity:.7}
      .ttpt-statusline{font-size:12px;opacity:.85;margin:4px 0 8px}
      .ttpt-list{display:flex;flex-direction:column;gap:6px}
      .ttpt-row{display:flex;align-items:flex-start;justify-content:space-between;border:1px solid rgba(127,127,127,.25);border-radius:12px;padding:8px}
      .ttpt-row-left{min-width:60%}
      .ttpt-poi-name{font-weight:600;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
      .ttpt-row-right{text-align:right;min-width:35%}
      .ttpt-eta{font-size:16px;font-weight:700}
      .ttpt-sub{font-size:11px;opacity:.8}
      .ttpt-empty{opacity:.8;border:1px dashed rgba(127,127,127,.35);border-radius:12px;padding:10px}
      .ttpt-foot{padding:0 8px 8px}
      .ttpt-hint{font-size:11px;opacity:.7}
      .ttpt-modal-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:flex-start;justify-content:center;padding:10px}
      .ttpt-modal{max-width:560px;width:100%;background:rgba(20,20,20,.92);color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:12px}
      .ttpt-modal h3{margin:0 0 8px;font-size:14px}
      .ttpt-form{display:flex;flex-direction:column;gap:10px}
      .ttpt-field{display:flex;flex-direction:column;gap:4px}
      .ttpt-field label{font-size:11px;opacity:.85}
      .ttpt-field input,.ttpt-field select,.ttpt-field textarea{border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.35);color:#fff;padding:8px}
      .ttpt-row2{display:flex;gap:8px;flex-wrap:wrap}
      .ttpt-row2 > *{flex:1}
      .ttpt-modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px}
      .ttpt-btn2{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:#fff;border-radius:10px;padding:6px 10px;cursor:pointer}
      .ttpt-btn2:hover{background:rgba(255,255,255,.10)}
      .ttpt-small{font-size:11px;opacity:.8}
      .ttpt-poi-editor{border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:8px}
      .ttpt-poi-item{border:1px solid rgba(255,255,255,.10);border-radius:12px;padding:8px;display:flex;flex-direction:column;gap:8px}
      .ttpt-poi-actions{display:flex;gap:8px;justify-content:flex-end}
      .ttpt-pill{display:inline-block;padding:2px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.18);font-size:11px;opacity:.85}
    `);
  }

  function togglePaused(ctx) {
    const s = getSettings(ctx);
    s.paused = !s.paused;
    setSettings(ctx, s);
    const st = STATE.get(ctx);
    if (st) {
      render(st.host, ctx);
      scheduleNext(ctx, { reason: "pauseToggle" });
    }
  }

  function scheduleNext(ctx, meta) {
    const st = STATE.get(ctx);
    if (!st) return;

    if (st.timer) {
      clearTimeout(st.timer);
      st.timer = null;
    }

    const s = getSettings(ctx);
    if (s.paused) return;

    const refreshSeconds = clamp(s.refreshSeconds, 30, 3600);
    const backoffFactor = st.backoffFactor || 1;
    const delayMs = Math.round(refreshSeconds * 1000 * backoffFactor);

    st.timer = setTimeout(() => {
      refreshNow(ctx, { reason: "auto" });
    }, delayMs);
  }

  async function refreshNow(ctx, meta) {
    const st = STATE.get(ctx);
    if (!st) return;
    if (st.inFlight) return;

    const host = st.host;
    const s = getSettings(ctx);

    if (meta && meta.reason !== "manual" && s.paused) return;

    st.inFlight = true;
    st.backoffFactor = 1;

    try {
      const enabledPois = (s.pois || []).filter(p => p && p.enabled !== false);
      if (!enabledPois.length) {
        render(host, ctx);
        return;
      }

      const origin = await bestEffortGeo(ctx, s);
      if (!origin) {
        for (const p of enabledPois) {
          s._cache.resultsByPoiId[p.id] = { status: "needsConfig", etaSeconds: NaN, distanceMeters: NaN, atMs: nowMs() };
        }
        s._cache.lastUpdatedMs = nowMs();
        setSettings(ctx, s);
        render(host, ctx);
        return;
      }

      const effProvider = resolveEffectiveProvider(s, ctx);
      const hasTomTomKey = !!getTomTomKey(s, ctx);

      // Fetch each POI (serial; improves debugging and avoids bursty free-tier hits)
      for (const poi of enabledPois) {
        const ll = getDestLatLon(poi);
        if (!ll) {
          s._cache.resultsByPoiId[poi.id] = { status: "unresolved", etaSeconds: NaN, distanceMeters: NaN, atMs: nowMs() };
          continue;
        }

        // If effective provider is TomTom but key missing, mark needs config.
        if (effProvider === "tomtom" && !hasTomTomKey) {
          s._cache.resultsByPoiId[poi.id] = { status: "needsConfig", etaSeconds: NaN, distanceMeters: NaN, atMs: nowMs() };
          continue;
        }

        const r = await routeOne(s, ctx, origin, ll);
        s._cache.resultsByPoiId[poi.id] = { ...r, atMs: nowMs() };

        if (r.status === "rateLimited") {
          // backoff next cycle
          st.backoffFactor = 2;
        }
      }

      s._cache.lastUpdatedMs = nowMs();
      setSettings(ctx, s);
      render(host, ctx);
    } finally {
      st.inFlight = false;
      scheduleNext(ctx, meta);
    }
  }

  function openSettings(ctx) {
    const st = STATE.get(ctx);
    if (!st) return;

    const host = st.host;
    const s = getSettings(ctx);

    const backdrop = mkEl("div", { class: "ttpt-modal-backdrop" });
    host.style.position = host.style.position || "relative";

    const modal = mkEl("div", { class: "ttpt-modal" });
    modal.appendChild(mkEl("h3", null, "Time-to-POI Settings"));

    const form = mkEl("div", { class: "ttpt-form" });

    // Provider selection (advisory)
    const providerField = mkEl("div", { class: "ttpt-field" });
    providerField.appendChild(mkEl("label", null, "Provider"));
    const providerSel = mkEl("select", null, [
      mkEl("option", { value: "osrm" }, "OSRM (keyless, best-effort)"),
      mkEl("option", { value: "tomtom" }, "TomTom (requires key; traffic-aware)"),
      mkEl("option", { value: "custom" }, "Custom (OSRM-compatible URL)"),
    ]);
    providerSel.value = (s.provider === "tomtom") ? "tomtom" : ((s.provider === "custom") ? "custom" : "osrm");
    providerField.appendChild(providerSel);
    providerField.appendChild(mkEl("div", { class: "ttpt-small" },
      "Effective provider: TomTom is auto-selected when a TomTom API key is present (per-instance priority)."));
    form.appendChild(providerField);

    // TomTom API key
    const keyField = mkEl("div", { class: "ttpt-field" });
    keyField.appendChild(mkEl("label", null, "TomTom API key (stored in settings for now)"));
    const keyInput = mkEl("input", { type: "password", value: String((s.auth && s.auth.apiKey && s.auth.apiKey.tomtom) || "") });
    keyField.appendChild(keyInput);
    keyField.appendChild(mkEl("div", { class: "ttpt-small" }, "If set, TomTom becomes default provider (priority rule)."));
    form.appendChild(keyField);

    // Endpoints
    const epOsrm = mkEl("div", { class: "ttpt-field" });
    epOsrm.appendChild(mkEl("label", null, "OSRM base URL"));
    const osrmInput = mkEl("input", { type: "text", value: String((s.endpoints && s.endpoints.osrmBaseUrl) || "") });
    epOsrm.appendChild(osrmInput);
    epOsrm.appendChild(mkEl("div", { class: "ttpt-small" }, "Example: https://router.project-osrm.org (public, best-effort)."));
    form.appendChild(epOsrm);

    const epTom = mkEl("div", { class: "ttpt-field" });
    epTom.appendChild(mkEl("label", null, "TomTom base URL"));
    const tomInput = mkEl("input", { type: "text", value: String((s.endpoints && s.endpoints.tomtomBaseUrl) || "https://api.tomtom.com") });
    epTom.appendChild(tomInput);
    epTom.appendChild(mkEl("div", { class: "ttpt-small" }, "Default is https://api.tomtom.com"));
    form.appendChild(epTom);

    const epNom = mkEl("div", { class: "ttpt-field" });
    epNom.appendChild(mkEl("label", null, "Nominatim URL (fallback geocoder when no key)"));
    const nomInput = mkEl("input", { type: "text", value: String((s.endpoints && s.endpoints.nominatimUrl) || "https://nominatim.openstreetmap.org/search") });
    epNom.appendChild(nomInput);
    epNom.appendChild(mkEl("div", { class: "ttpt-small" }, "Public Nominatim is rate-limited (~1 req/sec)."));
    form.appendChild(epNom);

    // Refresh & display
    const row = mkEl("div", { class: "ttpt-row2" });
    const refreshField = mkEl("div", { class: "ttpt-field" });
    refreshField.appendChild(mkEl("label", null, "Refresh seconds (30..3600)"));
    const refreshInput = mkEl("input", { type: "number", value: String(s.refreshSeconds) });
    refreshField.appendChild(refreshInput);
    row.appendChild(refreshField);

    const maxItemsField = mkEl("div", { class: "ttpt-field" });
    maxItemsField.appendChild(mkEl("label", null, "Max items (1..50)"));
    const maxItemsInput = mkEl("input", { type: "number", value: String((s.display && s.display.maxItems) || 6) });
    maxItemsField.appendChild(maxItemsInput);
    row.appendChild(maxItemsField);
    form.appendChild(row);

    // Origin
    const originField = mkEl("div", { class: "ttpt-field" });
    originField.appendChild(mkEl("label", null, "Origin mode"));
    const originSel = mkEl("select", null, [
      mkEl("option", { value: "currentLocation" }, "Current location (best effort)"),
      mkEl("option", { value: "fixed" }, "Fixed lat/lon"),
    ]);
    originSel.value = (s.origin && s.origin.mode === "fixed") ? "fixed" : "currentLocation";
    originField.appendChild(originSel);

    const originRow = mkEl("div", { class: "ttpt-row2" });
    const latInput = mkEl("input", { type: "number", step: "any", value: s.origin && s.origin.fixed ? String(s.origin.fixed.lat ?? "") : "" });
    const lonInput = mkEl("input", { type: "number", step: "any", value: s.origin && s.origin.fixed ? String(s.origin.fixed.lon ?? "") : "" });
    originRow.appendChild(mkEl("div", { class: "ttpt-field" }, [mkEl("label", null, "Fixed lat"), latInput]));
    originRow.appendChild(mkEl("div", { class: "ttpt-field" }, [mkEl("label", null, "Fixed lon"), lonInput]));
    originField.appendChild(originRow);
    form.appendChild(originField);

    const allowLocField = mkEl("div", { class: "ttpt-field" });
    allowLocField.appendChild(mkEl("label", null, "Privacy"));
    const allowLoc = mkEl("select", null, [
      mkEl("option", { value: "true" }, "Allow location"),
      mkEl("option", { value: "false" }, "Do not use location"),
    ]);
    allowLoc.value = (s.privacy && s.privacy.allowLocation) ? "true" : "false";
    allowLocField.appendChild(allowLoc);
    form.appendChild(allowLocField);

    // Sorting
    const sortField = mkEl("div", { class: "ttpt-field" });
    sortField.appendChild(mkEl("label", null, "Sort"));
    const sortSel = mkEl("select", null, [
      mkEl("option", { value: "asEntered" }, "As entered"),
      mkEl("option", { value: "shortestETA" }, "Shortest ETA (if available)"),
      mkEl("option", { value: "alpha" }, "Alphabetical"),
    ]);
    sortSel.value = (s.display && s.display.sort) ? s.display.sort : "asEntered";
    sortField.appendChild(sortSel);
    form.appendChild(sortField);

    // POI editor (address-first)
    const poiWrap = mkEl("div", { class: "ttpt-poi-editor" });
    poiWrap.appendChild(mkEl("div", null, "POIs"));
    const poiList = mkEl("div", null);
    poiWrap.appendChild(poiList);

    function renderPoiEditor(listSettings) {
      poiList.innerHTML = "";
      const pois = listSettings.pois || [];
      if (!pois.length) {
        poiList.appendChild(mkEl("div", { class: "ttpt-small" }, "No POIs yet. Click + Add POI."));
        return;
      }
      pois.forEach((poi, idx) => {
        const item = mkEl("div", { class: "ttpt-poi-item" });

        const r1 = mkEl("div", { class: "ttpt-row2" });

        const nameF = mkEl("div", { class: "ttpt-field" });
        nameF.appendChild(mkEl("label", null, "Display name"));
        const nameI = mkEl("input", { type: "text", value: String(poi.name || "") });
        nameF.appendChild(nameI);

        const enabledF = mkEl("div", { class: "ttpt-field" });
        enabledF.appendChild(mkEl("label", null, "Enabled"));
        const enabledSel = mkEl("select", null, [
          mkEl("option", { value: "true" }, "Yes"),
          mkEl("option", { value: "false" }, "No"),
        ]);
        enabledSel.value = (poi.enabled === false) ? "false" : "true";
        enabledF.appendChild(enabledSel);

        r1.appendChild(nameF);
        r1.appendChild(enabledF);

        const addrF = mkEl("div", { class: "ttpt-field" });
        addrF.appendChild(mkEl("label", null, "Address / place name"));
        const q0 = poi.destination ? (poi.destination.query || poi.destination.address || "") : "";
        const addrI = mkEl("input", { type: "text", value: String(q0 || "") });
        addrF.appendChild(addrI);
        addrF.appendChild(mkEl("div", { class: "ttpt-small" }, "Examples: 1600 Pennsylvania Avenue | The White House | Masjid Alwadood"));

        const info = mkEl("div", { class: "ttpt-small" });
        const ll = getDestLatLon(poi);
        if (ll) {
          info.appendChild(mkEl("span", { class: "ttpt-pill" }, "Resolved"));
          info.appendChild(document.createTextNode(" "));
          info.appendChild(mkEl("span", { class: "ttpt-pill" }, ll.lat.toFixed(5) + "," + ll.lon.toFixed(5)));
        } else {
          info.appendChild(mkEl("span", { class: "ttpt-pill" }, "Unresolved"));
        }

        const actions = mkEl("div", { class: "ttpt-poi-actions" });
        const btnUp = mkEl("button", { class: "ttpt-btn2", type: "button", onclick: () => {
          if (idx <= 0) return;
          const tmp = listSettings.pois[idx - 1];
          listSettings.pois[idx - 1] = listSettings.pois[idx];
          listSettings.pois[idx] = tmp;
          renderPoiEditor(listSettings);
        }}, "↑");

        const btnDown = mkEl("button", { class: "ttpt-btn2", type: "button", onclick: () => {
          if (idx >= listSettings.pois.length - 1) return;
          const tmp = listSettings.pois[idx + 1];
          listSettings.pois[idx + 1] = listSettings.pois[idx];
          listSettings.pois[idx] = tmp;
          renderPoiEditor(listSettings);
        }}, "↓");

        const btnClear = mkEl("button", { class: "ttpt-btn2", type: "button", onclick: () => {
          poi.destination = poi.destination || {};
          poi.destination.lat = null;
          poi.destination.lon = null;
          renderPoiEditor(listSettings);
        }}, "Clear coords");

        const btnDel = mkEl("button", { class: "ttpt-btn2", type: "button", onclick: () => {
          listSettings.pois.splice(idx, 1);
          renderPoiEditor(listSettings);
        }}, "Delete");

        actions.appendChild(btnUp);
        actions.appendChild(btnDown);
        actions.appendChild(btnClear);
        actions.appendChild(btnDel);

        // Wire edits
        nameI.addEventListener("input", () => { poi.name = nameI.value; });
        enabledSel.addEventListener("change", () => { poi.enabled = (enabledSel.value === "true"); });
        addrI.addEventListener("input", () => {
          poi.destination = poi.destination || {};
          poi.destination.mode = "address";
          poi.destination.query = addrI.value;
          // Invalidate coords when address changes (will re-resolve on save)
          poi.destination.lat = null;
          poi.destination.lon = null;
        });

        item.appendChild(r1);
        item.appendChild(addrF);
        item.appendChild(info);
        item.appendChild(actions);
        poiList.appendChild(item);
      });
    }

    renderPoiEditor(s);

    const btnAddPoi = mkEl("button", { class: "ttpt-btn2", type: "button", onclick: () => {
      s.pois = s.pois || [];
      s.pois.push({
        id: "poi-" + Math.random().toString(16).slice(2) + "-" + nowMs().toString(16),
        name: "New POI",
        destination: { mode: "address", query: "", lat: null, lon: null },
        enabled: true,
      });
      renderPoiEditor(s);
    }}, "+ Add POI");

    poiWrap.appendChild(btnAddPoi);
    form.appendChild(poiWrap);

    // Actions
    const actions = mkEl("div", { class: "ttpt-modal-actions" });

    const btnCancel = mkEl("button", { class: "ttpt-btn2", type: "button", onclick: () => closeModal(ctx) }, "Cancel");

    const btnReset = mkEl("button", { class: "ttpt-btn2", type: "button", onclick: () => {
      if (ctx.resetSettings) ctx.resetSettings();
      closeModal(ctx);
      const st2 = STATE.get(ctx);
      if (st2) {
        render(st2.host, ctx);
        scheduleNext(ctx, { reason: "reset" });
      }
    }}, "Reset");

    const btnSave = mkEl("button", { class: "ttpt-btn2", type: "button" }, "Save");

    async function doSave() {
      btnSave.disabled = true;
      const oldLabel = btnSave.textContent;
      btnSave.textContent = "Saving…";

      // Apply form values
      s.provider = providerSel.value;

      s.endpoints = s.endpoints || {};
      s.endpoints.osrmBaseUrl = String(osrmInput.value || "").trim() || "https://router.project-osrm.org";
      s.endpoints.tomtomBaseUrl = String(tomInput.value || "").trim() || "https://api.tomtom.com";
      s.endpoints.nominatimUrl = String(nomInput.value || "").trim() || "https://nominatim.openstreetmap.org/search";

      s.auth = s.auth || {};
      s.auth.apiKey = s.auth.apiKey || {};
      s.auth.apiKey.tomtom = String(keyInput.value || "").trim();

      s.refreshSeconds = clamp(refreshInput.value, 30, 3600);
      s.display = s.display || {};
      s.display.maxItems = clamp(maxItemsInput.value, 1, 50);
      s.display.sort = sortSel.value;

      s.origin = s.origin || {};
      s.origin.mode = originSel.value;
      s.origin.fixed = s.origin.fixed || {};
      s.origin.fixed.lat = (latInput.value === "") ? null : Number(latInput.value);
      s.origin.fixed.lon = (lonInput.value === "") ? null : Number(lonInput.value);

      s.privacy = s.privacy || {};
      s.privacy.allowLocation = (allowLoc.value === "true");

      // Ensure cache exists
      s._cache = s._cache || { lastUpdatedMs: 0, resultsByPoiId: {} };
      s._cache.resultsByPoiId = s._cache.resultsByPoiId || {};

      // Auto-resolve POIs (address -> lat/lon)
      const keyPresent = !!getTomTomKey(s, ctx);
      let lastNominatimAt = 0
      const pois = s.pois || [];
      for (const poi of pois) {
        if (poi && poi.enabled === false) continue;
        const dest = poi && poi.destination ? poi.destination : null;
        if (!dest) continue;
        const q = String(dest.query || dest.address || "").trim();
        const hasLL = getDestLatLon(poi);
        if (hasLL) continue;
        if (!q) continue;

        // Respect public Nominatim rate limits if we are using it
        if (!keyPresent) {
          const now = nowMs();
          const wait = (lastNominatimAt + 1100) - now;
          if (wait > 0) await sleep(wait);
        }

        const r = await geocodeOne(s, ctx, q);
        if (r.ok) {
          dest.mode = "latlon";
          dest.lat = r.lat;
          dest.lon = r.lon;
          dest._geocoder = r.provider;
          dest._resolvedAtMs = nowMs();
        } else {
          // keep unresolved
          dest.mode = "address";
          dest.lat = null;
          dest.lon = null;
          dest._geocoder = r.provider || "none";
          dest._resolvedAtMs = 0;
        }
        if (!keyPresent) lastNominatimAt = nowMs();

      }

      setSettings(ctx, s);
      closeModal(ctx);

      const st2 = STATE.get(ctx);
      if (st2) {
        render(st2.host, ctx);
        refreshNow(ctx, { reason: "settingsSaved" });
      }

      btnSave.textContent = oldLabel;
      btnSave.disabled = false;
    }

    btnSave.addEventListener("click", () => { void doSave(); });

    actions.appendChild(btnCancel);
    actions.appendChild(btnReset);
    actions.appendChild(btnSave);

    modal.appendChild(form);
    modal.appendChild(actions);
    backdrop.appendChild(modal);

    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal(ctx);
    });

    st.modal = backdrop;
    host.appendChild(backdrop);
  }

  function closeModal(ctx) {
    const st = STATE.get(ctx);
    if (!st || !st.modal) return;
    try { st.modal.remove(); } catch (_) {}
    st.modal = null;
  }

  function mount(host, ctx) {
    const st = {
      host,
      timer: null,
      inFlight: false,
      backoffFactor: 1,
      modal: null,
      settings: null,
    };
    STATE.set(ctx, st);

    render(host, ctx);
    refreshNow(ctx, { reason: "initial" });
    scheduleNext(ctx, { reason: "initial" });
  }

  function unmount(host, ctx) {
    const st = STATE.get(ctx);
    if (st) {
      if (st.timer) clearTimeout(st.timer);
      st.timer = null;
      st.inFlight = false;
      st.modal = null;
      STATE.delete(ctx);
    }
    if (host) host.innerHTML = "";
  }

  function onSettingsRequested(ctx) {
    openSettings(ctx);
  }

  function onInfoClick(ctx) {
    try {
      console.log("[Time-to-POI]", manifest._ver, manifest.verBlurb);
    } catch (_) {}
  }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS[manifest._class] = {
    manifest,
    mount,
    unmount,
    onSettingsRequested,
    onInfoClick,
  };
})();
