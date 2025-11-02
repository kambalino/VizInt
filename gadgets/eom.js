(function(){
  const GID = 'eom';

  function fmtHMS(secs){
    secs = Math.max(0, secs|0);
    const d = Math.floor(secs / 86400);
    const h = Math.floor((secs % 86400)/3600);
    const m = Math.floor((secs % 3600)/60);
    const s = secs % 60;
    const pad = n => String(n).padStart(2,'0');
    return (d>0 ? d+'d ' : '') + `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function endOfMonthFromCursor(cursor){
    const d = new Date(cursor);
    return new Date(d.getFullYear(), d.getMonth()+1, 0, 23, 59, 59, 0);
  }

  function mount(host){
    host.innerHTML = `
      <div class="row current">
        <div class="label">End of Month</div>
        <div class="status" id="eom-count">--:--:--</div>
      </div>
      <div class="fineprint muted" id="eom-note">Engine-backed: cursor-aware · context-neutral</div>
    `;
    const out = host.querySelector('#eom-count');

    let timer = null;
    function startLocalTick(){
      if (timer) clearInterval(timer);
      timer = setInterval(()=>{
        const now = (window.Chronus && window.Chronus.getState) ? window.Chronus.getState().cursor : new Date();
        const eom = endOfMonthFromCursor(now);
        const etaSecs = Math.max(0, Math.floor((eom - now)/1000));
        out.textContent = fmtHMS(etaSecs);
      }, 1000);
    }

    const offCursor = window.Chronus && window.Chronus.on ?
      window.Chronus.on('chronus.cursor.change', ev => { startLocalTick(); }) : null;

    startLocalTick();

    return ()=> { if (timer) clearInterval(timer); offCursor && offCursor(); };
  }

  if (window.Chronus && !window.Chronus.getState) {
    (function(){
      let lastCursor = new Date(), lastFrame = 'daily', lastContext = null;
      window.Chronus.on && window.Chronus.on('chronus.cursor.change', ev => {
        lastCursor = ev.detail.cursor; lastFrame = ev.detail.frame;
      });
      window.Chronus.on && window.Chronus.on('chronus.context.change', ev => {
        lastContext = ev.detail.activeContextId;
      });
      window.Chronus.getState = () => ({ cursor: lastCursor, frame: lastFrame, activeContextId: lastContext });
    })();
  }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS[GID] = { mount, info:'Days Left in Month (Chronus-aware)' };
})();