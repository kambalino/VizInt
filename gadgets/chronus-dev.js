(function(){
  // Minimal inline PrayerTimes provider (owned by this gadget)
  const Provider = {
    name: 'PrayerTimesProvider',
    async provide({ context, frame, cursor }) {
      if (frame !== 'daily') return [];
      if (typeof prayTimes === 'undefined') throw new Error('PrayTimes.js not loaded');
      const date = new Date(cursor);
      try { prayTimes.setMethod(context.method || 'MWL'); } catch {}
      prayTimes.adjust({ asr: 'Standard' });
      const t = prayTimes.getTimes(date, [context.lat, context.lng]);
      const pairs = [['fajr','Fajr',t.fajr],['sunrise','Sunrise',t.sunrise],['dhuhr','Dhuhr',t.dhuhr],
                     ['asr','Asr',t.asr],['maghrib','Maghrib',t.maghrib],['isha','Isha',t.isha]];
      const mk = (lab,hhmm)=>{ const [h,m]=hhmm.split(':').map(n=>+n);
        return new Date(date.getFullYear(),date.getMonth(),date.getDate(),h,m,0,0); };
      return pairs.map(([id,label,hhmm])=>({ id:'prayer:'+id,label,at:mk(label,hhmm),frame:'daily',
        category:'religious', contextId:context.id, source:'PrayerTimesProvider'}));
    }
  };

  function fmtHMS(secs){
    secs = Math.max(0, secs|0);
    const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60;
    const pad = n => String(n).padStart(2,'0'); return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function mount(host){
    // Register provider on mount (scoped to this gadget’s lifecycle)
    window.Chronus.registerProvider(Provider);

    host.innerHTML = `
      <div class="field">
        <div><strong>Frame</strong></div>
        <div>
          <select id="frameSel">
            <option value="daily" selected>Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="annual">Annual</option>
          </select>
        </div>
      </div>
      <div class="field">
        <div><strong>Cursor</strong></div>
        <div>
          <button id="yesterday">◀ Yesterday</button>
          <button id="today">Today</button>
          <button id="tomorrow">Tomorrow ▶</button>
        </div>
      </div>
      <div class="field">
        <div><strong>Context</strong></div>
        <div id="ctxList"></div>
      </div>
      <div id="anchors"></div>
      <div class="fineprint muted">Chronus Dev Gadget — Anchors + live ticks</div>
    `;
    const anchorsEl = host.querySelector('#anchors');

    function renderContexts(){
      const list = window.Chronus.listContexts();
      host.querySelector('#ctxList').innerHTML = list.map(c => `
        <label style="display:flex;gap:6px;align-items:center;margin-right:8px;">
          <input type="radio" name="ctx" value="${c.id}" ${c.id==='current'?'checked':''}/>
          ${c.label}
        </label>`).join('');
    }

    host.querySelector('#frameSel').addEventListener('change', e => window.Chronus.setFrame(e.target.value));
    host.querySelector('#yesterday').addEventListener('click', () => window.Chronus.jump({ days:-1 }));
    host.querySelector('#today').addEventListener('click', () => window.Chronus.setCursor(new Date()));
    host.querySelector('#tomorrow').addEventListener('click', () => window.Chronus.jump({ days:+1 }));
    host.querySelector('#ctxList').addEventListener('change', e => {
      if (e.target && e.target.name === 'ctx') window.Chronus.setActiveContext(e.target.value);
    });

    function renderList(anchors){
      anchorsEl.innerHTML = anchors.map(a => `
        <div class="row">
          <div class="label">${a.label}</div>
          <div class="status" data-aid="${a.id}">--:--:--</div>
        </div>`).join('');
    }

    // Initial context list after headless core sets one
    renderContexts();

    const offBlend = window.Chronus.on('chronus.blend.update', ev => renderList(ev.detail.anchors));
    const offTick  = window.Chronus.on('chronus.anchor.tick', ev => {
      const { id, etaSecs } = ev.detail;
      const el = anchorsEl.querySelector(`[data-aid="${id}"]`);
      if (el) el.textContent = fmtHMS(etaSecs);
    });

    return () => { offBlend && offBlend(); offTick && offTick(); };
  }

	window.GADGETS = window.GADGETS || {};
	// was: window.GADGETS.chronusdev = { mount, info:'Chronus Dev (Anchors viewer)' };
	window.GADGETS['chronus-dev'] = { mount, info:'Chronus Dev (Anchors viewer)' };

})();
