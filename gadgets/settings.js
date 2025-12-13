/*
 *
 *	File: gadgets/settings.js
 *	Gadget: Settings
 *	Description: Gadget settings and Portal options
 *	Author: K&K & U:Vz & U:Ux & U:St
 * 
 *	$VER: 1.2.5
 *
 *	$HISTORY:
 *	2025-12-11	U:St	1.2.5	Wire MI instance up/down arrows to Portal.reorderTile (tileOrder authority), allowing cross-boundary moves.
 *	2025/11/30	U:St	1.2.4	Inline multi-instance child rows under class rows; hide old MI section; export SettingsRuntime
 *	2025/11/30	U:St	1.2.3	Multi-instance class rows use [+] in main list; excluded from enabledGadgets
 *	2025/11/30	U:St	1.2.2	Added SettingsRuntime plumbing for multi-instance manager (core vs UI split, 48:33)
 *	2025/11/29	U:St	1.2.1	Restored the actual settings gadget as a normal/removable gadget
 *
 */
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
		const r  = anchorEl.getBoundingClientRect();
		const vw = Math.max(document.documentElement.clientWidth,  window.innerWidth  || 0);
		const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);

		pop.style.left = '-9999px'; pop.style.top = '-9999px'; pop.classList.add('on');
		const width  = pop.offsetWidth  || 320;
		const height = pop.offsetHeight || 160;

		let left = r.right + 8;
		let top  = r.top   - 4;

		if (left + width > vw - 8) left = r.left - width - 8;
		if (left < 8) left = 8;

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

	// =========== Portal-owned runtime plumbing (SettingsRuntime, 48:33) ===========
	//
	// This region is Portal-owned (no DOM/UI code).
	// It builds a catalog from:
	//   - settings.instances[classId].{order,records}
	//   - Portal.getInstances(classId)  // authoritative runtime view
	//
	// Shape:
	//   SettingsRuntime.getInstanceCatalog() → {
	//     [classId]: {
	//       order:   [instanceId, ...],
	//       records: {
	//         [instanceId]: {
	//           instanceId,
	//           displayName,
	//           manifestId,
	//           visible?,       // if present
	//           descriptor: {}  // runtime descriptor from getInstances(...)
	//         },
	//         ...
	//       }
	//     },
	//     ...
	//   }
	//
	const SettingsRuntime = (function(){
		function safeGetPortal() {
			const p = window.Portal;
			if (!p) {
				console.warn('[SettingsRuntime] window.Portal is not available');
			}
			return p;
		}

		function getInstanceCatalog() {
			const portal = safeGetPortal();
			if (!portal || typeof portal.getSettings !== 'function') {
				return {};
			}

			let settings;
			try {
				settings = portal.getSettings() || {};
			} catch (err) {
				console.error('[SettingsRuntime] Failed to read Portal settings for instances', err);
				settings = {};
			}

			const inst = (settings && settings.instances) || {};
			const catalog = {};

			Object.keys(inst).forEach((classId) => {
				const entry   = inst[classId] || {};
				const order   = Array.isArray(entry.order) ? entry.order.slice() : [];
				const records = entry.records || {};

				// Merge in runtime descriptors from Portal.getInstances(classId),
				// which is the authoritative runtime view for instances.
				let runtimeInstances = [];
				if (typeof portal.getInstances === 'function') {
					try {
						runtimeInstances = portal.getInstances(classId) || [];
					} catch (err) {
						console.warn('[SettingsRuntime] getInstances failed for', classId, err);
					}
				}
				const descById = {};
				runtimeInstances.forEach((ri) => {
					if (!ri || !ri.instanceId) return;
					descById[ri.instanceId] = ri.descriptor || null;
				});

				const mergedRecords = {};
				Object.keys(records).forEach((instanceId) => {
					const baseRec = records[instanceId];
					mergedRecords[instanceId] = {
						...baseRec,
						descriptor: descById[instanceId] || null
					};
				});

				catalog[classId] = {
					order,
					records: mergedRecords
				};
			});

			return catalog;
		}

		return {
			getInstanceCatalog
		};
	})();

	// expose runtime so Portal/UX can consume it
	if (typeof window !== 'undefined') {
		window.SettingsRuntime = SettingsRuntime;
	}

	// =========== Settings gadget ===========
	function mount(host, ctx) {
	
		const doc  = document;
		// IMPORTANT: use host as the root; fall back to ctx.body only if explicitly provided
		const root = (ctx && ctx.body) ? ctx.body : host;
		const portal = window.Portal || null;
	
		const { getSettings, setSettings, gadgetCatalog: initialCatalog } = ctx;

		/// Multi-instance helpers (inline child rows use the same classId semantics as SettingsRuntime)
		function normalizeClassId(raw) {
			return String(raw || '')
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '');
		}

		function getInstanceCatalogSafe() {
			if (!window.SettingsRuntime || typeof window.SettingsRuntime.getInstanceCatalog !== 'function') {
				return {};
			}
			try {
				return window.SettingsRuntime.getInstanceCatalog() || {};
			} catch (err) {
				console.error('[Settings] getInstanceCatalogSafe failed', err);
				return {};
			}
		}

		// Map a registry row (id + manifest) to the canonical classId used by Portal/settings.instances
		function resolveClassIdForRow(registryId, manifest, instanceCatalog) {
			const keys = Object.keys(instanceCatalog || {});
			if (!keys.length) return null;

			const nId  = normalizeClassId(registryId);
			const nCls = normalizeClassId(manifest && (manifest._class || manifest.id || ''));

			let best = null;
			for (const k of keys) {
				const nk = normalizeClassId(k);
				if (nk === nId || nk === nCls) {
					best = k;
					break;
				}
			}
			// Fallback: if nothing matched but there is exactly one MI entry, use it
			if (!best && keys.length === 1) best = keys[0];
			return best;
		}

		function getCatalog() {
			const live = (window.REGISTRY && window.REGISTRY.GADGETS) || initialCatalog || [];
			return live.map(({ id, label, iconEmoji, iconPng, iconBg, iconBorder }) =>
				({ id, label, iconEmoji, iconPng, iconBg, iconBorder })
			);
		}

		function computeUserGadgetList() {
			const s = getSettings();
			const catalog = getCatalog();

			const enabledOrder = s.enabledGadgets || [];
			const enabledSet   = new Set(enabledOrder);

			const enabled = enabledOrder
				.map(id => catalog.find(g => g.id === id))
				.filter(g => g && g.id !== 'header');

			const remaining = catalog.filter(g =>
				!enabledSet.has(g.id) && g.id !== 'header'
			);

			return [...enabled, ...remaining];
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

		// legacy MI manager section – kept but hidden so we don't lose the code
		const miSection = doc.createElement('section');
		miSection.className = 'vi-settings-section vi-settings-mi-section';
		miSection.style.display = 'none';  /// Hide legacy MI console; logic remains active if re-enabled

		const miHeader = doc.createElement('h2');
		miHeader.textContent = 'Multi-instance gadgets';
		miHeader.className = 'vi-settings-section-title';
		miSection.appendChild(miHeader);

		const miBody = doc.createElement('div');
		miBody.className = 'vi-settings-mi-body';
		miSection.appendChild(miBody);

		// Append MI section into the same root container as the rest of the gadget
		root.appendChild(miSection);

		/// Inline child rows rendered immediately under their multi-instance class row
		function injectMiChildren(parentLi, classId, manifest, instanceCatalog) {
			if (!classId) return;
			const entry   = (instanceCatalog && instanceCatalog[classId]) || {};
			const order   = Array.isArray(entry.order) ? entry.order.slice() : Object.keys(entry.records || {});
			const records = entry.records || {};
			if (!order.length) return;

			let insertAfter = parentLi;

			order.forEach(instanceId => {
				const rec = records[instanceId];
				if (!rec) return;

				const name = rec.displayName || instanceId;
				const li   = document.createElement('li');
				li.className = 'set-row grid8 mi-child-row';
				li.dataset.miChild    = '1';
				li.dataset.classId    = classId;
				li.dataset.instanceId = instanceId;

				const iconEmoji = manifest.iconEmoji || manifest.icon || '🔁';

				li.innerHTML = `
				<div class="cell c-chk">
					<button class="gbtn gbtn-xs mi-remove" aria-label="Remove instance">−</button>
				</div>
				<div class="cell c-ico">
					<span class="g-iconbox mi-icon">${escapeHtml(iconEmoji)}</span>
				</div>
				<div class="cell c-name">
					<span class="g-label truncate mi-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
				</div>
				<div class="cell c-cap cap1"></div>
				<div class="cell c-cap cap2"></div>
				<div class="cell c-cap cap3"></div>
				<div class="cell c-up"><button class="gbtn gbtn-xs mi-up"   aria-label="Move instance up">▲</button></div>
				<div class="cell c-dn"><button class="gbtn gbtn-xs mi-down" aria-label="Move instance down">▼</button></div>
				`;

				insertAfter.parentNode.insertBefore(li, insertAfter.nextSibling);
				insertAfter = li;

				if (portal) {
					const btnRemove = li.querySelector('.mi-remove');
					const nameSpan  = li.querySelector('.mi-name');
					const btnUp     = li.querySelector('.mi-up');
					const btnDown   = li.querySelector('.mi-down');

					// Make − tiny
					if (btnRemove) {
						btnRemove.style.padding   = '0 4px';
						btnRemove.style.fontSize  = '10px';
						btnRemove.style.minWidth  = 'auto';
					}

					btnRemove?.addEventListener('click', () => {
						const ok = window.confirm(
							'Are you sure you want to permanently delete this instance and all its settings?'
						);
						if (!ok) return;
						try {
							portal.removeInstance(classId, instanceId);
						} catch (err) {
							console.error('[Settings] removeInstance failed', err);
						}
					});

					const triggerRename = () => {
						beginInlineRename(li, classId, instanceId, nameSpan?.textContent || '');
					};

					if (nameSpan) {
						nameSpan.style.cursor = 'text';
						nameSpan.addEventListener('click', triggerRename);
					}
					
					btnUp?.addEventListener('click', () => {
						if (portal && typeof portal.reorderTile === 'function') {
							try { portal.reorderTile(classId, instanceId, 'up'); }
							catch (err) { console.error('[Settings] reorderTile(up) failed', err); }
						}
					});

					btnDown?.addEventListener('click', () => {
						if (portal && typeof portal.reorderTile === 'function') {
							try { portal.reorderTile(classId, instanceId, 'down'); }
							catch (err) { console.error('[Settings] reorderTile(down) failed', err); }
						}
					});

				}
			});
		}


		function beginMiRename(row, classId, instanceId, currentName) {
			const nameSpan = row.querySelector('.mi-name');
			if (!nameSpan) return;
			if (row.querySelector('input.vi-mi-name-edit')) return;

			const input = document.createElement('input');
			input.type = 'text';
			input.className = 'vi-mi-name-edit';
			input.value = currentName;
			input.setAttribute('maxlength', '64');

			nameSpan.replaceWith(input);
			input.focus();
			input.select();

			function commit() {
				const newName = (input.value || '').trim();
				if (!newName || newName === currentName) {
					cancel();
					return;
				}
				if (!portal || typeof portal.renameInstance !== 'function') {
					console.warn('[Settings] renameInstance not available on Portal');
					cancel();
					return;
				}
				try {
					portal.renameInstance(classId, instanceId, newName);
				} catch (err) {
					console.error('[Settings] renameInstance failed', err);
				}
			}

			function cancel() {
				input.replaceWith(nameSpan);
			}

			input.addEventListener('keydown', (ev) => {
				if (ev.key === 'Enter') {
					ev.preventDefault();
					commit();
				} else if (ev.key === 'Escape' || ev.key === 'Esc') {
					ev.preventDefault();
					cancel();
				}
			});

			input.addEventListener('blur', () => {
				cancel();
			});
		}

		async function decorateRow(li, instanceCatalog) {
			const id      = li.dataset.id;
			const labelEl = li.querySelector('.g-label');
			const info    = li.querySelector('.info-hook');
			const cap1    = li.querySelector('.cap1');
			const cap2    = li.querySelector('.cap2');
			const cap3    = li.querySelector('.cap3');

			// registry icon
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

			const m = await ensureManifestById(id);

			// multi-instance class row in main list
			(function setupMultiInstanceClassRow() {
				if (!m) return;
				const isMulti = (m._type === 'multi' || m.type === 'multi');
				if (!isMulti) return;

				const chkCell = li.querySelector('.c-chk');
				if (!chkCell) return;

				const existingChk = chkCell.querySelector('input[type=checkbox]');
				if (existingChk) existingChk.remove();

				li.dataset.miClass = '1';

				const btnAdd = document.createElement('button');
				btnAdd.type = 'button';
				btnAdd.className = 'gbtn gbtn-xs mi-add';
				btnAdd.textContent = '+';
				btnAdd.title = 'Add a new instance of this gadget';
				// Make [+] as small as possible, consistent with design language
				btnAdd.style.padding  = '0 4px';
				btnAdd.style.fontSize = '10px';
				btnAdd.style.minWidth = 'auto';
				chkCell.appendChild(btnAdd);

				btnAdd.addEventListener('click', () => {
					if (!portal || typeof portal.addInstance !== 'function') {
						console.warn('[Settings] Portal.addInstance is not available; multi-instance add is disabled.');
						return;
					}
					const classKey = (m && m._class) || id;
					try {
						// Create a new instance; we don't rely on the return value
						portal.addInstance(classKey, { displayName: null });

						// Refresh the list so the new child row appears
						renderList();

						// After DOM updates, focus the last child row for this class and start inline rename
						requestAnimationFrame(() => {
							const rows = root.querySelectorAll(`li.mi-child-row[data-class-id="${classKey}"]`);
							if (!rows.length) return;
							const row = rows[rows.length - 1];
							if (!row) return;

							const instanceId = row.dataset.instanceId;
							const nameSpan   = row.querySelector('.mi-name');
							const current    = nameSpan ? (nameSpan.textContent || '') : '';

							if (instanceId) {
								beginInlineRename(row, classKey, instanceId, current);
							}
						});
					} catch (err) {
						console.error('[Settings] addInstance failed for', classKey, err);
					}
				});


				// Inject existing instances for this class under the main row
				const classKey = (m && m._class) || id;
				injectMiChildren(li, classKey, m, instanceCatalog);

			})();

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
			pop.addEventListener('mouseleave', () => { overPop = false; hideInfoPopSoon(pop); });
		}

		function saveState() {
			///! I suspect pushing header may no longer be necessary either.
			const newOrder = ['header'];

			for (const li of ul.children) {
				const id = li.dataset.id;
				if (!id) continue;

				// Multi-instance class rows are not part of enabledGadgets.
				if (li.dataset.miClass === '1') continue;

				const chk = li.querySelector('input[type=checkbox]');
				if (!chk) continue;
				if (chk.checked) newOrder.push(id);
			}

			// ⚠ IMPORTANT: never overwrite the whole settings object — merge instead.
			const current = getSettings() || {};
			const next = {
				...current,
				enabledGadgets: newOrder
			};

			setSettings(next);

			window.dispatchEvent(new CustomEvent('gadgets:update', {
				detail: { enabled: newOrder }
			}));
		}

		function renderList() {
			const s = getSettings();
			const enabled = new Set(s.enabledGadgets || []);
			const userGadgets = computeUserGadgetList();
			const instanceCatalog = getInstanceCatalogSafe();

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

			// Decorate rows and, for multi-instance classes, inject children
			Array.from(ul.children).forEach(li => decorateRow(li, instanceCatalog));
		}

		// Move up/down & checkbox changes for main rows
		ul.addEventListener('click', e => {
			if (!e.target.matches('button')) return;
			const li = e.target.closest('li');
			if (!li || li.dataset.miChild === '1') return; // child rows have their own handlers

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
			if (e.target.matches('input[type=checkbox]') && !e.target.classList.contains('mi-vis')) {
				saveState();
			}
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

		chkFold.addEventListener('change', () => {
			const folded = !!chkFold.checked;

			const current = getSettings() || {};
			const next = {
				...current,
				foldedHubControls: folded
			};

			setSettings(next);

			window.dispatchEvent(new CustomEvent('gadgets:update', {
				detail: { enabled: next.enabledGadgets }
			}));

			showToast(
				folded ? 'Window controls folded under 💠' : 'Window controls expanded',
				'info',
				2000
			);
		});

		window.addEventListener('registry:updated', () => renderList());

		// Keep inline MI rows in sync with Portal mutations
		window.addEventListener('portal:gadgetInstancesChanged', () => renderList());
		window.addEventListener('portal:gadgetRenamed',          () => renderList());

		function beginInlineRename(row, classId, instanceId, currentName) {
			const nameSpan = row.querySelector('.mi-name');
			if (!nameSpan || !portal) return;

			// Avoid duplicate editors on the same row
			if (row.querySelector('input.vi-mi-name-edit')) return;

			const wrapper = document.createElement('div');
			wrapper.className = 'vi-mi-rename-wrap';
			// Layout: input + ✓ + × horizontally
			wrapper.style.display = 'flex';
			wrapper.style.alignItems = 'center';
			wrapper.style.gap = '4px';

			const input = document.createElement('input');
			input.type = 'text';
			input.className = 'vi-mi-name-edit';
			input.value = currentName;
			input.setAttribute('maxlength', '64');
			// Make it compact but flexible
			input.style.flex = '1';
			input.style.minWidth = '0';

			const btnOk = document.createElement('button');
			btnOk.type = 'button';
			btnOk.className = 'gbtn gbtn-xs vi-mi-rename-ok';
			btnOk.textContent = '✓';
			btnOk.title = 'Rename instance';
			btnOk.style.padding  = '0 4px';
			btnOk.style.fontSize = '10px';
			btnOk.style.minWidth = 'auto';

			const btnCancel = document.createElement('button');
			btnCancel.type = 'button';
			btnCancel.className = 'gbtn gbtn-xs vi-mi-rename-cancel';
			btnCancel.textContent = '×';
			btnCancel.title = 'Cancel rename';
			btnCancel.style.padding  = '0 4px';
			btnCancel.style.fontSize = '10px';
			btnCancel.style.minWidth = 'auto';

			wrapper.appendChild(input);
			wrapper.appendChild(btnOk);
			wrapper.appendChild(btnCancel);

			nameSpan.replaceWith(wrapper);
			input.focus();
			input.select();

			function finish(restoreLabel) {
				if (restoreLabel) {
					wrapper.replaceWith(nameSpan);
				} else {
					// Let the next portal:gadgetRenamed event + renderList refresh the label
					wrapper.replaceWith(nameSpan);
				}
			}

			function commit() {
				const newName = (input.value || '').trim();
				if (!newName || newName === currentName) {
					finish(true);
					return;
				}
				if (typeof portal.renameInstance !== 'function') {
					console.warn('[Settings] renameInstance not available on Portal');
					finish(true);
					return;
				}
				try {
					portal.renameInstance(classId, instanceId, newName);
				} catch (err) {
					console.error('[Settings] renameInstance failed', err);
					finish(true);
					return;
				}
				finish(false);
			}

			function cancel() {
				finish(true);
			}

			input.addEventListener('keydown', (ev) => {
				if (ev.key === 'Enter') {
					ev.preventDefault();
					commit();
				} else if (ev.key === 'Escape' || ev.key === 'Esc') {
					ev.preventDefault();
					cancel();
				}
			});

			btnOk.addEventListener('click', commit);
			btnCancel.addEventListener('click', cancel);

			input.addEventListener('blur', () => {
				// Avoid immediate cancel when clicking ✓ / ×
				setTimeout(() => {
					if (!row.contains(document.activeElement)) {
						cancel();
					}
				}, 80);
			});
		}

		// Keep the legacy MI-manager wiring alive for runtime refresh (even though UI is hidden)
		function buildMultiInstanceManager(rootEl) {
			const portal = window.Portal;
			const gadgetsRegistry = window.GADGETS || {};
			const runtime = window.SettingsRuntime || null;

			if (!portal) {
				console.warn('[Settings] Multi-instance manager: Portal not available');
				rootEl.textContent = 'Multi-instance support is not available in this build.';
				return;
			}

			const state = {
				catalog: getCatalogLegacy()
			};

			function normalizeClassId(raw) {
				return String(raw || '')
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, '');
			}

			function resolveGadgetApiForClass(classId) {
				const reg = gadgetsRegistry;

				if (reg[classId]) return reg[classId];

				const targetNorm = normalizeClassId(classId);

				let best = null;
				Object.keys(reg).forEach((key) => {
					const api = reg[key];
					const m = api && api.manifest;
					if (!m) return;

					const publicClass = m._class || key;
					const norm = normalizeClassId(publicClass);

					if (norm === targetNorm && !best) {
						best = api;
					}
				});

				return best;
			}

			function getClassMetaLegacy(classId, entry) {
				const api = resolveGadgetApiForClass(classId);
				const manifest = api && api.manifest || {};
				const label = manifest.label || manifest._class || classId;
				const icon = manifest.icon || '🔁';
				const badges = manifest.capabilities || [];
				const isMulti = manifest._type === 'multi' || manifest.type === 'multi';

				return { label, icon, badges, isMulti };
			}

			function getCatalogLegacy() {
				let catalog = {};

				if (runtime && typeof runtime.getInstanceCatalog === 'function') {
					catalog = runtime.getInstanceCatalog() || {};
				} else if (typeof portal.getInstanceConfig === 'function') {
					catalog = portal.getInstanceConfig() || {};
				}

				Object.keys(gadgetsRegistry).forEach((key) => {
					const api = gadgetsRegistry[key];
					const m = api && api.manifest;
					if (!m) return;

					const isMulti = m._type === 'multi' || m.type === 'multi';
					if (!isMulti) return;

					const publicClass = m._class || key;
					const normalized = normalizeClassId(publicClass);

					if (!catalog[normalized]) {
						catalog[normalized] = {
							order:   [],
							records: {}
						};
					}
				});

				return catalog;
			}

			function refreshFromPortal() {
				try {
					state.catalog = getCatalogLegacy();
				} catch (err) {
					console.error('[Settings] Failed to refresh instance catalog', err);
				}
				// no-op for hidden legacy UI
			}

			window.addEventListener('portal:gadgetInstancesChanged', refreshFromPortal);
			window.addEventListener('portal:gadgetRenamed',          refreshFromPortal);

			refreshFromPortal();
		}

		// still initialise the hidden legacy manager so events are wired
		buildMultiInstanceManager(miBody);

		// Initial render of main list (with inline MI children)
		renderList();

	}

	window.GADGETS = window.GADGETS || {};
	window.GADGETS.settings = {
		info: 'Choose which gadgets are visible. Your selection is saved locally.',
		mount
	};

})();
