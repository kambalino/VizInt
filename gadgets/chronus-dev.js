(function(){
  function mount(host){

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
