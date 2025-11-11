(function(){

  // =========== Capability dictionary (for tooltips) ===========
  const CAP_META = {
    chronus: { emoji:'🕰️', label:'Chronus (time/tz helpers)' },
    atlas:   { emoji:'📍',  label:'Atlas (geo helpers)' },
    served:  { emoji:'🖥️',  label:'Must be served (not file://)' },
    network: { emoji:'🌐',  label:'Contacts remote APIs' }
  };

  // =========== Manifest cache & helpers ===========
  const manifestCache = new Map(); // id -> manifest

  async function ensureManifestById(id) {
    if (manifestCache.has(id)) return manifestCache.get(id);
    try {
      if (typeof window.REGISTRY?.loadGadget !== 'function') return null;
      const api = await window.REGISTRY.loadGadget(id); // injects script, does NOT mount
      const m = api && api.manifest ? api.manifest : null;
      if (m) manifestCache.set(id, m);
      return m;
    } catch {
      return null;
    }
  }

  function getRegistryRecord(id) {
    const list = (window.REGISTRY && window.REGISTRY.GADGETS) || [];
    return list.find(x => x.id === id) || null;
  }
  function inferFileName(id) {
    const rec = getRegistryRecord(id);
    const path = rec?.path || rec?.src || rec?.url || '';
    if (!path) return '(unknown file)';
    try {
      const u = new URL(path, window.location.href);
      const p = u.pathname.split('/').filter(Boolean);
      return p[p.length - 1] || path;
    } catch {
      const parts = String(path).split('/').filter(Boolean);
      return parts[parts.length - 1] || path;
    }
  }

  // =========== Info panel ===========
  function ensureInfoPop() {
    let pop = document.querySelector('.g-infopop');
    if (!pop) {
      pop = document.createElement('div');
      pop.className = 'g-infopop';
      pop.setAttribute('role', 'dialog');
      pop.setAttribute('aria-hidden', 'true');
      document.body.appendChild(pop);
    }
    return pop;
  }

  function fillInfoPop(pop, manifestOrNull, fallbackLabel, idForFile) {
    const m = manifestOrNull;
    if (!m) {
      const file = inferFileName(idForFile);
      pop.innerHTML = `
        <div class="g-infopop-h">
          <strong title="${escapeHtml(fallbackLabel)}">${escapeHtml(truncate(fallbackLabel, 52))}</strong>
        </div>
        <div class="g-infopop-b">
          <div class="row"><span class="k">Type</span><span class="v">Legacy gadget (no manifest v1.0)</span></div>
          <div class="row"><span class="k">File</span><span class="v">${escapeHtml(file)}</span></div>
        </div>`;
      return;
    }

    const caps = Array.isArray(m.capabilities) ? m.capabilities : [];
    const capRows = caps.map(c => {
      const meta = CAP_META[c];
      const text = meta ? `${meta.emoji} ${meta.label}` : c;
      return `<div class="capline">${escapeHtml(text)}</div>`;
    }).join('');

    pop.innerHTML = `
      <div class="g-infopop-h">
        <strong title="${escapeHtml(m.label || `${m._class}:${m._id}`)}">
          ${escapeHtml(truncate(m.label || `${m._class}:${m._id}`, 52))}
        </strong>
      </div>
      <div class="g-infopop-b">
        ${m._class && m._id ? row('ID', `${escapeHtml(m._class)}:${escapeHtml(m._id)}`) : ''}
        ${m._ver ? row('Version', escapeHtml(m._ver)) : ''}
        ${m.verBlurb ? row('Notes', escapeHtml(m.verBlurb)) : ''}
        ${capRows ? rowBlock('Capabilities', capRows) : ''}
        ${m.publisher ? row('Publisher', escapeHtml(m.publisher)) : ''}
        ${m.contact_email ? row('Email', escapeHtml(m.contact_email)) : ''}
        ${m.contact_url ? row('URL', escapeHtml(m.contact_url)) : ''}
        ${m.contact_socials ? row('Socials', escapeHtml(m.contact_socials)) : ''}
        ${m.description ? `<div class="desc">${escapeHtml(m.description)}</div>` : ''}
      </div>
    `;

    function row(k, vHtml)     { return `<div class="row"><span class="k">${k}</span><span class="v">${vHtml}</span></div>`; }
    function rowBlock(k, html) { return `<div class="row"><span class="k">${k}</span><span class="v v-block">${html}</span></div>`; }
  }

  function positionInfoPop(pop, anchorEl) {
    // Place CLOSE to the icon, slightly to the right; clamp to viewport
    const r  = anchorEl.getBoundingClientRect();
    const vw = Math.max(document.documentElement.clientWidth,  window.innerWidth  || 0);
    const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

    // Measure, or assume compact size if not rendered yet
    pop.style.left = '-9999px'; pop.style.top = '-9999px'; pop.classList.add('on');
    const width  = pop.offsetWidth  || 320;
    const height = pop.offsetHeight || 160;

    let left = r.right + 8;     // closer to the icon
    let top  = r.top   - 4;

    // Horizontal clamp (flip to left if needed)
    if (left + width > vw - 8) left = r.left - width - 8;
    if (left < 8) left = 8;

    // Vertical clamp
    if (top + height > vh - 8) top = Math.max(8, vh - height - 8);
    if (top < 8) top = 8;

    pop.style.left = `${Math.round(left)}px`;
    pop.style.top  = `${Math.round(top)}px`;
  }

  function showInfoPop(pop) {
    pop.classList.add('on');
    pop.setAttribute('aria-hidden', 'false');
  }
  function hideInfoPopSoon(pop) {
    clearTimeout(pop._t);
    pop._t = setTimeout(() => {
      pop.classList.remove('on');
      pop.setAttribute('aria-hidden', 'true');
    }, 80);
  }

  function truncate(s, n) {
    if (!s) return '';
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }
  function escapeHtml(s) {
    return String(s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  // =========== Tiny toast ===========
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
      padding:'6px 10px', borderRadius:'6px',
      fontFamily:'sans-serif', fontSize:'11px',
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

  // =========== Settings gadget ===========
  function mount(host, ctx) {
    const { getSettings, setSettings, gadgetCatalog: initialCatalog } = ctx;

    function getCatalog() {
      const live = (window.REGISTRY && window.REGISTRY.GADGETS) || initialCatalog || [];
      return live.map(({ id, label, iconEmoji, iconPng, iconBg, iconBorder }) =>
        ({ id, label, iconEmoji, iconPng, iconBg, iconBorder })
      );
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

    const s0 = getSettings();
    host.innerHTML = `
      <div class="settings-compact">
        <ul id="orderList" class="gridlist8" aria-label="Gadgets"></ul>

        <hr class="muted" />
        <h4>Add Gadgets</h4>
        <div class="row" style="display:flex;gap:.5rem;flex-wrap:wrap;">
          <button id="btn-pick-dir" class="gbtn gbtn-sm">Scan a folder…</button>
          <button id="btn-upload-dir" class="gbtn gbtn-sm">Upload a folder…</button>
          <button id="btn-install-url" class="gbtn gbtn-sm">Install by URL…</button>
          <input id="file-dir" type="file" webkitdirectory multiple style="display:none">
        </div>

        <hr class="muted" />
        <h4>Portal Options</h4>
        <div class="row" style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;">
          <label style="display:flex;align-items:center;gap:.5rem;">
            <input id="opt-fold-hub" type="checkbox" ${s0.foldedHubControls ? 'checked' : ''}>
            Fold window controls under 💠 (experimental)
          </label>
        </div>
      </div>
    `;

    const ul        = host.querySelector('#orderList');
    const btnPick   = host.querySelector('#btn-pick-dir');
    const btnUpload = host.querySelector('#btn-upload-dir');
    const btnUrl    = host.querySelector('#btn-install-url');
    const fileInput = host.querySelector('#file-dir');
    const chkFold   = host.querySelector('#opt-fold-hub');

    function renderList() {
      const s = getSettings();
      const enabled = new Set(s.enabledGadgets || []);
      const userGadgets = computeUserGadgetList();

      ul.innerHTML = userGadgets.map(g => `
        <li data-id="${g.id}" class="set-row grid8">
          <!-- On -->
          <div class="cell c-chk">
            <input type="checkbox" ${enabled.has(g.id) ? 'checked' : ''} aria-label="Enable ${escapeHtml(g.label)}">
          </div>

          <!-- Icon / Info (LEFT of name) -->
          <div class="cell c-ico">
            <span class="info-hook g-iconbox is-interactive" role="button" tabindex="0" aria-label="Show gadget info">ℹ️</span>
          </div>

          <!-- Name (truncated; tooltip with full name) -->
          <div class="cell c-name">
            <span class="g-label truncate" title="${escapeHtml(g.label)}">${escapeHtml(g.label)}</span>
          </div>

          <!-- Capabilities columns (emoji chips only) -->
          <div class="cell c-cap cap1"></div>
          <div class="cell c-cap cap2"></div>
          <div class="cell c-cap cap3"></div>

          <!-- Up/Down -->
          <div class="cell c-up"><button class="gbtn gbtn-xs move-up"   aria-label="Move up">▲</button></div>
          <div class="cell c-dn"><button class="gbtn gbtn-xs move-down" aria-label="Move down">▼</button></div>
        </li>
      `).join('');

      // Eagerly fetch manifests and decorate rows
      [...ul.children].forEach(li => decorateRow(li));
    }

    async function decorateRow(li) {
      const id = li.dataset.id;
      const labelEl = li.querySelector('.g-label');
      const info    = li.querySelector('.info-hook');
      const cap1    = li.querySelector('.cap1');
      const cap2    = li.querySelector('.cap2');
      const cap3    = li.querySelector('.cap3');

      // Use registry-provided icon if present
      const reg = getRegistryRecord(id);
      if (reg) {
        if (reg.iconBg)     info.style.background = reg.iconBg;
        if (reg.iconBorder) info.style.border     = `1px solid ${reg.iconBorder}`;
        if (reg.iconEmoji)  { info.textContent = reg.iconEmoji; info.classList.add('emoji'); }
        if (reg.iconPng) {
          info.textContent = ''; info.classList.remove('emoji');
          const img = document.createElement('img'); img.src = reg.iconPng; img.alt = '';
          img.decoding = 'async'; info.appendChild(img);
        }
      }

      // Manifest (eager) and panel hookup
      const m = await ensureManifestById(id);

      // Fill three capability columns with emoji-only chips (with tooltips)
      function writeCapCell(cell, capName) {
        cell.innerHTML = '';
        if (!capName) return;
        const meta = CAP_META[capName];
        const span = document.createElement('span');
        span.className = 'g-chip';
        span.textContent = meta ? meta.emoji : capName;
        span.title = meta ? meta.label : capName;
        span.setAttribute('aria-label', span.title);
        cell.appendChild(span);
      }
      if (m && Array.isArray(m.capabilities) && m.capabilities.length) {
        writeCapCell(cap1, m.capabilities[0]);
        writeCapCell(cap2, m.capabilities[1]);
        writeCapCell(cap3, m.capabilities[2]);
      }

      // Info hover/focus → floating panel (capabilities in panel: one-per-line)
      const pop = ensureInfoPop();
      let overAnchor = false, overPop = false;

      function showPanel() {
        fillInfoPop(pop, m, labelEl.textContent, id);
        positionInfoPop(pop, info);
        clearTimeout(pop._t);
        showInfoPop(pop);
      }
      function hidePanelSoon() {
        if (!overAnchor && !overPop) hideInfoPopSoon(pop);
      }

      info.addEventListener('mouseenter', () => { overAnchor = true; showPanel(); });
      info.addEventListener('mouseleave', () => { overAnchor = false; hidePanelSoon(); });
      info.addEventListener('focus',      () => { overAnchor = true; showPanel(); });
      info.addEventListener('blur',       () => { overAnchor = false; hidePanelSoon(); });
      info.addEventListener('keydown',    (e) => {
        if (e.key === 'Enter')  { e.preventDefault(); showPanel(); }
        if (e.key === 'Escape') { e.preventDefault(); hidePanelSoon(); }
      });

      pop.addEventListener('mouseenter', () => { overPop = true; clearTimeout(pop._t); showInfoPop(pop); });
      pop.addEventListener('mouseleave', () => { overPop = false; hidePanelSoon(); });
    }

    function saveState() {
      const newOrder = ['header'];
      for (const li of ul.children) {
        const id = li.dataset.id;
        const checked = li.querySelector('input[type=checkbox]').checked;
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

    // Add Gadgets
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

    // Portal option (no duplicate const; use the one defined above)
    chkFold.addEventListener('change', () => {
      const next = !!chkFold.checked;
      setSettings({ foldedHubControls: next });
      window.dispatchEvent(new CustomEvent('gadgets:update', {
        detail: { enabled: getSettings().enabledGadgets }
      }));
      showToast(next ? 'Window controls folded under 💠' : 'Window controls expanded', 'info', 2000);
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
