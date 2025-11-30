/*
	portal.js v1.2.11

	HISTORY:
	2025-11-18 (U:Portal)
	- Implemented ctx.libs wiring and ctx.shared deprecation shim.
	- Added capability badges with ⚠ precedence for served-on-file gadgets.
	- Introduced debounced localStorage writes for portalSettings.
	2025-11-22 (U:Portal)
	- Wired ctx.libs.Core/Atlas/Chronus/Nexus with Nexus bus fallback to window.
	- Added per-instance settings wrappers for API 1.0 gadgets (Vz:<Class>:<Instance>).
	- Limited capability chips to _api "1.0" gadgets and respected per-instance ctx.get/set/resetSettings.
	2025-11-23 (U:Portal)
	- Cleaved runtime from loader.js into portal.js (runtime) and chrome.js (UX).
	- Fixed gadget ordering persistence, enforced header-first/settings-last.
	- Hardened enabledGadgets normalization to avoid duplicates and stray IDs.
	- Updated ctx.libs wiring to align with strict de-globalization FRTP (no direct window.* assembly).
	- Introduced factory-based lib construction (makeCoreInstance/makeAtlasInstance/makeChronusInstance/makeNexusInstance)
	  with legacy globals as a temporary fallback plus diagnostics.
	2025-11-24 (U:Portal)
	- Cleaved loader.js into portal.js (runtime) + chrome.js (UX chrome).
	- Delegated gadget titlebar/controls to window.PortalChrome.createGadgetChrome().
	2025-11-27 (U:Portal)
	- Introduced gadgetType/isSystem descriptor pattern (single|multi|system) for close rules.
	- Restored info-icon click affordance via chromeCtx.onInfoRequest.
	- Wired header chrome hooks (safe reset + theme toggle) cleanly from portal.
	2025-11-27 (U:Portal)
	- Added descriptor.supportsSettings/showSettingsGear and chromeCtx.onSettingsRequested hook
	  so gadgets own their settings UX when the settings gear is clicked.
	2025-11-27 (U:Portal)
	- Applied v1.2.x Option A for settings gear:
	  * Registry (meta.supportsSettings) is canonical for gear visibility.
	  * Manifest remains canonical for behavior + onSettingsRequested wiring.
	2025-11-28 (U:Portal)
	- Canonicalized ctx.settings API for _api "1.0" gadgets (get/set/reset/getAll) with shallow-merge semantics.
	- Exposed ctx.getSettings/setSettings/resetSettings as sugar over ctx.settings.* (///! planned for deprecation).
	- Introduced generic settings modal host plumbing (Portal.openSettingsModal/closeSettingsModal).
	- Wired header settings gear to the generic modal host (Phase-2 scaffold; Settings tile still present for now).
	2025-11-29 (U:Portal)
	- Implemented canonical normalizer + storageKey model for per-instance settings.
	- Introduced vz:gadgets:{storageKey}:{instanceId} instanceName path with migration from legacy Vz:<Class>:<Instance>.
	- Ensured system gadgets keep public classId but use normalized storageKey for settings buckets.
	2025-11-29 (U:Portal)
	- Stage-2A: Introduced internal instancesByClass table, Portal.getInstances(classId),
	  and portal:gadgetInstancesChanged events (single-instance compatible).
*/

(async function () {
	'use strict';

	// ---- localStorage-backed settings (file:// friendly) ----
	const KEY = 'portalSettings';

	// Dynamic default enablement list (from registry.js)
	const DEFAULT_ENABLED = (window.REGISTRY?.GADGETS || [])
		.filter(g => g.defaultEnabled)
		.map(g => g.id);

	// Keep full metadata from REGISTRY (we may need icon, labels, capabilities, etc.)
	const GADGET_CATALOG = (window.REGISTRY?.GADGETS || []);
	const GADGET_BY_ID   = Object.fromEntries(GADGET_CATALOG.map(g => [g.id, g]));

	// Map capability → chip + tooltip (still computed by Portal for now)
	const CAP_CHIPS = {
		chronus: { emoji: '🕰️', title: 'Uses Chronus (time/tz helpers)' },
		atlas:   { emoji: '📍',  title: 'Uses Atlas (geo helpers)' },
		served:  { emoji: '🖥️',  title: 'Must be served (not file://)' },
		network: { emoji: '🌐',  title: 'Contacts remote APIs' }
	};

	const CAP_ORDER = ['chronus', 'atlas', 'network', 'served'];

	// --- Stage-2A: internal instances table for multi-instance model ---
	// Map: descriptor.classId -> [ { instanceId, displayName, descriptor }, ... ]
	const instancesByClass = new Map();

	// === Theme support ===
	const DEFAULT_THEME = 'light';

	function applyTheme(theme) {
		document.body.classList.toggle('dark', theme === 'dark');
		window.dispatchEvent(new CustomEvent('theme:changed', { detail: { theme } }));
	}

	function initTheme(settings) {
		const theme = settings.theme || DEFAULT_THEME;
		applyTheme(theme);
		// Legacy toggle event (kept so we have a single place that mutates settings)
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

	// Normalization for classId / instanceId / storageKey (Portal-only)
	function normalizeSlug(raw) {
		if (typeof raw !== 'string') {
			raw = (raw == null) ? '' : String(raw);
		}
		let s = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
		s = s.toLowerCase();
		s = s.replace(/[^a-z0-9]+/g, '-'); // non-alnum → hyphen
		s = s.replace(/-+/g, '-');         // collapse multiple hyphens
		s = s.replace(/^-|-$/g, '');       // trim leading/trailing hyphens
		return s;
	}

	// Normalization:
	// - Only keep known gadget IDs
	// - Remove duplicates
	// - Ensure header exists (if present in catalog)
	// - Ensure settings exists (if present), but respect user ordering
	function normalizeEnabled(list) {
		const knownIds = new Set(GADGET_CATALOG.map(g => g.id));
		const seen     = new Set();
		const out      = [];

		const source = Array.isArray(list) ? list : DEFAULT_ENABLED;
		for (const id of source) {
			if (!knownIds.has(id)) continue;
			if (seen.has(id)) continue;
			out.push(id);
			seen.add(id);
		}

		// Ensure header exists, prepend if missing
		if (!seen.has('header') && knownIds.has('header')) {
			out.unshift('header');
			seen.add('header');
		}

		// Ensure settings exists, but only append if missing
		if (!seen.has('settings') && knownIds.has('settings')) {
			out.push('settings');
			seen.add('settings');
		}

		return out;
	}

	function getSettings() {
		const s = lsGet();
		const enabledGadgets   = normalizeEnabled(s && s.enabledGadgets);
		const instanceSettings = (s && typeof s.instanceSettings === 'object')
			? s.instanceSettings
			: {};
		return { ...(s || {}), enabledGadgets, instanceSettings };
	}

	function setSettings(next) {
		const prev   = getSettings();
		const merged = { ...prev, ...next };

		// Always normalize when writing back
		merged.enabledGadgets = normalizeEnabled(merged.enabledGadgets);

		lsSet(merged);
		return merged;
	}

	// ---------- per-instance identity + settings helpers (API 1.0 gadgets) ----------

	function computeInstanceIdentity(descriptor) {
		const manifest = descriptor.manifest || {};
		const rawClass    = manifest._class || descriptor.id || 'Unknown';
		const rawInstance = manifest._id || 'default';
		const isSystem    = !!descriptor.isSystem;

		const storageKeyBase = normalizeSlug(rawClass) || 'unknown';
		const storageKey     = storageKeyBase;

		// System vs non-system classId rules:
		// - system: classId = rawClass (NOT normalized), storageKey = normalized(rawClass)
		// - non-system: classId = normalized(rawClass), storageKey = same normalized value
		let classId = rawClass;
		if (!isSystem) {
			classId = storageKey;
		}

		const instanceIdBase = normalizeSlug(rawInstance) || 'default';
		const instanceId     = instanceIdBase;

		// Legacy instance key used by older builds.
		const legacyInstanceName = `Vz:${rawClass}:${rawInstance}`;

		// Canonical storage path per CXP: vz:gadgets:{storageKey}:{instanceId}
		const instanceName = `vz:gadgets:${storageKey}:${instanceId}`;

		return {
			classId,
			instanceId,
			instanceName,
			legacyInstanceName,
			storageKey
		};
	}

	function getInstanceSettingsObject(identity) {
		const root = lsGet() || {};
		const bucket = (root.instanceSettings && typeof root.instanceSettings === 'object')
			? root.instanceSettings
			: {};

		// Prefer new canonical key; fall back to legacy key if present.
		const newObj = (bucket[identity.instanceName] && typeof bucket[identity.instanceName] === 'object')
			? bucket[identity.instanceName]
			: null;
		if (newObj) return newObj;

		const legacyObj = (bucket[identity.legacyInstanceName] && typeof bucket[identity.legacyInstanceName] === 'object')
			? bucket[identity.legacyInstanceName]
			: null;
		return legacyObj || {};
	}

	function patchInstanceSettings(identity, patch) {
		if (!patch || typeof patch !== 'object') return;
		const root = lsGet() || {};
		const bucket = (root.instanceSettings && typeof root.instanceSettings === 'object')
			? { ...root.instanceSettings }
			: {};

		const newObj = (bucket[identity.instanceName] && typeof bucket[identity.instanceName] === 'object')
			? bucket[identity.instanceName]
			: {};
		const legacyObj = (bucket[identity.legacyInstanceName] && typeof bucket[identity.legacyInstanceName] === 'object')
			? bucket[identity.legacyInstanceName]
			: {};

		// Merge legacy → new → patch, then write to canonical key.
		const merged = { ...legacyObj, ...newObj, ...patch };
		bucket[identity.instanceName] = merged;

		// Clean up legacy key if present (rename-style migration).
		if (bucket[identity.legacyInstanceName]) {
			delete bucket[identity.legacyInstanceName];
		}

		root.instanceSettings = bucket;
		lsSet(root);
	}

	function resetInstanceSettings(identity) {
		const root = lsGet() || {};
		if (!root.instanceSettings || typeof root.instanceSettings !== 'object') return;
		const bucket = { ...root.instanceSettings };
		let changed = false;

		if (bucket[identity.instanceName]) {
			delete bucket[identity.instanceName];
			changed = true;
		}
		if (bucket[identity.legacyInstanceName]) {
			delete bucket[identity.legacyInstanceName];
			changed = true;
		}

		if (changed) {
			root.instanceSettings = bucket;
			lsSet(root);
		}
	}

	// ---------- shared library wiring (ctx.libs + deprecated ctx.shared) ----------

	// Build the shared-library surface (Core → Atlas → Chronus → Nexus).
	// Note: for now still sourced from window.*; full de-globalization is a v1.3 target.
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
	
	// Soft-deprecated ctx.shared shim:
	// - forwards to ctx.libs
	// - logs a warning on first get / set
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
	async function loadGadget(id) {
		if (!window.REGISTRY || typeof window.REGISTRY.loadGadget !== 'function') {
			throw new Error('Registry not loaded');
		}
		return window.REGISTRY.loadGadget(id);
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

	// ---------- gadget lifecycle via chrome.js ----------

	function unmountAll(dock) {
		for (const el of Array.from(dock.children)) {
			try {
				el._unmount && el._unmount();
			} catch {}
		}
		dock.innerHTML = '';
	}

	function safeResetAll() {
		try {
			// Clear in-memory cache first so subsequent getSettings() starts fresh.

			lsCache = null;

			localStorage.removeItem('portalSettings');
			localStorage.removeItem('vizint.registry');

			console.log('[VizInt SafeStart] Cleared portalSettings + vizint.registry');

			// Force a clean re-render after reset.
			if (window.Portal && typeof window.Portal.render === 'function') {
				window.Portal.render();
			}
		} catch (e) {
			console.warn('[VizInt SafeStart] Cleanup failed', e);
		}
	}

	function ensureDefaults(s) {
		const next = { ...s };
		if (typeof next.showDiag === 'undefined')          next.showDiag = false;
		if (typeof next.foldedHubControls === 'undefined') next.foldedHubControls = false;

		if (typeof next.showTitleChips === 'undefined')    next.showTitleChips = true; // future: moved to UX
		return next;
	}

	function computeBadgesForGadget(meta, manifest) {
		// Prefer manifest.capabilities (authoritative in v1.2),
		// but fall back to registry meta to avoid breaking older gadgets.
		const caps =
			(Array.isArray(manifest && manifest.capabilities) && manifest.capabilities.length
				? manifest.capabilities
				: (Array.isArray(meta && meta.capabilities) ? meta.capabilities : [])) || [];

		const badges = [];

		for (const key of CAP_ORDER) {
			if (!CAP_CHIPS[key]) continue;
			if (caps.includes(key)) {
				badges.push({
					category: key,
					emoji: CAP_CHIPS[key].emoji,
					title: CAP_CHIPS[key].title
				});
			}
		}

		// Optional: runtime ⚠ if served-only but running on file://
		if (caps.includes('served') && window.location.protocol === 'file:') {
			badges.push({
				category: 'served',
				emoji: '⚠️',
				title: 'This gadget expects to be served, but you are on file://'
			});
		}

		return badges;
	}

	// Core render routine (single-instance era). Multi-instance will be layered on later.
	async function mountGadget(gadgetId, ctx, dock) {
		const meta = GADGET_BY_ID[gadgetId] || null;

		// 1) Load API (built-in header vs dynamic gadget)
		let api;
		if (gadgetId === 'header') {
			api = window.GADGETS.header;
		} else {
			try {
				api = await loadGadget(gadgetId);
			} catch (err) {
				console.error(err);
				const errEl = document.createElement('div');
				errEl.className = 'gadget-error';
				errEl.textContent = 'Load error';
				dock.appendChild(errEl);
				return;
			}
		}

		// Manifest & API version
		const manifest = api.manifest || {};

		// 2) Descriptor construction (manifest-first-ish; identity refined via computeInstanceIdentity)
		const label    = manifest.label || (meta && meta.label) || gadgetId;
		const isHeader = (gadgetId === 'header');

		const manifestType = manifest._type;
		const metaType     = meta && (meta._type || meta.type);
		const inferredType = (isHeader || gadgetId === 'settings') ? 'system' : 'single';

		const gadgetType = manifestType || metaType || inferredType;
		const isSystem   = (gadgetType === 'system');

		const supportsFromManifest = !!manifest.supportsSettings;
		const supportsFromRegistry = !!(meta && meta.supportsSettings);

		// Manifest is now canonical; registry is *fallback*, not exclusive.
		const supportsSettings = supportsFromManifest || supportsFromRegistry;

		const bidi = manifest.bidi || 'ltr';

		const descriptor = {
			id: gadgetId,
			classId: manifest._class || gadgetId,
			instanceId: manifest._id || 'default',
			instanceName: label,
			label,
			displayName: label,
			manifest,
			gadgetType,                       // 'single' | 'multi' | 'system'
			isSystem,
			isHeader,
			canClose: !isSystem,
			disableCloseReason: isSystem ? 'system gadget cannot be closed' : '',
			gadgetInfo: meta || null,
			badges: computeBadgesForGadget(meta, manifest),
			bidi,
			///! These two fields reek of redundancy - we should clean these up ASAP
			supportsSettings,
			showSettingsGear: !!supportsSettings
		};

		descriptor.manifest = manifest;

		// Refine supportsSettings/showSettingsGear from manifest (behavioral canonical)
		if (Object.prototype.hasOwnProperty.call(manifest, 'supportsSettings')) {
			descriptor.supportsSettings = !!manifest.supportsSettings;
			descriptor.showSettingsGear = !!descriptor.supportsSettings || supportsFromRegistry;
		}

		// Refine gadgetType from manifest._type if available
		if (manifest._type === 'system' || manifest._type === 'multi' || manifest._type === 'single') {
			descriptor.gadgetType = manifest._type;
			descriptor.isSystem = (manifest._type === 'system');
			descriptor.canClose = !descriptor.isSystem;
			if (descriptor.isSystem && !descriptor.disableCloseReason) {
				descriptor.disableCloseReason = 'system gadget cannot be closed';
			}
		}

		// 2b) Compute per-instance identity (normalizer + storageKey model).
		const identity = computeInstanceIdentity(descriptor);
		descriptor.classId    = identity.classId;
		descriptor.instanceId = identity.instanceId;
		descriptor.storageKey = identity.storageKey;

		// --- Stage-2A: register instance in instancesByClass for this classId ---
		const instanceDisplayName = descriptor.instanceName || descriptor.displayName || descriptor.label || descriptor.id;
		let list = instancesByClass.get(descriptor.classId);
		if (!list) {
			list = [];
			instancesByClass.set(descriptor.classId, list);
		}
		const instanceRecord = {
			instanceId: descriptor.instanceId,
			displayName: instanceDisplayName,
			descriptor: descriptor
		};
		list.push(instanceRecord);
		descriptor.displayName = instanceDisplayName;
		descriptor.instanceIndex = list.length - 1;

		// 3) Chrome contract: PortalChrome must exist and export createGadgetChrome
		if (!window.PortalChrome || typeof window.PortalChrome.createGadgetChrome !== 'function') {
			console.error('[VizInt] PortalChrome.createGadgetChrome(...) not available; cannot render gadget chrome.');
			return;
		}

		// 4) Runtime callbacks for chrome interactions
		const chromeCtx = {
			onClose() {
				if (descriptor.isSystem) return;

				const s    = getSettings();
				const cur  = normalizeEnabled(s.enabledGadgets);
				const next = cur.filter(id => id !== gadgetId);
				const merged = setSettings({ ...s, enabledGadgets: next });

				window.dispatchEvent(new CustomEvent('gadgets:update', {
					detail: { enabled: merged.enabledGadgets }
				}));
			},
			onToggleCollapse(isCollapsed) {
				const s  = getSettings();
				const st = s.gadgetState || {};
				st[gadgetId] = { ...(st[gadgetId] || {}), collapsed: !!isCollapsed };
				setSettings({ ...s, gadgetState: st });
			},
			onToggleWide(isWide) {
				const s  = getSettings();
				const st = s.gadgetState || {};
				st[gadgetId] = { ...(st[gadgetId] || {}), wide: !!isWide };
				setSettings({ ...s, gadgetState: st });
			},
			onToggleFullscreen(isFs) {
				const s  = getSettings();
				const st = s.gadgetState || {};
				st[gadgetId] = {
					...(st[gadgetId] || {}),
					fullscreen: !!isFs,
					collapsed: false
				};
				setSettings({ ...s, gadgetState: st });
			},
			// Header-only hooks (theme + safe reset)
			onSafeReset: isHeader ? safeResetAll : null,
			onThemeToggle: isHeader
				? () => {
					// centralize theme change via theme:toggle listener in initTheme()
					window.dispatchEvent(new CustomEvent('theme:toggle'));
				}
				: null,
			// Info affordance (wired after chrome shell + api/manifest are known)
			onInfoRequest: null,
			// Settings gear hook: header uses modal; others route to gadget handler.
			onSettingsRequested: supportsSettings
				? () => {
					try {
						if (descriptor.id === 'header') {
							// Header: use the generic modal host, but still the same Settings gadget + store.
							if (window.Portal && typeof window.Portal.openSettingsModal === 'function') {
								window.Portal.openSettingsModal({
									mode: 'portal',
									gadgetId: 'settings'   ///! Phase-2: legacy settings tile still exists; planned to move fully into modal.
								});
							} else {
								console.warn('[VizInt] Header settings requested but Portal.openSettingsModal is unavailable');
							}
							return;
						}

						// Normal gadgets: inline / gadget-owned UX
						if (api && typeof api.onSettingsRequested === 'function') {
							api.onSettingsRequested(gctx, { slot, body, descriptor });
						} else {
							console.info('[VizInt] Settings requested but gadget has no onSettingsRequested handler:', gadgetId);
						}
					} catch (e) {
						console.warn('[VizInt] Gadget threw during onSettingsRequested:', gadgetId, e);
					}
				}
				: null,
			// Placeholder hooks for future multi-instance:
			onRenameInstance(/* newName */) {},
			onDeleteInstanceConfirmed() {},
			onSettingsModeToggle(/* isSettingsMode */) {}
		};

		// 5) Build chrome shell
		const shell = window.PortalChrome.createGadgetChrome(descriptor, chromeCtx);
		if (!shell || !shell.slot || !shell.body) {
			console.error('[VizInt] chrome.js did not return a valid shell for gadget:', gadgetId);
			return;
		}

		const { slot, body } = shell;
		dock.appendChild(slot);

		// Apply bidi from descriptor/manifest
		slot.setAttribute('dir', bidi);
		slot.classList.toggle('g-ltr', bidi === 'ltr');

		// 6) Build per-instance ctx (API 1.0) vs legacy ctx
		///! I don't like this hard-coded Api tracking mechanism - we should evolve this eventually.
		const isApiV1 = manifest._api === '1.0';

		const env = {
			geometry: null,
			layout: null,
			isDark: document.body.classList.contains('dark'),
			bidi
		};

		const libs   = ctx.libs;
		const shared = ctx.shared;
		const bus = (libs && libs.Nexus && libs.Nexus.bus)
			? libs.Nexus.bus
			: ctx.bus || window;

		const instanceGetSettings = function (key, defaultValue) {
			const all = getInstanceSettingsObject(identity);
			if (key === undefined || key === null) return all;
			return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : defaultValue;
		};

		const instanceSetSettings = function (patch) {
			if (!patch || typeof patch !== 'object') return;
			patchInstanceSettings(identity, patch);
		};

		const instanceResetSettings = function () {
			resetInstanceSettings(identity);
		};

		// Canonical per-instance settings API for _api: "1.0" gadgets
		let settingsAPI;

		if (isApiV1) {
			settingsAPI = {
				get(key, defaultValue) {
					return instanceGetSettings(key, defaultValue);
				},
				set(patch) {
					instanceSetSettings(patch);
				},
				reset() {
					instanceResetSettings();
				},
				getAll() {
					return instanceGetSettings();
				}
			};
		} else {
			// Legacy gadgets: adapt whatever ctx already had into the same shape
			const legacyGet = ctx.getSettings || function (key, def) {
				const all = getSettings();
				if (key === undefined || key === null) return all;
				return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : def;
			};
			const legacySet = ctx.setSettings || function (patch) {
				if (!patch || typeof patch !== 'object') return;
				setSettings(patch);
			};
			const legacyReset = ctx.resetSettings || function () {};

			settingsAPI = {
				get(key, defaultValue) {
					return legacyGet(key, defaultValue);
				},
				set(patch) {
					legacySet(patch);
				},
				reset() {
					legacyReset();
				},
				getAll() {
					return legacyGet();
				}
			};
		}

		const gctx = {
			...ctx,
			name: identity.instanceName,
			host: body,
			env,
			bus,
			// Canonical surface:
			settings: settingsAPI,
			// Sugar helpers:
			getSettings: settingsAPI.get,
			setSettings: settingsAPI.set,
			resetSettings: settingsAPI.reset,
			libs,
			shared
		};

		// 7) Info icon affordance wiring (chrome → portal → api/manifest)
		chromeCtx.onInfoRequest = function () {
			try {
				if (api && typeof api.onInfoClick === 'function') {
					api.onInfoClick(gctx, { slot, body });
					return;
				}
				if (api && api.manifest) {
					const m = api.manifest;
					const caps = (m.capabilities || []).join(', ');
					const lines = [
						`${m._class || descriptor.classId}:${m._id || descriptor.instanceId}`,
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
					if (lines.length) {
						alert(lines.join('\n'));
						return;
					}
				}
				if (api && typeof api.info === 'string' && api.info.trim()) {
					alert(api.info.trim());
				}
			} catch {
				// best-effort; swallow UI errors
			}
		};

		// 8) Mount gadget
		try {
			const unmount = api.mount(body, gctx);
			if (typeof unmount === 'function') {
				slot._unmount = unmount;
			}
		} catch (err) {
			console.error(err);
			body.innerHTML = `<div class="err">Mount error</div>`;
		}
	}

	// ---------- render ----------

	let rendering = false;

	async function render() {
		if (rendering) return;
		rendering = true;

		try {
			const dock = document.getElementById('dock');
			if (!dock) {
				console.warn('[VizInt] #dock not found; cannot render gadgets.');
				return;
			}

			const settings = ensureDefaults(getSettings());
			const enabled  = normalizeEnabled(settings.enabledGadgets);

			// Build shared libs + deprecated shared shim
			const libs   = buildLibs();
			const shared = makeSharedShim(libs);

			// Prefer Nexus bus if available, else window
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
					// Portal-level reset (per-instance reset handled per gadget via ctx.resetSettings)
				},
				libs,
				shared
			};

			unmountAll(dock);

			// Stage-2A: reset instancesByClass each render
			instancesByClass.clear();

			for (const id of enabled) {
				await mountGadget(id, ctx, dock);
			}

			// Stage-2A: After all gadgets are mounted, emit portal:gadgetInstancesChanged for each classId.
			for (const [classId, list] of instancesByClass.entries()) {
                const instances = list.map(function (rec) {
                    return {
                        instanceId: rec.instanceId,
                        displayName: rec.displayName,
                        descriptor: rec.descriptor
                    };
                });
                window.dispatchEvent(new CustomEvent('portal:gadgetInstancesChanged', {
                    detail: {
                        classId: classId,
                        instances: instances
                    }
                }));
            }
		} finally {
			rendering = false;
		}
	}

	// --- Stage-2A helper: public getInstances(classId) API ---
	function getInstances(classId) {
		const key = (typeof classId === 'string') ? classId : '';
		const list = instancesByClass.get(key) || [];
		return list.map(function (rec) {
			return {
				instanceId: rec.instanceId,
				displayName: rec.displayName,
				descriptor: rec.descriptor
			};
		});
	}

	// ---------- generic settings modal host (Phase-2 scaffold) ----------

	let activeSettingsModal = null;

	function closeSettingsModal() {
		if (!activeSettingsModal) return;
		try {
			if (typeof activeSettingsModal.unmount === 'function') {
				activeSettingsModal.unmount();
			}
		} catch (e) {
			console.warn('[VizInt] Settings modal unmount error', e);
		}
		try {
			if (typeof activeSettingsModal.close === 'function') {
				activeSettingsModal.close();
			}
		} catch (e) {
			console.warn('[VizInt] Settings modal close() error', e);
		}
		activeSettingsModal = null;
	}

	async function openSettingsModal(options) {
		const opts = options || {};
		const targetGadgetId = opts.gadgetId || 'settings';

		// If UX has not yet provided a modal shell, bail out gracefully.
		if (!window.PortalChrome || typeof window.PortalChrome.createSettingsModalShell !== 'function') {
			console.warn('[VizInt] PortalChrome.createSettingsModalShell(...) not available; cannot open settings modal.');
			return;
		}

		// Close any existing modal first.
		if (activeSettingsModal) {
			closeSettingsModal();
		}

		const modalChromeCtx = {
			onModalClosed() {
				closeSettingsModal();
			}
		};

		const shell = window.PortalChrome.createSettingsModalShell(modalChromeCtx);
		if (!shell || !shell.overlayEl || !shell.bodyEl || typeof shell.close !== 'function') {
			console.warn('[VizInt] Settings modal shell invalid; aborting.');
			return;
		}

		document.body.appendChild(shell.overlayEl);

		activeSettingsModal = {
			overlayEl: shell.overlayEl,
			close: shell.close,
			unmount: null
		};

		// Build a base Portal ctx for the Settings gadget inside the modal.
		const settings = ensureDefaults(getSettings());
		const libs = buildLibs();
		const shared = makeSharedShim(libs);
		const bus = (libs.Nexus && libs.Nexus.bus) ? libs.Nexus.bus : window;

		const baseCtx = {
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
				// Portal-level reset remains a no-op here; instance-level reset is per gadget.
			},
			libs,
			shared
		};

		// Load the target gadget (settings by default) into the modal body.
		let api;
		// NOTE: this is a shared code snippet used both in this file and in other contexts.
		try {
			api = await loadGadget(targetGadgetId);
		} catch (e) {
			console.error('[VizInt] Failed to load gadget for settings modal:', targetGadgetId, e);
			shell.bodyEl.innerHTML = '<div class="err">Settings load error</div>';
			return;
		}

		const env = {
			geometry: null,
			layout: null,
			isDark: document.body.classList.contains('dark'),
			bidi: 'ltr',
			mode: 'modal'
		};

		const gctx = {
			...baseCtx,
			name: `Vz:Portal:${targetGadgetId}:Modal`,
			host: shell.bodyEl,
			env,
			bus,
			libs,
			shared
		};

		try {
			const unmount = api.mount(shell.bodyEl, gctx);
			if (typeof unmount === 'function') {
				activeSettingsModal.unmount = unmount;
			}
		} catch (e) {
			console.error('[VizInt] Error mounting gadget in settings modal:', targetGadgetId, e);
			shell.bodyEl.innerHTML = '<div class="err">Settings mount error</div>';
		}
	}

	// ---------- events ----------

	window.addEventListener('gadgets:update', () => {
		render();
	});

	// ---------- Portal exports ----------

	window.Portal = {
		render,
		getSettings,
		setSettings,
		getInstances,
		DEFAULT_ENABLED,
		GADGET_CATALOG,
		safeResetAll,
		openSettingsModal,
		closeSettingsModal
	};

	// ---------- auto-start ----------

	if (window.Portal && typeof window.Portal.render === 'function') {
		initTheme(getSettings());
		window.Portal.render();
	}
})();
