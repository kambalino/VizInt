// ---- localStorage-backed settings (file:// friendly) + gadget chrome ----
(async function () {
  const KEY = 'portalSettings';
  // TEMP: keep only header/eom/settings enabled until daily/prayers are restored
  const DEFAULT_ENABLED = ['daily','prayers','header','eom','settings'];


  // Known gadgets for the Settings UI
  const GADGET_CATALOG = [
    { id: 'header',   label: 'VizInt' },             // built-in
    { id: 'daily',    label: 'Daily Milestones' },
    { id: 'prayers',  label: 'Prayer Times' },
    { id: 'eom',      label: 'Days Left in Month' },
    { id: 'settings', label: 'Settings' },
  ];
  const GADGET_TITLES = Object.fromEntries(GADGET_CATALOG.map(g => [g.id, g.label]));

  // File-backed scripts only (header is built-in)
  const SCRIPT_REGISTRY = {
    eom: './gadgets/eom.js',
    settings: './gadgets/settings.js',
    daily: './gadgets/daily.js',
    prayers: './gadgets/prayers.js',
  };


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

  // ---------- loader ----------
  const _loaded = new Set();
  function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
      if (_loaded.has(src)) return resolve();
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = () => { _loaded.add(src); resolve(); };
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
  }

  // Global gadget namespace
  window.GADGETS = window.GADGETS || {};

// Built-in header gadget (no external file)
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
    function setCollapsed(isCollapsed) {
      slot.classList.toggle('g-minimized', isCollapsed);
      btnCollapse.title = isCollapsed ? 'Restore tile' : 'Show title bar only';
    }
    function setFullWidth(isWide) {
      slot.classList.toggle('g-spanwide', isWide);
      btnWide.title = isWide ? 'Return to normal width' : 'Make full width';
    }
    function toggleFullscreen() {
      const now = slot.classList.toggle('g-maximized');
      btnMaxFs.title = now ? 'Exit fullscreen' : 'Toggle fullscreen';
      if (now) slot.classList.remove('g-minimized');
    }

    // wire controls
    btnCollapse.addEventListener('click', () => setCollapsed(!slot.classList.contains('g-minimized')));
    btnWide.addEventListener('click', () => setFullWidth(!slot.classList.contains('g-spanwide')));
    btnMaxFs.addEventListener('click', toggleFullscreen);
    btnX.addEventListener('click', () => {
      if (name === 'settings' || name === 'header') return;
      const s = getSettings();
      const next = { ...s, enabledGadgets: (s.enabledGadgets || []).filter(id => id !== name) };
      const merged = setSettings(next);
      window.dispatchEvent(new CustomEvent('gadgets:update', { detail: { enabled: merged.enabledGadgets }}));
    });

    // Info hidden until gadget provides api.info (set in mountGadget)
    btnInfo.style.display = 'none';

	// ---------- initial visual state ----------
	if (name === 'header') {
		setFullWidth(true);   // header spans full grid
		setCollapsed(true);   // header starts minimized (title bar only)
	} else {
		setFullWidth(false);
		setCollapsed(false);
	}


    return { slot, body, btnInfo };
  }

  function unmountAll(dock) {
    for (const el of Array.from(dock.children)) { try { el._unmount && el._unmount(); } catch {} }
    dock.innerHTML = '';
  }

  async function mountGadget(name, ctx, dock) {
    const { slot, body, btnInfo } = buildChrome(name, dock);

    // built-in header: no file load
    if (name === 'header') {
      const api = window.GADGETS.header;
      const unmount = api.mount(body, ctx);
      if (typeof unmount === 'function') slot._unmount = unmount;
      // Set info tooltip from gadget if present
      if (api && typeof api.info === 'string' && api.info.trim()) {
        btnInfo.title = api.info.trim();
        btnInfo.style.display = '';
      }
      return;
    }

    const path = SCRIPT_REGISTRY[name];
    if (!path) { body.innerHTML = `<div class="muted">Not implemented</div>`; return; }

    try {
      await loadScriptOnce(path);
      const api = window.GADGETS[name];

      if (api && typeof api.info === 'string' && api.info.trim()) {
        btnInfo.title = api.info.trim();
        btnInfo.style.display = '';
      } else {
        btnInfo.style.display = 'none';
      }

      if (!api || typeof api.mount !== 'function') {
        body.innerHTML = `<div class="muted">Not implemented</div>`;
        return;
      }

      const unmount = api.mount(body, ctx);
      if (typeof unmount === 'function') slot._unmount = unmount;
    } catch (err) {
      console.error(err);
      body.innerHTML = `<div class="err">Load error</div>`;
    }
  }

  function render() {
    const dock = document.getElementById('dock');
    const settings = getSettings();
    const enabled = settings.enabledGadgets;

    const ctx = {
      settings,
      setSettings(next) {
        const merged = setSettings(next);
        window.dispatchEvent(new CustomEvent('gadgets:update', { detail: { enabled: merged.enabledGadgets }}));
      },
      bus: window,
      gadgetCatalog: GADGET_CATALOG,
      getSettings,
    };

    unmountAll(dock);
    for (const g of enabled) mountGadget(g, ctx, dock);
  }

  window.addEventListener('gadgets:update', () => render());
  window.Portal = { render, getSettings, setSettings, DEFAULT_ENABLED, GADGET_CATALOG };

  // Auto-render once everything is ready
	if (window.Portal && typeof window.Portal.render === 'function') {
		// Initialize theme
		initTheme(getSettings());
		window.Portal.render();
	}

})();
