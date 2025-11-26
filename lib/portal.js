/*
	loader.js v1.2.5

	HISTORY:
	2025-11-18 (U:Portal)
	- Implemented ctx.libs wiring and ctx.shared deprecation shim.
	- Added capability badges with ⚠ precedence for served-on-file gadgets.
	- Introduced debounced localStorage writes for portalSettings.
	2025-11-22 (U:Portal)
	- Wired ctx.libs.Core/Atlas/Chronus/Nexus with Nexus bus fallback to window.
	- Added per-instance settings wrappers for API 1.0 gadgets (Vz:<Class>:<Instance>).
	- Limited capability badges to _api "1.0" gadgets and respected per-instance ctx.get/set/resetSettings.
	2025-11-23 (U:Portal)
	- Updated ctx.libs wiring to align with strict de-globalization FRTP (no direct window.* assembly).
	- Introduced factory-based lib construction (makeCoreInstance/makeAtlasInstance/makeChronusInstance/makeNexusInstance)
	  with legacy globals as a temporary fallback plus diagnostics.
	2025-11-27 (U:Portal)
	- Cleaved loader.js into portal.js (runtime) + chrome.js (UX chrome).
	- Delegated gadget titlebar/controls to window.PortalChrome.createGadgetChrome().
*/

(async function () {
	'use strict';

	const KEY = 'portalSettings';

	// Dynamic default enablement list (from registry.js)
	const DEFAULT_ENABLED = (window.REGISTRY?.GADGETS || [])
		.filter(g => g.defaultEnabled)
		.map(g => g.id);

	// Keep full metadata from REGISTRY (we may need icon, labels, etc.)
	const GADGET_CATALOG = (window.REGISTRY?.GADGETS || []);
	const GADGET_TITLES  = Object.fromEntries(GADGET_CATALOG.map(g => [g.id, g.label]));

	// === Theme support ===
	const DEFAULT_THEME = 'light';

	function applyTheme(theme) {
		document.body.classList.toggle('dark', theme === 'dark');
		window.dispatchEvent(new CustomEvent('theme:changed', { detail: { theme } }));
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

	// ---------- settings storage ----------

	let lsCache = null;
	let lsWriteTimer = null;

	function lsGet() {
		if (lsCache !== null) return lsCache;
		try {
			lsCache = JSON.parse(localStorage.getItem(KEY) || 'null');
		} catch {
			lsCache = null;
		}
		return lsCache;
	}

	function lsSet(obj) {
		lsCache = obj;
		if (lsWriteTimer) clearTimeout(lsWriteTimer);
		// Debounced write (≥ 100 ms as per Storage Doctrine)
		lsWriteTimer = setTimeout(() => {
			try {
				localStorage.setItem(KEY, JSON.stringify(lsCache));
			} catch {
				// Swallow storage errors (quota, private mode, etc.)
			}
		}, 150);
	}

	function normalizeEnabled(list) {
		const known = new Set(GADGET_CATALOG.map(g => g.id));
		const out  = [];
		const seen = new Set();
		for (const id of Array.isArray(list) ? list : DEFAULT_ENABLED) {
			if (!known.has(id)) continue;
			if (!seen.has(id)) {
				out.push(id);
				seen.add(id);
			}
		}
		if (!seen.has('settings')) out.push('settings'); // always on
		if (!seen.has('header'))   out.unshift('header'); // ensure header present
		return out;
	}

	function getSettings() {
		const s = lsGet();
		const enabledGadgets = normalizeEnabled(s && s.enabledGadgets);
		const instanceSettings = (s && typeof s.instanceSettings === 'object')
			? s.instanceSettings
			: {};
		return { ...(s || {}), enabledGadgets, instanceSettings };
	}

	function setSettings(next) {
		const prev   = getSettings();
		const merged = { ...prev, ...next };
		merged.enabledGadgets = normalizeEnabled(merged.enabledGadgets);
		lsSet(merged);
		return merged;
	}

	// ---------- per-instance settings helpers (API 1.0 gadgets) ----------

	function makeInstanceName(manifest, fallbackId) {
		// Vz:<Class>:<Instance>
		const cls = (manifest && manifest._class) || fallbackId || 'Unknown';
		const inst = (manifest && manifest._id) || 'default';
		return `Vz:${cls}:${inst}`;
	}

	function getInstanceSettingsObject(instanceName) {
		const root = lsGet() || {};
		const bucket = (root.instanceSettings && typeof root.instanceSettings === 'object')
			? root.instanceSettings
			: {};
		const current = (bucket[instanceName] && typeof bucket[instanceName] === 'object')
			? bucket[instanceName]
			: {};
		return current;
	}

	function patchInstanceSettings(instanceName, patch) {
		if (!patch || typeof patch !== 'object') return;
		const root = lsGet() || {};
		const bucket = (root.instanceSettings && typeof root.instanceSettings === 'object')
			? { ...root.instanceSettings }
			: {};
		const current = (bucket[instanceName] && typeof bucket[instanceName] === 'object')
			? bucket[instanceName]
			: {};
		bucket[instanceName] = { ...current, ...patch };
		root.instanceSettings = bucket;
		lsSet(root);
	}

	function resetInstanceSettings(instanceName) {
		const root = lsGet() || {};
		if (!root.instanceSettings || typeof root.instanceSettings !== 'object') return;
		const bucket = { ...root.instanceSettings };
		if (bucket[instanceName]) {
			delete bucket[instanceName];
			root.instanceSettings = bucket;
			lsSet(root);
		}
	}

	// ---------- shared library wiring (ctx.libs + deprecated ctx.shared) ----------

	function buildLibs() {
		const Core    = window.Core    || window.SHARED_CORE || {};
		const Atlas   = window.Atlas   || {};
		const Chronus = window.Chronus || {};
		const Nexus   = window.Nexus   || {};

		if (!window.Core) {
			console.warn('[VizInt] Core library not found on window.Core; ctx.libs.Core will be empty.');
		}
		if (!window.Atlas) {
			console.warn('[VizInt] Atlas library not found on window.Atlas; ctx.libs.Atlas will be empty.');
		}
		if (!window.Chronus) {
			console.warn('[VizInt] Chronus library not found on window.Chronus; ctx.libs.Chronus will be empty.');
		}
		if (!window.Nexus) {
			console.warn('[VizInt] Nexus library not found on window.Nexus; ctx.libs.Nexus will be empty (bus will fall back to window).');
		}

		return { Core, Atlas, Chronus, Nexus };
	}

	function makeSharedShim(libs) {
		const warned = { get: false, set: false };
		return new Proxy(libs, {
			get(target, prop, recv) {
				if (!warned.get) {
					console.warn('[VizInt] ctx.shared is deprecated; use ctx.libs instead (will be removed in a future version).');
					warned.get = true;
				}
				return Reflect.get(target, prop, recv);
			},
			set(target, prop, value, recv) {
				if (!warned.set) {
					console.warn('[VizInt] ctx.shared mutation is deprecated; update callers to use ctx.libs instead.');
					warned.set = true;
				}
				return Reflect.set(target, prop, value, recv);
			}
		});
	}

	// Registry loader
	async function loadGadget(name) {
		if (!window.REGISTRY || typeof window.REGISTRY.loadGadget !== 'function') {
			throw new Error('Registry not loaded');
		}
		return window.REGISTRY.loadGadget(name);
	}

	// Built-in header (unchanged content)
	window.GADGETS = window.GADGETS || {};
	window.GADGETS.header = {
		info: `VizInt · ${window.VIZINT_VERSION || '$VER: #???'}`,
		mount(host /* el */, ctx) {
			const HISTORY = window.VIZINT_HISTORY || [];
			host.innerHTML = `
				<div class="vizint-history">
					${HISTORY.map(h => `
						<details>
							<summary><strong>${h.ver}</strong> — ${h.title} <span class="muted">· ${h.status}</span></summary>
							<ul>${h.bullets.map(b => `<li>${b}</li>`).join('')}</ul>
						</details>
					`).join('')}
				</div>
			`;
		}
	};

	// ---------- unmount helper ----------

	function unmountAll(dock) {
		for (const el of Array.from(dock.children)) {
			try {
				el._unmount && el._unmount();
			} catch {}
		}
		dock.innerHTML = '';
	}

	// Map capability → chip + tooltip (still computed by Portal for now)
	const CAP_CHIPS = {
		chronus: { emoji: '🕰️', title: 'Uses Chronus (time/tz helpers)' },
		atlas:   { emoji: '📍',  title: 'Uses Atlas (geo helpers)' },
		served:  { emoji: '🖥️',  title: 'Must be served (not file://)' },
		network: { emoji: '🌐',  title: 'Contacts remote APIs' }
	};

	const CAP_ORDER = ['chronus', 'atlas', 'network', 'served'];

	// ---------- safe reset for header trash button ----------

	function safeResetAll() {
		const s = getSettings();
		// Preserve some gadget-specific payloads if needed; hard-coded flashcards bucket for now
		setSettings({ ...s, flashcards: {} });
		try {
			localStorage.removeItem('portalSettings');
			localStorage.removeItem('vizint.registry');
			console.log('[VizInt SafeStart] Cleared portalSettings + vizint.registry');
		} catch (e) {
			console.warn('[VizInt SafeStart] Cleanup failed', e);
		}
		render();
	}

	// ---------- chrome descriptor + mount ----------

	function buildChromeDescriptor(name, manifest, gadgetInfo, bidi) {
		const classId = (manifest && manifest._class) || name;
		const instanceId = (manifest && manifest._id) || 'default';
		const label = gadgetInfo?.label || name;

		return {
			id: name,
			classId,
			instanceId,
			instanceName: label, // will evolve with multi-instance naming
			label,
			isHeader: name === 'header',
			isSettingsGadget: name === 'settings',
			canClose: !(name === 'header' || name === 'settings'),
			disableCloseReason: name === 'header'
				? 'header cannot be closed'
				: (name === 'settings' ? 'settings cannot be closed' : ''),
			gadgetInfo,
			bidi: bidi || 'ltr'
		};
	}

	async function mountGadget(name, ctx, dock) {
		if (!window.PortalChrome || typeof window.PortalChrome.createGadgetChrome !== 'function') {
			console.error('[VizInt] chrome.js not loaded or PortalChrome.createGadgetChrome missing.');
			return;
		}

		// Load API
		let api;
		if (name === 'header') {
			api = window.GADGETS.header;
		} else {
			try {
				api = await loadGadget(name);
			} catch (err) {
				console.error(err);
				const fallback = document.createElement('div');
				fallback.className = 'cell3d gadget-slot';
				fallback.textContent = `Load error for gadget: ${name}`;
				dock.appendChild(fallback);
				return;
			}
		}

		const manifest = api.manifest || {};
		const isApiV1 = manifest._api === '1.0';
		const bidi = manifest.bidi || 'ltr';

		const gadgetInfo = ctx.gadgetCatalog.find(g => g.id === name);
		const descriptor = buildChromeDescriptor(name, manifest, gadgetInfo, bidi);

		const s = getSettings();
		const gadgetStateAll = s.gadgetState || {};
		const st = gadgetStateAll[name] || {};
		const hasExplicitState = !!gadgetStateAll[name];

		const initialState = {
			collapsed: !!st.collapsed,
			wide: !!st.wide,
			fullscreen: !!st.fullscreen,
			hasExplicitState
		};

		const chromeCtx = {
			dock,
			isHeader: descriptor.isHeader,
			isSettingsGadget: descriptor.isSettingsGadget,
			isFoldedHubControls: !!s.foldedHubControls,
			initialState,
			verString: window.VIZINT_VERSION || '$VER: #---',
			onStateChange(partial) {
				// Persist gadgetState deltas for this gadget
				const cur = getSettings();
				const gsAll = cur.gadgetState || {};
				const curGs = gsAll[name] || {};
				gsAll[name] = { ...curGs, ...partial };
				setSettings({ ...cur, gadgetState: gsAll });
			},
			onClose() {
				if (descriptor.isHeader || descriptor.isSettingsGadget) return;
				const s = getSettings();
				const next = {
					...s,
					enabledGadgets: (s.enabledGadgets || []).filter(id => id !== name)
				};
				const merged = setSettings(next);
				window.dispatchEvent(new CustomEvent('gadgets:update', {
					detail: { enabled: merged.enabledGadgets }
				}));
			},
			onSafeReset: safeResetAll,
			onThemeToggle() {
				window.dispatchEvent(new CustomEvent('theme:toggle'));
			}
		};

		// Call into chrome.js to build shell
		const { slot, body, iconEl, chipsSpan } = window.PortalChrome.createGadgetChrome(descriptor, chromeCtx);

		// 2) Instance name for settings (Vz:<Class>:<Instance>)
		const instanceName = makeInstanceName(manifest, name);

		// 3) Capability chips for API 1.0 gadgets (still rendered by Portal for now)
		const showChips = !!s.showTitleChips; // defaulted in ensureDefaults()

		if (showChips && chipsSpan && isApiV1 && Array.isArray(manifest.capabilities)) {
			chipsSpan.innerHTML = '';

			const caps = manifest.capabilities;
			const isFile = (location.protocol === 'file:');

			// Capability guard: served + file:// → ⚠ first
			if (isFile && caps.includes('served')) {
				const warnSpan = document.createElement('span');
				warnSpan.className = 'g-chip g-chip-warn';
				warnSpan.textContent = '⚠';
				warnSpan.title = 'This gadget expects to be served over HTTP(S); running under file:// may limit functionality.';
				chipsSpan.appendChild(warnSpan);
			}

			for (const cap of CAP_ORDER) {
				if (!caps.includes(cap)) continue;
				const meta = CAP_CHIPS[cap];
				if (!meta) continue;
				const span = document.createElement('span');
				span.className = 'g-chip';
				span.textContent = meta.emoji;
				span.title = meta.title;
				chipsSpan.appendChild(span);
			}
		}

		// 4) Build per-instance ctx (API 1.0) vs legacy ctx
		const env = {
			geometry: null,
			layout: null,
			isDark: document.body.classList.contains('dark'),
			bidi: descriptor.bidi
		};

		const bus = (ctx.libs && ctx.libs.Nexus && ctx.libs.Nexus.bus)
			? ctx.libs.Nexus.bus
			: ctx.bus || window;

		const instanceGetSettings = function (key, defaultValue) {
			const all = getInstanceSettingsObject(instanceName);
			if (key === undefined || key === null) return all;
			return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : defaultValue;
		};

		const instanceSetSettings = function (patch) {
			if (!patch || typeof patch !== 'object') return;
			patchInstanceSettings(instanceName, patch);
		};

		const instanceResetSettings = function () {
			resetInstanceSettings(instanceName);
		};

		const gctx = {
			...ctx,
			name: instanceName,
			host: body,
			env,
			bus,
			getSettings: isApiV1 ? instanceGetSettings : ctx.getSettings,
			setSettings: isApiV1 ? instanceSetSettings : ctx.setSettings,
			resetSettings: isApiV1 ? instanceResetSettings : (ctx.resetSettings || (() => {}))
		};

		// 5) Mount gadget
		try {
			const unmount = api.mount(body, gctx);
			if (typeof unmount === 'function') slot._unmount = unmount;
		} catch (err) {
			console.error(err);
			body.innerHTML = `<div class="err">Mount error</div>`;
		}

		// 6) Info affordance via icon
		if (iconEl) {
			iconEl.classList.add('is-interactive');
			iconEl.title = 'Info';
			iconEl.addEventListener('click', (e) => {
				e.stopPropagation();
				if (api && typeof api.onInfoClick === 'function') {
					api.onInfoClick(gctx, { slot, body });
					return;
				}
				if (api && api.manifest) {
					const m = api.manifest;
					const caps = (m.capabilities || []).join(', ');
					const lines = [
						`${m._class}:${m._id}`,
						m.label ? `Title: ${m.label}` : '',
						m._ver ? `Version: ${m._ver}` : '',
						m.verBlurb ? `Notes: ${m.verBlurb}` : '',
						caps ? `Capabilities: ${caps}` : '',
						m.publisher ? `Publisher: ${m.publisher}` : '',
						m.contact_email ? `Email: ${m.contact_email}` : '',
						m.contact_url ? `URL: ${m.contact_url}` : '',
						m.contact_socials ? `Socials: ${m.contact_socials}` : '',
						m.description ? `—\n${m.description}` : ''
					].filter(Boolean);
					try {
						alert(lines.join('\n'));
					} catch {}
				} else if (api && typeof api.info === 'string' && api.info.trim()) {
					try {
						alert(api.info);
					} catch {}
				}
			});
		}
	}

	// ---------- render ----------

	function ensureDefaults(s) {
		const next = { ...s };
		if (typeof next.showDiag === 'undefined')          next.showDiag = false;
		if (typeof next.foldedHubControls === 'undefined') next.foldedHubControls = false;
		if (typeof next.showTitleChips === 'undefined')    next.showTitleChips = true;
		return next;
	}

	function render() {
		const dock = document.getElementById('dock');
		if (!dock) {
			console.warn('[VizInt] Missing #dock container; aborting render.');
			return;
		}

		const settings = ensureDefaults(getSettings());
		const enabled  = settings.enabledGadgets;

		const libs   = buildLibs();
		const shared = makeSharedShim(libs);

		const bus = (libs.Nexus && libs.Nexus.bus) ? libs.Nexus.bus : window;

		const ctx = {
			settings,
			setSettings(next) {
				const merged = setSettings(next);
				window.dispatchEvent(new CustomEvent('gadgets:update', {
					detail: { enabled: merged.enabledGadgets }
				}));
			},
			bus,
			gadgetCatalog: GADGET_CATALOG,
			getSettings,
			resetSettings() {
				// Portal-level reset hook (per-instance reset handled via ctx.resetSettings per gadget)
			},
			libs,
			shared
		};

		unmountAll(dock);
		for (const g of enabled) {
			mountGadget(g, ctx, dock);
		}
	}

	// ---------- events ----------

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

	if (window.Portal && typeof window.Portal.render === 'function') {
		initTheme(getSettings());
		window.Portal.render();
	}
})();
