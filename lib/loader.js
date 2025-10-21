// ---- localStorage-backed settings (file:// friendly) + gadget chrome ----
(async function () {
  const KEY = 'portalSettings';

	// Dynamic default enablement list (from Registry.js)
	const DEFAULT_ENABLED = (window.REGISTRY?.GADGETS || [])
		.filter(g => g.defaultEnabled)
		.map(g => g.id);

	// Gadget catalog & title map (sourced from Registry.js)
	const GADGET_CATALOG = (window.REGISTRY?.GADGETS || [])
	.map(({ id, label }) => ({ id, label }));
	const GADGET_TITLES = Object.fromEntries(GADGET_CATALOG.map(g => [g.id, g.label]));


  // === Theme support ===
const DEFAULT_THEME = 'light';

function applyTheme(theme) {
  document.body.classList.toggle('dark', theme === 'dark');
}

function initTheme(settings) {
  const theme = settings.theme || DEFAULT_THEME;
  applyTheme(theme);
  window.addEventListener('theme:toggle', () => {
    const next = (document.body.classList.contains('dark') ? 'light' : 'dark');
    applyTheme(next);
    const s = getSettings();
    setSettings({ ...s, theme: next });
  });
}


  // ---------- storage ----------
  function lsGet()       { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
  function lsSet(obj)    { try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch {} }
  function normalizeEnabled(list) {
    const known = new Set(GADGET_CATALOG.map(g => g.id));
    const out = []; const seen = new Set();
    for (const id of Array.isArray(list) ? list : DEFAULT_ENABLED) {
      if (!known.has(id)) continue;
      if (!seen.has(id)) { out.push(id); seen.add(id); }
    }
    if (!seen.has('settings')) out.push('settings'); // always on
    if (!seen.has('header')) out.unshift('header');  // ensure header present
    return out;
  }
  function getSettings() {
    const s = lsGet();
    const enabledGadgets = normalizeEnabled(s && s.enabledGadgets);
    return { ...(s || {}), enabledGadgets };
  }
  function setSettings(next) {
    const prev = getSettings();
    const merged = { ...prev, ...next };
    merged.enabledGadgets = normalizeEnabled(merged.enabledGadgets);
    lsSet(merged);
    return merged;
  }

  // Use the new global Registry (file:// friendly)
  async function loadGadget(name) {
	if (!window.REGISTRY || typeof window.REGISTRY.loadGadget !== 'function') {
	throw new Error('Registry not loaded');
	}
	return window.REGISTRY.loadGadget(name);

  }


  // Global gadget namespace
  window.GADGETS = window.GADGETS || {};

// Built-in header gadget with History content
window.GADGETS.header = {
	//$VER text from GitHub Tag:
  info: `VizInt · ${window.VIZINT_VERSION || '$VER: #???'}`,

  mount(host /* el */, ctx) {
	const HISTORY = window.VIZINT_HISTORY || [];

    // Minimal, readable markup
    host.innerHTML = `
      <div class="vizint-history">
        ${HISTORY.map(h => `
          <details>
            <summary><strong>${h.ver}</strong> — ${h.title} <span class="muted">· ${h.status}</span></summary>
            <ul>
              ${h.bullets.map(b => `<li>${b}</li>`).join('')}
            </ul>
          </details>
        `).join('')}
      </div>
    `;

    // no timers to clean up
  }
};

  // Build chrome wrapper and return refs (slot, body, btnInfo)
  function buildChrome(name, dock) {
    const slot = document.createElement('div');
    slot.className = 'cell3d gadget-slot';
    slot.dataset.gadget = name;

    const titleId = `gtitle-${name}-${Math.random().toString(36).slice(2)}`;
    slot.setAttribute('role', 'region');
    slot.setAttribute('aria-labelledby', titleId);

    const bar   = document.createElement('div');  bar.className   = 'g-titlebar';
    const title = document.createElement('div');  title.className = 'g-title'; title.id = titleId;
    const act   = document.createElement('div');  act.className   = 'g-actions';

    const btnInfo     = document.createElement('button'); btnInfo.className     = 'gbtn g-info';      btnInfo.textContent     = 'ℹ️';
    const btnCollapse = document.createElement('button'); btnCollapse.className = 'gbtn g-collapse';  btnCollapse.textContent = '▁';
    const btnWide     = document.createElement('button'); btnWide.className     = 'gbtn g-wide';      btnWide.textContent     = '⟷';
    const btnMaxFs    = document.createElement('button'); btnMaxFs.className    = 'gbtn g-max';       btnMaxFs.textContent    = '▢';
    const btnX        = document.createElement('button'); btnX.className        = 'gbtn g-close';     btnX.textContent        = '✕';

    title.textContent   = GADGET_TITLES[name] || name;
    btnInfo.title       = 'Info';
    btnCollapse.title   = 'Show title bar only';
    btnWide.title       = 'Toggle full width';
    btnMaxFs.title      = 'Toggle fullscreen';
    btnX.title          = 'Close';

	const btnTheme = document.createElement('button');
	btnTheme.className = 'gbtn g-theme';
	btnTheme.title = 'Toggle dark / light mode';

	// pick initial icon based on current state
	btnTheme.textContent = document.body.classList.contains('dark') ? '🌞' : '🌜';
	btnTheme.addEventListener('click', () => {
		window.dispatchEvent(new CustomEvent('theme:toggle'));
	});

	// keep icon in sync when theme changes elsewhere
	window.addEventListener('theme:changed', (e) => {
		btnTheme.textContent = e.detail.theme === 'dark' ? '🌞' : '🌜';
	});

	// Only show this on the VizInt header gadget
	if (name === 'header') {

		// Show version info on VizInt header
		const ver = window.VIZINT_VERSION || '$VER: #---';
		const verSpan = document.createElement('span');
		verSpan.className = 'vizint-ver muted';
		verSpan.textContent = `· ${ver}`;
		title.appendChild(verSpan);

		// --- Theme toggle button (only on VizInt header gadget) ---
		const btnTheme = document.createElement('button');
		btnTheme.className = 'gbtn g-theme';
		btnTheme.title = 'Toggle dark / light mode';
		// initial icon based on current state
		btnTheme.textContent = document.body.classList.contains('dark') ? '🌞' : '🌜';

		btnTheme.addEventListener('click', () => {
			// Tell loader theme system to flip
			window.dispatchEvent(new CustomEvent('theme:toggle'));
			// Update icon immediately
			btnTheme.textContent = document.body.classList.contains('dark') ? '🌞' : '🌜';
		});

		// If theme changes elsewhere, keep icon in sync
		window.addEventListener('theme:changed', (e) => {
			btnTheme.textContent = e.detail.theme === 'dark' ? '🌞' : '🌜';
		});

		// Put it at the start of the actions group (or .append if you prefer)
		act.prepend(btnTheme); // or append, your choice
		act.prepend(btnTheme);
	}

	
    if (name === 'settings' || name === 'header') {
      btnX.disabled = true;
      btnX.title = name === 'settings' ? 'Settings cannot be closed' : 'Header cannot be closed';
    }

    act.append(btnInfo, btnCollapse, btnWide, btnMaxFs, btnX);
    bar.append(title, act);

    const body = document.createElement('div'); body.className = 'g-body';
    slot.append(bar, body);
    dock.appendChild(slot);

    // state helpers
	  // ---------- state helpers ----------
  function persist(partial) {
    const s = getSettings();
    const st = s.gadgetState || {};
    st[name] = { ...(st[name] || {}), ...partial };
    setSettings({ ...s, gadgetState: st });
  }

  function setCollapsed(isCollapsed) {
    slot.classList.toggle('g-minimized', isCollapsed);
    btnCollapse.title = isCollapsed ? 'Restore tile' : 'Show title bar only';
    persist({ collapsed: isCollapsed });
  }

  function setFullWidth(isWide) {
    slot.classList.toggle('g-spanwide', isWide);
    btnWide.title = isWide ? 'Return to normal width' : 'Make full width';
    persist({ wide: isWide });
  }

  function setFullscreen(isFs) {
    slot.classList.toggle('g-maximized', isFs);
    btnMaxFs.title = isFs ? 'Exit fullscreen' : 'Toggle fullscreen';
    if (isFs) slot.classList.remove('g-minimized');
    persist({ fullscreen: isFs });
  }

  // ---------- wire controls ----------
  btnCollapse.addEventListener('click',		() => setCollapsed(!slot.classList.contains('g-minimized')));
  btnWide.addEventListener('click',	   		() => setFullWidth(!slot.classList.contains('g-spanwide')));
  btnMaxFs.addEventListener('click',		() => setFullscreen(!slot.classList.contains('g-maximized')));
  btnX.addEventListener('click', () => {
    if (name === 'settings' || name === 'header') return;
    const s = getSettings();
    const next = {
      ...s,
      enabledGadgets: (s.enabledGadgets || []).filter(id => id !== name)
    };
    const merged = setSettings(next);
    window.dispatchEvent(new CustomEvent('gadgets:update', {
      detail: { enabled: merged.enabledGadgets }
    }));
  });

  btnInfo.style.display = 'none';

  // ---------- initial visual state ----------
  const s  = getSettings();
  const st = (s.gadgetState && s.gadgetState[name]) || {};

  // 1️⃣ Restore persisted states
  if (st.wide)       setFullWidth(true);
  if (st.fullscreen) setFullscreen(true);
  if (st.collapsed)  setCollapsed(true);

  // 2️⃣ Apply defaults if no saved state yet
  if (!(s.gadgetState && s.gadgetState[name])) {
    if (name === 'header') {
      setFullWidth(true);
      setCollapsed(true);
    } else {
      setFullWidth(false);
      setCollapsed(false);
    }
  }

  return { slot, body, btnInfo };
  }

  function unmountAll(dock) {
    for (const el of Array.from(dock.children)) { try { el._unmount && el._unmount(); } catch {} }
    dock.innerHTML = '';
  }

	async function mountGadget(name, ctx, dock) {
		const { slot, body, btnInfo } = buildChrome(name, dock);

		// 1) Resolve the gadget API (built-in header vs dynamic)
		let api;
		if (name === 'header') {
			api = window.GADGETS.header;
		} else {
			try {
			api = await loadGadget(name); // uses Registry.loadGadget()
			} catch (err) {
			console.error(err);
			body.innerHTML = `<div class="err">Load error</div>`;
			return;
			}
		}

		// 2) Info tooltip + visibility
		if (api && typeof api.info === 'string' && api.info.trim()) {
			btnInfo.title = api.info.trim();
			btnInfo.style.display = '';
		} else {
			btnInfo.style.display = 'none';
		}

		// 3) Mount the gadget
		try {
			const unmount = api.mount(body, ctx);
			if (typeof unmount === 'function') slot._unmount = unmount;
		} catch (err) {
			console.error(err);
			body.innerHTML = `<div class="err">Mount error</div>`;
		}

		// 4) Always wire the ℹ️ button for any gadget that implements onInfoClick
		btnInfo.onclick = null; // clear any prior handler to avoid duplicates
		if (api && typeof api.onInfoClick === 'function') {
			btnInfo.addEventListener('click', () => api.onInfoClick(ctx, { slot, body }));
		}
	}
  // ---------- render ----------
  function render() {
    const dock = document.getElementById('dock');

    // ✅ Apply default settings keys before use
    const settings = ensureDefaults(getSettings());
    const enabled = settings.enabledGadgets;

    const ctx = {
      settings,
      setSettings(next) {
        const merged = setSettings(next);
        window.dispatchEvent(new CustomEvent('gadgets:update', {
          detail: { enabled: merged.enabledGadgets }
        }));
      },
      bus: window,
      gadgetCatalog: GADGET_CATALOG,
      getSettings,
    };

    // Clear and mount all enabled gadgets
    unmountAll(dock);
    for (const g of enabled) mountGadget(g, ctx, dock);
  }

  // ---------- defaults initializer ----------
  // Ensures certain global settings keys exist
  // (avoids undefined access in gadgets)
  function ensureDefaults(s) {
    const next = { ...s };
    if (typeof next.showDiag === 'undefined') next.showDiag = false;
    return next;
  }

  // ---------- event wiring ----------
  window.addEventListener('gadgets:update', () => render());

  // ---------- Portal exports ----------
  window.Portal = {
    render,
    getSettings,
    setSettings,
    DEFAULT_ENABLED,
    GADGET_CATALOG
  };

  // ---------- auto-start ----------
  // Initialize theme and render once DOM is ready
  if (window.Portal && typeof window.Portal.render === 'function') {
    initTheme(getSettings());
    window.Portal.render();
  }

})();
