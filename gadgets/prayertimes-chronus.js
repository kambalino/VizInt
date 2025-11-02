(function(){
  const GID = 'prayertimes-chronus';

  const PrayerProvider = {
    name: 'PrayerTimesProvider/Chronus',
    async provide({ context, frame, cursor }){
      if (frame !== 'daily') return [];
      if (typeof prayTimes === 'undefined') throw new Error('PrayTimes.js not loaded');
      const date = new Date(cursor);
      try { prayTimes.setMethod(context.method || 'MWL'); } catch {}
      prayTimes.adjust({ asr:'Standard' });
      const t = prayTimes.getTimes(date, [context.lat, context.lng]);
      const pairs = [
        ['fajr','Fajr', t.fajr],
        ['sunrise','Sunrise', t.sunrise],
        ['dhuhr','Dhuhr', t.dhuhr],
        ['asr','Asr', t.asr],
        ['maghrib','Maghrib', t.maghrib],
        ['isha','Isha', t.isha],
      ];
      const mk = (hhmm)=>{
        const [h,m] = (''+hhmm).split(':').map(n=>+n);
        return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0, 0);
      };
      return pairs.map(([id,label,hhmm])=>({
        id:'prayer:'+id, label, at: mk(hhmm),
        frame:'daily', category:'religious', contextId: context.id, source: PrayerProvider.name
      }));
    }
  };

  function fmtHMS(secs){
    secs = Math.max(0, secs|0);
    const h = Math.floor(secs/3600), m = Math.floor((secs%3600)/60), s = secs%60;
    const pad = n => String(n).padStart(2,'0');
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
  }

  function mount(host){
    host.innerHTML = `
      <div class="field">
        <div><strong>Date</strong></div>
        <div>
          <button id="yesterday">◀</button>
          <button id="today">Today</button>
          <button id="tomorrow">▶</button>
        </div>
      </div>
      <div class="field">
        <div><strong>Location</strong></div>
        <div id="ctxList"></div>
      </div>
      <div id="list"></div>
      <div class="fineprint muted" id="note"></div>
    `;

    const listEl = host.querySelector('#list');
    const noteEl = host.querySelector('#note');

    if (typeof window.prayTimes !== 'undefined') {
      window.Chronus.registerProvider(PrayerProvider);
      noteEl.textContent = '';
    } else {
      noteEl.textContent = 'PrayerTimes provider unavailable (load PrayTimes to enable).';
    }

    host.querySelector('#yesterday').addEventListener('click', ()=> window.Chronus.jump({ days:-1 }));
    host.querySelector('#today').addEventListener('click', ()=> window.Chronus.setCursor(new Date()));
    host.querySelector('#tomorrow').addEventListener('click', ()=> window.Chronus.jump({ days:+1 }));

    function renderContexts(){
      const list = window.Chronus.listContexts();
      host.querySelector('#ctxList').innerHTML = list.map(c => `
        <label style="display:flex;gap:6px;align-items:center;margin-right:8px;">
          <input type="radio" name="ctx" value="${c.id}" ${c.id==='current'?'checked':''}/>
          ${c.label}
        </label>`).join('');
    }
    host.querySelector('#ctxList').addEventListener('change', (e)=>{
      if (e.target && e.target.name === 'ctx') window.Chronus.setActiveContext(e.target.value);
    });
    renderContexts();

    function render(anchors){
      const prayers = anchors.filter(a => (a.id||'').startsWith('prayer:'));
      if (!prayers.length) {
        listEl.innerHTML = `<div class="muted">No prayer anchors for this day.</div>`;
        return;
      }
      listEl.innerHTML = prayers.map(a => `
        <div class="row">
          <div class="label">${a.label}</div>
          <div class="status" data-aid="${a.id}">--:--:--</div>
        </div>`).join('');
    }

    const offBlend = window.Chronus.on('chronus.blend.update', ev => render(ev.detail.anchors));
    const offTick  = window.Chronus.on('chronus.anchor.tick', ev => {
      const { id, etaSecs } = ev.detail;
      const el = listEl.querySelector(`[data-aid="${id}"]`);
      if (el) el.textContent = fmtHMS(etaSecs);
    });

    return ()=> { offBlend && offBlend(); offTick && offTick(); };
  }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS[GID] = { mount, info:'Prayer Times (Chronus-backed)' };
})();