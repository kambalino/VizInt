/*
 *	File: lib/portal.js
 *	Description: Portal runtime core
 *	Author: U:Portal & K&K
 *
 *	$VER: portal.js 1.2.15
 * 
 *	HISTORY:
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

	2025-12-11 (U:Portal)
	- Implemented v1.4 ordering surface (settings.tileOrder) as render authority.
	- Enforced instanceId='__singleton__' for single/system tiles per CXP 49:16.
	- Added Portal.getTileOrder() and Portal.reorderTile() for Settings/Chrome.
	- Introduced generic settings modal host plumbing (Portal.openSettingsModal/closeSettingsModal).
	- Wired header settings gear to the generic modal host (Phase-2 scaffold; Settings tile still present for now).
	2025-11-29 (U:Portal)
	- Implemented canonical normalizer + storageKey model for per-instance settings.
	- Introduced vz:gadgets:{storageKey}:{instanceId} instanceName path with migration from legacy Vz:<Class>:<Instance>.
	- Ensured system gadgets keep public classId but use normalized storageKey for settings buckets.
	2025-11-29 (U:Portal)
	- Stage-2A: Introduced internal instancesByClass table, Portal.getInstances(classId),
	  and portal:gadgetInstancesChanged events (single-instance compatible).
	2025-11-29 (U:Portal)
	- Stage-2B (partial): Added Portal.addInstance/removeInstance/renameInstance/reorderInstance,
	  portal:gadgetRenamed, and per-class instancesChanged helper (no multi-instance dock yet).
	2025-11-29 (U:Portal)
	- Stage-2B (part 1): Implemented layout persistence via settings.layout[classId][instanceId],
	  while retaining legacy gadgetState; stopped force-enabling the dock "settings" gadget (Option B).
	2025-11-29 (U:Portal)
	- Stage-2C (proposal): Introduced settings.instances[classId].{order,records} for persistent
	  multi-instance metadata and Portal.addInstance/renameInstance/removeInstance helpers.

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
	// - Do NOT force-enable "settings" (Option B)
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

		// IMPORTANT: Settings is now a normal gadget (Option B).
		// Do NOT auto-add "settings" here. If the user removes it,
		// it stays removed unless explicitly re-added via UX.

		return out;
	}

	function computeEffectiveEnabled(enabled) {
		const base = Array.isArray(enabled) ? enabled : [];
		const seen = new Set();
		const effective = [];

		// 1) Seed from explicitly enabled gadgets (normalized list)
		for (const id of base) {
			if (typeof id !== 'string') continue;
			const trimmed = id.trim();
			if (!trimmed || seen.has(trimmed)) continue;
			seen.add(trimmed);
			effective.push(trimmed);
		}

		// 2) Promote any manifestId referenced by persistent instances to implicit enablement
		if (typeof getInstanceCatalog === 'function') {
			const catalog = getInstanceCatalog();
			const instances = (catalog && typeof catalog === 'object') ? catalog.instances : null;
			if (instances && typeof instances === 'object') {
				for (const classId in instances) {
					if (!Object.prototype.hasOwnProperty.call(instances, classId)) continue;
					const bucket = instances[classId];
					if (!bucket || !bucket.records || typeof bucket.records !== 'object') continue;

					for (const instanceId in bucket.records) {
						if (!Object.prototype.hasOwnProperty.call(bucket.records, instanceId)) continue;
						const rec = bucket.records[instanceId];
						if (!rec || typeof rec.manifestId !== 'string') continue;

						const trimmed = rec.manifestId.trim();
						if (!trimmed || seen.has(trimmed)) continue;

						seen.add(trimmed);
						effective.push(trimmed);
					}
				}
			}
		}

		return effective;
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
		const rawClass = manifest._class || descriptor.classId || descriptor.id || 'Unknown';
		const isSystem = !!descriptor.isSystem;

		// classId doctrine:
		// - system: classId = rawClass (NOT normalized), storageKey = normalized(rawClass)
		// - non-system: classId = normalized(rawClass), storageKey = same normalized value
		const storageKeyBase = normalizeSlug(rawClass) || 'unknown';
		const storageKey     = storageKeyBase;

		let classId = rawClass;
		if (!isSystem) {
			classId = storageKey;
		}

		// instanceId doctrine (CXP 49:16):
		// - single/system tiles use the literal "__singleton__"
		// - multi tiles use the Portal-owned instanceId (passed via instanceHint / records)
		let instanceId = '__singleton__';
		if (descriptor.gadgetType === 'multi') {
			const hinted = (typeof descriptor.instanceId === 'string' && descriptor.instanceId) ? descriptor.instanceId : null;
			instanceId = normalizeSlug(hinted) || hinted || 'instance-1';
		}

		// Legacy instance key used by older builds (Vz:<Class>:<Instance>).
		const legacyInstanceName = `Vz:${rawClass}:${instanceId}`;

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
	
	
	// ---------- per-instance layout persistence (Stage-2B/W48:20) ----------

	function getLayoutForInstance(classId, instanceId) {
		const s = getSettings();
		const layout = (s && s.layout && typeof s.layout === 'object') ? s.layout : {};
		const perClass = (classId && layout[classId] && typeof layout[classId] === 'object')
			? layout[classId]
			: {};
		const entry = (instanceId && perClass[instanceId] && typeof perClass[instanceId] === 'object')
			? perClass[instanceId]
			: {};
		return { ...entry }; // defensive copy
	}

	function writeLayoutForInstance(classId, instanceId, patch) {
		if (!classId || !instanceId || !patch || typeof patch !== 'object') return;

		const s = getSettings();
		const currentLayout = (s && s.layout && typeof s.layout === 'object') ? s.layout : {};
		const layout = { ...currentLayout };

		const perClass = (layout[classId] && typeof layout[classId] === 'object')
			? { ...layout[classId] }
			: {};

		const prev = (perClass[instanceId] && typeof perClass[instanceId] === 'object')
			? perClass[instanceId]
			: {};

		const next = { ...prev, ...patch };

		perClass[instanceId] = next;
		layout[classId] = perClass;

		setSettings({ ...s, layout });
	}

	
	// ---------- persistent instance catalog helpers (Stage-2C) ----------

	function getInstanceCatalog() {
		const s = getSettings();
		const instances = (s.instances && typeof s.instances === 'object') ? s.instances : {};
		return { s, instances };
	}

	function writeInstanceCatalog(s, instances) {
		// Preserve other settings keys while updating instances bucket
		setSettings({ ...s, instances });
	}

	function ensureTileOrderInitialized(settings, enabled, instances) {
		if (!settings || typeof settings !== 'object') return;

		// If tileOrder already exists and is non-empty, do nothing.
		if (Array.isArray(settings.tileOrder) && settings.tileOrder.length > 0) {
			return;
		}

		const tileOrder   = [];
		const seen        = new Set();
		const enabledList = Array.isArray(enabled) ? enabled.slice() : [];

		for (let i = 0; i < enabledList.length; i++) {
			const gadgetId = enabledList[i];
			if (!gadgetId || typeof gadgetId !== 'string') continue;

			// Collect all instance buckets whose records have manifestId === gadgetId
			const bucketsForGadget = [];
			if (instances && typeof instances === 'object') {
				for (const classId in instances) {
					if (!Object.prototype.hasOwnProperty.call(instances, classId)) continue;
					const bucket = instances[classId];
					if (!bucket || typeof bucket !== 'object') continue;

					const records = bucket.records || {};
					const order   = Array.isArray(bucket.order)
						? bucket.order.slice()
						: Object.keys(records);

					let matches = false;
					for (let j = 0; j < order.length; j++) {
						const recId = order[j];
						if (!Object.prototype.hasOwnProperty.call(records, recId)) continue;
						const rec = records[recId];
						if (rec && rec.manifestId === gadgetId) {
							matches = true;
							break;
						}
					}

					if (matches) {
						bucketsForGadget.push({ classId, bucket });
					}
				}
			}

			// No instance buckets → singleton/system tile: instanceId="__singleton__".
			if (!bucketsForGadget.length) {
				const classId = gadgetId;
				const key = classId + '::__singleton__';
				if (!seen.has(key)) {
					seen.add(key);
					tileOrder.push({ classId, instanceId: '__singleton__' });
				}
				continue;
			}

			// Multi-instance: one tile per (classId, instanceId) in bucket.order.
			for (let b = 0; b < bucketsForGadget.length; b++) {
				const entry   = bucketsForGadget[b];
				const classId = entry.classId;
				const bucket  = entry.bucket;

				const records = bucket.records || {};
				const order   = Array.isArray(bucket.order)
					? bucket.order.slice()
					: Object.keys(records);

				for (let k = 0; k < order.length; k++) {
					const instanceId = order[k];
					if (!instanceId) continue;

					const key = classId + '::' + instanceId;
					if (seen.has(key)) continue;
					seen.add(key);

					tileOrder.push({ classId, instanceId });
				}
			}
		}

		// Only persist if we actually built something.
		if (tileOrder.length > 0) {
			const next = Object.assign({}, settings, { tileOrder });
			setSettings(next);
		}
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

	// Helpers for canonical settings key without re-deriving identity from manifest._id.
	function deleteSettingsForStorageKeyAndInstance(storageKey, instanceId) {
		const root = lsGet() || {};
		if (!root.instanceSettings || typeof root.instanceSettings !== 'object') return;
		const bucket = { ...root.instanceSettings };
		const key = `vz:gadgets:${storageKey}:${instanceId}`;
		if (Object.prototype.hasOwnProperty.call(bucket, key)) {
			delete bucket[key];
			root.instanceSettings = bucket;
			lsSet(root);
		}
	}

	function renameSettingsForStorageKey(storageKey, oldInstanceId, newInstanceId) {
		const root = lsGet() || {};
		if (!root.instanceSettings || typeof root.instanceSettings !== 'object') return;
		const bucket = { ...root.instanceSettings };

		const oldKey = `vz:gadgets:${storageKey}:${oldInstanceId}`;
		const newKey = `vz:gadgets:${storageKey}:${newInstanceId}`;

		if (!Object.prototype.hasOwnProperty.call(bucket, oldKey)) {
			// Nothing to migrate yet.
			return;
		}

		const payload = bucket[oldKey];
		if (payload && typeof payload === 'object') {
			bucket[newKey] = { ...payload };
		} else {
			bucket[newKey] = payload;
		}
		delete bucket[oldKey];

		root.instanceSettings = bucket;
		lsSet(root);
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

		// Stage-2B: layout bucket
		if (typeof next.layout === 'undefined')            next.layout = {};

		// Stage-2C: persistent instance catalog (classId → { order, records })
		if (typeof next.instances === 'undefined')         next.instances = {};

		// v1.4: global tile ordering surface (flat list of tiles).
		if (!Array.isArray(next.tileOrder))               next.tileOrder = [];

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
	// instanceHint is optional: { classId, instanceId, displayName }
	async function mountGadget(gadgetId, ctx, dock, instanceHint) {
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
		const inferredType = (isHeader) ? 'system' : 'single';

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

		// --- Option B: Dock "settings" is a normal, removable gadget ---
		// Header remains the only canonical, non-removable Settings entry.
		if (descriptor.id === 'settings') {			
			descriptor.isSystem = false; ///! Superfluous
			descriptor.gadgetType = 'single';
			descriptor.canClose = true;
			descriptor.disableCloseReason = '';
		}


		descriptor.manifest = manifest;

		// Apply per-instance hints (if provided) BEFORE identity normalization.
		if (instanceHint && typeof instanceHint === 'object') {
			if (typeof instanceHint.instanceId === 'string' && instanceHint.instanceId) {
				descriptor.instanceId = instanceHint.instanceId;
			}
			if (typeof instanceHint.displayName === 'string' && instanceHint.displayName.trim()) {
				const name = instanceHint.displayName.trim();
				descriptor.displayName = name;
				descriptor.instanceName = name;
			}
			// classId hint is *not* required here; computeInstanceIdentity() derives
			// classId from manifest/_class + isSystem and will remain consistent with
			// how Settings created the classId bucket.
		}


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

		// Stage-2B: per-instance layout persistence
		const initialLayout = getLayoutForInstance(descriptor.classId, descriptor.instanceId);


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
			// === REQUIRED CANONICAL LAYOUT CONTRACT (ratified W48:23) ===
			initialLayout,
			onLayoutChanged(nextLayout) {
				const patch = (nextLayout && typeof nextLayout === 'object') ? nextLayout : {};

				// 1) Canonical per-instance layout persistence
				writeLayoutForInstance(descriptor.classId, descriptor.instanceId, patch);

				// 2) Backwards-compatibility bridge to legacy chrome.js
				const s  = getSettings();
				const st = s.gadgetState || {};
				const prev = st[gadgetId] || {};
				const legacy = {};

				if ('collapsed' in patch) legacy.collapsed = !!patch.collapsed;
				if ('spanWide'  in patch) legacy.wide      = !!patch.spanWide;
				if ('fullscreen' in patch) {
					legacy.fullscreen = !!patch.fullscreen;
					if (patch.fullscreen) legacy.collapsed = false;
				}

				st[gadgetId] = { ...prev, ...legacy };
				setSettings({ ...s, gadgetState: st });
			},

			// === LEGACY SHIMS (MUST REMAIN UNTIL Chrome migrates fully) ===
			onToggleCollapse(isCollapsed) {
				chromeCtx.onLayoutChanged({ collapsed: !!isCollapsed });
			},
			onToggleWide(isWide) {
				chromeCtx.onLayoutChanged({ spanWide: !!isWide });
			},
			onToggleFullscreen(isFs) {
				chromeCtx.onLayoutChanged({ fullscreen: !!isFs, collapsed: false });
			},

			// === CLOSE SEMANTICS (instance-aware fallback) ===
			onClose() {
				if (descriptor.isSystem) return;

				try {
					const s = getSettings();
					const allInstances = (s && s.instances && typeof s.instances === 'object') ? s.instances : {};

					let targetClassId = descriptor.classId;
					let instRoot = null;

					// 1) Prefer direct bucket match by descriptor.classId
					if (
						targetClassId &&
						allInstances[targetClassId] &&
						allInstances[targetClassId].records &&
						allInstances[targetClassId].records[descriptor.instanceId]
					) {
						instRoot = allInstances[targetClassId];
					} else {
						// 2) Fallback: scan all buckets for this instanceId (handles raw vs normalized classId keys)
						for (const cid in allInstances) {
							if (!Object.prototype.hasOwnProperty.call(allInstances, cid)) continue;
							const bucket = allInstances[cid];
							if (!bucket || !bucket.records || typeof bucket.records !== 'object') continue;
							if (bucket.records[descriptor.instanceId]) {
								targetClassId = cid;
								instRoot = bucket;
								break;
							}
						}
					}

					const hasInstanceRecord = !!(
						instRoot &&
						instRoot.records &&
						instRoot.records[descriptor.instanceId]
					);

					// Multi-instance path: let Portal.removeInstance own the mutation + events
					if (
						hasInstanceRecord &&
						window.Portal &&
						typeof window.Portal.removeInstance === 'function'
					) {
						window.Portal.removeInstance(targetClassId, descriptor.instanceId);
						return;
					}

					// --- Legacy single-instance path: remove from enabledGadgets ---
					const cur   = normalizeEnabled(s.enabledGadgets);
					const next  = cur.filter(id => id !== gadgetId);
					const merged = setSettings({ ...s, enabledGadgets: next });

					window.dispatchEvent(new CustomEvent('gadgets:update', {
						detail: { enabled: merged.enabledGadgets }
					}));
				} catch (e) {
					console.warn('[VizInt] chromeCtx.onClose failed, attempting legacy fallback', e);

					// Ultra-defensive: try legacy removal again if the first attempt blew up mid-way.
					try {
						const s     = getSettings();
						const cur   = normalizeEnabled(s.enabledGadgets);
						const next  = cur.filter(id => id !== gadgetId);
						const merged = setSettings({ ...s, enabledGadgets: next });

						window.dispatchEvent(new CustomEvent('gadgets:update', {
							detail: { enabled: merged.enabledGadgets }
						}));
					} catch (e2) {
						console.warn('[VizInt] chromeCtx.onClose legacy fallback also failed', e2);
					}
				}
			},


			// === HEADER HOOKS ===
			onSafeReset: isHeader ? safeResetAll : null,
			onThemeToggle: isHeader ? () => {
				window.dispatchEvent(new CustomEvent('theme:toggle'));
			} : null,

			// === INFO / SETTINGS ===
			onInfoRequest: null,
			onSettingsRequested: supportsSettings
				? () => {
					try {
						if (descriptor.id === 'header') {
							if (window.Portal?.openSettingsModal) {
								window.Portal.openSettingsModal({
									mode: 'portal',
									gadgetId: 'settings'
								});
							}
							return;
						}

						if (api?.onSettingsRequested) {
							api.onSettingsRequested(gctx, { slot, body, descriptor });
						}
					} catch (e) {
						console.warn('[VizInt] onSettingsRequested error', e);
					}
				}
				: null,

			// === FINALIZED FUTURE-FACING MULTI-INSTANCE HOOKS (UX contract) ===
			onInstanceRenamed(/* newName */) {},
			onInstanceDeleted(/* instanceId */) {},
			onInstanceModeToggle(/* isSettingsMode */) {}
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
			///! when was this : null behaviour; without initialLayout introduced?
			layout: initialLayout || null,
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

	// ---------- Stage-2B helpers: instancesChanged / indexes ----------

	function snapshotInstancesForClass(classId) {
		const list = instancesByClass.get(classId) || [];
		return list.map(function (rec) {
			return {
				instanceId: rec.instanceId,
				displayName: rec.displayName,
				descriptor: rec.descriptor
			};
		});
	}

	function emitInstancesChangedForClass(classId) {
		const instances = snapshotInstancesForClass(classId);
		window.dispatchEvent(new CustomEvent('portal:gadgetInstancesChanged', {
			detail: {
				classId: classId,
				instances: instances
			}
		}));
	}

	function recomputeInstanceIndexesForClass(classId) {
		const list = instancesByClass.get(classId);
		if (!list) return;
		for (let i = 0; i < list.length; i++) {
			const rec = list[i];
			if (rec && rec.descriptor) {
				rec.descriptor.instanceIndex = i;
			}
		}
	}

	function findInstanceRecord(classId, instanceId) {
		const list = instancesByClass.get(classId);
		if (!list || !list.length) return null;
		for (let i = 0; i < list.length; i++) {
			if (list[i].instanceId === instanceId) {
				return { list, index: i, record: list[i] };
			}
		}
		return null;
	}

	function getTileOrder() {
		const settings = ensureDefaults(getSettings());
		const enabled  = normalizeEnabled(settings.enabledGadgets);

		const enabledSet = new Set(Array.isArray(enabled) ? enabled : []);

		const { instances } = getInstanceCatalog();

		const tileOrder = Array.isArray(settings.tileOrder) ? settings.tileOrder : [];
		const out = [];

		for (let i = 0; i < tileOrder.length; i++) {
			const t = tileOrder[i];
			if (!t || typeof t !== 'object') continue;

			const classId = t.classId;
			const instanceId = t.instanceId;

			if (!classId || !instanceId) continue;

			// Singleton/system tiles: filter by enabledGadgets (header is always normalized in anyway)
			if (instanceId === '__singleton__') {
				if (!enabledSet.has(classId)) continue;
				out.push({ classId, instanceId });
				continue;
			}

			// Multi-instance tiles: render if the instance record exists.
			// (This preserves today’s behavior where instances can appear even if the classId
			// isn’t “enabled” as a parent concept yet.)
			const bucket = instances && instances[classId];
			const rec = bucket && bucket.records && bucket.records[instanceId];
			if (!rec) continue;

			out.push({ classId, instanceId, rec });
		}

		return out;
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
			const effectiveEnabled = computeEffectiveEnabled(enabled);

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

			// Stage-2C: read persistent instance catalog
			const { instances } = getInstanceCatalog();

			// v1.4 scaffold: initialize settings.tileOrder if missing,
			// using the current effectiveEnabled list + instances catalog.
			ensureTileOrderInitialized(settings, effectiveEnabled, instances);
			
			const tiles = getTileOrder();

			for (let t = 0; t < tiles.length; t++) {
				const tile = tiles[t];

				// Singleton/system tile
				if (tile.instanceId === '__singleton__') {
					await mountGadget(tile.classId, ctx, dock, null);
					continue;
				}

				// Multi-instance tile
				const rec = tile.rec;
				const displayName = (rec.displayName && rec.displayName.trim())
					? rec.displayName.trim()
					: tile.instanceId;

				const instanceHint = {
					classId: tile.classId,
					instanceId: tile.instanceId,
					displayName
				};

				const gadgetIdToUse = rec.manifestId;
				await mountGadget(gadgetIdToUse, ctx, dock, instanceHint);
			}


			// Stage-2A/B: After all gadgets are mounted, emit portal:gadgetInstancesChanged for each classId.
			for (const [classId] of instancesByClass.entries()) {
				emitInstancesChangedForClass(classId);
			}
		} finally {
			rendering = false;
		}
	}


	// --- Stage-2C helper: public getInstances(classId) API ---
	//
	// Canonical rules:
	// - settings.instances[classId].{order,records} is the SINGLE source of truth
	//   for membership + ordering.
	// - instancesByClass is a runtime table providing descriptor metadata only.
	// - If there is no instance bucket yet for a classId, we fall back to the
	//   legacy runtime-only view for backwards-compatibility.
	function getInstances(classId) {
		const key = (typeof classId === 'string') ? classId : '';

		// 1) Read canonical instance config from storage.
		const { order, records } = getInstanceConfig(key) || {};
		const hasBucket = Array.isArray(order) && order.length > 0 &&
			records && Object.keys(records).length > 0;

		// 2) Build a lookup of runtime descriptors (if any) from instancesByClass.
		const runtimeList = snapshotInstancesForClass(key) || [];
		const runtimeById = {};
		for (let i = 0; i < runtimeList.length; i++) {
			const rec = runtimeList[i];
			if (!rec || !rec.instanceId) continue;
			runtimeById[rec.instanceId] = rec.descriptor || null;
		}

		// 3) If there is no storage bucket yet, fall back to the runtime view.
		if (!hasBucket) {
			// Legacy Stage-2A behavior: purely runtime-driven instances.
			return runtimeList.map(function (rec) {
				return {
					instanceId: rec.instanceId,
					displayName: rec.displayName,
					descriptor: rec.descriptor || null
				};
			});
		}

		// 4) Storage-led path: synthesize instances from {order,records},
		//    overlaying descriptor metadata where available.
		const result = [];

		for (let i = 0; i < order.length; i++) {
			const instanceId = order[i];
			if (!instanceId) continue;

			const baseRec = records[instanceId];
			if (!baseRec) continue;

			const descriptor = runtimeById[instanceId] || null;

			// displayName precedence:
			//   1) stored displayName
			//   2) runtime descriptor.instanceName / label / id
			//   3) instanceId fallback
			let displayName = baseRec.displayName;
			if (!displayName && descriptor) {
				displayName =
					descriptor.instanceName ||
					descriptor.displayName ||
					descriptor.label ||
					descriptor.id ||
					instanceId;
			}
			if (!displayName) {
				displayName = instanceId;
			}

			result.push({
				instanceId,
				displayName,
				descriptor
			});
		}

		return result;
	}


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


	// ---------- multi-instance mutation APIs (Stage-2C proposal) ----------
	///! Why is this a second instance of addInstance()?
	function addInstance(classId, options) {
		if (typeof classId !== 'string' || !classId) {
			console.warn('[VizInt] Portal.addInstance: invalid classId:', classId);
			return null;
		}

		const opts = options || {};
		let desiredDisplayName = typeof opts.displayName === 'string' && opts.displayName.trim()
			? opts.displayName.trim()
			: '';

		const { s, instances } = getInstanceCatalog();
		const catalog = { ...instances };

		let bucket = catalog[classId];
		if (!bucket || typeof bucket !== 'object') {
			bucket = { order: [], records: {} };
		} else {
			bucket = {
				order: Array.isArray(bucket.order) ? bucket.order.slice() : [],
				records: (bucket.records && typeof bucket.records === 'object') ? { ...bucket.records } : {}
			};
		}

		// Determine manifestId: either explicit or inferred from catalog
		let manifestId = typeof opts.manifestId === 'string' && opts.manifestId
			? opts.manifestId
			: null;

		if (!manifestId) {
			// Heuristic: first gadget whose normalized class matches this classId
			for (const g of GADGET_CATALOG) {
				const m = g.manifest || {};
				const rawClass = m._class || g.id;
				const norm = normalizeSlug(rawClass);
				if (norm === classId || rawClass === classId) {
					manifestId = g.id;
					break;
				}
			}
		}

		if (!manifestId) {
			console.warn('[VizInt] Portal.addInstance: unable to infer manifestId for classId:', classId);
		}

		// Display name
		if (!desiredDisplayName) {
			const base = 'Instance';
			let idx = bucket.order.length + 1;
			let candidate = `${base} ${idx}`;
			const takenNames = new Set(Object.values(bucket.records).map(r => r.displayName));
			while (takenNames.has(candidate)) {
				idx += 1;
				candidate = `${base} ${idx}`;
			}
			desiredDisplayName = candidate;
		}

		// Instance ID
		let instanceId = opts.instanceId
			? normalizeSlug(opts.instanceId)
			: normalizeSlug(desiredDisplayName) || 'instance';

		if (!instanceId) instanceId = 'instance';

		// De-dupe instanceId by suffixing -2, -3, ...
		const taken = new Set(Object.keys(bucket.records));
		if (taken.has(instanceId)) {
			let idx = 2;
			let candidate = `${instanceId}-${idx}`;
			while (taken.has(candidate)) {
				idx += 1;
				candidate = `${instanceId}-${idx}`;
			}
			instanceId = candidate;
		}

		const record = {
			instanceId,
			displayName: desiredDisplayName,
			manifestId: manifestId || ''
		};

		bucket.records[instanceId] = record;
		if (!bucket.order.includes(instanceId)) {
			bucket.order.push(instanceId);
		}

		catalog[classId] = bucket;
		writeInstanceCatalog(s, catalog);

		// Re-render so runtime descriptors + portal:gadgetInstancesChanged stay in sync
		if (window.Portal && typeof window.Portal.render === 'function') {
			window.Portal.render();
		}

		return { classId, instanceId, displayName: desiredDisplayName, manifestId: record.manifestId };
	}

	function renameInstance(classId, instanceId, newDisplayName) {
		if (typeof classId !== 'string' || !classId) return;
		if (typeof instanceId !== 'string' || !instanceId) return;
		if (typeof newDisplayName !== 'string' || !newDisplayName.trim()) return;

		const { s, instances } = getInstanceCatalog();
		const catalog = { ...instances };
		const bucket = catalog[classId];

		if (!bucket || !bucket.records || !bucket.records[instanceId]) {
			console.warn('[VizInt] Portal.renameInstance: instance not found:', classId, instanceId);
			return;
		}

		const rec = { ...bucket.records[instanceId], displayName: newDisplayName.trim() };
		const newBucket = {
			order: Array.isArray(bucket.order) ? bucket.order.slice() : [],
			records: { ...bucket.records, [instanceId]: rec }
		};

		catalog[classId] = newBucket;
		writeInstanceCatalog(s, catalog);

		if (window.Portal && typeof window.Portal.render === 'function') {
			window.Portal.render();
		}
	}

	function reorderInstance(classId, instanceId, direction) {
		// Back-compat shim: instance reordering is now tileOrder reordering.
		reorderTile(classId, instanceId, direction);
		return;

		
        if (typeof classId !== 'string' || !classId) return;
        if (typeof instanceId !== 'string' || !instanceId) return;

        const dir = (direction || '').toLowerCase();
        if (dir !== 'up' && dir !== 'down') {
            console.warn('[VizInt] Portal.reorderInstance: invalid direction:', direction);
            return;
        }

        const { s, instances } = getInstanceCatalog();
        const catalog = { ...instances };
        const bucket = catalog[classId];

        if (!bucket || !bucket.records || !bucket.records[instanceId]) {
            console.warn('[VizInt] Portal.reorderInstance: instance not found:', classId, instanceId);
            return;
        }

        const order = Array.isArray(bucket.order)
            ? bucket.order.slice()
            : Object.keys(bucket.records || {});

        const idx = order.indexOf(instanceId);
        if (idx === -1) {
            console.warn('[VizInt] Portal.reorderInstance: instanceId missing from order:', classId, instanceId);
            return;
        }

        let targetIdx = idx;
        if (dir === 'up' && idx > 0) {
            targetIdx = idx - 1;
        } else if (dir === 'down' && idx < order.length - 1) {
            targetIdx = idx + 1;
        } else {
            // already at boundary, nothing to do
            return;
        }

        // swap positions
        const tmp = order[targetIdx];
        order[targetIdx] = order[idx];
        order[idx] = tmp;

        const newBucket = {
            order,
            records: { ...bucket.records }
        };

        catalog[classId] = newBucket;
        writeInstanceCatalog(s, catalog);

        if (window.Portal && typeof window.Portal.render === 'function') {
            window.Portal.render();
        }
    }


	function removeInstance(classId, instanceId) {
		if (typeof classId !== 'string' || !classId) return;
		if (typeof instanceId !== 'string' || !instanceId) return;

		const { s, instances } = getInstanceCatalog();
		const catalog = { ...instances };
		const bucket = catalog[classId];

		if (!bucket || !bucket.records || !bucket.records[instanceId]) {
			console.warn('[VizInt] Portal.removeInstance: instance not found:', classId, instanceId);
			return;
		}

		const newRecords = { ...bucket.records };
		delete newRecords[instanceId];

		let newOrder = Array.isArray(bucket.order) ? bucket.order.slice() : [];
		newOrder = newOrder.filter(id => id !== instanceId);

		if (Object.keys(newRecords).length === 0) {
			// No more instances for this class; drop bucket to keep config tidy
			delete catalog[classId];
		} else {
			catalog[classId] = {
				order: newOrder,
				records: newRecords
			};
		}

		writeInstanceCatalog(s, catalog);

		if (window.Portal && typeof window.Portal.render === 'function') {
			window.Portal.render();
		}
	}

	function getInstanceConfig(classId) {
		const { instances } = getInstanceCatalog();
		if (typeof classId !== 'string' || !classId) {
			return instances;
		}
		const bucket = instances[classId];
		if (!bucket || !bucket.records) return { order: [], records: {} };
		const order = Array.isArray(bucket.order) ? bucket.order.slice() : Object.keys(bucket.records);
		return {
			order,
			records: { ...bucket.records }
		};
	}



	// ---------- Portal exports ----------

	window.Portal = {
        render,
        getSettings,
        setSettings,
        getInstances,			// runtime instance table (from instancesByClass)
        getTileOrder,			
        addInstance,			// Stage-2C
        renameInstance,			// Stage-2C
        removeInstance,			// Stage-2C
        reorderInstance,		// Stage-2C (new) – used by Settings MI child rows
        getInstanceConfig,		// Stage-2C, optional
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
