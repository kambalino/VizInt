(function(){
	/**
	 * =========================================================================
	 * PRAYER TIMES (CHRONUS-BACKED) — GADGET
	 * File: gadgets/prayertimes-chronus.js
	 * Indentation: Tabs (width = 4)
	 * -------------------------------------------------------------------------
	 * REQUIREMENTS & SCOPE (kept current)
	 * -------------------------------------------------------------------------
	 * 1) Architecture
	 *		- Chronus-backed: subscribes to Chronus events (blend/cursor/context/tick).
	*		- Gadget OWNS its provider (no global provider files, no index.html includes).
	*		- NO dependency on “chronus-core” or “chronus-timer” as gadgets.
	*		  Chronus runs as a library (lib/chronus.js) and emits its own tick.
	*		- Works with frame 'daily' by convention; does not mutate global frame.
	*
	* 2) Behavior
	*		- Compute/refresh anchors for active context + cursor date.
	*		- Always include NEXT-DAY FAJR as rollover boundary (for post-Isha).
	*		- Highlight CURRENT PRAYER SLOT with a leading '▷'.
	*		- Show ONE countdown only: time remaining until the NEXT boundary.
	*		- Update EVERY SECOND (real-time now, not the fixed Chronus cursor).
	*		- Survive day transitions, DST changes, and timezone travel.
	*
	* 3) Dependencies
	*		- Requires a global `prayTimes` API (loaded lazily via loadExternalScriptOnce).
	*		- If not present, load https://praytimes.org/code/v2/js/PrayTimes.js (httpSafe).
	*		- Fail gracefully if it can’t load (print fineprint message; no exceptions).
	*
	* 4) UI
	*		- Top fineprint ALWAYS shows City (ctx.city or resolved via IP JSONP).
	*		- Title-bar [i]:
	*			• toggles extra detail appended to the fineprint:
	*			  " · Method: <X> (Asr <Y>) · tz: <zone>"
	*			• tooltip (hover) shows City/Country/Lat/Long/Method/TZ/DST.
	*		- Prayer list labels include Arabic in parentheses (e.g., "Isha (العشاء)").
	*		- Navigation (Yesterday / Today / Tomorrow) uses small buttons (class 'mini'),
	*		  is hidden by default, and becomes visible only when [i] is toggled.
	*		- Countdown below current active prayer: "⌛ H:MM:SS", right-aligned, ticking every second.
	*
	* 5) Notes/Assumptions
	*		- Sunrise is rendered but NOT considered a "current slot" boundary.
	*		- Method auto-pick:
	*			• If context.method = 'auto' or missing → use internal pickMethod(country, lat, lng):
	*			  US/CA → ISNA; known-country map → specific methods; NA geobox → ISNA; else MWL.
	*			• Asr defaults to 'Standard' unless context.asr provided.
	*		- City Resolution: prefer ctx.city; if ctx.label is "Current Location", resolve once via ipApiJSONP and cache.
	*
	* 6) Diagnostics
	*		- High-level messages go to gadget fineprint (top).
	*		- Console logging is suppressed except for hard failures (e.g., prayTimes load error).
	*
	* 7) Styling (CSS)
	*		- No inline layout styles; relies on styles/common.css:
	*			• #nav { display:none; } (shown when [i] toggled)
	*			• .nav-btns { display:flex; gap:6px; margin-top:6px; }
	*			• button.mini { padding:2px 8px; font-size:12px; line-height:1.1; }
	*
	* ★ Future hooks
	*		- Multi-calendar overlays (e.g., Hijri) via separate providers.
	*		- Settings surface for method selection + Asr juristic option.
	*		- Context picker UI (multi-city) when Chronus exposes a contexts list UX.
	* =========================================================================
	*/
	const GID = 'prayertimes-chronus';

	// ---------------------------------------------------------------------
	// Diagnostics helper (fineprint only; no console spam)
	// ---------------------------------------------------------------------
	function setNote(host, msg){
		const noteEl = host.querySelector('#note');
		if (noteEl) noteEl.textContent = msg || '';
	}

	// ---------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------
	
	function pad2(n){ return String(n).padStart(2, '0'); }
	function fmtHMS(secs){
		secs = Math.max(0, secs|0);
		const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60;
		return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
	}

	function resolveSlots(anchors, now){
		// Sequence that includes tomorrow’s fajr as the rollover boundary
		const seq = anchors
			.filter(a => (a.id||'').startsWith('prayer:')) // includes fajr_next
			.sort((a,b) => a.at - b.at);

		if (!seq.length) return { seq: [], current: null, next: null };

		// First anchor strictly after "now" is the NEXT; previous is CURRENT (with wrap)
		let nextIndex = seq.findIndex(a => a.at > now);
		if (nextIndex === -1) nextIndex = seq.length - 1; // after last anchor → treat last as "next"
		let currentIndex = (nextIndex - 1 + seq.length) % seq.length;

		const next = seq[nextIndex];
		const current = seq[currentIndex];

		return { seq, current, next };
	}

function renderList(listEl, anchors, now){
	// Visible rows exclude fajr_next; include sunrise
	const visible = anchors
		.filter(a => ((a.id||'').startsWith('prayer:') && a.id !== 'prayer:fajr_next') || a.id === 'misc:sunrise')
		.sort((a,b) => a.at - b.at);

	const slots = resolveSlots(anchors, now); // { seq, current, next }

	const currentVisibleId = slots.current
		? (slots.current.id === 'prayer:fajr_next' ? 'prayer:isha' : slots.current.id)
		: null;

	const nextVisibleId = slots.next
		? (slots.next.id === 'prayer:fajr_next' ? 'prayer:fajr' : slots.next.id)
		: null;

	// Compute countdown for current prayer
	let timeLeftStr = '';
	if (slots.current && slots.next) {
		const etaSecs = Math.max(0, Math.floor((slots.next.at - now) / 1000));
		const h = Math.floor(etaSecs / 3600);
		const m = Math.floor((etaSecs % 3600) / 60);
		const s = etaSecs % 60;
		timeLeftStr = `${h}:${pad2(m)}:${pad2(s)}`;
	}

	const rows = visible.map(a => {
		const en = a.label || a.id;
		const ar = a.labelAr || '';
		const timeStr = `${pad2(a.at.getHours())}:${pad2(a.at.getMinutes())}`;
		const isCurrent = (a.id === currentVisibleId);

		let extra = '';
		if (isCurrent && timeLeftStr) {
			extra = ``;//`<br>⌛ Time Left: ${timeLeftStr}`;
		}

		return `
			<div class="row${isCurrent ? ' current' : ''}" data-id="${a.id}">
				<div class="label">${isCurrent ? '▷ ' : ''}${en}${ar ? ' ('+ar+')' : ''}</div>
				<div class="time">${timeStr}${extra}</div>
			</div>
		`;
	}).join('');
	listEl.innerHTML = rows;
}




	function computeNextCountdown(anchors, now){
		const { next } = resolveSlots(anchors, now);
		if (!next){
			console.debug('[PTC] computeNextCountdown: no next slot.');
			return { label: '—', etaSecs: 0 };
		}
		const etaSecs = Math.max(0, Math.floor((next.at - now) / 1000));
		const label   = (next.id === 'prayer:fajr_next') ? 'Fajr' : (next.label || '—');
		console.debug('[PTC] computeNextCountdown:', { nextId: next.id, label, etaSecs });
		return { label, etaSecs };
	}

	// ---------------------------------------------------------------------
	// Gadget mount
	// ---------------------------------------------------------------------
	async function mount(host){
		host.innerHTML = `
			<div class="fineprint muted" id="note"></div>
			<div class="field" id="nav">
				<strong>Date</strong>
				<div class="nav-btns">
					<button class="mini" id="yesterday">◀</button>
					<button class="mini" id="today">Today</button>
					<button class="mini" id="tomorrow">▶</button>
				</div>
			</div>
			<div id="list"></div>
		`;

		// Ensure the Chronus library is present (and exposes .on) before anything else
		await (window.loadExternalScriptOnce
			? window.loadExternalScriptOnce('./lib/chronus.js', () => (window.Chronus && typeof window.Chronus.on === 'function'), 8000)
			: (async () => {
				if (!(window.Chronus && typeof window.Chronus.on === 'function')) {
					const s = document.createElement('script');
					s.src = './lib/chronus.js';
					document.head.appendChild(s);
					// crude poll until available
					const t0 = Date.now();
					await new Promise((resolve, reject) => {
						(function poll(){
							if (window.Chronus && typeof window.Chronus.on === 'function') return resolve();
							if (Date.now() - t0 > 8000) return reject(new Error('Chronus load timeout'));
							setTimeout(poll, 80);
						})();
					});
				}
			})());

		// Ensure the prayer provider library is loaded (registers itself)
		await (window.loadExternalScriptOnce
			? window.loadExternalScriptOnce('./providers/chronus_prayerTimes_provider.js', () => !!window.__ChronusPrayerProviderReady, 8000)
			: (async () => { const s=document.createElement('script'); s.src='./providers/chronus_prayerTimes_provider.js'; document.head.appendChild(s); })());

		// Bootstrap Chronus if there is no context yet (we removed chronus-core gadget)
		try{
			const hasCtx = (window.Chronus.listContexts && window.Chronus.listContexts().length > 0);
			if (!hasCtx){
				const geo = await (window.getBestGeo ? window.getBestGeo({ ipTimeoutMs: 4000 }) : null);
				const ctx = geo ? {
					id: 'current',
					label: 'Current Location',
					city: geo.city || '',
					country: geo.country || 'NA',
					tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
					lat: geo.lat, lng: geo.lng, method: 'auto'
				} : {
					id: 'cairo',
					label: 'Cairo (fallback)',
					city: 'Cairo',
					country: 'EG',
					tz: 'Africa/Cairo',
					lat: 30.0444, lng: 31.2357, method: 'auto'
				};
				window.Chronus.addContext(ctx);
				window.Chronus.setFrame('daily');
				window.Chronus.start();
			}
		}catch(_){}

		try { window.Chronus.start && window.Chronus.start(); } catch(_) {}


		

		const listEl	= host.querySelector('#list');
		const nextEta	= host.querySelector('#nextEta');

		// Controls
		host.querySelector('#yesterday').addEventListener('click', () => window.Chronus.jump({ days:-1 }));
		host.querySelector('#today').addEventListener('click', () => window.Chronus.setCursor(new Date()));
		host.querySelector('#tomorrow').addEventListener('click', () => window.Chronus.jump({ days:+1 }));

		let latestAnchors = [];

function recalcAndPaint(){
	const now = new Date();

	// 1) render rows
	renderList(listEl, latestAnchors, now);

	// 2) compute next countdown
	const { next } = resolveSlots(latestAnchors, now);
	const eta = next ? Math.max(0, Math.floor((next.at - now)/1000)) : 0;
	const etaStr = fmtHMS(eta);

	// 3) place a fresh countdown row right after CURRENT (remove any old one)
	const list   = host.querySelector('#list');
	const curRow = list ? list.querySelector('.row.current') : null;

	// remove prior countdown rows living inside the list
	Array.from(list.querySelectorAll('.row.countdown')).forEach(n => n.remove());

	if (list && curRow && next){
		curRow.insertAdjacentHTML('afterend', `
			<div class="row countdown">
				<div class="label">⌛ Time left</div>
				<div class="time">${etaStr}</div>
			</div>
		`);
	}
}

		const offBlend  = window.Chronus.on('chronus.blend.update', ev => {
			latestAnchors = (ev.detail && Array.isArray(ev.detail.anchors)) ? ev.detail.anchors.slice() : [];
			recalcAndPaint();
		});
		const offTick   = window.Chronus.on('chronus.anchor.tick',   () => recalcAndPaint());
		const offCursor = window.Chronus.on('chronus.cursor.change', () => recalcAndPaint());
		const offCtx    = window.Chronus.on('chronus.context.change',() => recalcAndPaint());

		// 🔹 Nudge providers to compute anchors now, and paint immediately
		try { window.Chronus.setCursor(new Date()); } catch(_) {}
		recalcAndPaint();

		return () => { offBlend && offBlend(); offTick && offTick(); offCursor && offCursor(); offCtx && offCtx(); };
	}

	// Register gadget
	window.GADGETS = window.GADGETS || {};
	window.GADGETS[GID] = { mount, info:'Prayer Times (Chronus-backed)' };
})();
