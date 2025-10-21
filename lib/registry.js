// registry.js — Unified Gadget Registry (file:// friendly, no CORS)

(function () {

  // === Unified Gadget List ===
  // Each entry provides: id → path → human label
  // registry.js

  window.REGISTRY = {
		GADGETS: [
			{ id: 'header',   path: null,                     label: 'VizInt',           defaultEnabled: true },
			{ id: 'daily',    path: './gadgets/daily.js',     label: 'Daily Milestones', defaultEnabled: true },
			{ id: 'prayers',  path: './gadgets/prayers.js',   label: 'Prayer Times',     defaultEnabled: true },
			{ id: 'eom',      path: './gadgets/eom.js',       label: 'Days Left in Month', defaultEnabled: true },
			{ id: 'worldtz',  path: './gadgets/worldtz.js',   label: 'World Time Zone',  defaultEnabled: true },
			{ id: 'embed',    path: './gadgets/embed.js',     label: 'Custom Embed',     defaultEnabled: true },
			{ id: 'settings', path: './gadgets/settings.js',  label: 'Settings',         defaultEnabled: true },
		]
	};

	// === Derived lookup tables ===
	const PATHS = Object.fromEntries((window.REGISTRY.GADGETS || [])
		.filter(g => g.path)
		.map(g => [g.id, g.path]));

	const GADGET_CATALOG = (window.REGISTRY.GADGETS || [])
		.map(({ id, label }) => ({ id, label }));

	// === Core loader ===
	const _loaded = new Set();

	async function loadGadget(name) {
		const path = PATHS[name];
		if (!path) {
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
	window.REGISTRY.loadGadget = loadGadget;
	window.REGISTRY.GADGET_CATALOG = GADGET_CATALOG;
	window.REGISTRY.PATHS = PATHS;

})();
