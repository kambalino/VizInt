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
		registerProvider,
		// snapshot
		getState: () => ({ cursor, frame, activeContextId })
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

	async function ensureContext(){
		if (Chronus.listContexts().length === 0){
		const geo = await getBestGeo();
		Chronus.addContext({ id:'auto', label: geo.city || 'Auto', ...geo });
		Chronus.setFrame('daily');
		Chronus.start();
		}
	}

	// Public promise for readiness
	const ready = (async()=>{
		await ensureProviders();
		await ensureContext();
		return true;
	})();

	window.Chronus.ready = ready;
	})();

})();