/*
 * $VER: Time to POI Gadget v1.0 (2024-06-15)
 * $DESCRIPTION:
 * A gadget that displays the time remaining to reach a specified Point of Interest (POI).
 *
 * $HISTORY: 
 * 
 * 2026/01/16	1.0.0	Initial public release.
 * 
 */

(function () {
  "use strict";

  const manifest = {
    _api: "1.0",
    _class: "time-to-poi",
    _type: "multi",
    _id: "default",
    _ver: "0.1.0",
    label: "Time to POI",
    iconEmoji: "🚗",
    capabilities: ["network", "atlas"], // atlas for best-effort coarse geo fallback
    supportsSettings: true,
    verBlurb: "OSRM-first (keyless) live ETA list with graceful degraded states.",
  };

  // Per-instance runtime state (no globals per-instance)
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

  function defaultSettings() {
    return {
      provider: "osrm", // "osrm" | "custom" (v0.1.0 uses OSRM adapter)
      refreshSeconds: 300,
      paused: false,

      // OSRM endpoint (best-effort default). User can override.
      // NOTE: public endpoints may rate-limit. This is expected.
      endpoints: {
        osrmBaseUrl: "https://router.project-osrm.org"
      },

      origin: {
        mode: "currentLocation", // per Addendum A-ADD-3 default
        label: "Current location",
        fixed: { lat: null, lon: null }
      },

      pois: [],

      display: {
        maxItems: 6,
        sort: "asEntered", // "asEntered" | "shortestETA" | "alpha"
        showLastUpdated: true
      },

      privacy: {
        allowLocation: true,
        redactExactCoordsInUI: false
      },

      // Present in spec, but we are explicitly punting API keys in v0.1.0
      auth: {
        apiKeyRef: ""
      },

      // Internal cache extension (non-breaking)
      _cache: {
        lastUpdatedMs: 0,
        resultsByPoiId: {} // { [poiId]: { etaSeconds, distanceMeters, status, atMs } }
      }
    };
  }

// ---- Geocoding (Nominatim / OSM) ----
// NOTE: Nominatim requires a User-Agent. If you have a VizInt-wide UA policy, replace this header accordingly.
async function geocodeNominatimOne(query, nominatimUrl, timeoutMs) {
  const url = (nominatimUrl || "https://nominatim.openstreetmap.org/search")
    + "?format=json&limit=1&q=" + encodeURIComponent(query);

  const ctrl = (typeof AbortController !== "undefined") ? new AbortController() : null;
  const t = timeoutMs ? setTimeout(() => { try { ctrl && ctrl.abort(); } catch {} }, timeoutMs) : null;

  try {
    const resp = await fetch(url, {
      signal: ctrl ? ctrl.signal : undefined,
      headers: {
        "User-Agent": "VizInt-TimeToPOI/0.1 (no-email)" // keep short; replace if you have a standard
      }
    });

    if (!resp.ok) return { ok:false, code: resp.status, lat:null, lon:null };

    const data = await resp.json();
    if (!data || !data.length) return { ok:false, code: 404, lat:null, lon:null };

    const lat = Number(data[0].lat);
    const lon = Number(data[0].lon);
    if (!isFinite(lat) || !isFinite(lon)) return { ok:false, code: 422, lat:null, lon:null };

    return { ok:true, code:200, lat, lon };
  } catch (e) {
    // Abort or network fail
    return { ok:false, code: 0, lat:null, lon:null };
  } finally {
    if (t) clearTimeout(t);
  }
}


  function getSettings(ctx) {
    // Spec: do NOT write settings in mount() for defaults
    const def = defaultSettings();
    const s = ctx.getSettings ? ctx.getSettings("settings", def) : def;
    // Merge shallowly with defaults to tolerate missing fields
    return deepMergeDefaults(safeJsonClone(s), def);
  }

  function deepMergeDefaults(obj, def) {
    if (obj == null || typeof obj !== "object") return safeJsonClone(def);
    const out = Array.isArray(def) ? (Array.isArray(obj) ? obj : []) : obj;

    // Ensure any default keys exist
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
    // keep short, no fancy i18n
    const s = (km < 10) ? km.toFixed(1) : km.toFixed(0);
    return s + " km";
  }

  function parseCtxDisplayName(ctx) {
    // ctx.name is like "Vz:<Class>:<Instance>"
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
    // Under file:// or blocked CORS, fetch often throws TypeError
    if (!err) return { kind: "error", label: "ERROR" };
    const msg = String(err && err.message ? err.message : err);
    if (msg.toLowerCase().includes("failed to fetch") || err.name === "TypeError") {
      return { kind: "blocked", label: "BLOCKED (CORS/NETWORK)" };
    }
    return { kind: "error", label: "ERROR" };
  }

  async function bestEffortGeo(ctx, settings) {
    // Returns { lat, lon, source } or null
    // Priority:
    // 1) navigator.geolocation if allowed & available
    // 2) Atlas.getBestGeo() (coarse)
    // 3) fixed origin if set
    const o = settings.origin || {};
    const privacy = settings.privacy || {};
    const allowLoc = !!privacy.allowLocation;

    if (o.mode === "fixed") {
      const f = o.fixed || {};
      if (isFinite(f.lat) && isFinite(f.lon)) return { lat: Number(f.lat), lon: Number(f.lon), source: "fixed" };
      return null;
    }

    // currentLocation
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
      // If denied/unavailable, fall through to Atlas best-effort
    }

    // Atlas fallback (coarse / IP-based / last-known depending on implementation)
    try {
      if (ctx && ctx.libs && ctx.libs.Atlas && ctx.libs.Atlas.ready) {
        await ctx.libs.Atlas.ready;
        const geo = ctx.libs.Atlas.getBestGeo ? ctx.libs.Atlas.getBestGeo() : null;
        // Try to support a few plausible shapes without assuming too much
        const lat = geo && (geo.lat ?? (geo.coords && geo.coords.lat));
        const lon = geo && (geo.lon ?? geo.lng ?? (geo.coords && (geo.coords.lon ?? geo.coords.lng)));
        if (isFinite(lat) && isFinite(lon)) return { lat: Number(lat), lon: Number(lon), source: "atlas" };
      }
    } catch (_) {
      // ignore
    }

    // Last resort: fixed origin if present
    const f = (o.fixed || {});
    if (isFinite(f.lat) && isFinite(f.lon)) return { lat: Number(f.lat), lon: Number(f.lon), source: "fixed" };

    return null;
  }

  function osrmRouteUrl(baseUrl, origin, dest) {
    // OSRM expects lon,lat pairs
    const o = origin.lon + "," + origin.lat;
    const d = dest.lon + "," + dest.lat;
    const path = "/route/v1/driving/" + o + ";" + d;
    const qs = "?overview=false&alternatives=false&steps=false&annotations=false";
    return trimTrailingSlash(baseUrl) + path + qs;
  }

  function trimTrailingSlash(s) {
    s = String(s || "");
    while (s.endsWith("/")) s = s.slice(0, -1);
    return s;
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
    // asEntered
    return list;
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

    // Compute top-level state badges
    if (!navigator.onLine) {
      badges.appendChild(mkBadge("OFFLINE", "warn"));
    } else {
      badges.appendChild(mkBadge("ONLINE", "ok"));
    }

    if (isProbablyFileProtocol()) {
      // We still mount; show a gentle warning because network + CORS can be tricky under file://
      badges.appendChild(mkBadge("file://", "muted"));
    }

    // Config readiness
    const enabledPois = (settings.pois || []).filter(p => p && p.enabled !== false);
    const hasPois = enabledPois.length > 0;

    const originMode = (settings.origin && settings.origin.mode) || "currentLocation";
    const fixedOk = settings.origin && settings.origin.fixed && isFinite(settings.origin.fixed.lat) && isFinite(settings.origin.fixed.lon);
    const originOk = (originMode === "fixed") ? fixedOk : true; // currentLocation may still be denied; handled during refresh

    if (!hasPois) {
      badges.appendChild(mkBadge("NEEDS POIs", "warn"));
    }
    if (!originOk && originMode === "fixed") {
      badges.appendChild(mkBadge("NEEDS ORIGIN", "warn"));
    }

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

        const dest = poi.destination || {};
        const hasLatLon = (dest.mode === "latlon" && isFinite(dest.lat) && isFinite(dest.lon));
        if (!hasLatLon) {
          name.appendChild(mkBadge("NEEDS LAT/LON", "warn"));
        }

        left.appendChild(name);

        const right = mkEl("div", { class: "ttpt-row-right" });

        const r = resultsByPoiId[poi.id] || {};
        if (r.status === "ok") {
          const eta = mkEl("div", { class: "ttpt-eta" }, formatMins(r.etaSeconds) + " min");
          right.appendChild(eta);
          const sub = mkEl("div", { class: "ttpt-sub" }, formatKm(r.distanceMeters));
          right.appendChild(sub);
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

    // Paused indicator
    if (settings.paused) {
      badges.appendChild(mkBadge("PAUSED", "muted"));
    }

    // Provider badge
    badges.appendChild(mkBadge(String(settings.provider || "osrm").toUpperCase(), "muted"));

    // Assemble
    body.appendChild(badges);
    body.appendChild(statusLine);
    body.appendChild(list);

    // Footer hint (only if we have issues)
    const hint = mkEl("div", { class: "ttpt-hint" });
    hint.appendChild(mkEl("div", null, "Tip: Under file://, network requests can be blocked by CORS. If so, use a CORS-friendly OSRM endpoint or a VizInt proxy (if available)."));
    foot.appendChild(hint);

    host.appendChild(styleTag());
    host.appendChild(header);
    host.appendChild(body);
    host.appendChild(foot);
  }

  function styleTag() {
    // Inline CSS, scoped by classes
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
      .ttpt-ok{opacity:.95}
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
      .ttpt-modal{max-width:520px;width:100%;background:rgba(20,20,20,.92);color:#fff;border:1px solid rgba(255,255,255,.12);border-radius:16px;padding:12px}
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

    // Backoff if rate limited
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

    // If paused, do nothing (manual refresh still allowed)
    if (meta && meta.reason !== "manual" && s.paused) return;

    st.inFlight = true;
    st.backoffFactor = 1;

    try {
      const enabledPois = (s.pois || []).filter(p => p && p.enabled !== false);
      if (!enabledPois.length) {
        // Nothing to do
        st.inFlight = false;
        render(host, ctx);
        scheduleNext(ctx, meta);
        return;
      }

      // Determine origin
      const origin = await bestEffortGeo(ctx, s);
      if (!origin) {
        // Configuration required
        // Mark all enabled POIs as not-fetched error-ish so UI shows "NEEDS CONFIG"
        for (const p of enabledPois) {
          s._cache.resultsByPoiId[p.id] = {
            status: "error",
            etaSeconds: NaN,
            distanceMeters: NaN,
            atMs: nowMs()
          };
        }
        s._cache.lastUpdatedMs = nowMs();
        setSettings(ctx, s);
        st.inFlight = false;
        render(host, ctx);
        scheduleNext(ctx, meta);
        return;
      }

      const baseUrl = (s.endpoints && s.endpoints.osrmBaseUrl) ? s.endpoints.osrmBaseUrl : "https://router.project-osrm.org";

      // Fetch each POI (simple serial loop for v0.1.0; easy to parallelize later with throttling)
      for (const poi of enabledPois) {
        const dest = poi.destination || {};
        const hasLatLon = (dest.mode === "latlon" && isFinite(dest.lat) && isFinite(dest.lon));
        if (!hasLatLon) {
          s._cache.resultsByPoiId[poi.id] = {
            status: "error",
            etaSeconds: NaN,
            distanceMeters: NaN,
            atMs: nowMs()
          };
          continue;
        }

        const url = osrmRouteUrl(baseUrl, origin, { lat: Number(dest.lat), lon: Number(dest.lon) });

        let resp;
        try {
          resp = await fetch(url, { method: "GET" });
        } catch (e) {
          const c = classifyFetchError(e);
          s._cache.resultsByPoiId[poi.id] = {
            status: c.kind,
            etaSeconds: NaN,
            distanceMeters: NaN,
            atMs: nowMs()
          };
          continue;
        }

        if (resp.status === 429) {
          // Backoff for next cycle
          st.backoffFactor = 2;
          s._cache.resultsByPoiId[poi.id] = {
            status: "rateLimited",
            etaSeconds: NaN,
            distanceMeters: NaN,
            atMs: nowMs()
          };
          continue;
        }

        if (!resp.ok) {
          const kind = (resp.status === 401 || resp.status === 403) ? "error" : "error";
          s._cache.resultsByPoiId[poi.id] = {
            status: kind,
            etaSeconds: NaN,
            distanceMeters: NaN,
            atMs: nowMs()
          };
          continue;
        }

        let data;
        try { data = await resp.json(); }
        catch (_) { data = null; }

        // OSRM success shape: { routes:[{duration,distance,...}], code:"Ok" }
        const route = data && data.routes && data.routes[0];
        if (route && isFinite(route.duration)) {
          s._cache.resultsByPoiId[poi.id] = {
            status: "ok",
            etaSeconds: Number(route.duration),
            distanceMeters: isFinite(route.distance) ? Number(route.distance) : NaN,
            atMs: nowMs()
          };
        } else {
          s._cache.resultsByPoiId[poi.id] = {
            status: "error",
            etaSeconds: NaN,
            distanceMeters: NaN,
            atMs: nowMs()
          };
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

    // Backdrop
    const backdrop = mkEl("div", { class: "ttpt-modal-backdrop" });
    // Ensure positioning works even if host isn't positioned
    host.style.position = host.style.position || "relative";

    const modal = mkEl("div", { class: "ttpt-modal" });
    modal.appendChild(mkEl("h3", null, "Time-to-POI Settings"));

    const form = mkEl("div", { class: "ttpt-form" });

    // Provider (v0.1.0: only OSRM is wired)
    const providerField = mkEl("div", { class: "ttpt-field" });
    providerField.appendChild(mkEl("label", null, "Provider"));
    const providerSel = mkEl("select", null, [
      mkEl("option", { value: "osrm" }, "OSRM (keyless)"),
      mkEl("option", { value: "custom" }, "Custom (OSRM-compatible URL)")
    ]);
    providerSel.value = (s.provider === "custom") ? "custom" : "osrm";
    providerField.appendChild(providerSel);
    providerField.appendChild(mkEl("div", { class: "ttpt-small" }, "v0.1.0 uses OSRM routing. Address geocoding is not included."));
    form.appendChild(providerField);

    // OSRM endpoint
    const epField = mkEl("div", { class: "ttpt-field" });
    epField.appendChild(mkEl("label", null, "OSRM base URL"));
    const epInput = mkEl("input", { type: "text", value: (s.endpoints && s.endpoints.osrmBaseUrl) ? s.endpoints.osrmBaseUrl : "" });
    epField.appendChild(epInput);
    epField.appendChild(mkEl("div", { class: "ttpt-small" }, "Example: https://router.project-osrm.org (best-effort public)."));
    form.appendChild(epField);

    // Refresh interval
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

    // Origin mode
    const originField = mkEl("div", { class: "ttpt-field" });
    originField.appendChild(mkEl("label", null, "Origin mode"));
    const originSel = mkEl("select", null, [
      mkEl("option", { value: "currentLocation" }, "Current location (best effort)"),
      mkEl("option", { value: "fixed" }, "Fixed lat/lon")
    ]);
    originSel.value = (s.origin && s.origin.mode === "fixed") ? "fixed" : "currentLocation";
    originField.appendChild(originSel);

    const originRow = mkEl("div", { class: "ttpt-row2" });
    const latInput = mkEl("input", { type: "number", step: "any", value: s.origin && s.origin.fixed ? String(s.origin.fixed.lat ?? "") : "" });
    const lonInput = mkEl("input", { type: "number", step: "any", value: s.origin && s.origin.fixed ? String(s.origin.fixed.lon ?? "") : "" });
    originRow.appendChild(mkEl("div", { class: "ttpt-field" }, [mkEl("label", null, "Fixed lat"), latInput]));
    originRow.appendChild(mkEl("div", { class: "ttpt-field" }, [mkEl("label", null, "Fixed lon"), lonInput]));
    originField.appendChild(originRow);

    const allowLocField = mkEl("div", { class: "ttpt-field" });
    const allowLoc = mkEl("select", null, [
      mkEl("option", { value: "true" }, "Allow location"),
      mkEl("option", { value: "false" }, "Do not use location")
    ]);
    allowLoc.value = (s.privacy && s.privacy.allowLocation) ? "true" : "false";
    allowLocField.appendChild(mkEl("label", null, "Privacy"));
    allowLocField.appendChild(allowLoc);

    form.appendChild(originField);
    form.appendChild(allowLocField);

    // Sorting
    const sortField = mkEl("div", { class: "ttpt-field" });
    sortField.appendChild(mkEl("label", null, "Sort"));
    const sortSel = mkEl("select", null, [
      mkEl("option", { value: "asEntered" }, "As entered"),
      mkEl("option", { value: "shortestETA" }, "Shortest ETA (if available)"),
      mkEl("option", { value: "alpha" }, "Alphabetical")
    ]);
    sortSel.value = (s.display && s.display.sort) ? s.display.sort : "asEntered";
    sortField.appendChild(sortSel);
    form.appendChild(sortField);

    // POI editor
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
        nameF.appendChild(mkEl("label", null, "Name"));
        const nameI = mkEl("input", { type: "text", value: String(poi.name || "") });
        nameF.appendChild(nameI);

        const enabledF = mkEl("div", { class: "ttpt-field" });
        enabledF.appendChild(mkEl("label", null, "Enabled"));
        const enabledSel = mkEl("select", null, [
          mkEl("option", { value: "true" }, "Yes"),
          mkEl("option", { value: "false" }, "No")
        ]);
        enabledSel.value = (poi.enabled === false) ? "false" : "true";
        enabledF.appendChild(enabledSel);

        r1.appendChild(nameF);
        r1.appendChild(enabledF);

        const r2 = mkEl("div", { class: "ttpt-row2" });

        const latF = mkEl("div", { class: "ttpt-field" });
        latF.appendChild(mkEl("label", null, "Dest lat"));
        const dLat = mkEl("input", { type: "number", step: "any", value: (poi.destination && poi.destination.lat != null) ? String(poi.destination.lat) : "" });
        latF.appendChild(dLat);

        const lonF = mkEl("div", { class: "ttpt-field" });
        lonF.appendChild(mkEl("label", null, "Dest lon"));
        const dLon = mkEl("input", { type: "number", step: "any", value: (poi.destination && poi.destination.lon != null) ? String(poi.destination.lon) : "" });
        lonF.appendChild(dLon);

        r2.appendChild(latF);
        r2.appendChild(lonF);

        const small = mkEl("div", { class: "ttpt-small" }, "Address mode is stored but not geocoded in v0.1.0. Use lat/lon for now.");

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

        const btnDel = mkEl("button", { class: "ttpt-btn2", type: "button", onclick: () => {
          listSettings.pois.splice(idx, 1);
          renderPoiEditor(listSettings);
        }}, "Delete");

        actions.appendChild(btnUp);
        actions.appendChild(btnDown);
        actions.appendChild(btnDel);

        // Wire edits back into listSettings in-place
        nameI.addEventListener("input", () => { poi.name = nameI.value; });
        enabledSel.addEventListener("change", () => { poi.enabled = (enabledSel.value === "true"); });
        dLat.addEventListener("input", () => {
          poi.destination = poi.destination || { mode: "latlon" };
          poi.destination.mode = "latlon";
          poi.destination.lat = (dLat.value === "") ? null : Number(dLat.value);
        });
        dLon.addEventListener("input", () => {
          poi.destination = poi.destination || { mode: "latlon" };
          poi.destination.mode = "latlon";
          poi.destination.lon = (dLon.value === "") ? null : Number(dLon.value);
        });

        item.appendChild(r1);
        item.appendChild(r2);
        item.appendChild(small);
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
        destination: { mode: "latlon", lat: null, lon: null },
        enabled: true
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
      // render + refresh after reset
      const st2 = STATE.get(ctx);
      if (st2) {
        render(st2.host, ctx);
        scheduleNext(ctx, { reason: "reset" });
      }
    }}, "Reset");

    const btnSave = mkEl("button", { class: "ttpt-btn2", type: "button", onclick: () => {
      // Apply form values -> s
      s.provider = providerSel.value;
      s.endpoints = s.endpoints || {};
      s.endpoints.osrmBaseUrl = String(epInput.value || "").trim() || "https://router.project-osrm.org";

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

      setSettings(ctx, s);
      closeModal(ctx);

      const st2 = STATE.get(ctx);
      if (st2) {
        render(st2.host, ctx);
        refreshNow(ctx, { reason: "settingsSaved" });
      }
    }}, "Save");

    actions.appendChild(btnCancel);
    actions.appendChild(btnReset);
    actions.appendChild(btnSave);

    modal.appendChild(form);
    modal.appendChild(actions);

    backdrop.appendChild(modal);

    // Close on backdrop click
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeModal(ctx);
    });

    // Store and attach
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
    // Initialize runtime state
    const st = {
      host: host,
      timer: null,
      inFlight: false,
      backoffFactor: 1,
      modal: null,
      settings: null
    };
    STATE.set(ctx, st);

    render(host, ctx);

    // Kick first refresh (best-effort)
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

  // Optional Portal-driven settings hook:
  // If Portal calls this, we open our in-gadget settings overlay.
  function onSettingsRequested(ctx /*, shell */) {
    openSettings(ctx);
  }

  function onInfoClick(ctx /*, shell */) {
    // Minimal "About" log for now (keeps it offline-safe)
    try {
      console.log("[Time-to-POI]", manifest._ver, "OSRM-first; keyless; per-instance settings.");
    } catch (_) {}
  }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS[manifest._class] = {
    manifest,
    mount,
    unmount,
    onSettingsRequested,
    onInfoClick
  };
})();
