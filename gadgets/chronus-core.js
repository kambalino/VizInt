(function(){
  // === Chronus hub (loader-owned, headless) ===
  (function(){
    const listeners = new Map();              // event -> Set<fn(ev)>
    const contexts  = new Map();              // id -> { id, tz, lat, lng, label, method? }
    const anchors   = new Map();              // key(ctx::frame) -> Anchor[]
    const providers = new Set();              // async provide({context, frame, cursor}) -> Anchor[]

    let activeContextId = null;
    let frame  = 'daily';                     // 'daily' | 'weekly' | 'monthly' | 'annual'
    let cursor = new Date();                  // time-travel "now"
    let tickId = null;

    // read-only snapshot for passive consumers (EOM, etc.)
    const state = () => ({ cursor, frame, activeContextId });

    // --- events ---
    function emit(type, detail){
      const set = listeners.get(type); if(!set) return;
      set.forEach(fn => { try { fn({ type, detail }); } catch(e){} });
    }
    function on(type, fn){
      if(!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
      return () => listeners.get(type).delete(fn);
    }

    // --- keys ---
    const keyFor = (contextId, frm) => contextId + '::' + frm;

    // --- contexts ---
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
    const listContexts = () => Array.from(contexts.values());

    // --- frame/cursor (time travel) ---
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

    // --- anchors store ---
    function upsertAnchors(contextId, frm, list){
      const k = keyFor(contextId, frm);
      const clean = (list || []).slice().sort((a,b)=>a.at - b.at);
      anchors.set(k, clean);
      emit('chronus.blend.update', { contextId, frame: frm, anchors: clean });
    }
    function getAnchors({ contextId, frame: f } = {}){
      const k = keyFor(contextId || activeContextId, f || frame);
      return anchors.get(k) || [];
    }

    // --- providers refresh ---
    async function refresh(){
      const ctx = contexts.get(activeContextId);
      if (!ctx) return;
      for (const p of providers) {
        try {
          const out = await p.provide({ context: ctx, frame, cursor });
          if (Array.isArray(out)) {
            // providers return full set for the current frame; replace
            upsertAnchors(ctx.id, frame, out);
          }
        } catch (e) {
          emit('chronus.provider.error', { provider: p.name || 'provider', message: e.message });
        }
      }
    }

    // --- engine tick ---
    function start(){
      if (tickId) return;
      tickId = setInterval(()=>{
        const ctx = contexts.get(activeContextId); if(!ctx) return;
        const list = getAnchors({ contextId: ctx.id, frame });
        const now = cursor;
        for (const a of list){
          const etaSecs = Math.floor((a.at - now)/1000);
          emit('chronus.anchor.tick', {
            contextId: ctx.id, id: a.id, label: a.label, at: a.at,
            etaSecs, isPast: etaSecs < 0
          });
        }
      }, 1000);
    }
    function stop(){ if(tickId){ clearInterval(tickId); tickId = null; } }

    // --- providers registration ---
    function registerProvider(p){ providers.add(p); refresh(); }

    // public API
    window.Chronus = {
      // events
      on,
      // lifecycle
      start, stop,
      // contexts
      addContext, setActiveContext, listContexts,
      // frame/cursor
      setFrame, setCursor, jump,
      // anchors
      upsertAnchors, getAnchors,
      // providers
      registerProvider,
      // read-only snapshot
      getState: () => state()
    };
  })();

  // === headless gadget mount: set default context + start ticking ===
  function mount(host){
    (async () => {
      let ctx;
      try {
        const geo = await (window.getBestGeo ? window.getBestGeo({ ipTimeoutMs: 4000 }) : null);
        ctx = geo ? {
          id: 'current',
          label: 'Current Location',
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          lat: geo.lat, lng: geo.lng, method: 'auto'
        } : {
          id: 'cairo',
          label: 'Cairo (fallback)',
          tz: 'Africa/Cairo',
          lat: 30.0444, lng: 31.2357, method: 'auto'
        };
      } catch {
        ctx = { id: 'cairo', label: 'Cairo (fallback)', tz: 'Africa/Cairo', lat: 30.0444, lng: 31.2357, method: 'Egypt' };
      }
      window.Chronus.addContext(ctx);
      window.Chronus.setFrame('daily');
      window.Chronus.start();
    })();

    // No UI
    host.innerHTML = '';
    return ()=> window.Chronus.stop();
  }

  // export as a loader-managed, headless gadget
  window.GADGETS = window.GADGETS || {};
  window.GADGETS['chronus-core'] = { mount, info: 'Chronus Core (headless)' };
})();
