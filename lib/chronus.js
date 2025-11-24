/*==============================================================================
	VizInt – Chronus Core
	This is lib/chronus.js
	Tabs: Hard

	Chronus is the time & anchor engine behind VizInt gadgets.
	It owns:
	- Wall-clock time & timezones (via Intl)
	- Contexts & cursors for time navigation
	- Anchors store (e.g. prayer times, sunrise, events)
	- A sequencer store for timelines / countdowns	

	$VER: 1.2.2
	$AUTHOR: VizInt Volk
	$COPYRIGHT: (c) 2024–2025 K&Co. All rights reserved.

	$HISTORY:
		2025/11/22	1.2.2	Fixed bootstrap (no Atlas/getBestGeo dependency),
							added loadSequences() to ready path, and exposed
							listProviders() for the v1.2 provider registry.
		2025/11/18	1.2.1	Added Chronus v1.2 public API facade (time/DST,
							provider registry, getSequencer) + legacy warnings
							for window.Chronus APIs.
		2025/11/18	1.2.0	Moved to new VizInt 1.2 gadget/core architecture.
		2025/11/10	1.1.1	Added sequencer storage (chronus.sequences.v1).
		2025/11/01	1.1.0	Added multi-context support and anchors store.
		2025/10/30	1.0.0	Initial extract from Chronus v29 (gadgets-only).
==============================================================================*/

// Global entry point for Chronus readiness (safe to call anytime)
window.ChronusReady = (async () => {
	if (!window.loadExternalScriptOnce)
		throw new Error("shared.js must load before ChronusReady");

	// 1️⃣ Ensure Chronus core is in memory
	if (!window.Chronus) {
		await loadExternalScriptOnce('./lib/chronus.js', () => window.Chronus);
	}

	// 2️⃣ Wait for Chronus internal bootstrap if available
	if (window.Chronus && Chronus.ready)
		await Chronus.ready;

	return window.Chronus;
})();

(function(){
	// Chronus Anchors — tiny core (pub/sub + contexts + frames + cursor + anchors)
	const listeners = new Map();          // event -> Set<fn(ev)>
	const contexts  = new Map();          // id -> { id, tz, lat, lng, label, method? }
	const anchors   = new Map();          // key(ctx::frame) -> Anchor[]
	const providers = new Set();          // each has async provide({context, frame, cursor}) -> Anchor[]

	// --- Sequences library (dynamic, persisted) ---
	const SEQ_KEY = 'chronus.sequences.v1';
	const sequences = new Map(); // id -> { id, label, steps:[{id,label,durationMs?,offsetMs?,meta?}], meta? }

	function persistSequences(){
		try {
			const arr = Array.from(sequences.values());
			localStorage.setItem(SEQ_KEY, JSON.stringify(arr));
		} catch {}
	}
	function loadSequences(){
		try {
			const arr = JSON.parse(localStorage.getItem(SEQ_KEY) || '[]');
			sequences.clear();
			for (const s of (Array.isArray(arr) ? arr : [])) {
				if (s && s.id) sequences.set(s.id, s);
			}
		} catch {}
	}

	let activeContextId = null;
	let frame  = 'daily';                 // 'daily' | 'weekly' | 'monthly' | 'annual'
	let cursor = new Date();              // time-travel "now"
	let tickId = null;

	function emit(type, detail){
		const set = listeners.get(type); if(!set) return;
		set.forEach(fn => { try { fn({ type, detail }); } catch(e){} });
	}
	function on(type, fn){
		if(!listeners.has(type)) listeners.set(type, new Set());
		listeners.get(type).add(fn);
		return () => listeners.get(type).delete(fn);
	}

	function keyFor(contextId, frm){ return contextId + '::' + frm; }

	function addContext(ctx){
		if (!ctx || !ctx.id) throw new Error('Context requires an id');
		contexts.set(ctx.id, ctx);
		if (!activeContextId) activeContextId = ctx.id;
		emit('chronus.context.change', { activeContextId });
		refresh();
		return ctx.id;
	}
	function setActiveContext(id){
		if (!contexts.has(id)) throw new Error('Unknown context: '+id);
		activeContextId = id;
		emit('chronus.context.change', { activeContextId });
		refresh();
	}
	function listContexts(){ return Array.from(contexts.values()); }

	function setFrame(f){
		frame = f;
		emit('chronus.cursor.change', { cursor, frame });
		refresh();
	}
	function setCursor(d){
		cursor = new Date(d);
		emit('chronus.cursor.change', { cursor, frame });
		refresh();
	}
	function jump(delta){
		const d = new Date(cursor);
		if (delta.days)   d.setDate(d.getDate() + delta.days);
		if (delta.weeks)  d.setDate(d.getDate() + 7*delta.weeks);
		if (delta.months) d.setMonth(d.getMonth() + delta.months);
		if (delta.years)  d.setFullYear(d.getFullYear() + delta.years);
		setCursor(d);
	}

	function upsertAnchors(contextId, frm, list){
		const k = keyFor(contextId, frm);
		const clean = (list || []).slice().sort((a,b)=>a.at - b.at);
		anchors.set(k, clean);
		emit('chronus.blend.update', { contextId, frame: frm, anchors: clean });
	}
	function getAnchors({ contextId, frame: f, range } = {}){
		const k = keyFor(contextId || activeContextId, f || frame);
		return anchors.get(k) || [];
	}

	async function refresh(){
		const ctx = contexts.get(activeContextId);
		if (!ctx) return;
		for (const p of providers) {
			try {
				const out = await p.provide({ context: ctx, frame, cursor });
				if (Array.isArray(out)) {
					upsertAnchors(ctx.id, frame, out);
				}
			} catch (e) {
				emit('chronus.provider.error', { provider: p.name || 'provider', message: e.message });
			}
		}
	}

	function start(){
		if (tickId) return;

		// 1) One place to emit the per-second tick
		function emitTick(){
			const ctx = contexts.get(activeContextId);
			if (!ctx) return;
			const list = getAnchors({ contextId: ctx.id, frame });
			const now = cursor; // (design note: if you ever want true wall-clock ticking, use: new Date())
			for (const a of list){
				const etaSecs = Math.floor((a.at - now)/1000);
				emit('chronus.anchor.tick', {
					contextId: ctx.id, id: a.id, label: a.label, at: a.at,
					etaSecs, isPast: etaSecs < 0
				});
			}
		}

		// 2) Prime state (providers run) then give subscribers an immediate tick
		try { refresh(); } catch(_) {}
		emitTick();

		// 3) Keep ticking every second
		tickId = setInterval(emitTick, 1000);
	}

	function stop(){ if(tickId){ clearInterval(tickId); tickId = null; } }

	function registerProvider(p){ providers.add(p); refresh(); }

	function listProviders(){ return Array.from(providers); }

	window.Chronus = {
		// events
		on, start, stop,
		// contexts
		addContext, setActiveContext, listContexts,
		// frame/cursor
		setFrame, setCursor, jump,
		// anchors
		upsertAnchors, getAnchors,
		// providers
		registerProvider, listProviders,
		// snapshot
		getState: () => ({ cursor, frame, activeContextId }),

		// sequences (dynamic, user-provided)
		upsertSequences(list){        // list: [{id,label,steps:[...]}, ...]
			let changed = false;
			for (const s of (Array.isArray(list) ? list : [])) {
				if (!s || !s.id) continue;
				const cur = sequences.get(s.id);
				const next = { ...cur, ...s, id: s.id };
				sequences.set(s.id, next);
				changed = true;
			}
			if (changed) {
				persistSequences();
				emit('chronus.sequences.update', { ids: list.map(x=>x.id) });
			}
		},
		getSequences({ ids } = {}){   // returns array
			const all = Array.from(sequences.values());
			if (Array.isArray(ids) && ids.length) return all.filter(s => ids.includes(s.id));
			return all;
		},
		deleteSequences(ids=[]){
			let changed = false;
			for (const id of ids) { if (sequences.delete(id)) changed = true; }
			if (changed){ persistSequences(); emit('chronus.sequences.update', { ids }); }
		},
	};

	;(function bootstrapChronus(){
		const PROVIDER_PATHS = [
			'./providers/chronus_civil_provider.js',
			'./providers/chronus_prayerTimes_provider.js'
		];

		async function ensureProviders(){
			if (!window.loadExternalScriptOnce) return; // shared.js not yet loaded
			for (const path of PROVIDER_PATHS){
				try {
					await loadExternalScriptOnce(path, ()=> true);
				} catch(e){ console.warn('Chronus provider load failed:', path, e.message); }
			}
		}

		// Default context bootstrap:
		// - No Atlas coupling here.
		// - Just derive tz from Intl or fall back to 'UTC'.
		async function ensureContext(){
			if (Chronus.listContexts().length === 0){
				const tz =
					(typeof Intl !== 'undefined' &&
						Intl.DateTimeFormat &&
						Intl.DateTimeFormat().resolvedOptions().timeZone) ||
					'UTC';

				Chronus.addContext({
					id: 'local',
					label: 'Local',
					tz
				});
				Chronus.setFrame('daily');
				Chronus.start();
			}
		}

		// Make sure sequencer storage is ready before .ready resolves.
		loadSequences();

		// Public promise for readiness
		const ready = (async()=>{
			await ensureProviders();
			await ensureContext();
			return true;
		})();

		window.Chronus.ready = ready;
	})();

	// --- IPC: allow gadgets to manage sequences over the window bus ---
	try {
		window.addEventListener('chronus:sequences:upsert', (e)=>{
			const list = e.detail && e.detail.list;
			if (Array.isArray(list)) window.Chronus.upsertSequences(list);
		});
		window.addEventListener('chronus:sequences:delete', (e)=>{
			const ids = e.detail && e.detail.ids;
			if (Array.isArray(ids)) window.Chronus.deleteSequences(ids);
		});
		window.addEventListener('chronus:sequences:request', (e)=>{
			const ids  = e.detail && e.detail.ids;
			const dest = (e.detail && e.detail.replyTo) || 'chronus:sequences:response';
			const payload = window.Chronus.getSequences({ ids });
			window.dispatchEvent(new CustomEvent(dest, { detail: { ids, list: payload }}));
		});
	} catch {}

})();

//==============================================================================
// Chronus v1.2 API Facade & Legacy Warnings
//------------------------------------------------------------------------------
// This block:
//   - Adds the v1.2 library-style surface expected via ctx.libs.Chronus
//   - Wraps legacy window.Chronus APIs with gentle console warnings
//   - Exposes time/DST helpers, provider registry helpers, and getSequencer()
//==============================================================================

(function () {
	// Guard for environments that somehow load this tail before core
	if (typeof window === "undefined" || !window.Chronus) return;

	const Chronus = window.Chronus;

	//------------------------------------------------------------------------
	// Legacy warning helper (only once per key)
	//------------------------------------------------------------------------
	const _legacyWarnFlags = Object.create(null);

	function legacyWarn(key, msg) {
		if (_legacyWarnFlags[key]) return;
		console.warn("[Chronus]", msg);
		_legacyWarnFlags[key] = true;
	}

	// Keep references to pre-v1.2 style methods (if they exist)
	const _legacy = {
		upsertAnchors: Chronus.upsertAnchors
	};

	// Wrap legacy methods with warnings (for v1.3 deprecation)
	if (_legacy.upsertAnchors) {
		Chronus.upsertAnchors = function (...args) {
			legacyWarn(
				"upsertAnchors",
				"Chronus.upsertAnchors(contextId, frame, anchors) is a legacy API " +
				"and will be deprecated in v1.3. " +
				"Prefer provider-centric flows (Chronus.getAnchors with providers) and sequencer APIs."
			);
			return _legacy.upsertAnchors.apply(Chronus, args);
		};
	}

	//------------------------------------------------------------------------
	// Time & DST utilities
	//------------------------------------------------------------------------

	function nowUTC() {
		return new Date();
	}

	function nowInTZ(tz) {
		if (!tz || typeof Intl === "undefined" || !Intl.DateTimeFormat) {
			return new Date();
		}
		// We approximate by formatting 'now' in the target TZ and re-parsing.
		const now = new Date();
		const fmt = new Intl.DateTimeFormat("en-CA", {
			timeZone: tz,
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			hour12: false
		});
		const parts = fmt.formatToParts(now);
		const get = (type) => Number(parts.find(p => p.type === type)?.value || 0);
		const year   = get("year");
		const month  = get("month");
		const day    = get("day");
		const hour   = get("hour");
		const minute = get("minute");
		const second = get("second");
		return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
	}

	function getOffset(tz, at) {
		const ref = at instanceof Date ? at : new Date();
		// offset in minutes = (localMillis - utcMillis) / 60000
		const utcMillis = ref.getTime();
		const inTz = nowInTZ(tz);
		const tzMillis = inTz.getTime();
		return (tzMillis - utcMillis) / 60000;
	}

	function getDSTInfo(tz, at) {
		const ref = at instanceof Date ? new Date(at.getTime()) : new Date();
		const baseOffset = getOffset(tz, ref);

		// For v1.2 we do a bounded search +- 1 year looking for a change
		const ONE_DAY = 24 * 60 * 60 * 1000;
		const MAX_DAYS = 370;

		let nextTransition = null;
		let prevTransition = null;

		// Search forward
		{
			let lo = new Date(ref.getTime());
			let hi = new Date(ref.getTime());
			let loOffset = baseOffset;
			let hiOffset = baseOffset;
			let changed = false;

			for (let i = 0; i < MAX_DAYS; i++) {
				hi = new Date(hi.getTime() + ONE_DAY);
				hiOffset = getOffset(tz, hi);
				if (hiOffset !== loOffset) {
					changed = true;
					break;
				}
			}
			if (changed) {
				// binary search between lo..hi for the day offset flips
				let l = lo.getTime();
				let r = hi.getTime();
				while (r - l > ONE_DAY / 24) { // ~1h resolution
					const mid = new Date((l + r) / 2);
					const midOffset = getOffset(tz, mid);
					if (midOffset === loOffset) {
						l = mid.getTime();
					} else {
						r = mid.getTime();
					}
				}
				nextTransition = new Date(r);
			}
		}

		// Search backward
		{
			let lo = new Date(ref.getTime());
			let hi = new Date(ref.getTime());
			let loOffset = baseOffset;
			let hiOffset = baseOffset;
			let changed = false;

			for (let i = 0; i < MAX_DAYS; i++) {
				lo = new Date(lo.getTime() - ONE_DAY);
				loOffset = getOffset(tz, lo);
				if (loOffset !== hiOffset) {
					changed = true;
					break;
				}
			}
			if (changed) {
				// binary search between lo..hi for the day offset flips
				let l = lo.getTime();
				let r = hi.getTime();
				while (r - l > ONE_DAY / 24) { // ~1h resolution
					const mid = new Date((l + r) / 2);
					const midOffset = getOffset(tz, mid);
					if (midOffset === loOffset) {
						l = mid.getTime();
					} else {
						r = mid.getTime();
					}
				}
				prevTransition = new Date(l);
			}
		}

		const inDST = baseOffset !== getOffset("UTC", ref); // simple heuristic

		return {
			inDST,
			offsetMinutes: baseOffset,
			nextTransition,
			prevTransition
		};
	}

	function getDayBounds(tz, date) {
		const ref = date instanceof Date ? new Date(date.getTime()) : nowInTZ(tz);
		const year  = ref.getUTCFullYear();
		const month = ref.getUTCMonth();
		const day   = ref.getUTCDate();
		const start = new Date(Date.UTC(year, month, day, 0, 0, 0));
		const end   = new Date(Date.UTC(year, month, day, 23, 59, 59, 999));
		return { start, end };
	}

	//------------------------------------------------------------------------
	// Provider facade
	//------------------------------------------------------------------------

	function listProvidersFacade() {
		if (typeof Chronus.listProviders === "function") {
			return Chronus.listProviders();
		}
		return [];
	}

	function getProvider(name) {
		const list = listProvidersFacade();
		return list.find(p => p && (p.name === name || p.id === name));
	}

	// NOTE: For v1.2, this is intentionally thin. It delegates to the existing
	// context-based anchor store so we don't break current gadgets.
	//
	// Provider-centric computation (e.g. via chronus_prayerTimes_provider) can
	// gradually be wired in behind this facade in a later iteration.
	async function getAnchorsFacade(options = {}) {
		const {
			provider,  // currently unused, but accepted for future use
			contextId,
			frame,
			geo,       // accepted but not used yet (Atlas wiring is external)
			date       // accepted but not used yet
		} = options;

		// For now, treat this as a thin wrapper over the legacy anchor store.
		return Chronus.getAnchors({
			contextId: contextId || (Chronus.getState && Chronus.getState().activeContextId),
			frame: frame || (Chronus.getState && Chronus.getState().frame)
		});
	}

	//------------------------------------------------------------------------
	// Sequencer facade (built on top of internal sequence storage)
	//------------------------------------------------------------------------

	function getSequencer() {
		return {
			getSequences: (opts) => Chronus.getSequences(opts),
			upsertSequences: (list) => Chronus.upsertSequences(list),
			deleteSequences: (ids) => Chronus.deleteSequences(ids)
		};
	}

	//------------------------------------------------------------------------
	// Attach v1.2 facade to Chronus
	//------------------------------------------------------------------------

	Chronus.nowUTC       = nowUTC;
	Chronus.nowInTZ      = nowInTZ;
	Chronus.getOffset    = getOffset;
	Chronus.getDSTInfo   = getDSTInfo;
	Chronus.getDayBounds = getDayBounds;

	Chronus.listProviders = Chronus.listProviders || listProvidersFacade;
	Chronus.getProvider   = getProvider;
	Chronus.getAnchorsV12 = getAnchorsFacade; // non-breaking alias

	Chronus.getSequencer  = getSequencer;

})();

