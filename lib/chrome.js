/*
	chrome.js v1.2.2

	HISTORY:
	2025-11-27 (U:UX/U:Portal)
	- Extracted from loader.js buildChrome().
	- chrome.js now owns titlebar/chrome only; no direct storage or ctx.libs access.
	2025-11-27 (U:UX)
	- Wired info-icon click affordance via chromeCtx.onInfoRequest callback.
	2025-11-29 (U:UX)
	- Added createSettingsModalShell() for header/settings modal host.
*/

(function () {
	'use strict';

	function createGadgetChrome(descriptor, chromeCtx) {
		const name       = descriptor.id;
		const gadgetInfo = descriptor.gadgetInfo || null;
		const isHeader   = !!descriptor.isHeader;
		// Portal owns mount lifecycle; chrome.js does not touch the dock.
		// const dock       = chromeCtx.dock;

		const slot = document.createElement('div');
		slot.className = 'cell3d gadget-slot';
		slot.dataset.gadget = name;

		const titleId = `gtitle-${name}-${Math.random().toString(36).slice(2)}`;
		slot.setAttribute('role', 'region');
		slot.setAttribute('aria-labelledby', titleId);

		const bar   = document.createElement('div');  bar.className   = 'g-titlebar';
		const title = document.createElement('div');  title.className = 'g-title'; title.id = titleId;
		const act   = document.createElement('div');  act.className   = 'g-actions';

		// --- Icon (info trigger). If registry has icon, use it; otherwise default ℹ️
		const box = document.createElement('span');
		box.className = 'g-iconbox';
		if (gadgetInfo?.iconBg)     box.style.background = gadgetInfo.iconBg;
		if (gadgetInfo?.iconBorder) box.style.border     = `1px solid ${gadgetInfo.iconBorder}`;
		if (gadgetInfo?.iconEmoji) {
			box.classList.add('emoji');
			box.textContent = gadgetInfo.iconEmoji;
		} else if (gadgetInfo?.iconPng) {
			const img = document.createElement('img');
			img.src = gadgetInfo.iconPng;
			img.alt = '';
			img.decoding = 'async';
			box.appendChild(img);
		} else {
			box.textContent = 'ℹ️';
		}
		const iconEl = box;
		title.appendChild(box);

		// Info click affordance (delegated to portal via chromeCtx.onInfoRequest)
		if (iconEl && chromeCtx) {
			iconEl.classList.add('is-interactive');
			iconEl.title = 'Info';
			iconEl.addEventListener('click', (e) => {
				e.stopPropagation();
				const fn = chromeCtx.onInfoRequest;
				if (typeof fn === 'function') {
					try {
						fn();
					} catch (_) {
						// best-effort; swallow UI errors
					}
				}
			});
		}

		// Title text
		title.append(document.createTextNode(descriptor.label || name));

		// Optional tiny chips container; Portal still populates chips for now.
		const chipsSpan = document.createElement('span');
		chipsSpan.className = 'g-chips';
		title.appendChild(chipsSpan);

		// ---------- state helpers (purely visual; persistence via chromeCtx.onStateChange) ----------

		let collapsed  = !!(chromeCtx.initialState && chromeCtx.initialState.collapsed);
		let wide       = !!(chromeCtx.initialState && chromeCtx.initialState.wide);
		let fullscreen = !!(chromeCtx.initialState && chromeCtx.initialState.fullscreen);
		const hasExplicitState = !!(chromeCtx.initialState && chromeCtx.initialState.hasExplicitState);

		function persist(partial) {
			if (chromeCtx.onStateChange) {
				try { chromeCtx.onStateChange(partial); } catch (_) {}
			}
		}

		function setCollapsed(isCollapsed) {
			collapsed = !!isCollapsed;
			slot.classList.toggle('g-minimized', collapsed);
			persist({ collapsed });
		}

		function setFullWidth(isWide) {
			wide = !!isWide;
			slot.classList.toggle('g-spanwide', wide);
			persist({ wide });
		}

		function setFullscreen(isFs) {
			fullscreen = !!isFs;
			slot.classList.toggle('g-maximized', fullscreen);
			if (fullscreen) slot.classList.remove('g-minimized');
			persist({ fullscreen });
		}

		// ---------- header-specific chrome (theme + safe reset) ----------

		if (isHeader) {
			const ver = chromeCtx.verString || (window.VIZINT_VERSION || '$VER: #---');
			const verSpan = document.createElement('span');
			verSpan.className = 'vizint-ver muted';
			verSpan.textContent = `· ${ver}`;
			title.appendChild(verSpan);

			// 🗑️ Clear all gadget settings
			const btnTrash = document.createElement('button');
			btnTrash.className = 'gbtn g-trash';
			btnTrash.title = 'Clear all gadget settings';
			btnTrash.textContent = '🗑️';
			btnTrash.addEventListener('click', () => {
				if (confirm('Are you sure you want to clear all settings?')) {
					if (chromeCtx.onSafeReset) {
						try { chromeCtx.onSafeReset(); } catch (_) {}
					}
				}
			});
			act.prepend(btnTrash);

			// Theme toggle 🌞 / 🌜
			const btnTheme = document.createElement('button');
			btnTheme.className = 'gbtn g-theme';
			btnTheme.title = 'Toggle dark / light mode';
			btnTheme.textContent = document.body.classList.contains('dark') ? '🌞' : '🌜';
			btnTheme.addEventListener('click', () => {
				if (chromeCtx.onThemeToggle) {
					try { chromeCtx.onThemeToggle(); } catch (_) {}
				}
				btnTheme.textContent = document.body.classList.contains('dark') ? '🌞' : '🌜';
			});
			window.addEventListener('theme:changed', (e) => {
				btnTheme.textContent = e.detail.theme === 'dark' ? '🌞' : '🌜';
			});
			act.prepend(btnTheme);
		}

		// ---------- window controls (folded hub vs inline) ----------

		const folded = !!chromeCtx.isFoldedHubControls;

		if (folded) {
			const btnHub = document.createElement('button');
			btnHub.className = 'gbtn g-hub';
			btnHub.title = 'Window controls';
			btnHub.textContent = '💠';

			let hubOpen = false;
			let hubBtns = null;

			function openHub() {
				const bCollapse = document.createElement('button');
				bCollapse.className = 'gbtn';
				bCollapse.title = 'Minimize / Restore';
				bCollapse.textContent = '▁';
				bCollapse.addEventListener('click', (e) => {
					e.stopPropagation();
					setCollapsed(!collapsed);
				});

				const bWide = document.createElement('button');
				bWide.className = 'gbtn';
				bWide.title = 'Toggle Full Width';
				bWide.textContent = '⟷';
				bWide.addEventListener('click', (e) => {
					e.stopPropagation();
					setFullWidth(!wide);
				});

				const bFs = document.createElement('button');
				bFs.className = 'gbtn';
				bFs.title = 'Toggle Fullscreen';
				bFs.textContent = '▢';
				bFs.addEventListener('click', (e) => {
					e.stopPropagation();
					setFullscreen(!fullscreen);
				});

				hubBtns = [bCollapse, bWide, bFs];
				const nextSibling = btnHub.nextSibling;
				for (const b of hubBtns) act.insertBefore(b, nextSibling);
				hubOpen = true;
			}

			function closeHub() {
				if (!hubBtns) return;
				for (const b of hubBtns) {
					try { b.remove(); } catch {}
				}
				hubBtns = null;
				hubOpen = false;
			}

			btnHub.addEventListener('click', (e) => {
				e.stopPropagation();
				if (hubOpen) closeHub();
				else openHub();
			});
			bar.addEventListener('click', () => {
				if (hubOpen) closeHub();
			}, { capture: true });

			act.append(btnHub);
		} else {
			const bCollapse = document.createElement('button');
			bCollapse.className = 'gbtn';
			bCollapse.title = 'Minimize / Restore';
			bCollapse.textContent = '▁';
			bCollapse.addEventListener('click', () => setCollapsed(!collapsed));

			const bWide = document.createElement('button');
			bWide.className = 'gbtn';
			bWide.title = 'Toggle Full Width';
			bWide.textContent = '⟷';
			bWide.addEventListener('click', () => setFullWidth(!wide));

			const bFs = document.createElement('button');
			bFs.className = 'gbtn';
			bFs.title = 'Toggle Fullscreen';
			bFs.textContent = '▢';
			bFs.addEventListener('click', () => setFullscreen(!fullscreen));

			act.append(bCollapse, bWide, bFs);
		}

		// ✕ close (disabled for system gadgets)
		const btnClose = document.createElement('button');
		btnClose.className = 'gbtn g-close';
		btnClose.title = 'Close';
		btnClose.textContent = '✕';
		if (!descriptor.canClose) {
			btnClose.disabled = true;
			if (descriptor.disableCloseReason) {
				btnClose.title = descriptor.disableCloseReason;
			}
		} else {
			btnClose.addEventListener('click', () => {
				if (chromeCtx.onClose) {
					try { chromeCtx.onClose(); } catch (_) {}
				}
			});
		}

		act.append(btnClose);
		bar.append(title, act);

		const body = document.createElement('div');
		body.className = 'g-body';

		slot.append(bar, body);

		// Apply bidi from descriptor
		const bidi = (descriptor && descriptor.bidi) || 'ltr';
		slot.setAttribute('dir', bidi);
		slot.classList.toggle('g-ltr', bidi === 'ltr');

		// --- Settings gear (Phase-1) ---
		if (descriptor && descriptor.showSettingsGear && typeof chromeCtx.onSettingsRequested === 'function') {
			const btnSettings = document.createElement('button');
			btnSettings.className = 'gbtn g-settings';
			btnSettings.type = 'button';
			btnSettings.title = 'Settings';
			btnSettings.setAttribute('aria-label', 'Open settings');
			btnSettings.textContent = '⚙️';

			btnSettings.addEventListener('click', () => {
                try {
					chromeCtx.onSettingsRequested();
				} catch (err) {
					console.error('[PortalChrome] onSettingsRequested handler threw:', err);
				}
			});

			// Insert at the *front* of the actions row so the gear appears first
			const first = act.firstChild;
			if (first) act.insertBefore(btnSettings, first);
			else act.appendChild(btnSettings);
		}

		// Initial visual state
		if (wide)       setFullWidth(true);
		if (fullscreen) setFullscreen(true);
		if (collapsed)  setCollapsed(true);

		if (!hasExplicitState) {
			if (isHeader) {
				setFullWidth(true);
				setCollapsed(true);
			}
		}

		return { slot, body, iconEl, chipsSpan };
	}

	/**
	 * Modal shell factory for header/settings modal (no gadget logic).
	 *
	 * Portal is responsible for:
	 * - Appending overlayEl to document.body
	 * - Mounting/unmounting the Settings gadget into bodyEl
	 * - Tracking open/closed state (for gear-toggle semantics)
	 *
	 * chrome.js is responsible for:
	 * - Visual shell (overlay/panel/body/close button)
	 * - ESC handling (closes modal, does NOT close gadgets)
	 * - Not closing on click-away
	 */
	function createSettingsModalShell(chromeCtx) {
		chromeCtx = chromeCtx || {};

		const doc = document;

		// --- Overlay ---
		const overlayEl = doc.createElement('div');
		overlayEl.className = 'vi-modal-overlay';
		overlayEl.setAttribute('role', 'dialog');
		overlayEl.setAttribute('aria-modal', 'true');

		// Optional direction hint (defaults to ltr)
		const dir = chromeCtx.bidi || 'ltr';
		overlayEl.setAttribute('dir', dir);

		// --- Panel ---
		const panelEl = doc.createElement('div');
		panelEl.className = 'vi-modal-panel';

		// --- Header ---
		const headerEl = doc.createElement('div');
		headerEl.className = 'vi-modal-header';

		const titleEl = doc.createElement('div');
		titleEl.className = 'vi-modal-title';
		titleEl.textContent = chromeCtx.title || 'Settings';
		headerEl.appendChild(titleEl);

		const btnClose = doc.createElement('button');
		btnClose.type = 'button';
		btnClose.className = 'vi-modal-close';
		btnClose.setAttribute('aria-label', 'Close settings');
		btnClose.title = 'Close settings';
		btnClose.textContent = '✕';
		headerEl.appendChild(btnClose);

		// --- Body (mount target for Settings gadget) ---
		const bodyEl = doc.createElement('div');
		bodyEl.className = 'vi-modal-body';

		panelEl.appendChild(headerEl);
		panelEl.appendChild(bodyEl);
		overlayEl.appendChild(panelEl);

		// --- Close wiring ---
		let closed = false;

		function invokeOnModalClosed(reason) {
			if (typeof chromeCtx.onModalClosed === 'function') {
				try {
					chromeCtx.onModalClosed({ reason: reason || 'programmatic' });
				} catch (err) {
					console.error('[PortalChrome] onModalClosed handler threw:', err);
				}
			}
		}

		function doClose(reason) {
			if (closed) return;
			closed = true;

			// Remove listeners
			doc.removeEventListener('keydown', onKeyDown, true);

			// Remove overlay from DOM (Portal might have appended it)
			try {
				overlayEl.remove();
			} catch (_) {}

			invokeOnModalClosed(reason || 'programmatic');
		}

		function onKeyDown(ev) {
			// ESC must close modal, never gadgets; must not leak to underlying layers
			if (ev.key === 'Escape' || ev.key === 'Esc') {
				ev.stopPropagation();
				ev.preventDefault();
				doClose('esc');
			}
		}

		// ESC closes modal, never gadgets
		doc.addEventListener('keydown', onKeyDown, true);

		// Click-away: do NOT close modal, but swallow overlay clicks
		overlayEl.addEventListener('click', function (ev) {
			if (ev.target === overlayEl) {
				ev.stopPropagation();
			}
		});

		// Keep clicks inside panel from bubbling to overlay
		panelEl.addEventListener('click', function (ev) {
			ev.stopPropagation();
		});

		// Close button → close modal (NOT gadgets)
		btnClose.addEventListener('click', function (ev) {
			ev.preventDefault();
			ev.stopPropagation();
			doClose('close-button');
		});

		// IMPORTANT: we do NOT append overlayEl to document.body here.
		// Portal will do: document.body.appendChild(overlayEl);

		return {
			overlayEl,
			panelEl,
			bodyEl,
			close: function () {
				doClose('programmatic');
			}
		};
	}


	window.PortalChrome = {
		createGadgetChrome,
		createSettingsModalShell
	};

	// Ensure PortalChrome namespace exists
	//window.PortalChrome = window.PortalChrome || {};


})();
