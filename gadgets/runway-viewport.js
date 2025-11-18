(function(){
	/**
	 * =====================================================================
	 * RUNWAY VIEWPORT — Chronus-backed anchor viewer
	 * File: gadgets/runway-viewport.js
	 * Tabs: hard (width = 4)
	 * ---------------------------------------------------------------------
	 * $VER: Runway Viewport #042 (VizInt)
	 *
	 * History
	 *  - #042 2025-11-17
	 *      • Make gadget fully self-contained:
	 *          - Load ./lib/chronus.js if needed.
	 *          - Load civil + prayer-time providers with their ready flags.
	 *          - Bootstrap a default Chronus context if none exists
	 *            (geo → "current" → Cairo fallback).
	 *          - Subscribe to Chronus events and render anchors.
	 */

	const GID = 'runway-viewport';

	// ---------------------------------------------------------------------
	// Small helpers
	// ---------------------------------------------------------------------

	function pad2(n){
		return (n < 10 ? '0' : '') + n;
	}

	function fmtTime(d){
		return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
	}

	function safeJsonParse(str, fallback){
		try { return JSON.parse(str); } catch(_){ return fallback; }
	}

	function fmtHMS(totalSeconds){
		const s = Math.max(0, totalSeconds|0);
		const h = (s / 3600) | 0;
		const m = ((s % 3600) / 60) | 0;
		const r = (s % 60) | 0;
		return (h ? h + ':' : '') + pad2(m) + ':' + pad2(r);
	}

	// Decide current/next anchors given "now"
	function resolveSlots(anchors, now){
		let current = null;
		let next	= null;

		const sorted = (anchors || []).slice().sort((a,b) => a.at - b.at);

		for (let i = 0; i < sorted.length; i++){
			const a = sorted[i];
			const b = sorted[i+1] || null;

			if (a.at <= now && (!b || b.at > now)){
				current = a;
				next    = b || null;
				break;
			}
			if (now < a.at){
				next = a;
				break;
			}
		}
		return { current, next, sorted };
	}

	// ---------------------------------------------------------------------
	// Rendering
	// ---------------------------------------------------------------------

	function renderList(listEl, anchors, now){
		if (!listEl){
			return;
		}

		const { current, sorted } = resolveSlots(anchors, now);

		listEl.innerHTML = '';

		if (!sorted || !sorted.length){
			const empty = document.createElement('div');
			empty.className = 'muted';
			empty.style.padding = '4px 8px';
			empty.textContent = 'No anchors available for this context/frame.';
			listEl.appendChild(empty);
			return;
		}

		for (const a of sorted){
			const row  = document.createElement('div');
			row.className = 'row' + (current && current.id === a.id ? ' current' : '');

			const label = document.createElement('div');
			label.className = 'label';
			label.textContent = (a.label || a.id || '').toString();

			const time = document.createElement('div');
			time.className = 'time';
			const at = (a.at instanceof Date) ? a.at : new Date(a.at);
			time.textContent = fmtTime(at);

			row.appendChild(label);
			row.appendChild(time);
			listEl.appendChild(row);
		}
	}

	// ---------------------------------------------------------------------
	// Script loading helpers (mirrors PrayerTimes gadget)
	// ---------------------------------------------------------------------

	function ensureScript(url, isReady, timeoutMs){
		return new Promise((resolve, reject) => {
			const readyFn = (typeof isReady === 'function') ? isReady : () => !!isReady;
			if (readyFn()){
				return resolve();
			}

			if (window.loadExternalScriptOnce){
				window.loadExternalScriptOnce(url, readyFn, timeoutMs || 8000)
					.then(resolve, reject);
				return;
			}

			// Fallback: manual <script> + poll
			const s = document.createElement('script');
			s.src = url;
			document.head.appendChild(s);

			const t0 = Date.now();
			(function poll(){
				if (readyFn()) return resolve();
				if (Date.now() - t0 > (timeoutMs || 8000)){
					return reject(new Error('Script load timeout: ' + url));
				}
				setTimeout(poll, 80);
			})();
		});
	}

	// ---------------------------------------------------------------------
	// Gadget mount
	// ---------------------------------------------------------------------

	async function mount(host, ctx){
		host.classList.add('runway-viewport');

		// Basic chrome
		host.innerHTML = `
			<div class="fineprint" id="fine"></div>
			<div class="controls">
				<button class="mini" id="yesterday">⟵</button>
				<button class="mini" id="today">Today</button>
				<button class="mini" id="tomorrow">⟶</button>
				<div class="spacer"></div>
				<div class="muted" id="nextEta"></div>
			</div>
			<div class="list" id="list"></div>
		`;

		const fineEl   = host.querySelector('#fine');
		const listEl   = host.querySelector('#list');
		const etaEl    = host.querySelector('#nextEta');
		const btnY     = host.querySelector('#yesterday');
		const btnT     = host.querySelector('#today');
		const btnTm    = host.querySelector('#tomorrow');

		// Parse optional config from data-runway attribute
		let cfg = {};
		try {
			const slot = host.closest('[data-gadget-id]');
			if (slot){
				const raw = slot.getAttribute('data-runway');
				if (raw){
					cfg = safeJsonParse(raw, {}) || {};
				}
			}
		} catch(_){ cfg = {}; }

		// -----------------------------------------------------------------
		// 1) Load Chronus core + providers (self-contained)
		// -----------------------------------------------------------------
		try {
			// Chronus core (lib/chronus.js)
			await ensureScript(
				'./lib/chronus.js',
				() => (window.Chronus && typeof window.Chronus.on === 'function'),
				8000
			);

			// Civil provider
			await ensureScript(
				'./providers/chronus_civil_provider.js',
				() => !!window.__ChronusCivilProviderReady,
				12000
			);

			// Prayer-times provider
			await ensureScript(
				'./providers/chronus_prayerTimes_provider.js',
				() => !!window.__ChronusPrayerProviderReady,
				12000
			);
		} catch (e){
			console.error('[Runway] Failed to load Chronus or providers', e);
			if (fineEl){
				fineEl.textContent = 'Load error: Chronus stack unavailable.';
				fineEl.style.color = 'red';
			}
			return;
		}

		if (!window.Chronus || typeof window.Chronus.on !== 'function'){
			if (fineEl){
				fineEl.textContent = 'Chronus not available (no .on API).';
				fineEl.style.color = 'red';
			}
			return;
		}

		// -----------------------------------------------------------------
		// 2) Ensure at least one context (geo → current → Cairo)
		// -----------------------------------------------------------------
		try{
			const contexts = (Chronus.listContexts && Chronus.listContexts()) || [];
			if (!contexts.length){
				const geo = await (window.getBestGeo ? window.getBestGeo({ ipTimeoutMs: 4000 }) : null);
				const ctxObj = geo ? {
					id: 'current',
					label: 'Current Location',
					city: geo.city || '',
					country: geo.country || 'NA',
					tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
					lat: geo.lat,
					lng: geo.lng,
					method: 'auto'
				} : {
					id: 'cairo',
					label: 'Cairo (fallback)',
					city: 'Cairo',
					country: 'EG',
					tz: 'Africa/Cairo',
					lat: 30.0444,
					lng: 31.2357,
					method: 'auto'
				};
				Chronus.addContext(ctxObj);
				Chronus.setFrame('daily');
			}
		}catch(e){
			console.warn('[Runway] context bootstrap failed', e);
		}

		try { Chronus.start && Chronus.start(); } catch(_){}

		// Re-fetch state now that Chronus is alive
		let state = Chronus.getState ? Chronus.getState() : { cursor:new Date(), frame:'daily', activeContextId:null };
		const allCtx = Chronus.listContexts ? Chronus.listContexts() : [];
		if (!state.activeContextId && allCtx.length){
			try {
				Chronus.setActiveContext(allCtx[0].id);
				state = Chronus.getState();
			} catch(_){}
		}

		const effectiveContextId = cfg.contextId || state.activeContextId || (allCtx[0] && allCtx[0].id) || 'default';
		const effectiveFrame     = cfg.frame || state.frame || 'daily';

		// Update fineprint with basic context info
		const ctxObj = allCtx.find(c => c.id === effectiveContextId) || allCtx[0] || null;
		if (fineEl){
			if (ctxObj){
				const parts = [];
				if (ctxObj.label) parts.push(ctxObj.label);
				if (ctxObj.city)  parts.push(ctxObj.city);
				if (ctxObj.country) parts.push(ctxObj.country);
				if (ctxObj.tz)    parts.push('tz: ' + ctxObj.tz);
				fineEl.textContent = parts.join(' · ');
			}else{
				fineEl.textContent = 'Chronus context: ' + effectiveContextId + ' · frame: ' + effectiveFrame;
			}
		}

		// -----------------------------------------------------------------
		// 3) Wire controls
		// -----------------------------------------------------------------
		if (btnY) btnY.addEventListener('click', () => Chronus.jump && Chronus.jump({ days:-1 }));
		if (btnT) btnT.addEventListener('click', () => Chronus.setCursor && Chronus.setCursor(new Date()));
		if (btnTm) btnTm.addEventListener('click', () => Chronus.jump && Chronus.jump({ days:+1 }));

		let latestAnchors = [];

		function recalcAndPaint(){
			const now = new Date();

			// Pull anchors directly from Chronus for our chosen context/frame
			try{
				latestAnchors = (Chronus.getAnchors
					? Chronus.getAnchors({ contextId: effectiveContextId, frame: effectiveFrame }) || []
					: latestAnchors);
			}catch(e){
				console.warn('[Runway] getAnchors failed', e);
			}

			renderList(listEl, latestAnchors, now);

			// Countdown to "next"
			if (etaEl){
				const { next } = resolveSlots(latestAnchors, now);
				if (next && next.at){
					const etaSeconds = Math.max(0, ((next.at instanceof Date ? next.at : new Date(next.at)) - now)/1000);
					etaEl.textContent = 'Next in ' + fmtHMS(etaSeconds);
				}else{
					etaEl.textContent = '';
				}
			}
		}

		// Initial paint
		recalcAndPaint();

		// Subscribe to Chronus events (blend updates + tick + cursor/context)
		const offBlend  = Chronus.on && Chronus.on('chronus.blend.update', ev => {
			if (ev && ev.detail && Array.isArray(ev.detail.anchors)){
				latestAnchors = ev.detail.anchors.slice();
			}
			recalcAndPaint();
		});
		const offTick   = Chronus.on && Chronus.on('chronus.anchor.tick', () => recalcAndPaint());
		const offCursor = Chronus.on && Chronus.on('chronus.cursor.change', () => recalcAndPaint());
		const offCtx    = Chronus.on && Chronus.on('chronus.context.change', () => recalcAndPaint());

		// Small nudge to make sure providers run at least once
		try { Chronus.setCursor && Chronus.setCursor(new Date()); } catch(_){}

		// Unmount handler
		return () => {
			if (offBlend)  offBlend();
			if (offTick)   offTick();
			if (offCursor) offCursor();
			if (offCtx)    offCtx();
		};
	}

	// ---------------------------------------------------------------------
	// Register gadget
	// ---------------------------------------------------------------------
	window.GADGETS = window.GADGETS || {};
	window.GADGETS[GID] = {
		info: 'Runway Viewport (Chronus-backed)',
		mount
	};
})();
