// registry.js — Unified Gadget Registry (file:// friendly, no CORS)

(function () {

  // === Unified Gadget List ===
  // Each entry provides: id → path → human label
  const GADGETS = [
    { id: 'header',   path: null,                     label: 'VizInt' },             // built-in
    { id: 'worldtz',  path: './gadgets/worldtz.js',   label: 'World Time Zone' },
    { id: 'daily',    path: './gadgets/daily.js',     label: 'Daily Milestones' },
    { id: 'prayers',  path: './gadgets/prayers.js',   label: 'Prayer Times' },
    { id: 'eom',      path: './gadgets/eom.js',       label: 'Days Left in Month' },
    { id: 'settings', path: './gadgets/settings.js',  label: 'Settings' },
  ];

  // === Derived lookup tables ===
  const PATHS = Object.fromEntries(GADGETS.filter(g => g.path).map(g => [g.id, g.path]));
  const GADGET_CATALOG = GADGETS.map(({ id, label }) => ({ id, label }));

  // === Core loader ===
  const _loaded = new Set();

  async function loadGadget(name) {
    const path = PATHS[name];
    if (!path) {
      // built-in or unimplemented gadget
      if (window.GADGETS && window.GADGETS[name]) return window.GADGETS[name];
      throw new Error(`No path defined for gadget: ${name}`);
    }

    if (!_loaded.has(path)) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = path;
        s.async = true;
        s.onload = () => { _loaded.add(path); resolve(); };
        s.onerror = () => reject(new Error('Failed to load ' + path));
        document.head.appendChild(s);
      });
    }

    const api = window.GADGETS && window.GADGETS[name];
    if (!api || typeof api.mount !== 'function') {
      throw new Error(`Gadget ${name} missing mount() API`);
    }
    return api;
  }

  // === Export globally for loader + settings ===
  window.Registry = {
    loadGadget,
    GADGETS,          // full unified table
    GADGET_CATALOG,   // human-readable subset
    PATHS             // machine lookup subset
  };

})();
