/*
 * $VER: Masjid Iqama Countdown Gadget (RSS) 1.0.0
 * $DESCRIPTION:
 * A gadget that displays a countdown to the next Iqama time.
 * $HISTORY:
 * 2026/01/16	1.0.0	Initial public release.
 * 
 * Notes:
 * - v1.2.2 registration doctrine: window.GADGETS[manifest._class]
 * - No ES modules. Plain IIFE.
 * - Per-instance settings only via ctx.getSettings / ctx.setSettings / ctx.resetSettings 
 * - Chronus 1.0+ compatibility via ctx.libs.Chronus
 * - Deterministic RSS parsing + bounded correction rule (03:15 -> 15:15 only under strict invariant)
*/

(function () {
  "use strict";

  const manifest = {
    _api: "1.0",
    _class: "iqama-countdown",
    _type: "multi",
    _id: "default",
    _ver: "0.1.0",
    label: "Masjid I",
    iconEmoji: "🕌",
    supportsSettings: true,
    capabilities: ["network", "chronus"],
    description: "Shows minutes until the next Iqama (إقامة) from a Masjid RSS feed (deterministic parsing).",
    verBlurb: "Initial release: deterministic RSS parsing + Chronus 1s countdown + bounded typo correction."
  };

  const DEFAULTS = {
    masjid: { name: "Masjid (configure in ⚙️)", locationHint: "" },
    feed: { url: "https://masjidalwadood.com/api/rss.php", mode: "rss", parseStrategy: "auto" },
    refreshSeconds: 60,
    display: { showArabicLabel: true, showNextPrayerName: true, largeTypography: true },
    behavior: { countdownMode: "toIqamaOnly", negativeTimeHandling: "clampToZero" },
    debug: { showLastFetch: false, showParseDetails: false }
  };

  function clamp(n, lo, hi) {
    n = Number(n);
    if (!isFinite(n)) return lo;
    return Math.min(hi, Math.max(lo, n));
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function deepMerge(a, b) {
    // small, safe deep merge for plain objects
    const out = Array.isArray(a) ? a.slice() : Object.assign({}, a || {});
    if (!b || typeof b !== "object") return out;
    for (const k of Object.keys(b)) {
      const bv = b[k];
      const av = out[k];
      if (bv && typeof bv === "object" && !Array.isArray(bv)) out[k] = deepMerge(av && typeof av === "object" ? av : {}, bv);
      else out[k] = bv;
    }
    return out;
  }

  function getAllSettings(ctx) {
    try {
      // ctx.getSettings(key?, def?) exists per spec; calling with no args returns whole object in many implementations.
      const current = ctx.getSettings ? ctx.getSettings() : null;
      return deepMerge(DEFAULTS, current || {});
    } catch (_) {
      return deepMerge(DEFAULTS, {});
    }
  }

  function setSettings(ctx, patch) {
    if (!ctx || typeof ctx.setSettings !== "function") return;
    try {
      ctx.setSettings(patch);
    } catch (_) {}
  }

  function resetSettings(ctx) {
    if (!ctx || typeof ctx.resetSettings !== "function") return;
    try {
      ctx.resetSettings();
    } catch (_) {}
  }

  function nowChronus(ctx) {
    const Chronus = ctx && ctx.libs && ctx.libs.Chronus;
    if (Chronus && typeof Chronus.now === "function") return Chronus.now();
    return null;
  }

  function nowDate(ctx) {
    const z = nowChronus(ctx);
    // Chronus "now" likely has .toDate(); if not, fall back
    if (z && typeof z.toDate === "function") return z.toDate();
    return new Date();
  }

  function fmtHMS(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const H = Math.floor(s / 3600);
    const M = Math.floor((s % 3600) / 60);
    const S = s % 60;
    return String(H).padStart(2, "0") + ":" + String(M).padStart(2, "0") + ":" + String(S).padStart(2, "0");
  }

  function minutesUntil(target, now) {
    const diffMs = target.getTime() - now.getTime();
    return Math.ceil(diffMs / 60000);
  }

  function fetchWithTimeout(url, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    return fetch(url, { signal: ctrl.signal, cache: "no-store" })
      .then((r) => {
        clearTimeout(t);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .catch((e) => {
        clearTimeout(t);
        throw e;
      });
  }

  // ---- RSS parsing (deterministic) ----

  function parseRss(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "text/xml");
    const rss = doc.querySelector("rss");
    if (!rss) throw new Error("Not RSS XML");
    const item = doc.querySelector("channel > item");
    if (!item) throw new Error("No <item> found");

    const title = (item.querySelector("title") && item.querySelector("title").textContent) || "";
    const descNode = item.querySelector("description");
    const description = (descNode && descNode.textContent) || "";

    const dateMatch = String(title).match(/(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) throw new Error("No YYYY-MM-DD date found in item title");
    const ymd = dateMatch[1];

    // Normalize description text (keep HTML-ish content as string; regex is strict but whitespace-tolerant)
    const text = String(description)
      .replace(/\r/g, "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+/g, " ")
      .replace(/\n+/g, "\n");

    // Strict prayer extraction: <strong>Name:</strong> Adhan HH:MM:SS, Iqama HH:MM:SS
    const prayerRe =
      /<strong>\s*(Fajar|Dhuhr|Asr|Maghrib|Isha)\s*:\s*<\/strong>\s*Adhan\s*([0-2]\d:[0-5]\d:[0-5]\d)\s*,\s*Iqama\s*([0-2]\d:[0-5]\d:[0-5]\d)/gi;

    const prayers = [];
    let m;
    while ((m = prayerRe.exec(text))) {
      prayers.push({
        name: m[1],
        adhan: m[2],
        iqama: m[3]
      });
    }

    if (!prayers.length) {
      throw new Error("No prayer blocks found in RSS description (unsupported format)");
    }

    return { ymd, prayers, rawDescription: description, rawTitle: title };
  }

  function parseHMS(hms) {
    const m = String(hms).match(/^([0-2]\d):([0-5]\d):([0-5]\d)$/);
    if (!m) return null;
    return { h: Number(m[1]), mi: Number(m[2]), s: Number(m[3]) };
  }

  function hmsToSeconds(t) {
    return t.h * 3600 + t.mi * 60 + t.s;
  }

  function buildLocalDate(ymd, hmsObj) {
    // Interpret as user-local time (per Addendum default)
    const parts = String(ymd).split("-");
    const y = Number(parts[0]),
      mo = Number(parts[1]),
      d = Number(parts[2]);
    return new Date(y, mo - 1, d, hmsObj.h, hmsObj.mi, hmsObj.s, 0);
  }

  function applyBoundedCorrection(prayerName, adhanObj, iqamaObj) {
    // Strict correction rule:
    // If (Iqama < Adhan) AND (Iqama < 12:00:00) AND (Adhan >= 12:00:00)
    // then add 12h to iqama hour (e.g. 03:15 -> 15:15).
    const adhanSec = hmsToSeconds(adhanObj);
    const iqamaSec = hmsToSeconds(iqamaObj);

    if (iqamaSec < adhanSec && iqamaSec < 12 * 3600 && adhanSec >= 12 * 3600) {
      const corrected = { h: iqamaObj.h + 12, mi: iqamaObj.mi, s: iqamaObj.s };
      if (corrected.h >= 24) return { corrected: null, note: "Correction overflow (ignored)", didCorrect: false };
      return {
        corrected,
        note: prayerName + " Iqama corrected (Iqama < Adhan invariant)",
        didCorrect: true,
        from: iqamaObj,
        to: corrected
      };
    }
    return { corrected: null, note: "", didCorrect: false };
  }

  function buildScheduleFromRss(parsed) {
    const schedule = [];
    const corrections = [];

    for (const p of parsed.prayers) {
      const adhanObj = parseHMS(p.adhan);
      const iqamaObj = parseHMS(p.iqama);
      if (!adhanObj || !iqamaObj) continue;

      const corr = applyBoundedCorrection(p.name, adhanObj, iqamaObj);
      const iqamaFinal = corr.didCorrect ? corr.to : iqamaObj;

      if (corr.didCorrect) {
        corrections.push({
          prayer: p.name,
          from: p.iqama,
          to:
            String(iqamaFinal.h).padStart(2, "0") +
            ":" +
            String(iqamaFinal.mi).padStart(2, "0") +
            ":" +
            String(iqamaFinal.s).padStart(2, "0"),
          note: corr.note
        });
      }

      const iqamaDate = buildLocalDate(parsed.ymd, iqamaFinal);
      schedule.push({
        name: p.name,
        iqamaDate
      });
    }

    // Sort by time
    schedule.sort((a, b) => a.iqamaDate.getTime() - b.iqamaDate.getTime());
    return { schedule, corrections };
  }

  function pickNextIqama(schedule, now) {
    for (const entry of schedule) {
      if (entry.iqamaDate.getTime() > now.getTime()) return entry;
    }
    return null;
  }

  // ---- UI ----

  function ensureStyles(host) {
    // Per-instance style tag inside host (no global IDs)
    const style = document.createElement("style");
    style.textContent = `
      .miq-wrap{height:100%;display:flex;flex-direction:column;gap:6px;padding:10px;box-sizing:border-box;}
      .miq-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;}
      .miq-name{font-weight:700;line-height:1.1}
      .miq-hint{opacity:.75;font-size:12px;margin-top:2px}
      .miq-main{display:flex;flex-direction:column;gap:4px;margin-top:6px}
      .miq-line1{font-weight:700}
      .miq-big{font-size:28px}
      .miq-med{font-size:20px}
      .miq-sub{opacity:.85;font-size:12px}
      .miq-status{margin-top:auto;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;opacity:.85}
      .miq-pill{padding:2px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.18);opacity:.9}
      .miq-row{display:flex;gap:8px;align-items:center}
      .miq-btn{cursor:pointer;border-radius:8px;padding:6px 10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:inherit}
      .miq-btn:active{transform:translateY(1px)}
      .miq-muted{opacity:.7}
      .miq-err{opacity:1}
      .miq-err strong{color:inherit}
      input.miq-in{width:100%;box-sizing:border-box;padding:8px;border-radius:8px;border:1px solid rgba(0,0,0,.2)}
      .miq-form label{font-size:12px;opacity:.85}
      .miq-form{display:flex;flex-direction:column;gap:10px;padding:10px}
      .miq-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      .miq-actions{display:flex;justify-content:flex-end;gap:8px}
      .miq-note{font-size:12px;opacity:.8;line-height:1.25}
      .miq-kv{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:11px;opacity:.85}
    `;
    host.appendChild(style);
  }

  function buildUI(host) {
    host.innerHTML = "";
    ensureStyles(host);

    const wrap = document.createElement("div");
    wrap.className = "miq-wrap";

    const top = document.createElement("div");
    top.className = "miq-top";

    const titleBox = document.createElement("div");
    const nameEl = document.createElement("div");
    nameEl.className = "miq-name";
    nameEl.textContent = "Masjid";
    const hintEl = document.createElement("div");
    hintEl.className = "miq-hint";
    hintEl.textContent = "";

    titleBox.appendChild(nameEl);
    titleBox.appendChild(hintEl);

    const btnRow = document.createElement("div");
    btnRow.className = "miq-row";

    const refreshBtn = document.createElement("button");
    refreshBtn.type = "button";
    refreshBtn.className = "miq-btn";
    refreshBtn.textContent = "⟳";
    refreshBtn.title = "Refresh now";

    btnRow.appendChild(refreshBtn);

    top.appendChild(titleBox);
    top.appendChild(btnRow);

    const main = document.createElement("div");
    main.className = "miq-main";

    const line1 = document.createElement("div");
    line1.className = "miq-line1 miq-med";
    line1.textContent = "⏱ —";

    const sub = document.createElement("div");
    sub.className = "miq-sub";
    sub.textContent = "Time until Iqama (إقامة). Not Adhan.";

    const debugBox = document.createElement("div");
    debugBox.className = "miq-kv";
    debugBox.style.display = "none";

    main.appendChild(line1);
    main.appendChild(sub);
    main.appendChild(debugBox);

    const status = document.createElement("div");
    status.className = "miq-status";

    const left = document.createElement("div");
    left.className = "miq-row";

    const pill = document.createElement("span");
    pill.className = "miq-pill";
    pill.textContent = "idle";

    const last = document.createElement("span");
    last.className = "miq-muted";
    last.textContent = "";

    left.appendChild(pill);
    left.appendChild(last);

    const right = document.createElement("div");
    right.className = "miq-row";

    const countdown = document.createElement("span");
    countdown.className = "miq-muted";
    countdown.textContent = "";

    right.appendChild(countdown);

    status.appendChild(left);
    status.appendChild(right);

    wrap.appendChild(top);
    wrap.appendChild(main);
    wrap.appendChild(status);

    host.appendChild(wrap);

    return {
      wrap,
      nameEl,
      hintEl,
      refreshBtn,
      line1,
      sub,
      pill,
      last,
      countdown,
      debugBox
    };
  }

  function render(state) {
    const ui = state.ui;
    const s = state.settings;

    ui.nameEl.textContent = s.masjid && s.masjid.name ? s.masjid.name : DEFAULTS.masjid.name;
    ui.hintEl.textContent = s.masjid && s.masjid.locationHint ? s.masjid.locationHint : "";

    ui.line1.className = "miq-line1 " + (s.display && s.display.largeTypography ? "miq-big" : "miq-med");

    const arab = s.display && s.display.showArabicLabel ? " (إقامة)" : "";
    const next = state.next;

    if (state.error) {
      ui.pill.textContent = "error";
      ui.last.textContent = state.lastFetchAt ? "last: " + state.lastFetchAt.toLocaleTimeString() : "";
      ui.line1.textContent = "⚠ " + state.error;
      ui.sub.textContent = "Time until Iqama" + arab + ". Not Adhan.";
      ui.countdown.textContent = "";
      ui.debugBox.style.display = state.settings.debug && state.settings.debug.showParseDetails ? "block" : "none";
      ui.debugBox.textContent = state.debugText || "";
      return;
    }

    if (!next) {
      ui.pill.textContent = state.status || "idle";
      ui.last.textContent = state.lastFetchAt ? "last: " + state.lastFetchAt.toLocaleTimeString() : "";
      ui.line1.textContent = "⏱ No upcoming Iqama today" + arab;
      ui.sub.textContent = "This tile tracks Iqama" + arab + " (not Adhan).";
      ui.countdown.textContent = "";
      ui.debugBox.style.display = state.settings.debug && state.settings.debug.showParseDetails ? "block" : "none";
      ui.debugBox.textContent = state.debugText || "";
      return;
    }

    const now = nowDate(state.ctx);
    const mins = minutesUntil(next.iqamaDate, now);
    const diffMs = next.iqamaDate.getTime() - now.getTime();

    ui.pill.textContent = state.status || "ok";
    ui.last.textContent = state.lastFetchAt ? "last: " + state.lastFetchAt.toLocaleTimeString() : "";

    const pName = (state.settings.display && state.settings.display.showNextPrayerName) ? next.name : "";
    const nextPart = pName ? ("Next: " + pName + " • ") : "";
    ui.sub.textContent = nextPart + "Time until Iqama" + arab + " (not Adhan).";

    if (mins >= 0) {
      ui.line1.textContent = "⏱ " + mins + " minute" + (mins === 1 ? "" : "s") + " until Iqama" + arab;
    } else {
      // negative time handling
      if (state.settings.behavior && state.settings.behavior.negativeTimeHandling === "showLateBy") {
        const late = Math.abs(mins);
        ui.line1.textContent = "⏱ Late by " + late + " minute" + (late === 1 ? "" : "s") + " (Iqama" + arab + ")";
      } else {
        ui.line1.textContent = "⏱ 0 minutes until Iqama" + arab;
      }
    }

    // small HH:MM:SS countdown display (always deterministic)
    ui.countdown.textContent = diffMs > 0 ? fmtHMS(diffMs) : (state.settings.behavior && state.settings.behavior.negativeTimeHandling === "showLateBy" ? ("-" + fmtHMS(-diffMs)) : "00:00:00");

    ui.debugBox.style.display = state.settings.debug && state.settings.debug.showParseDetails ? "block" : "none";
    ui.debugBox.textContent = state.debugText || "";
  }

  function setStatus(state, status, errorMsg) {
    state.status = status;
    state.error = errorMsg || "";
    render(state);
  }

  async function refresh(state, reason) {
    const s = state.settings;
    const url = s.feed && s.feed.url ? String(s.feed.url).trim() : "";
    if (!url) {
      setStatus(state, "error", "Missing Feed URL (configure in ⚙️)");
      return;
    }

    setStatus(state, "fetching", "");
    state.debugText = "";

    try {
      const xml = await fetchWithTimeout(url, 12000);
      const parsed = parseRss(xml);
      const built = buildScheduleFromRss(parsed);
      const now = nowDate(state.ctx);
      const next = pickNextIqama(built.schedule, now);

      state.lastFetchAt = new Date();
      state.next = next;
      state.schedule = built.schedule;

      // Debug details
      const dbg = [];
      if (state.settings.debug && state.settings.debug.showLastFetch) {
        dbg.push("reason=" + (reason || "auto"));
        dbg.push("itemTitle=" + parsed.rawTitle.trim());
        dbg.push("ymd=" + parsed.ymd);
      }
      if (built.corrections && built.corrections.length) {
        for (const c of built.corrections) {
          dbg.push("CORRECT " + c.prayer + ": " + c.from + " -> " + c.to);
        }
      }
      if (state.settings.debug && state.settings.debug.showParseDetails) {
        dbg.push("schedule=" + built.schedule.map((e) => e.name + "@" + e.iqamaDate.toLocaleTimeString()).join(", "));
      }
      state.debugText = dbg.join("\n");

      state.error = "";
      state.status = "ok";
      render(state);
    } catch (e) {
      state.lastFetchAt = state.lastFetchAt || null;
      state.next = null;
      state.schedule = [];
      const msg =
        (e && e.name === "AbortError")
          ? "Fetch timed out (possible CORS/offline)"
          : "Feed unreachable / blocked / invalid RSS";
      state.debugText = (state.settings.debug && state.settings.debug.showParseDetails) ? ("error=" + String(e && e.message ? e.message : e)) : "";
      setStatus(state, "error", msg);
    }
  }

  function startTimers(state) {
    stopTimers(state);

    // 1s tick for countdown UI (no re-fetch)
    state._tick = setInterval(() => {
      if (!state) return;
      if (!state.next) return;
      // Render is cheap; also keeps countdown moving
      render(state);
    }, 1000);

    // periodic refresh
    const sec = clamp(state.settings.refreshSeconds, 10, 3600);
    state._refresh = setInterval(() => {
      refresh(state, "timer");
    }, sec * 1000);

    // refresh on visibility return (nice-to-have, safe)
    state._vis = () => {
      if (!document.hidden) refresh(state, "visibility");
    };
    document.addEventListener("visibilitychange", state._vis);
  }

  function stopTimers(state) {
    if (!state) return;
    if (state._tick) clearInterval(state._tick);
    if (state._refresh) clearInterval(state._refresh);
    if (state._vis) document.removeEventListener("visibilitychange", state._vis);
    state._tick = null;
    state._refresh = null;
    state._vis = null;
  }

  // ---- Settings UI ----

  function buildSettingsUI(ctx, shellLike) {
    const body = shellLike && shellLike.body ? shellLike.body : shellLike;
    if (!body) return;

    const current = getAllSettings(ctx);

    body.innerHTML = "";
    const form = document.createElement("form");
    form.className = "miq-form";

    const h = document.createElement("div");
    h.style.fontWeight = "700";
    h.textContent = "Masjid Iqama — Settings";
    form.appendChild(h);

    const note = document.createElement("div");
    note.className = "miq-note";
    note.innerHTML =
      "This gadget shows <b>time until Iqama (إقامة)</b> (not Adhan). RSS parsing is deterministic. A bounded correction may fix obvious AM/PM typos (e.g., 03:15 → 15:15) only when Iqama would otherwise be before its Adhan.";
    form.appendChild(note);

    const grid = document.createElement("div");
    grid.className = "miq-grid";

    // Masjid name
    const masjidNameWrap = document.createElement("div");
    const masjidNameLabel = document.createElement("label");
    masjidNameLabel.textContent = "Masjid name (required)";
    const masjidNameInput = document.createElement("input");
    masjidNameInput.className = "miq-in";
    masjidNameInput.type = "text";
    masjidNameInput.value = (current.masjid && current.masjid.name) || "";
    masjidNameWrap.appendChild(masjidNameLabel);
    masjidNameWrap.appendChild(masjidNameInput);

    // Location hint
    const locWrap = document.createElement("div");
    const locLabel = document.createElement("label");
    locLabel.textContent = "Location hint (optional)";
    const locInput = document.createElement("input");
    locInput.className = "miq-in";
    locInput.type = "text";
    locInput.value = (current.masjid && current.masjid.locationHint) || "";
    locWrap.appendChild(locLabel);
    locWrap.appendChild(locInput);

    // Feed URL
    const urlWrap = document.createElement("div");
    urlWrap.style.gridColumn = "1 / span 2";
    const urlLabel = document.createElement("label");
    urlLabel.textContent = "RSS Feed URL (required)";
    const urlInput = document.createElement("input");
    urlInput.className = "miq-in";
    urlInput.type = "text";
    urlInput.value = (current.feed && current.feed.url) || "";
    urlWrap.appendChild(urlLabel);
    urlWrap.appendChild(urlInput);

    // Refresh seconds
    const refWrap = document.createElement("div");
    const refLabel = document.createElement("label");
    refLabel.textContent = "Refresh seconds (10–3600)";
    const refInput = document.createElement("input");
    refInput.className = "miq-in";
    refInput.type = "number";
    refInput.min = "10";
    refInput.max = "3600";
    refInput.step = "1";
    refInput.value = String(clamp(current.refreshSeconds, 10, 3600));
    refWrap.appendChild(refLabel);
    refWrap.appendChild(refInput);

    // toggles
    const togglesWrap = document.createElement("div");
    const tLabel = document.createElement("label");
    tLabel.textContent = "Display";
    const tBox = document.createElement("div");
    tBox.style.display = "flex";
    tBox.style.flexDirection = "column";
    tBox.style.gap = "6px";

    function mkCheck(labelText, initial) {
      const row = document.createElement("label");
      row.style.display = "flex";
      row.style.alignItems = "center";
      row.style.gap = "8px";
      row.style.fontSize = "12px";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!initial;
      const sp = document.createElement("span");
      sp.textContent = labelText;
      row.appendChild(cb);
      row.appendChild(sp);
      return { row, cb };
    }

    const cArabic = mkCheck("Show Arabic label (إقامة)", current.display && current.display.showArabicLabel);
    const cNext = mkCheck("Show next prayer name", current.display && current.display.showNextPrayerName);
    const cBig = mkCheck("Large typography", current.display && current.display.largeTypography);
    tBox.appendChild(cArabic.row);
    tBox.appendChild(cNext.row);
    tBox.appendChild(cBig.row);

    togglesWrap.appendChild(tLabel);
    togglesWrap.appendChild(tBox);

    // debug toggles
    const dbgWrap = document.createElement("div");
    const dbgLabel = document.createElement("label");
    dbgLabel.textContent = "Debug";
    const dbgBox = document.createElement("div");
    dbgBox.style.display = "flex";
    dbgBox.style.flexDirection = "column";
    dbgBox.style.gap = "6px";

    const dFetch = mkCheck("Show last fetch reason/title", current.debug && current.debug.showLastFetch);
    const dParse = mkCheck("Show parse details & corrections", current.debug && current.debug.showParseDetails);
    dbgBox.appendChild(dFetch.row);
    dbgBox.appendChild(dParse.row);

    dbgWrap.appendChild(dbgLabel);
    dbgWrap.appendChild(dbgBox);

    grid.appendChild(masjidNameWrap);
    grid.appendChild(locWrap);
    grid.appendChild(urlWrap);
    grid.appendChild(refWrap);
    grid.appendChild(togglesWrap);
    grid.appendChild(dbgWrap);

    form.appendChild(grid);

    const actions = document.createElement("div");
    actions.className = "miq-actions";

    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "miq-btn";
    resetBtn.textContent = "Reset";

    const saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "miq-btn";
    saveBtn.textContent = "Save";

    actions.appendChild(resetBtn);
    actions.appendChild(saveBtn);
    form.appendChild(actions);

    resetBtn.addEventListener("click", () => {
      resetSettings(ctx);
      // Re-render panel to reflect defaults after host resets
      buildSettingsUI(ctx, shellLike);
    });

    form.addEventListener("submit", (e) => {
      e.preventDefault();

      const patch = {
        masjid: {
          name: String(masjidNameInput.value || "").trim(),
          locationHint: String(locInput.value || "").trim()
        },
        feed: {
          url: String(urlInput.value || "").trim(),
          mode: "rss",
          parseStrategy: "auto"
        },
        refreshSeconds: clamp(refInput.value, 10, 3600),
        display: {
          showArabicLabel: !!cArabic.cb.checked,
          showNextPrayerName: !!cNext.cb.checked,
          largeTypography: !!cBig.cb.checked
        },
        debug: {
          showLastFetch: !!dFetch.cb.checked,
          showParseDetails: !!dParse.cb.checked
        }
      };

      // Basic guard: keep required fields non-empty (but do not block saving entirely)
      if (!patch.masjid.name) patch.masjid.name = DEFAULTS.masjid.name;
      if (!patch.feed.url) patch.feed.url = DEFAULTS.feed.url;

      setSettings(ctx, patch);
      // Portal/chrome own dialog closing semantics. We just persist.
    });

    body.appendChild(form);
  }

  // ---- Lifecycle ----

  function mount(host, ctx) {
    host.innerHTML = "";
    const ui = buildUI(host);

    const state = {
      ctx,
      host,
      ui,
      settings: getAllSettings(ctx),
      status: "idle",
      error: "",
      lastFetchAt: null,
      schedule: [],
      next: null,
      debugText: "",
      _tick: null,
      _refresh: null,
      _vis: null
    };

    // Keep state per instance on host only (namespaced)
    host.__miq_state = state;

    ui.refreshBtn.addEventListener("click", () => refresh(state, "manual"));

    // initial render
    render(state);

    // Start timers and do first fetch
    startTimers(state);
    refresh(state, "mount");
  }

  function unmount(host /*, ctx */) {
    const state = host && host.__miq_state;
    if (state) {
      stopTimers(state);
    }
    if (host) {
      delete host.__miq_state;
      host.innerHTML = "";
    }
  }

  function onSettingsRequested(ctx, shell) {
    buildSettingsUI(ctx, shell);
  }

  function onInfoClick(ctx, shellLike) {
    const body = shellLike && shellLike.body ? shellLike.body : shellLike;
    if (!body) return;

    body.innerHTML = `
      <div style="padding:10px;font-size:12px;line-height:1.35;">
        <div style="font-weight:700;margin-bottom:6px;">${esc(manifest.label)} — About</div>
        <div style="margin-bottom:8px;">
          This gadget shows <b>time until the next Iqama (إقامة)</b> for the configured Masjid RSS feed.
          <b>It does not display Adhan countdown</b>.
        </div>
        <div style="margin-bottom:8px;">
          <b>Parsing doctrine:</b> deterministic extraction from RSS item description.
          A bounded correction may fix obvious AM/PM typos only when an Iqama would otherwise be before its Adhan.
        </div>
        <div class="miq-kv">
          class: ${esc(manifest._class)}<br/>
          type: ${esc(manifest._type)}<br/>
          ver: ${esc(manifest._ver)}<br/>
          capabilities: ${esc((manifest.capabilities || []).join(", "))}
        </div>
      </div>
    `;
  }

  // Register (v1.2.2+ canon)
  window.GADGETS = window.GADGETS || {};
  window.GADGETS[manifest._class] = {
    manifest,
    mount,
    unmount,
    onSettingsRequested,
    onInfoClick
  };
})();
