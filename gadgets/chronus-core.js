(function(){
  // === Chronus hub (moved here so the loader controls it) ===
  (function(){
    const listeners = new Map(), contexts=new Map(), anchors=new Map(), providers=new Set();
    let activeContextId=null, frame='daily', cursor=new Date(), tickId=null;
    const emit=(t,d)=> (listeners.get(t)||[]).forEach(fn=>{ try{fn({type:t,detail:d})}catch{} });
    const on=(t,fn)=>{ if(!listeners.has(t)) listeners.set(t,new Set()); listeners.get(t).add(fn); return ()=>listeners.get(t).delete(fn); };
    const key=(cid,f)=> cid+'::'+f;

    function addContext(ctx){ if(!ctx||!ctx.id) throw new Error('Context requires id');
      contexts.set(ctx.id,ctx); if(!activeContextId) activeContextId=ctx.id;
      emit('chronus.context.change',{activeContextId}); refresh(); return ctx.id; }
    function setActiveContext(id){ if(!contexts.has(id)) throw new Error('Unknown context '+id);
      activeContextId=id; emit('chronus.context.change',{activeContextId}); refresh(); }
    const listContexts=()=> Array.from(contexts.values());
    function setFrame(f){ frame=f; emit('chronus.cursor.change',{cursor,frame}); refresh(); }
    function setCursor(d){ cursor=new Date(d); emit('chronus.cursor.change',{cursor,frame}); refresh(); }
    function jump(delta){ const d=new Date(cursor);
      if(delta.days) d.setDate(d.getDate()+delta.days);
      if(delta.weeks) d.setDate(d.getDate()+7*delta.weeks);
      if(delta.months) d.setMonth(d.getMonth()+delta.months);
      if(delta.years) d.setFullYear(d.getFullYear()+delta.years);
      setCursor(d); }
    function upsertAnchors(contextId, frm, list){
      const k=key(contextId,frm), clean=(list||[]).slice().sort((a,b)=>a.at-b.at);
      anchors.set(k,clean); emit('chronus.blend.update',{contextId,frame:frm,anchors:clean}); }
    function getAnchors({contextId,frame:f}={}){ return anchors.get(key(contextId||activeContextId,f||frame)) || []; }
    async function refresh(){
      const ctx=contexts.get(activeContextId); if(!ctx) return;
      for(const p of providers){ try{
        const out=await p.provide({context:ctx,frame,cursor});
        if(Array.isArray(out)) upsertAnchors(ctx.id,frame,out);
      }catch(e){ emit('chronus.provider.error',{provider:p.name||'provider',message:e.message}); } } }
    function start(){ if(tickId) return; tickId=setInterval(()=>{
      const ctx=contexts.get(activeContextId); if(!ctx) return;
      const list=getAnchors({contextId:ctx.id,frame}); const now=cursor;
      for(const a of list){ const etaSecs=Math.floor((a.at-now)/1000);
        emit('chronus.anchor.tick',{contextId:ctx.id,id:a.id,label:a.label,at:a.at,etaSecs,isPast:etaSecs<0}); }
    },1000); }
    function stop(){ if(tickId){ clearInterval(tickId); tickId=null; } }
    const registerProvider=p=>{ providers.add(p); refresh(); };

    window.Chronus={ on,start,stop, addContext,setActiveContext,listContexts, setFrame,setCursor,jump, upsertAnchors,getAnchors, registerProvider };
  })();

  // === headless gadget mount: set default context + start ticking ===
  function mount(host){
    (async () => {
      let ctx;
      try {
        const geo = await (window.getBestGeo ? window.getBestGeo({ ipTimeoutMs: 4000 }) : null);
        ctx = geo ? { id:'current', label:'Current Location',
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
          lat: geo.lat, lng: geo.lng, method: 'MWL' }
          : { id:'cairo', label:'Cairo (fallback)', tz:'Africa/Cairo', lat:30.0444, lng:31.2357, method:'Egypt' };
      } catch { ctx = { id:'cairo', label:'Cairo (fallback)', tz:'Africa/Cairo', lat:30.0444, lng:31.2357, method:'Egypt' }; }
      window.Chronus.addContext(ctx);
      window.Chronus.setFrame('daily');
      window.Chronus.start();
    })();
    // No UI
    host.innerHTML = '';
    return ()=> window.Chronus.stop();
  }

		window.GADGETS = window.GADGETS || {};
// was: window.GADGETS.chronuscore = { mount, info: 'Chronus Core (headless)' };
		window.GADGETS['chronus-core'] = { mount, info: 'Chronus Core (headless)' };

})();
