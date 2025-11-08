(function(){

  // --- Simple Toast Utility -------------------------------------------------
  function showToast(msg, type='info', timeout=3000) {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      Object.assign(container.style, {
        position:'fixed', bottom:'1rem', right:'1rem',
        display:'flex', flexDirection:'column', gap:'.5rem',
        zIndex:9999
      });
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.textContent = msg;
    Object.assign(toast.style, {
      padding:'8px 12px', borderRadius:'6px',
      fontFamily:'sans-serif', fontSize:'0.9em',
      color:'#fff', background: type==='error' ? '#d33' :
               type==='success' ? '#2a2' : '#333',
      boxShadow:'0 2px 4px rgba(0,0,0,0.2)',
      opacity:'0', transition:'opacity .3s'
    });
    container.appendChild(toast);
    requestAnimationFrame(()=> toast.style.opacity='1');
    setTimeout(()=> {
      toast.style.opacity='0';
      setTimeout(()=> toast.remove(), 400);
    }, timeout);
  }

  // --- Settings Gadget ------------------------------------------------------
  function mount(host, ctx) {
    const { getSettings, setSettings, gadgetCatalog: initialCatalog } = ctx;

	function getCatalog() {
		// Always use the live list from REGISTRY; shape to {id,label} here.
		const live = (window.REGISTRY && window.REGISTRY.GADGETS) || initialCatalog || [];
		return live.map(({ id, label }) => ({ id, label }));
	}


    function computeUserGadgetList() {
      const s = getSettings();
      const catalog = getCatalog();
      const knownIds = new Set(s.enabledGadgets || []);
      return [
        ...(s.enabledGadgets || [])
          .map(id => catalog.find(g => g.id === id))
          .filter(g => g && g.id !== 'header' && g.id !== 'settings'),
        ...catalog.filter(g => !knownIds.has(g.id) && g.id !== 'header' && g.id !== 'settings')
      ];
    }

    host.innerHTML = `
      <h2>Gadgets</h2>
      <ul id="orderList" style="list-style:none;padding:0;margin:0;"></ul>

      <hr class="muted" />
      <h4>Add Gadgets</h4>
      <div class="row" style="display:flex;gap:.5rem;flex-wrap:wrap;">
        <button id="btn-pick-dir" class="gbtn">Scan a folder…</button>
        <button id="btn-upload-dir" class="gbtn">Upload a folder…</button>
        <button id="btn-install-url" class="gbtn">Install by URL…</button>
        <input id="file-dir" type="file" webkitdirectory multiple style="display:none">
      </div>
    `;

    const ul        = host.querySelector('#orderList');
    const btnPick   = host.querySelector('#btn-pick-dir');
    const btnUpload = host.querySelector('#btn-upload-dir');
    const btnUrl    = host.querySelector('#btn-install-url');
    const fileInput = host.querySelector('#file-dir');

    function renderList() {
      const s = getSettings();
      const enabled = new Set(s.enabledGadgets || []);
      const userGadgets = computeUserGadgetList();

      ul.innerHTML = userGadgets.map(g => `
        <li data-id="${g.id}"
            style="display:flex;align-items:center;gap:6px;margin:4px 0;">
          <input type="checkbox" ${enabled.has(g.id) ? 'checked' : ''}>
          <span style="flex:1">${g.label}</span>
          <button class="gbtn move-up">▲</button>
          <button class="gbtn move-down">▼</button>
        </li>
      `).join('');
    }

    function saveState() {
      const newOrder = ['header'];
      for (const li of ul.children) {
        const id = li.dataset.id;
        const checked = li.querySelector('input').checked;
        if (checked) newOrder.push(id);
      }
      newOrder.push('settings');
      setSettings({ enabledGadgets: newOrder });
      window.dispatchEvent(new CustomEvent('gadgets:update', { detail:{ enabled:newOrder } }));
    }

    // Move up/down & checkbox changes
    ul.addEventListener('click', e => {
      if (!e.target.matches('button')) return;
      const li = e.target.closest('li');
      const items = [...ul.children];
      const idx = items.indexOf(li);
      if (e.target.classList.contains('move-up') && idx > 0) {
        ul.insertBefore(li, items[idx - 1]);
      } else if (e.target.classList.contains('move-down') && idx < items.length - 1) {
        ul.insertBefore(items[idx + 1], li);
      }
      saveState();
    });
    ul.addEventListener('change', e => {
      if (e.target.matches('input[type=checkbox]')) saveState();
    });

    // --- Add Gadgets actions ------------------------------------------------
    btnPick.addEventListener('click', async () => {
      try {
        if (typeof window.pickAndScanGadgets !== 'function')
          throw new Error('Directory picker not supported in this browser.');
        await window.pickAndScanGadgets();
        renderList();
        showToast('Folder scanned. Gadgets added.', 'success');
      } catch (e) {
        showToast(e.message || e, 'error');
      }
    });

    btnUpload.addEventListener('click', () => fileInput.click());
    if (typeof window.initFolderUploadScanner === 'function') {
      window.initFolderUploadScanner(fileInput);
      fileInput.addEventListener('change', () => {
        renderList();
        showToast('Folder uploaded. Gadgets added.', 'success');
      });
    }

    btnUrl.addEventListener('click', async () => {
      const url = prompt('Enter full URL to a gadget .js file (https://…):');
      if (!url) return;
      const id = prompt('Choose an ID (e.g., "mygadget"):', 'remote');
      if (!id) return;
      const label = prompt('Label to show in Settings:', id);
      try {
        if (typeof window.installByUrl !== 'function')
          throw new Error('Install-by-URL not supported.');
        await window.installByUrl(id, url, label, false);
        renderList();
        showToast(`Installed “${label}”. Enable or reorder above.`, 'success');
      } catch (e) {
        showToast(e.message || e, 'error');
      }
    });

    window.addEventListener('registry:updated', () => renderList());

    renderList();
  }

  window.GADGETS = window.GADGETS || {};
  window.GADGETS.settings = {
    info: 'Choose which gadgets are visible. Your selection is saved locally.',
    mount
  };
})();
