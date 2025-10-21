(function(){


	function mount(host, ctx) {
  const { getSettings, setSettings, gadgetCatalog } = ctx;
  const s = getSettings();
  const enabled = new Set(s.enabledGadgets);


	// preserve user-defined order and include any new gadgets
	const knownIds = new Set(s.enabledGadgets);
	const userGadgets = [
		// existing ones in saved order
		...s.enabledGadgets
			.map(id => gadgetCatalog.find(g => g.id === id))
			.filter(g => g && g.id !== 'header' && g.id !== 'settings'),
		// any new ones not yet saved
		...gadgetCatalog.filter(g =>
			!knownIds.has(g.id) && g.id !== 'header' && g.id !== 'settings')
	];


  host.innerHTML = `
    <h2>Gadgets</h2>
    <ul id="orderList" style="list-style:none;padding:0;">
      ${userGadgets.map(g => `
        <li data-id="${g.id}"
            style="display:flex;align-items:center;gap:6px;margin:4px 0;">
          <input type="checkbox" ${enabled.has(g.id) ? 'checked' : ''}>
          <span style="flex:1">${g.label}</span>
			<button class="gbtn move-up">▲</button>
			<button class="gbtn move-down">▼</button>
        </li>
      `).join('')}
    </ul>
  `;

  const ul = host.querySelector('#orderList');

  ul.addEventListener('click', e => {
    if (!e.target.matches('button')) return;
    const li = e.target.closest('li');
    const items = [...ul.children];
    const idx = items.indexOf(li);

    if (e.target.classList.contains('move-up') && idx > 0)
    	ul.insertBefore(li, items[idx - 1]);
	else if (e.target.classList.contains('move-down') && idx < items.length - 1)
		ul.insertBefore(items[idx + 1], li);

    saveState();
  });

  ul.addEventListener('change', e => {
    if (e.target.matches('input[type=checkbox]')) saveState();
  });

  function saveState() {
    const newOrder = ['header'];
    for (const li of ul.children) {
      const id = li.dataset.id;
      const checked = li.querySelector('input').checked;
      if (checked) newOrder.push(id);
    }
    newOrder.push('settings');
    setSettings({ enabledGadgets: newOrder });
    window.dispatchEvent(new CustomEvent('gadgets:update', { detail:{enabled:newOrder} }));
  }
}

  window.GADGETS = window.GADGETS || {};
  window.GADGETS.settings = {
    info: 'Choose which gadgets are visible. Your selection is saved locally.',
    mount
  };
})();
