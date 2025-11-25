/*
	chrome.js v1.2.0

	HISTORY:
	2025-11-27 (U:UX/U:Portal)
	- Extracted from loader.js buildChrome().
	- chrome.js now owns titlebar/chrome only; no direct storage or ctx.libs access.
*/

(function () {
	'use strict';

	function createGadgetChrome(descriptor, chromeCtx) {
		const name       = descriptor.id;
		const gadgetInfo = descriptor.gadgetInfo || null;
		const isHeader   = !!descriptor.isHeader;
		const dock       = chromeCtx.dock;

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

		// ✕ close (disabled for header/settings)
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
		dock.appendChild(slot);

		// Apply bidi from descriptor
		const bidi = descriptor.bidi || 'ltr';
		slot.setAttribute('dir', bidi);
		slot.classList.toggle('g-ltr', bidi === 'ltr');

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

	window.PortalChrome = {
		createGadgetChrome
	};
})();
