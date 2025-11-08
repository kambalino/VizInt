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
	 *		- Gadget is Chronus-backed and subscribes to Chronus events.
	 *		- Gadget OWNS its provider (no global providers; no index.html includes).
	 *		- Does NOT change Chronus global frame; works with 'daily' by convention.
	 *		- Uses Chronus cursor/context as the authoritative "now"/"where".
	 *
	 * 2) Behavior
	 *		- Compute/refresh prayer anchors for the active context + cursor date.
	 *		- Always include NEXT-DAY FAJR as an extra boundary for post-Isha.
	 *		- Highlight the CURRENT PRAYER SLOT.
	 *		- Show ONLY ONE countdown: time remaining until the NEXT PRAYER.
	 *		- Update EVERY SECOND (subscribe to Chronus ticks).
	 *		- Handle day transitions, DST changes, and timezone travel via Chronus.
	 *
	 * 3) Dependencies
	 *		- Needs a global `prayTimes` API compatible with the legacy gadget.
	 *		- If missing, gadget fails gracefully and prints diagnostics in fineprint.
	 *
	 * 4) UI
	 *		- Controls: Yesterday / Today / Tomorrow (cursor travel), context picker.
	 *		- Prayer list shows rows; CURRENT slot is highlighted with a leading '▷'.
	 *		- A single countdown line appears below the list, right-aligned, as:
	 *		  "⌛ <H:MM:SS>" and continuously updates every second.
	 *
	 * 5) Notes/Assumptions
	 *		- Sunrise is rendered but NOT considered a "current slot" boundary.
	 *		- Method selection:
	 *			* If context.method exists, use it. Else default 'MWL'.
	 *			* (We can graft full pickMethod() from legacy later.)
	 *
	 * 6) Diagnostics
	 *		- Always print high-level diagnostic messages in the gadget fineprint.
	 *		- Always print detailed console debug output.
	 *		- Do NOT throw hard errors; fail gracefully.
	 *
	 * ★ Future hooks (not implemented yet; tracked here)
	 *		- Import legacy method heuristics (pickMethod by country/lat/lng).
	 *		- Multi-calendar overlays (e.g., Hijri) as separate providers.
	 *		- Settings for Asr juristic method (Standard/Hanafi).
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
	// Optional lazy loader for prayTimes (file:// friendly)
	// - Tries window.VIZINT_PRAYTIMES_SRC if provided. Otherwise stays graceful.
	// - No console logs; communicates via fineprint diagnostics.
	// ---------------------------------------------------------------------

	async function ensurePrayTimes(host){

		// Same CDN URL as legacy (via httpSafe for consistency)
		const src = window.httpSafe
			? window.httpSafe('praytimes.org/code/v2/js/PrayTimes.js')
			: 'https://praytimes.org/code/v2/js/PrayTimes.js';

		setNote(host, 'Loading PrayerTimes library…');

		try{
			await window.loadExternalScriptOnce(src, () => typeof window.prayTimes !== 'undefined', 8000);
			setNote(host, 'PrayerTimes ready.');
			return true;
		}catch(err){
			setNote(host, 'PrayerTimes failed to load.');
			// this error is deemed console-worthy
			console.debug('[prayertimes-chronus] load failed:', err);
			return false;
		}
	}

	// --- Method auto-pick (self-contained; no dependency on legacy gadget) ---
	function pickMethod(country, lat, lng){
		// Map by country (same spirit as legacy)
		const map = {
			US:'ISNA', CA:'ISNA',
			EG:'Egypt', SA:'Makkah', IR:'Tehran',
			IN:'Karachi', PK:'Karachi', BD:'Karachi',
			GB:'MWL', UK:'MWL', NL:'MWL', IT:'MWL', FR:'MWL', ES:'MWL', DE:'MWL',
			ID:'MWL', MY:'MWL', SG:'MWL', BN:'MWL', TR:'MWL', AU:'MWL', NZ:'MWL',
			JP:'MWL', CN:'MWL', KR:'MWL'
		};
		if (country && country !== 'NA' && map[country]) return map[country];

		// Geobox: North America fallback (if cc unknown)
		if (typeof lat === 'number' && typeof lng === 'number'){
			if (lat >= 5 && lat <= 83 && lng >= -170 && lng <= -50) return 'ISNA';
		}
		return 'MWL';
	}

	// ---------------------------------------------------------------------
	// Provider (owned by this gadget)
	// Generates today's 5 prayers + NEXT-DAY FAJR for a proper next boundary.
	// ---------------------------------------------------------------------
	const PrayerProvider = {
		name: 'PrayerTimesProvider/Chronus',
		async provide({ context, frame, cursor }){
			if (frame !== 'daily') return [];

			if (typeof prayTimes === 'undefined'){
				return []; // graceful: gadget will show diagnostics
			}

			const date = new Date(cursor);
			// Resolve method
			let method = (context && typeof context.method === 'string') ? context.method : 'auto';
			if (!method || method.toLowerCase() === 'auto'){
				method = pickMethod(context && context.country, context && context.lat, context && context.lng);
			}
			try { prayTimes.setMethod(method); } catch {}

			const asrMode = (context && typeof context.asr === 'string') ? context.asr : 'Standard';
			try { prayTimes.adjust({ asr: asrMode }); } catch {}

			const toDateAt = (base, hhmm) => {
				const [h,m] = (''+hhmm).split(':').map(n => +n);
				return new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, m, 0, 0);
			};

			const todayTimes = prayTimes.getTimes(date, [context.lat, context.lng]);
			const fajr		= toDateAt(date, todayTimes.fajr);
			const sunrise	= toDateAt(date, todayTimes.sunrise);
			const dhuhr		= toDateAt(date, todayTimes.dhuhr);
			const asr		= toDateAt(date, todayTimes.asr);
			const maghrib	= toDateAt(date, todayTimes.maghrib);
			const isha		= toDateAt(date, todayTimes.isha);

			const nextDate  = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
			const nextTimes = prayTimes.getTimes(nextDate, [context.lat, context.lng]);
			const fajrNext	= toDateAt(nextDate, nextTimes.fajr);

			return [
				{ id:'prayer:fajr',			label:'Fajr',		at: fajr,		frame:'daily', category:'religious', contextId: context.id, source: PrayerProvider.name },
				{ id:'misc:sunrise',		label:'Sunrisej',	at: sunrise,	frame:'daily', category:'info',		contextId: context.id, source: PrayerProvider.name },
				{ id:'prayer:dhuhr',		label:'Dhuhr',		at: dhuhr,		frame:'daily', category:'religious', contextId: context.id, source: PrayerProvider.name },
				{ id:'prayer:asr',			label:'Asr',		at: asr,		frame:'daily', category:'religious', contextId: context.id, source: PrayerProvider.name },
				{ id:'prayer:maghrib',		label:'Maghrib',	at: maghrib,	frame:'daily', category:'religious', contextId: context.id, source: PrayerProvider.name },
				{ id:'prayer:isha',			label:'Isha',		at: isha,		frame:'daily', category:'religious', contextId: context.id, source: PrayerProvider.name },
				{ id:'prayer:fajr_next',	label:'Fajr',		at: fajrNext,	frame:'daily', category:'religious', contextId: context.id, source: PrayerProvider.name }
			];
		}
	};

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
		const nameMap = {
			'prayer:fajr':     ['Fajr','الفجر'],
			'misc:sunrise':    ['Sunrise','الشروق'],
			'prayer:dhuhr':    ['Dhuhr','الظهر'],
			'prayer:asr':      ['Asr','العصر'],
			'prayer:maghrib':  ['Maghrib','المغرب'],
			'prayer:isha':     ['Isha','العشاء']
		};

		// Only visible rows (exclude fajr_next)
		const visible = anchors
			.filter(a => ((a.id||'').startsWith('prayer:') && a.id !== 'prayer:fajr_next') || a.id === 'misc:sunrise')
			.sort((a,b) => a.at - b.at);

		const rows = visible.map(a => {
			const [en, ar] = nameMap[a.id] || [a.label, ''];
			const timeStr = `${pad2(a.at.getHours())}:${pad2(a.at.getMinutes())}`;
			return `
				<div class="row" data-id="${a.id}">
					<div class="label">:${en}${ar ? ' -('+ar+')' : 'n/a'}</div>
					<div class="time">${timeStr}</div>
				</div>
			`;
		}).join('');
		listEl.innerHTML = rows;

		// Figure out current from the full sequence (with fajr_next) then decorate the matching visible row
		const { current } = resolveSlots(anchors, now);

		Array.from(listEl.querySelectorAll('.row')).forEach(el => {
			el.classList.remove('current');
			const lab = el.querySelector('.label');
			if (lab) lab.textContent = lab.textContent.replace(/^▷\s*/, '');
		});

		if (current){
			// If current is fajr_next, we highlight today's Isha
			const currentId = (current.id === 'prayer:fajr_next') ? 'prayer:isha' : current.id;
			const el = listEl.querySelector(`.row[data-id="${currentId}"]`);
			if (el){
				el.classList.add('current');
				const lab = el.querySelector('.label');
				if (lab && !/^▷\s/.test(lab.textContent)) lab.textContent = '▷ ' + lab.textContent;
			}
		}
	}


	function computeNextCountdown(anchors, now){
		const { next } = resolveSlots(anchors, now);
		if (!next) return { label: '—', etaSecs: 0 };
		const etaSecs = Math.max(0, Math.floor((next.at - now) / 1000));
		// If the next anchor is 'prayer:fajr_next', show label 'Fajr'
		const label = (next.id === 'prayer:fajr_next') ? 'Fajr' : (next.label || '—');
		return { label, etaSecs };
	}

	// ---------------------------------------------------------------------
	// Gadget mount
	// ---------------------------------------------------------------------
	function mount(host){
		host.innerHTML = `
			<div class="fineprint muted" id="note"></div>
			<div class="field" id="nav">
				<strong>Date</strong>
				<div style="nav-btns">
					<button class="mini" id="yesterday">◀</button>
					<button class="mini" id="today">Today</button>
					<button class="mini" id="tomorrow">▶</button>
				</div>
			</div>			
			<div id="list"></div>
			<div class="field">
				<div></div>
				<div id="nextLine" style="text-align:right;"><span>⌛ </span><span id="nextEta">--:--:--</span></div>
			</div>
		`;

		const listEl	= host.querySelector('#list');
		const nextEta	= host.querySelector('#nextEta');

		// Try to ensure prayTimes exists (lazy), otherwise print diagnostics.
		// When it finally loads, register provider and force a Chronus refresh.
		(async () => {
			const ok = await ensurePrayTimes(host);
			if (ok){
				setNote(host, '');
				window.Chronus.registerProvider(PrayerProvider);
				// Nudge refresh
				const st = window.Chronus.getState ? window.Chronus.getState() : { cursor: new Date() };
				window.Chronus.setCursor(st.cursor);
			}
		})();

		// Controls
		host.querySelector('#yesterday').addEventListener('click', () => window.Chronus.jump({ days:-1 }));
		host.querySelector('#today').addEventListener('click', () => window.Chronus.setCursor(new Date()));
		host.querySelector('#tomorrow').addEventListener('click', () => window.Chronus.jump({ days:+1 }));

		let latestAnchors = [];
		function recalcAndPaint(){
			const now = new Date(); // real-time clock for countdown & slot highlight
			renderList(listEl, latestAnchors, now);
			const next = computeNextCountdown(latestAnchors, now);
			nextEta.textContent = fmtHMS(next.etaSecs);
			// High-level diagnostics in fineprint
			try {
				const st = window.Chronus.getState ? window.Chronus.getState() : {};
				const ctxs = (window.Chronus.listContexts && window.Chronus.listContexts()) || [];
				const ctx = ctxs.find(c => c.id === st.activeContextId) || ctxs[0] || {};

				const methodPicked = (ctx && typeof ctx.method === 'string' && ctx.method.toLowerCase() !== 'auto')
					? ctx.method
					: pickMethod(ctx && ctx.country, ctx && ctx.lat, ctx && ctx.lng);
				const asrMode = (ctx && typeof ctx.asr === 'string') ? ctx.asr : 'Standard';
				const tz = ctx && ctx.tz ? ctx.tz : (Intl.DateTimeFormat().resolvedOptions().timeZone || 'local');

				// Fineprint base: City always
				// Prefer ctx.city if available; otherwise fall back gracefully
				let city = (ctx && ctx.city) || (ctx && ctx.label) || '—';
				if (/^current location$/i.test(city) && window.ipApiJSONP) {
					// Try to resolve to a proper city name once
					if (!host._ipCity) {
						host._ipCity = '…';
						window.ipApiJSONP(3000).then(r => {
							if (r && r.city) {
								host._ipCity = r.city;
								recalcAndPaint();
							}
						});
					}
					if (host._ipCity && host._ipCity !== '…') {
						city = host._ipCity;
					}
				}

				// Title-bar [i] button lives outside the gadget DOM; find it and wire tooltip + toggle
				const slot = host.closest('.gadget-slot');
				const infoBtn = slot ? slot.querySelector('.gbtn.g-info') : null;

				// Determine whether extra detail is currently shown (toggle stored on slot)
				const showExtra = !!(slot && slot._showExtraInfo);

				// Fineprint content
				const base = city;
				const extra = ` · Method: ${methodPicked} (Asr ${asrMode}) · tz: ${tz}`;
				setNote(host, showExtra ? (base + extra) : base);

				// Show/hide the date navigation when [i] is toggled
				const nav = host.querySelector('#nav');
				if (nav) {
					nav.style.display = showExtra ? 'block' : 'none';
				}



				// Tooltip: City/Country/Lat/Long/Method/TZ/DST
				if (infoBtn){
					const dst = (new Date()).toTimeString().includes('DST') ? 'Yes' : 'No';
					const tip = [
						`City: ${city}`,
						`Country: ${ctx.country || '—'}`,
						`Lat: ${ctx.lat ?? '—'}`,
						`Long: ${ctx.lng ?? '—'}`,
						`Method: ${methodPicked} (Asr ${asrMode})`,
						`TZ: ${tz}`,
						`DST: ${dst}`
					].join('\n');
					infoBtn.title = tip;
					// Hook the toggle once
					if (!infoBtn._wired){
						infoBtn.addEventListener('click', () => {
							const s = host.closest('.gadget-slot');
							if (s) s._showExtraInfo = !s._showExtraInfo;
							recalcAndPaint();
						});
						infoBtn._wired = true;
					}
				}
			} catch(_) {}
		}

		const offBlend  = window.Chronus.on('chronus.blend.update', ev => {
			latestAnchors = (ev.detail && Array.isArray(ev.detail.anchors)) ? ev.detail.anchors.slice() : [];
			recalcAndPaint();
		});
		const offTick   = window.Chronus.on('chronus.anchor.tick', () => recalcAndPaint());
		const offCursor = window.Chronus.on('chronus.cursor.change', () => recalcAndPaint());
		const offCtx    = window.Chronus.on('chronus.context.change', () => recalcAndPaint());

		return () => { offBlend && offBlend(); offTick && offTick(); offCursor && offCursor(); offCtx && offCtx(); };
	}

	// Register gadget
	window.GADGETS = window.GADGETS || {};
	window.GADGETS[GID] = { mount, info:'Prayer Times (Chronus-backed)' };
})();
