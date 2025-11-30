/*
 *
 *  $VER: 1.2.2
 *
 * 
 *  $HISTORY:
 *  2025/11/29  1.2.1  Restored the actual settings gadget as a normal/removable gadget
 *  2025/11/30  1.2.2  Added SettingsRuntime plumbing for multi-instance manager (core vs UI split, 48:33)
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

	// =========== Settings gadget ===========
	function mount(host, ctx) {
	
		const doc  = document;
		// IMPORTANT: use host as the root; fall back to ctx.body only if explicitly provided
		const root = (ctx && ctx.body) ? ctx.body : host;
	
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

			const enabledOrder = s.enabledGadgets || [];
			const enabledSet   = new Set(enabledOrder);

			// 1) Enabled gadgets in the user’s order, excluding header
			const enabled = enabledOrder
				.map(id => catalog.find(g => g.id === id))
				.filter(g => g && g.id !== 'header' /* && g.id !== 'settings' */);

			// 2) Remaining catalog gadgets, also excluding header
			const remaining = catalog.filter(g =>
				!enabledSet.has(g.id) && g.id !== 'header' /* && g.id !== 'settings' */
			);

			// Flat list for the settings UI
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
			Array.from(ul.children).forEach(li => decorateRow(li));
		}

		// Multi-instance section
		const miSection = doc.createElement('section');
		miSection.className = 'vi-settings-section vi-settings-mi-section';

		const miHeader = doc.createElement('h2');
		miHeader.textContent = 'Multi-instance gadgets';
		miHeader.className = 'vi-settings-section-title';
		miSection.appendChild(miHeader);

		const miBody = doc.createElement('div');
		miBody.className = 'vi-settings-mi-body';
		miSection.appendChild(miBody);

		// Append MI section into the same root container as the rest of the gadget
		root.appendChild(miSection);

		buildMultiInstanceManager(miBody);

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
			pop.addEventListener('mouseleave', () => { overPop = false; hideInfoPopSoon(pop); });
		}

		function saveState() {
			///! I suspect pushing header may no longer be necessary either.
			const newOrder = ['header'];
			for (const li of ul.children) {
				const id = li.dataset.id;
				const checked = li.querySelector('input[type=checkbox]').checked;
				if (checked) newOrder.push(id);
			}
			///! Restoring settings every time is no longer mandatory in the new modal model
			//newOrder.push('settings');
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

		function buildMultiInstanceManager(rootEl) {
			const portal = window.Portal;

			// Canonical requirements for this manager:
			// - SettingsRuntime.getInstanceCatalog(): merged view of settings.instances + getInstances()
			if (!portal) {
				console.warn('[Settings] Multi-instance manager: Portal not available');
				rootEl.textContent = 'Multi-instance support is not available in this build.';
				return;
			}

			const state = {
				// catalog[classId] = { order: [instanceId...], records: { instanceId: { instanceId, displayName, manifestId, descriptor? } } }
				catalog: {}
			};

			// Use descriptor from runtime instances (via SettingsRuntime) as the canonical source of manifest/meta
			function getClassMeta(classId, entry) {
				entry = entry || {};
				const records = entry.records || {};
				const instanceIds = Object.keys(records);
				const firstId = instanceIds[0];
				const firstRec = firstId ? records[firstId] : null;
				const desc = firstRec && firstRec.descriptor || null;
				const manifest = desc && desc.manifest || {};

				const label =
					manifest.label ||
					(desc && (desc.displayName || desc.label)) ||
					manifest._class ||
					classId;

				// We don’t have a dedicated icon field in descriptor yet; fall back to manifest.iconEmoji/icon or a generic emoji.
				const icon = (manifest.iconEmoji || manifest.icon) || '🔁';

				const badges = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
				// _type enum is now "single" | "multi" | "system"
				const isMulti = manifest._type === 'multi' || manifest.type === 'multi';

				return { label, icon, badges, isMulti };
			}

			function clearRoot() {
				while (rootEl.firstChild) {
					rootEl.removeChild(rootEl.firstChild);
				}
			}

			function renderEmptyState() {
				const empty = document.createElement('div');
				empty.className = 'vi-mi-empty';
				empty.textContent = 'No multi-instance gadgets are configured yet.';
				rootEl.appendChild(empty);
			}

			function createBadge(text) {
				const span = document.createElement('span');
				span.className = 'vi-mi-badge';
				span.textContent = text;
				return span;
			}

			function createIconSpan(iconText) {
				const span = document.createElement('span');
				span.className = 'vi-mi-icon';
				span.textContent = iconText;
				return span;
			}

			function render() {
				clearRoot();

				const catalog = state.catalog || {};
				const classIds = Object.keys(catalog);

				// Filter to classes that are actually multi-instance (or that have >1 record)
				const filteredClassIds = classIds.filter((classId) => {
					const entry = catalog[classId] || {};
					const meta = getClassMeta(classId, entry);
					const recs = entry.records || {};
					const recCount = Object.keys(recs).length;
					return meta.isMulti || recCount > 1;
				});

				if (!filteredClassIds.length) {
					renderEmptyState();
					return;
				}

				// Sort by human label
				filteredClassIds.sort((a, b) => {
					const ma = getClassMeta(a, catalog[a]);
					const mb = getClassMeta(b, catalog[b]);
					return ma.label.localeCompare(mb.label);
				});

				filteredClassIds.forEach((classId) => {
					renderClassBlock(classId, catalog[classId]);
				});
			}

			function renderClassBlock(classId, entry) {
				entry = entry || {};
				const order = Array.isArray(entry.order)
					? entry.order.slice()
					: Object.keys(entry.records || {});
				const records = entry.records || {};
				const meta = getClassMeta(classId, entry);

				// Class row (parent)
				const classRow = document.createElement('div');
				classRow.className = 'vi-mi-class-row';
				classRow.dataset.classId = classId;

				// + button
				const btnAdd = document.createElement('button');
				btnAdd.type = 'button';
				btnAdd.className = 'vi-mi-btn vi-mi-btn-add';
				btnAdd.textContent = '+';
				btnAdd.title = 'Add new instance';
				classRow.appendChild(btnAdd);

				// icon
				classRow.appendChild(createIconSpan(meta.icon));

				// class name
				const nameSpan = document.createElement('span');
				nameSpan.className = 'vi-mi-class-name';
				nameSpan.textContent = meta.label;
				classRow.appendChild(nameSpan);

				// badges (capabilities, type, etc.)
				const badgesHost = document.createElement('span');
				badgesHost.className = 'vi-mi-badges';
				(meta.badges || []).forEach((b) => badgesHost.appendChild(createBadge(b)));
				// Show a generic "multi-instance" badge if none present
				if (!meta.badges || !meta.badges.length) {
					badgesHost.appendChild(createBadge('multi-instance'));
				}
				classRow.appendChild(badgesHost);

				// reorder arrows for the whole block (class + its instances)
				const btnUp = document.createElement('button');
				btnUp.type = 'button';
				btnUp.className = 'vi-mi-btn vi-mi-btn-row-up';
				btnUp.textContent = '↑';
				btnUp.title = 'Move class up';
				classRow.appendChild(btnUp);

				const btnDown = document.createElement('button');
				btnDown.type = 'button';
				btnDown.className = 'vi-mi-btn vi-mi-btn-row-down';
				btnDown.textContent = '↓';
				btnDown.title = 'Move class down';
				classRow.appendChild(btnDown);

				rootEl.appendChild(classRow);

				// Instance rows container
				const instancesContainer = document.createElement('div');
				instancesContainer.className = 'vi-mi-instances';
				rootEl.appendChild(instancesContainer);

				order.forEach((instanceId) => {
					const rec = records[instanceId];
					if (!rec) return;
					renderInstanceRow(instancesContainer, classId, rec);
				});

				// Wire up class-level events
				btnAdd.addEventListener('click', () => {
					try {
						portal.addInstance(classId, { displayName: null });
					} catch (err) {
						console.error('[Settings] addInstance failed for', classId, err);
					}
				});

				// Note: class-level up/down reordering needs a class-block ordering API in Portal.
				// We do not invent one. These buttons are wired only if Portal.reorderClassBlock exists.
				function maybeReorder(direction) {
					if (typeof portal.reorderClassBlock === 'function') {
						try {
							portal.reorderClassBlock(classId, direction);
						} catch (err) {
							console.error('[Settings] reorderClassBlock failed', err);
						}
					} else {
						console.warn('[Settings] reorderClassBlock not available on Portal');
					}
				}

				btnUp.addEventListener('click', () => maybeReorder('up'));
				btnDown.addEventListener('click', () => maybeReorder('down'));
			}

			function renderInstanceRow(parentEl, classId, rec) {
				const instanceId = rec.instanceId;
				const displayName = rec.displayName || instanceId;

				const row = document.createElement('div');
				row.className = 'vi-mi-instance-row';
				row.dataset.classId = classId;
				row.dataset.instanceId = instanceId;

				// remove button
				const btnRemove = document.createElement('button');
				btnRemove.type = 'button';
				btnRemove.className = 'vi-mi-btn vi-mi-btn-remove';
				btnRemove.textContent = '−';
				btnRemove.title = 'Remove this instance';
				row.appendChild(btnRemove);

				// visibility checkbox (stub until Portal exposes a real API)
				const visLabel = document.createElement('label');
				visLabel.className = 'vi-mi-vis-label';

				const visCheckbox = document.createElement('input');
				visCheckbox.type = 'checkbox';
				visCheckbox.className = 'vi-mi-vis-checkbox';
				visCheckbox.checked = rec.visible !== false; // default true unless explicitly false

				const visText = document.createElement('span');
				visText.textContent = 'Visible';

				visLabel.appendChild(visCheckbox);
				visLabel.appendChild(visText);
				row.appendChild(visLabel);

				// icon/meta reused from class-level descriptor
				const meta = getClassMeta(classId, state.catalog[classId]);
				row.appendChild(createIconSpan(meta.icon));

				// editable name
				const nameSpan = document.createElement('span');
				nameSpan.className = 'vi-mi-instance-name';
				nameSpan.textContent = displayName;
				nameSpan.title = 'Click to rename';
				row.appendChild(nameSpan);

				// badges (reuse class badges for now)
				const badgesHost = document.createElement('span');
				badgesHost.className = 'vi-mi-badges';
				(meta.badges || []).forEach((b) => badgesHost.appendChild(createBadge(b)));
				row.appendChild(badgesHost);

				// reorder arrows within class
				const btnUp = document.createElement('button');
				btnUp.type = 'button';
				btnUp.className = 'vi-mi-btn vi-mi-btn-row-up';
				btnUp.textContent = '↑';
				btnUp.title = 'Move instance up';
				row.appendChild(btnUp);

				const btnDown = document.createElement('button');
				btnDown.type = 'button';
				btnDown.className = 'vi-mi-btn vi-mi-btn-row-down';
				btnDown.textContent = '↓';
				btnDown.title = 'Move instance down';
				row.appendChild(btnDown);

				parentEl.appendChild(row);

				// Events

				btnRemove.addEventListener('click', () => {
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

				nameSpan.addEventListener('click', () => {
					beginRename(row, classId, instanceId, nameSpan.textContent || '');
				});

				btnUp.addEventListener('click', () => {
					if (typeof portal.reorderInstance === 'function') {
						try {
							portal.reorderInstance(classId, instanceId, 'up');
						} catch (err) {
							console.error('[Settings] reorderInstance(up) failed', err);
						}
					} else {
						console.warn('[Settings] reorderInstance not available on Portal');
					}
				});

				btnDown.addEventListener('click', () => {
					if (typeof portal.reorderInstance === 'function') {
						try {
							portal.reorderInstance(classId, instanceId, 'down');
						} catch (err) {
							console.error('[Settings] reorderInstance(down) failed', err);
						}
					} else {
						console.warn('[Settings] reorderInstance not available on Portal');
					}
				});

				visCheckbox.addEventListener('change', () => {
					// Do not invent a Portal API. Only call if Portal already provides one.
					if (typeof portal.setInstanceVisibility === 'function') {
						try {
							portal.setInstanceVisibility(classId, instanceId, visCheckbox.checked);
						} catch (err) {
							console.error('[Settings] setInstanceVisibility failed', err);
						}
					} else {
						console.warn(
							'[Settings] Visibility checkbox is currently visual only; Portal.setInstanceVisibility is not implemented.'
						);
					}
				});
			}

			function beginRename(row, classId, instanceId, currentName) {
				const nameSpan = row.querySelector('.vi-mi-instance-name');
				if (!nameSpan) return;

				// Avoid double editors
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

			function refreshFromPortal() {
				try {
					state.catalog = SettingsRuntime.getInstanceCatalog() || {};
				} catch (err) {
					console.error('[Settings] Failed to refresh instance catalog via SettingsRuntime', err);
					state.catalog = {};
				}
				render();
			}

			// Listen for Portal events
			window.addEventListener('portal:gadgetInstancesChanged', refreshFromPortal);
			window.addEventListener('portal:gadgetRenamed',          refreshFromPortal);

			// Initial render
			refreshFromPortal();
		}

	}

	window.GADGETS = window.GADGETS || {};
	window.GADGETS.settings = {
		info: 'Choose which gadgets are visible. Your selection is saved locally.',
		mount
	};

})();
