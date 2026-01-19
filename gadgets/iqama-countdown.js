/*
 * $VER: Masjid Iqama Countdown Gadget (RSS) 1.1.0
 *
 * $DESCRIPTION:
 * Multi-instance gadget that displays ALL Adhan + Iqama times (Iqama bold),
 * and shows a countdown to the NEXT Iqama with a remaining-time progress bar
 * rendered BETWEEN the previous and next Iqama rows.
 *
 * $HISTORY:
 * 2026/01/16  1.0.0  Initial public release (deterministic RSS parsing + bounded typo correction).
 * 2026/01/18  1.1.0  Spec v0.2.0 UI + semantics:
 *                    - Full prayer table (Adhan + Iqama; Iqama bold)
 *                    - Interval progress bar inserted BETWEEN prev/next rows
 *                    - Progress meaning = time remaining (0% means you’re late)
 *                    - Header: Iqama | Masjid name | إقامة + ⟳
 *                    - Footer: minutes-only remaining + last updated (grey)
 *                    - Countdown updates every 10s; under 10m switches to MM:SS @ 1s
 *                    - Settings: gear toggles in-gadget panel; Save/Reset/Close hide it
 *
 * Notes:
 * - Registration doctrine: window.GADGETS[manifest._class] = api
 * - No ES modules. Plain IIFE.
 * - Per-instance settings only via ctx.getSettings / ctx.setSettings / ctx.resetSettings
 */

(function () {
  "use strict";

  // ----------------------------
  // Manifest
  // ----------------------------
  var manifest = {
    _api: "1.0",
    _class: "iqama-countdown",
    _type: "multi",
    _id: "default",
    _ver: "1.1.0",
    label: "Masjid Iqama",
    iconEmoji: "🕌",
    supportsSettings: true,
    capabilities: ["settings", "network"],
    description: "Shows Adhan + Iqama times and countdown to next Iqama (إقامة) from RSS (deterministic parsing)."
  };

  // ----------------------------
  // Defaults
  // ----------------------------
  var DEFAULTS = {
	masjid: { name: "Masjid", locationHint: "" },
    feed: { url: "https://masjidalwadood.com/api/rss.php", mode: "rss", parseStrategy: "auto" },
	refreshSeconds: 60,
	display: { showArabicLabel: true, largeTypography: true },
	behavior: {
		commuteMinutes: 5
	},
	debug: { showLastFetch: false, showParseDetails: false }	
  };

  // ----------------------------
  // Utilities
  // ----------------------------
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
      .replace(/\"/g, "&quot;");
  }

  function deepMerge(a, b) {
    var out = Array.isArray(a) ? a.slice() : Object.assign({}, a || {});
    if (!b || typeof b !== "object") return out;
    Object.keys(b).forEach(function (k) {
      var bv = b[k];
      var av = out[k];
      if (bv && typeof bv === "object" && !Array.isArray(bv)) out[k] = deepMerge(av && typeof av === "object" ? av : {}, bv);
      else out[k] = bv;
    });
    return out;
  }

  function getAllSettings(ctx) {
    try {
      var current = (ctx && typeof ctx.getSettings === "function" ? (ctx.getSettings() || {}) : {});
      return deepMerge(DEFAULTS, current);
    } catch (e) {
      return deepMerge(DEFAULTS, {});
    }
  }

  function setSettings(ctx, patch) {
    if (!ctx || typeof ctx.setSettings !== "function") return;
    try { ctx.setSettings(patch); } catch (e) {}
  }

  function resetSettings(ctx) {
    if (!ctx || typeof ctx.resetSettings !== "function") return;
    try { ctx.resetSettings(); } catch (e) {}
  }

  function nowDate() {
    return new Date();
  }

  function parseHMS(hms) {
    var m = String(hms).match(/^([0-2]\d):([0-5]\d):([0-5]\d)$/);
    if (!m) return null;
    return { h: Number(m[1]), mi: Number(m[2]), s: Number(m[3]) };
  }

  function hmsToSeconds(t) {
    return t.h * 3600 + t.mi * 60 + t.s;
  }

  function buildLocalDate(ymd, hmsObj, dayOffset) {
    var parts = String(ymd).split("-");
    var y = Number(parts[0]), mo = Number(parts[1]), d = Number(parts[2]);
    var dt = new Date(y, mo - 1, d, hmsObj.h, hmsObj.mi, hmsObj.s, 0);
    if (dayOffset) dt.setDate(dt.getDate() + dayOffset);
    return dt;
  }

  function fmtHHMM(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var H = Math.floor(s / 3600);
    var M = Math.floor((s % 3600) / 60);
    return String(H).padStart(2, "0") + ":" + String(M).padStart(2, "0");
  }

  function fmtMMSS(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var M = Math.floor(s / 60);
    var S = s % 60;
    return String(M).padStart(2, "0") + ":" + String(S).padStart(2, "0");
  }

  function minutesRemaining(ms) {
    return Math.max(0, Math.ceil(ms / 60000));
  }

  // ----------------------------
  // Fetch
  // ----------------------------
  function fetchWithTimeout(url, timeoutMs) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, timeoutMs);
    return fetch(url, { signal: ctrl.signal, cache: "no-store" })
      .then(function (r) {
        clearTimeout(t);
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      })
      .catch(function (e) {
        clearTimeout(t);
        throw e;
      });
  }

  // ----------------------------
  // RSS parsing (deterministic)
  // ----------------------------
  function parseRss(xmlText) {
    var doc = new DOMParser().parseFromString(xmlText, "text/xml");
    var item = doc.querySelector("channel > item");
    if (!item) throw new Error("No <item> found");

    var title = (item.querySelector("title") && item.querySelector("title").textContent) || "";
    var descNode = item.querySelector("description");
    var description = (descNode && descNode.textContent) || "";

    var dateMatch = String(title).match(/(\d{4}-\d{2}-\d{2})/);
    if (!dateMatch) throw new Error("No YYYY-MM-DD date found in item title");
    var ymd = dateMatch[1];

    // deterministic extraction of Adhan/Iqama from description CDATA
    var text = String(description);
    var prayerRe = /<strong>\s*(Fajar|Dhuhr|Asr|Maghrib|Isha)\s*:\s*<\/strong>\s*Adhan\s*([0-2]\d:[0-5]\d:[0-5]\d)\s*,\s*Iqama\s*([0-2]\d:[0-5]\d:[0-5]\d)/gi;

    var prayers = [];
    var m;
    while ((m = prayerRe.exec(text))) {
      prayers.push({ name: m[1], adhan: m[2], iqama: m[3] });
    }
    if (!prayers.length) throw new Error("No prayer blocks found in RSS description (unsupported format)");

    return { ymd: ymd, prayers: prayers, rawTitle: title };
  }

  // Bounded correction rule (deterministic): if Iqama < Adhan and looks like AM/PM typo, add 12h.
  function applyBoundedCorrection(prayerName, adhanObj, iqamaObj) {
    var adhanSec = hmsToSeconds(adhanObj);
    var iqamaSec = hmsToSeconds(iqamaObj);

    if (iqamaSec < adhanSec && iqamaSec < 12 * 3600 && adhanSec >= 12 * 3600) {
      var corrected = { h: iqamaObj.h + 12, mi: iqamaObj.mi, s: iqamaObj.s };
      if (corrected.h >= 24) return { didCorrect: false };
      return { didCorrect: true, from: iqamaObj, to: corrected, note: prayerName + " Iqama corrected (Iqama < Adhan invariant)" };
    }
    return { didCorrect: false };
  }

  function buildSchedule(parsed) {
    var rows = [];
    var corrections = [];

    for (var i = 0; i < parsed.prayers.length; i++) {
      var p = parsed.prayers[i];
      var adhanObj = parseHMS(p.adhan);
      var iqamaObj = parseHMS(p.iqama);
      if (!adhanObj || !iqamaObj) continue;

      var corr = applyBoundedCorrection(p.name, adhanObj, iqamaObj);
      var iqamaFinal = corr.didCorrect ? corr.to : iqamaObj;

      if (corr.didCorrect) {
        var toStr = String(iqamaFinal.h).padStart(2, "0") + ":" + String(iqamaFinal.mi).padStart(2, "0") + ":" + String(iqamaFinal.s).padStart(2, "0");
        corrections.push({ prayer: p.name, from: p.iqama, to: toStr, note: corr.note });
        p.iqama = toStr;
      }

      rows.push({
        name: p.name,
        adhanStr: p.adhan,
        iqamaStr: p.iqama,
        adhanDate: buildLocalDate(parsed.ymd, adhanObj, 0),
        iqamaDate: buildLocalDate(parsed.ymd, iqamaFinal, 0)
      });
    }

    rows.sort(function (a, b) { return a.iqamaDate.getTime() - b.iqamaDate.getTime(); });
    return { rows: rows, corrections: corrections };
  }

  function computeInterval(state, now) {
    var rows = state.rows || [];
    if (!rows.length) return null;

    var nextIdx = -1;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].iqamaDate.getTime() > now.getTime()) { nextIdx = i; break; }
    }

	    // If the next iqama is the FIRST one of the day (usually Fajr),
    // we still want a progress bar from the PREVIOUS day's last iqama (Isha) -> this Fajr.
    if (nextIdx === 0) {
      var next0 = rows[0];
      var prevLast = rows[rows.length - 1];

      var prevHMS0 = parseHMS(prevLast.iqamaStr);
      if (prevHMS0) {
        var prevDate0 = buildLocalDate(state.ymd, prevHMS0, -1); // yesterday's Isha time-of-day
        var prevSynthetic = Object.assign({}, prevLast, { iqamaDate: prevDate0 });

        return {
          prev: prevSynthetic,
          next: next0,
          prevName: prevLast.name,
          nextName: next0.name,
          isTomorrowAssumption: false,
          __syntheticPrevFromYesterday: true
        };
      }
      // If parsing fails, fall through to existing logic (bar may not render).
    }


    // If none left today, target "tomorrow Fajr" using today's Fajr time-of-day (RSS limitation acknowledged).
    if (nextIdx === -1) {
      var fajrIdx = -1;
      var ishaIdx = -1;
      for (var j = 0; j < rows.length; j++) {
        var nm = String(rows[j].name).toLowerCase();
        if (nm.indexOf("fajar") !== -1 || nm.indexOf("fajr") !== -1) fajrIdx = j;
        if (nm === "isha") ishaIdx = j;
      }
      var prev = (ishaIdx >= 0 ? rows[ishaIdx] : rows[rows.length - 1]);
      var fajr = (fajrIdx >= 0 ? rows[fajrIdx] : rows[0]);

      var fajrHMS = parseHMS(fajr.iqamaStr);
      if (!fajrHMS) return null;
      var nextDate = buildLocalDate(state.ymd, fajrHMS, 1);

      return {
        prev: prev,
        next: Object.assign({}, fajr, { iqamaDate: nextDate, __isTomorrowFajrAssumption: true }),
        prevName: prev.name,
        nextName: fajr.name,
        isTomorrowAssumption: true
      };
    }

    return {
      prev: (nextIdx > 0 ? rows[nextIdx - 1] : null),
      next: rows[nextIdx],
      prevName: (nextIdx > 0 ? rows[nextIdx - 1].name : null),
      nextName: rows[nextIdx].name,
      isTomorrowAssumption: false
    };
  }

  // ----------------------------
  // UI
  // ----------------------------
  function ensureStyles(host) {
    if (host.__miq_hasStyles) return;
    host.__miq_hasStyles = true;

    var style = document.createElement("style");

style.textContent = `
.miq-root{
  height:100%;
  display:flex;
  flex-direction:column;
  gap:8px;
  padding:10px;
  box-sizing:border-box;
}

.miq-header{
  display:grid;
  grid-template-columns:auto 1fr auto auto;
  align-items:center;
  gap:10px;
}

.miq-hl,.miq-hc,.miq-hr{font-weight:800}
.miq-hc{
  text-align:center;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
}

.miq-refresh{
  border:1px solid rgba(255,255,255,.18);
  background:rgba(255,255,255,.06);
  border-radius:8px;
  padding:4px 8px;
  cursor:pointer;
}
.miq-refresh:active{transform:translateY(1px)}

.miq-table{
  display:flex;
  flex-direction:column;
  gap:6px;
  margin-top:2px;
}

.miq-row{
  display:grid;
  grid-template-columns: minmax(48px, 1fr) minmax(64px, 1fr) auto;
  align-items:baseline;
  gap:12px;
}

.miq-head{
  font-weight:800;
  opacity:.85;
}

.miq-head > div{
  text-align:center;
}


.miq-row > div{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;              /* ensures no wrap */
  min-width:0;                     /* allows ellipsis in grid */
}

.miq-row > div:nth-child(1){ text-align:left; }
.miq-row > div:nth-child(2){ text-align:center; }
.miq-row > div:nth-child(3){ text-align:right; }

.miq-pr{opacity:.92;font-weight:700;text-align:left;}
.miq-ad{opacity:.85;text-align:center;}
.miq-iq{opacity:1;text-align:right;} /* align iqama times consistently */
.miq-iq strong{font-weight:900}

.miq-next{
  border-radius:10px;
  padding:4px 0;                 /* ✅ REMOVE horizontal padding */
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.12);
}

.miq-interval{margin:2px 0}

.miq-barLine{
  display:flex;
  align-items:center;
  gap:8px;
}

.miq-bar{
  position:relative;
  flex:1;
  height:22px;
  border-radius:12px;
  overflow:hidden;
  border:1px solid rgba(255,255,255,.16);
  background:rgba(0,0,0,.10);
}

.miq-barFill{
  position:absolute;
  top:0;
  bottom:0;
  right:0;           /* reverse fill direction */
  width:0%;
  background:linear-gradient(90deg,#4da3ff,#2f80ed);
}

.miq-bar.miq-urgent .miq-barFill{
  background:linear-gradient(90deg,#ff6b6b,#d63031);
}

.miq-barLabel{
  position:absolute;
  top:50%;
  transform:translateY(-50%);
  padding:0 10px;
  font-size:12px;
  font-weight:800;
  white-space:nowrap;
  font-variant-numeric:tabular-nums;
  pointer-events:none;
  color:rgba(255,255,255,.95);
  text-shadow:0 1px 0 rgba(0,0,0,.25);
  max-width: calc(100% - 16px);
}

.miq-barPct{
  font-size:12px;
  opacity:.85;
  white-space:nowrap;
}

.miq-foot{
  margin-top:auto;
  display:flex;
  justify-content:space-between;
  align-items:center;
  font-size:12px;
  opacity:.65;
}
`;

    host.appendChild(style);
  }

  function buildUI(host) {
    host.innerHTML = "";
    ensureStyles(host);

    var root = document.createElement("div");
    root.className = "miq-root";

    var header = document.createElement("div");
    header.className = "miq-header";

    var hl = document.createElement("div");
    hl.className = "miq-hl";
    hl.textContent = "Iqama";

    var hc = document.createElement("div");
    hc.className = "miq-hc";
    hc.textContent = "Masjid";

    var hr = document.createElement("div");
    hr.className = "miq-hr";
    hr.textContent = "إقامة";

    var refreshBtn = document.createElement("button");
    refreshBtn.className = "miq-refresh";
    refreshBtn.type = "button";
    refreshBtn.textContent = "⟳";
    refreshBtn.title = "Refresh RSS now";

    header.appendChild(hl);
    header.appendChild(hc);
    header.appendChild(hr);

    var settings = document.createElement("div");
    settings.className = "miq-settings";

    var table = document.createElement("div");
    table.className = "miq-table";

    var err = document.createElement("div");
    err.className = "miq-err";
    err.style.display = "none";

    var debug = document.createElement("div");
    debug.className = "miq-debug";
    debug.style.display = "none";

    var foot = document.createElement("div");
    foot.className = "miq-foot";


    var footL = document.createElement("div");
    var footR = document.createElement("div");
    foot.appendChild(footL);
    foot.appendChild(footR);

    root.appendChild(header);
    root.appendChild(settings);
    root.appendChild(table);
    root.appendChild(err);
    root.appendChild(debug);
    root.appendChild(foot);
	foot.appendChild(refreshBtn);

    host.appendChild(root);

    return { root: root, hl: hl, hc: hc, hr: hr, refreshBtn: refreshBtn, settings: settings, table: table, err: err, debug: debug, footL: footL, footR: footR };
  }

  function showSettings(state, show) {
    state.showSettings = !!show;
    state.ui.settings.style.display = state.showSettings ? "block" : "none";
    // Keep table visible even when settings open? We'll hide to avoid confusion.
    state.ui.table.style.display = state.showSettings ? "none" : "flex";
    state.ui.err.style.display = (state.showSettings ? "none" : (state.error ? "block" : "none"));
    state.ui.debug.style.display = "none";
  }

  function buildSettingsPanel(state) {
    var ctx = state.ctx;
    var ui = state.ui;
    var current = getAllSettings(ctx);

    ui.settings.innerHTML = "";

    var h = document.createElement("h3");
    h.textContent = "Masjid Iqama — Settings";

    var form = document.createElement("form");

    var grid = document.createElement("div");
    grid.className = "miq-grid";

    function mkInput(labelText, value, type, full) {
      var wrap = document.createElement("label");
      wrap.textContent = labelText;
      var inp = document.createElement("input");
      inp.type = type || "text";
      inp.value = value || "";
      wrap.appendChild(inp);
      if (full) wrap.style.gridColumn = "1 / span 2";
      return { wrap: wrap, inp: inp };
    }

    var masjidName = mkInput("Masjid name (required)", (current.masjid && current.masjid.name) || "", "text", false);
    var locHint = mkInput("Location hint (optional)", (current.masjid && current.masjid.locationHint) || "", "text", false);
    var feedUrl = mkInput("RSS Feed URL (required)", (current.feed && current.feed.url) || "", "text", true);
    var refreshSec = mkInput("Refresh seconds (10–3600)", String(clamp(current.refreshSeconds, 10, 3600)), "number", false);
    refreshSec.inp.min = "10";
    refreshSec.inp.max = "3600";

    grid.appendChild(masjidName.wrap);
    grid.appendChild(locHint.wrap);
    grid.appendChild(feedUrl.wrap);
    grid.appendChild(refreshSec.wrap);

    var toggles = document.createElement("label");
    toggles.textContent = "Show Arabic label (إقامة)";
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = !!(current.display && current.display.showArabicLabel);
    toggles.appendChild(cb);

    var dbg = document.createElement("label");
    dbg.textContent = "Debug parse details";
    var cbDbg = document.createElement("input");
    cbDbg.type = "checkbox";
    cbDbg.checked = !!(current.debug && current.debug.showParseDetails);
    dbg.appendChild(cbDbg);

    grid.appendChild(toggles);
    grid.appendChild(dbg);

    var actions = document.createElement("div");
    actions.className = "miq-actions";

    var closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.textContent = "Close";

    var resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.textContent = "Reset";

    var saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.textContent = "Save";

    actions.appendChild(closeBtn);
    actions.appendChild(resetBtn);
    actions.appendChild(saveBtn);

    form.appendChild(grid);
    form.appendChild(actions);

    closeBtn.addEventListener("click", function () {
      showSettings(state, false);
      render(state);
    });

    resetBtn.addEventListener("click", function () {
      resetSettings(ctx);
      state.settings = getAllSettings(ctx);
      showSettings(state, false);
      render(state);
      // trigger a refresh because feed/url could reset
      refresh(state, "reset");
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var patch = {
        masjid: {
          name: String(masjidName.inp.value || "").trim() || DEFAULTS.masjid.name,
          locationHint: String(locHint.inp.value || "").trim()
        },
        feed: {
          url: String(feedUrl.inp.value || "").trim() || DEFAULTS.feed.url,
          mode: "rss",
          parseStrategy: "auto"
        },
        refreshSeconds: clamp(refreshSec.inp.value, 10, 3600),
        display: { showArabicLabel: !!cb.checked, largeTypography: true },
        debug: { showParseDetails: !!cbDbg.checked }
      };

      setSettings(ctx, patch);
      state.settings = getAllSettings(ctx);
      showSettings(state, false);
      render(state);
      refresh(state, "save");
    });

    ui.settings.appendChild(h);
    ui.settings.appendChild(form);
  }

  function render(state) {
    var ui = state.ui;
    var s = state.settings;

    // Header
    ui.hc.textContent = (s.masjid && s.masjid.name) ? s.masjid.name : DEFAULTS.masjid.name;
    ui.hr.textContent = (s.display && s.display.showArabicLabel) ? "إقامة" : "";

    if (state.showSettings) {
      ui.footL.textContent = "";
      ui.footR.textContent = "";
      return;
    }

    // Error
    if (state.error) {
      ui.err.style.display = "block";
      ui.err.innerHTML = "<strong>⚠</strong> " + esc(state.error);
      ui.table.innerHTML = "";
      ui.footL.textContent = "";
      ui.footR.textContent = (state.lastFetchAt ? ("Last updated " + state.lastFetchAt.toLocaleTimeString()) : "");
      ui.debug.style.display = (s.debug && s.debug.showParseDetails) ? "block" : "none";
      ui.debug.textContent = (s.debug && s.debug.showParseDetails) ? (state.debugText || "") : "";
      return;
    }

    ui.err.style.display = "none";
    ui.debug.style.display = (s.debug && s.debug.showParseDetails) ? "block" : "none";
    ui.debug.textContent = (s.debug && s.debug.showParseDetails) ? (state.debugText || "") : "";

    var rows = state.rows || [];
    var now = nowDate();
    var interval = computeInterval(state, now);

    ui.table.innerHTML = "";
	  const hdr = document.createElement("div");
		hdr.className = "miq-row miq-head";
		hdr.innerHTML = `
		<div>Prayer</div>
		<div>Adhan</div>
		<div>Iqama</div>
		`;
		ui.table.appendChild(hdr);
    if (!rows.length || !interval || !interval.next) {
      ui.footL.textContent = "";
      ui.footR.textContent = (state.lastFetchAt ? ("Last updated " + state.lastFetchAt.toLocaleTimeString()) : "");
      return;
    }

    var nextName = interval.nextName;
    var prevName = interval.prevName;

    function addPrayerRow(r, isNext) {
      var row = document.createElement("div");
      row.className = "miq-row" + (isNext ? " miq-next" : "");
      if (s.display && s.display.largeTypography) row.style.fontSize = "14px";

      var pr = document.createElement("div");
      pr.className = "miq-pr";
	  pr.textContent = (r.name === "Fajar") ? "Fajr" : r.name;


      var ad = document.createElement("div");
      ad.className = "miq-ad";
      ad.textContent = r.adhanStr.slice(0, 5);

      var iq = document.createElement("div");
      iq.className = "miq-iq";
      iq.innerHTML = "<strong>" + esc(r.iqamaStr.slice(0, 5)) + "</strong>";

      row.appendChild(pr);
      row.appendChild(ad);
      row.appendChild(iq);
      ui.table.appendChild(row);
    }

    function addIntervalBar(prev, next) {
      if (!prev || !next) return;

      var now2 = nowDate();
      var totalMs = Math.max(1, next.iqamaDate.getTime() - prev.iqamaDate.getTime());
      var remainMs = Math.max(0, next.iqamaDate.getTime() - now2.getTime());
      var pctRemain = clamp(remainMs / totalMs, 0, 1); // 1 => just after prev, 0 => late

      var pctText = Math.round(pctRemain * 100) + "%";

	  var urgent = remainMs < (20 * 60 * 1000);

      var timeText = urgent ? fmtMMSS(remainMs) : fmtHHMM(remainMs);
      var labelText = "⏱ " + timeText + " left";

      var container = document.createElement("div");
      container.className = "miq-interval";

      var line = document.createElement("div");
      line.className = "miq-barLine";

      var bar = document.createElement("div");
      bar.className = "miq-bar";

	  if (urgent) bar.classList.add("miq-urgent");


      var fill = document.createElement("div");
      fill.className = "miq-barFill";
      fill.style.width = (pctRemain * 100).toFixed(2) + "%";

	var label = document.createElement("div");
	label.className = "miq-barLabel";
	label.textContent = labelText;

	// Anchor label fully INSIDE the larger segment.
	// NOTE: fill is right-anchored (remaining portion is on the RIGHT).
	var onFill = (pctRemain >= 0.5);

	if (onFill) {
		// Remaining (fill) is larger => place label on RIGHT side (inside fill)
		label.style.right = "8px";
		label.style.left = "auto";
		label.style.textAlign = "right";

		// White text works on blue/red fill
		label.style.color = "rgba(255,255,255,.95)";
		label.style.textShadow = "0 1px 0 rgba(0,0,0,.25)";
	} else {
		// Empty (gray) is larger => place label on LEFT side (inside empty)
		label.style.left = "8px";
		label.style.right = "auto";
		label.style.textAlign = "left";

		// Dark text works on the gray background
		label.style.color = "rgba(0,0,0,.70)";
		label.style.textShadow = "none";
	}

	  bar.appendChild(fill);
      bar.appendChild(label);

      var pct = document.createElement("div");
      pct.className = "miq-barPct";
      pct.textContent = pctText;

      line.appendChild(bar);
      line.appendChild(pct);
      container.appendChild(line);
      ui.table.appendChild(container);

      // footer refinements
      ui.footL.textContent = String(minutesRemaining(remainMs)) + " minutes remaining";
    }

	var barInserted = false;

	for (var i = 0; i < rows.length; i++) {
		var r = rows[i];
		addPrayerRow(r, (nextName && r.name === nextName));

		if (!barInserted && prevName && r.name === prevName) {
			addIntervalBar(interval.prev, interval.next);
			barInserted = true;
		}
	}

	// 🔒 SAFETY NET:
	// If we crossed midnight and couldn't match prevName in rows,
	// still render the bar AFTER the table.
	if (!barInserted && interval && interval.prev && interval.next) {
		addIntervalBar(interval.prev, interval.next);
	}

    // If we couldn't insert (prev missing), still compute footer
    if (!prevName) {
      var remainMs2 = Math.max(0, interval.next.iqamaDate.getTime() - now.getTime());
      ui.footL.textContent = String(minutesRemaining(remainMs2)) + " minutes remaining";
    }

    ui.footR.textContent = (state.lastFetchAt ? ("Last updated " + state.lastFetchAt.toLocaleTimeString()) : "");
  }

  // ----------------------------
  // Runtime
  // ----------------------------
  function setError(state, msg, detail) {
    state.error = msg || "";
    state.debugText = detail || "";
    render(state);
  }

  function clearError(state) {
    state.error = "";
    state.debugText = "";
  }

  function refresh(state, reason) {
    var s = state.settings;
    var url = (s.feed && s.feed.url) ? String(s.feed.url).trim() : "";
    if (!url) {
      setError(state, "Missing Feed URL (configure in ⚙️)");
      return;
    }

    state.lastFetchReason = reason || "";

    fetchWithTimeout(url, 15000)
      .then(function (txt) {
        state.lastFetchAt = nowDate();
        clearError(state);

        var parsed = parseRss(txt);
        var schedule = buildSchedule(parsed);
        state.ymd = parsed.ymd;
        state.rows = schedule.rows;

        // Debug details
        if (s.debug && s.debug.showParseDetails) {
          var lines = [];
          lines.push("RSS title: " + parsed.rawTitle);
          lines.push("YMD: " + parsed.ymd);
          lines.push("Reason: " + (reason || ""));
          if (schedule.corrections.length) {
            lines.push("Corrections:");
            schedule.corrections.forEach(function (c) {
              lines.push("- " + c.prayer + ": " + c.from + " → " + c.to);
            });
          }
          state.debugText = lines.join("\n");
        }

        render(state);
      })
      .catch(function (e) {
        setError(state, "RSS fetch failed (CORS/offline?)", String(e && e.message ? e.message : e));
      });
  }

  function updateTickMode(state) {
    var now = nowDate();
    var interval = computeInterval(state, now);
    if (!interval || !interval.next || !interval.prev) return;

    var remainMs = Math.max(0, interval.next.iqamaDate.getTime() - now.getTime());
    var wantFast = remainMs < (10 * 60 * 1000);
    var newMs = wantFast ? 1000 : 10000;

    if (state._tickMs !== newMs) {
      state._tickMs = newMs;
      if (state._tick) {
        clearInterval(state._tick);
        state._tick = null;
      }
      state._tick = setInterval(function () {
        // midnight refresh check
        try {
          if (state.ymd) {
            var d = nowDate();
            var y = d.getFullYear();
            var m = String(d.getMonth() + 1).padStart(2, "0");
            var dd = String(d.getDate()).padStart(2, "0");
            var ymdNow = y + "-" + m + "-" + dd;
            if (ymdNow !== state.ymd) {
              refresh(state, "midnight");
            }
          }
        } catch (e) {}
        render(state);
        updateTickMode(state);
      }, state._tickMs);
    }
  }

  function start(state) {
    // fetch cadence
    if (state._refresh) clearInterval(state._refresh);
    state._refresh = setInterval(function () {
      refresh(state, "auto");
    }, clamp(state.settings.refreshSeconds, 10, 3600) * 1000);

    // tick cadence
    state._tickMs = null;
    updateTickMode(state);
  }

  function stop(state) {
    if (state._tick) { clearInterval(state._tick); state._tick = null; }
    if (state._refresh) { clearInterval(state._refresh); state._refresh = null; }
  }

  // ----------------------------
  // Lifecycle (Portal expects mount(host, ctx))
  // ----------------------------
  function mount(host, ctx) {
    host.innerHTML = "";

    var ui = buildUI(host);
    var state = {
      ctx: ctx,
      host: host,
      ui: ui,
      settings: getAllSettings(ctx),
      rows: [],
      ymd: null,
      lastFetchAt: null,
      lastFetchReason: "",
      error: "",
      debugText: "",
      showSettings: false,
      _tick: null,
      _tickMs: null,
      _refresh: null
    };

    host.__miq_state = state;

    ui.refreshBtn.addEventListener("click", function () {
      refresh(state, "manual");
    });

    render(state);
    refresh(state, "mount");
    start(state);
  }

  function unmount(host) {
    var state = host && host.__miq_state;
    if (state) stop(state);
    if (host) {
      delete host.__miq_state;
      host.innerHTML = "";
    }
  }

  // Portal gear icon: toggle in-gadget settings panel (EmbedWeb/Flashcards pattern)
  function onSettingsRequested(ctx, shell) {
    var host = (shell && (shell.body || shell.slot)) || null;
    var root = host;
    if (!root) return;

    // Find our mounted state
    var state = root.__miq_state || (root.querySelector && root.querySelector(".miq-root") && root.__miq_state) || null;
    // Fallback: sometimes shell.body is inside host; walk up
    if (!state && root.closest) {
      var p = root;
      while (p && !state) {
        if (p.__miq_state) state = p.__miq_state;
        p = p.parentNode;
      }
    }
    if (!state) return;

    // toggle
    if (!state.showSettings) {
      state.settings = getAllSettings(state.ctx);
      buildSettingsPanel(state);
      showSettings(state, true);
    } else {
      showSettings(state, false);
      render(state);
    }
  }

  function onInfoClick(ctx, shell) {
    // Minimal: toggle settings as help entrypoint if desired.
    onSettingsRequested(ctx, shell);
  }

  // Register
  window.GADGETS = window.GADGETS || {};
  window.GADGETS[manifest._class] = { manifest: manifest, mount: mount, unmount: unmount, onSettingsRequested: onSettingsRequested, onInfoClick: onInfoClick };
})();
