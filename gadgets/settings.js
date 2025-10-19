(function(){
  function mount(host, ctx){
    const catalog = ctx.gadgetCatalog; // [{id,label},...]
    const settings = ctx.getSettings();
    const enabled = new Set(settings.enabledGadgets || []);

    host.innerHTML = `
      <div id="list"></div>
      <div style="margin-top:8px">
        <button id="save">Save</button>
        <span id="note" class="muted" style="margin-left:8px;"></span>
      </div>
    `;

    const list = host.querySelector('#list');
    list.innerHTML = catalog.map(item=>{
		const isSettings = item.id === 'settings';
		const checked = (enabled.has(item.id) || isSettings) ? 'checked' : '';
		const disabled = isSettings ? 'disabled' : '';
		return `
		<label style="display:flex; align-items:center; gap:8px; margin:4px 0;">
			<input type="checkbox" data-id="${item.id}" ${checked} ${disabled}/>
			<span>${item.label}${isSettings ? ' <span class="muted" style="font-size:11px;">(always on)</span>' : ''}</span>
		</label>
		`;
    }).join('');

	host.querySelector('#save').addEventListener('click', () => {
		const boxes = Array.from(list.querySelectorAll('input[type="checkbox"]'));
		const nextEnabled = boxes
			.filter(b => b.checked || b.dataset.id === 'settings')   // ensure settings present
			.map(b => b.dataset.id);

		if (!nextEnabled.includes('settings')) nextEnabled.push('settings');

		const next = { ...settings, enabledGadgets: nextEnabled };
		ctx.setSettings(next); // persists & triggers gadgets:update
		const note = host.querySelector('#note');
		note.textContent = 'Saved';
		setTimeout(() => note.textContent = '', 1200);
	});

  }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS.settings = {
    info: 'Choose which gadgets are visible. Your selection is saved locally.',
    mount
  };
})();
