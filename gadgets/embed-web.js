/*
 *
 *  $VER: EmbedWeb 1.2.3
 * 
 *  ///! MERGE HISTORIES BELOW
 * 
 *  $HISTORY:
 *  	2025/12/10 1.2.3	Settings gear now delegates to the ✏️ inline popover; second gear-click closes it; pruned legacy settings-shell code (U:Fx)
 *  	2025/11/30 1.2.2	Restored ✏️ popover editor + debug checkbox alongside Settings; popover submit now updates settings + live instance (U:Fx)
 *  	2025/11/30 1.2.1	Converted to multi-instance gadget, v1.2 manifest, Settings-driven URL config (U:Fx)
 *  	2025/10/01 0.3.6	Debug checkbox in popover; debugColors persisted in settings (U:Vz)
 * 
 * 	// --- History ---------------------------------------------------------
	// v0.3.0  Basic Embed Web gadget (URL + iframe).
	// v0.3.2  Added buffer margin + toolbar refinements.
	// v0.3.3  Introduced debug rainbow colors + zoom diagnostics.
	// v0.3.4  Flex + min-height fix to stop handle collapsing at high zoom.
	// v0.3.5  Clean build: subtle colors, slimmer chrome, optional debug mode.
	// v0.3.6  Debug checkbox in popover; debugColors persisted in settings.
 *
 */

(function () {
	// ---------------------------------------------------------------------
	// Defaults & helpers
	// ---------------------------------------------------------------------

	// Default for new instances; settings.debugColors overrides this.
	const DEBUG_COLORS = false;

	function createSettingsAdapter(ctx, fallbackRoot) {
		const read = () => {
			if (ctx && typeof ctx.getSettings === "function") {
				return ctx.getSettings() || {};
			}
			if (fallbackRoot && fallbackRoot.__settings) {
				return fallbackRoot.__settings;
			}
			return {};
		};
		const write = (next) => {
			if (ctx && typeof ctx.setSettings === "function") {
				ctx.setSettings(next);
			} else if (fallbackRoot) {
				fallbackRoot.__settings = next;
			}
		};
		return {
			get() {
				return read();
			},
			set(partial) {
				const current = read();
				write({ ...current, ...partial });
			},
		};
	}

	// ---------------------------------------------------------------------
	// VizInt v1.2.x Gadget Manifest (API 1.0)
	// ---------------------------------------------------------------------

	const manifest = {
		_api: "1.0",
		_class: "EmbedWeb",          // canonical class identity (Portal will normalize)
		_type: "multi",              // multi-instance gadget
		_id: "default",              // internal variant id (kept simple for now)
		_ver: "v1.2.3",
		label: "Custom Embed",
		iconEmoji: "🌐",
		description:
			"Embed external web content via <iframe>. Configure the URL via the gadget’s Settings (gear) or the inline ✏️ popover. Hover the very top edge to reveal a tiny toolbar (✏️ Edit / 🔄 Refresh / 🔗 Open); multiple instances are supported.",
		capabilities: ["network"],
		supportsSettings: true,
		// badges: [] // (optional; Portal will derive badges from capabilities)
	};

	// ---------------------------------------------------------------------
	// Registration under manifest._class (Portal will re-key by normalized classId)
	// ---------------------------------------------------------------------

	window.GADGETS = window.GADGETS || {};
	window.GADGETS[manifest._class] = {
		manifest,
		info: manifest.description,
		mount,
		unmount,
		onInfoClick,
		onSettingsRequested,
	};

	// ---------------------------------------------------------------------
	// mount / unmount
	// ---------------------------------------------------------------------

	function mount(root, ctx) {
		const S = createSettingsAdapter(ctx, root);

		root.innerHTML = "";
		root.classList.add("vi-embedweb");

		const css = document.createElement("style");
		css.textContent = `
			.vi-embedweb { position: relative; display: flex; flex-direction: column; }

			/* BLANK mode hides iframe panel entirely, only shows instructions */
			.vi-embedweb.blank .vi-ew-body { display: none; }
			.vi-embedweb.blank .vi-ew-hint { display: block; }

			/* Handle bar: skinny, with slightly larger hit-zone; pushes content when expanded */
			.vi-ew-handle {
				height: 4px;
				background: rgba(0,0,0,.10);
				position: relative;
				overflow: hidden;
				transition: height .14s ease;
				z-index: 3;
				flex: 0 0 auto; /* prevent flex from shrinking below its height */
			}
			/* Invisible hover/click zone to survive zoom quirks */
			.vi-ew-handle::before {
				content: "";
				position: absolute;
				left: 0; right: 0; top: 0;
				height: 10px;
				background: transparent;
				pointer-events: auto;
			}
			.vi-ew-handle.expanded {
				height: 24px;         /* slimmer than debug build */
				min-height: 18px;     /* still large enough not to collapse */
				background: rgba(255,255,255,.96);
				border-bottom: 1px solid rgba(0,0,0,.10);
			}

			/* Micro-toolbar centered inside the handle bar */
			.vi-ew-tools {
				position: absolute; left: 50%; top: 50%;
				transform: translate(-50%, -50%);
				display: flex; gap: 4px; align-items: center;
				opacity: 0; pointer-events: none;
				transition: opacity .12s ease;
				z-index: 4; /* sits above iframe/body */
				background: rgba(0,0,0,0.02);
				padding: 1px 4px;
				border-radius: 6px;
			}
			.vi-ew-handle.expanded .vi-ew-tools {
				opacity: 1; pointer-events: auto;
			}
			.vi-ew-toolbtn {
				border: 0; background: transparent; cursor: pointer;
				padding: 1px 4px; font-size: 11px; border-radius: 4px;
				color: inherit;
			}
			.vi-ew-toolbtn:hover { background: rgba(0,0,0,.06); }

			/* Inline popover for quick edit (✏️) */
			.vi-ew-pop {
				position: absolute;
				top: 6px;
				left: 50%;
				transform: translateX(-50%);
				z-index: 10;
				background: #fff;
				border-radius: 8px;
				box-shadow: 0 2px 8px rgba(0,0,0,.15);
				padding: 6px 8px;
				font-size: 11px;
				display: none;
				min-width: 240px;
			}
			.vi-ew-pop.show {
				display: block;
			}
			.vi-ew-pop form {
				display: flex;
				flex-direction: column;
				gap: 4px;
			}
			.vi-ew-pop label {
				font-size: 11px;
			}
			.vi-ew-pop input[type="text"],
			.vi-ew-pop select {
				font-size: 11px;
				width: 100%;
				box-sizing: border-box;
			}
			.vi-ew-pop .vi-ew-pop-buttons {
				display: flex;
				justify-content: flex-end;
				gap: 4px;
				margin-top: 4px;
			}

			/* Iframe panel; extra whitespace buffer is applied as margin-top on this */
			.vi-ew-body { position: relative; z-index: 1; }
			.vi-ew-iframe {
				width: 100%; height: 460px; border: 0; display: block;
				background: #fff; position: relative; z-index: 1;
			}
			/* While tools are open (e.g., during hover/popover), prevent iframe from eating pointer events */
			.vi-embedweb.tools-open .vi-ew-iframe {
				pointer-events: none;
			}

			/* Compact inline error */
			.vi-ew-error {
				position: absolute; top: 8px; right: 8px; z-index: 5;
				font-size: 11px; background: #fff7f7; color: #a40000;
				border: 1px solid #f0b3b3; border-radius: 6px; padding: 4px 6px;
				display: none; gap: 6px; align-items: center;
			}
			.vi-ew-error.show { display: inline-flex; }
			.vi-ew-errlink { text-decoration: underline; cursor: pointer; }

			/* Minimal instructions when blank (no giant white panel) */
			.vi-ew-hint {
				display: none;
				font-size: 12px; color: #555; padding: 8px 6px;
			}

			/* Debug rainbow mode (opt-in via Settings or popover) */
			.vi-embedweb.debug .vi-ew-handle {
				background: red !important;
			}
			.vi-embedweb.debug .vi-ew-handle.expanded {
				background: orange !important;
			}
			.vi-embedweb.debug .vi-ew-tools {
				background: rgba(0,0,255,0.3) !important;
			}
			.vi-embedweb.debug .vi-ew-body {
				background: rgba(0,255,0,0.08) !important;
			}
		`;
		root.appendChild(css);

		let collapseTimer = null;
		let pop = null;

		const isExpanded = () => handle.classList.contains("expanded");

		const applyBuffer = () => {
			const s = S.get() || {};
			const buf = typeof s.bufferPx === "number" ? s.bufferPx : 3; // slightly slimmer default
			body.style.marginTop = buf ? buf + "px" : "0px";
		};

		const applyDebug = () => {
			const s = S.get() || {};
			const saved = typeof s.debugColors === "boolean" ? s.debugColors : undefined;
			const dbg = saved !== undefined ? saved : DEBUG_COLORS;
			if (dbg) root.classList.add("debug");
			else root.classList.remove("debug");
		};

		const expand = () => {
			clearTimeout(collapseTimer);
			handle.classList.add("expanded");
			root.classList.add("tools-open");
		};

		const collapseNow = () => {
			clearTimeout(collapseTimer);
			handle.classList.remove("expanded");
			root.classList.remove("tools-open");
		};

		const collapseSoon = (ms = 2000) => {
			clearTimeout(collapseTimer);
			collapseTimer = setTimeout(() => {
				handle.classList.remove("expanded");
				root.classList.remove("tools-open");
			}, ms);
		};

		const toggleBar = (persistOpen = false) => {
			if (isExpanded()) {
				collapseNow();
			} else {
				expand();
				if (!persistOpen) collapseSoon(2000);
			}
		};

		// Forward-declared so the ✏️ handler + settings gear can call it
		function showPopover() {
			if (!pop) return;
			pop.classList.add("show");
			expand();
		}
		function hidePopover() {
			if (!pop) return;
			pop.classList.remove("show");
		}
		function togglePopover() {
			if (!pop) return;
			if (pop.classList.contains("show")) {
				hidePopover();
			} else {
				showPopover();
			}
		}

		// Handle bar + centered toolbar (now ✏️ / Refresh / Open)
		const handle = el("div", "vi-ew-handle");
		const tools = el("div", "vi-ew-tools");
		const tEdit = btn("✏️", "Edit URL / options");
		const tRefresh = btn("🔄", "Refresh");
		const tOpen = btn("🔗", "Open in new tab");
		tools.append(tEdit, tRefresh, tOpen);
		handle.appendChild(tools);

		// Iframe body + error chip
		const body = el("div", "vi-ew-body");
		const iframe = el("iframe", "vi-ew-iframe", {
			sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox",
		});
		const errorChip = el("div", "vi-ew-error");
		errorChip.append(
			el("span", "", null, "This site may block embedding."),
			el("span", "vi-ew-errlink", null, "Open in new tab")
		);
		body.append(iframe, errorChip);

		const hint = el(
			"div",
			"vi-ew-hint",
			null,
			"No URL saved. Use the gadget’s Settings (gear icon) or the inline ✏️ popover to configure an embed URL. Example: https://example.com or file:///C:/path/to/local.html"
		);

		root.append(handle, body, hint);

		// --- hover & click behaviour for handle/tools --- //
		handle.addEventListener("mouseenter", expand);
		handle.addEventListener("mouseleave", () => collapseSoon(2000));
		tools.addEventListener("mouseenter", expand);
		tools.addEventListener("mouseleave", () => collapseSoon(2000));
		handle.addEventListener("click", (e) => {
			if (e.target.closest(".vi-ew-tools")) return;
			toggleBar(true); // explicit click → stay open
		});

		// Refresh / open / error link
		tRefresh.addEventListener("click", () => {
			const url = (S.get().url || "").trim();
			if (url) {
				iframe.src = "";
				requestAnimationFrame(() => {
					iframe.src = url;
				});
			}
		});

		tOpen.addEventListener("click", () => {
			const url = (S.get().url || "").trim();
			if (url) window.open(url, "_blank", "noopener");
		});

		errorChip.querySelector(".vi-ew-errlink").addEventListener("click", () => tOpen.click());

		// Iframe best-effort error indicator
		iframe.addEventListener("load", () => {
			hideError();
			try {
				const doc = iframe.contentDocument;
				if (doc && doc.body && !doc.body.childElementCount && !doc.body.textContent.trim()) {
					showError();
				}
			} catch {
				const r = iframe.getBoundingClientRect();
				if (r.height < 16) showError();
			}
		});

		// Initial render + buffer + debug application
		const initial = S.get() || {};
		applyBuffer();
		applyDebug();
		render(initial.url || "");

		// -----------------------------------------------------------------
		// Inline popover editor (✏️) — URL / buffer / debug
		// -----------------------------------------------------------------

		pop = el("div", "vi-ew-pop");
		const popForm = document.createElement("form");

		const popUrlRow = document.createElement("div");
		const popUrlLabel = document.createElement("label");
		popUrlLabel.textContent = "Embed URL";
		const popUrlInput = document.createElement("input");
		popUrlInput.type = "text";
		popUrlInput.value = initial.url || "";
		popUrlInput.placeholder = "https://example.com or file:///C:/path/to/local.html";
		popUrlRow.appendChild(popUrlLabel);
		popUrlRow.appendChild(popUrlInput);

		const popBufferRow = document.createElement("div");
		const popBufferLabel = document.createElement("label");
		popBufferLabel.textContent = "Toolbar buffer (px)";
		const popBufferSelect = document.createElement("select");
		[0, 2, 4, 6, 8, 12].forEach((v) => {
			const opt = document.createElement("option");
			opt.value = String(v);
			opt.textContent = v + " px";
			popBufferSelect.appendChild(opt);
		});
		const initialBuf = typeof initial.bufferPx === "number" ? initial.bufferPx : 3;
		popBufferSelect.value = String(initialBuf);
		popBufferRow.appendChild(popBufferLabel);
		popBufferRow.appendChild(popBufferSelect);

		const popDebugRow = document.createElement("div");
		const popDebugChk = document.createElement("input");
		popDebugChk.type = "checkbox";
		popDebugChk.id = "vi-ew-debug-toggle-popover";
		popDebugChk.checked =
			typeof initial.debugColors === "boolean"
				? initial.debugColors
				: DEBUG_COLORS;
		const popDebugLabel = document.createElement("label");
		popDebugLabel.textContent = "Debug colors (rainbow)";
		popDebugLabel.htmlFor = popDebugChk.id;
		popDebugRow.appendChild(popDebugChk);
		popDebugRow.appendChild(popDebugLabel);

		const popButtonsRow = document.createElement("div");
		popButtonsRow.className = "vi-ew-pop-buttons";
		const popSaveBtn = document.createElement("button");
		popSaveBtn.type = "submit";
		popSaveBtn.textContent = "Save";
		const popCancelBtn = document.createElement("button");
		popCancelBtn.type = "button";
		popCancelBtn.textContent = "Cancel";
		popButtonsRow.appendChild(popCancelBtn);
		popButtonsRow.appendChild(popSaveBtn);

		popForm.appendChild(popUrlRow);
		popForm.appendChild(popBufferRow);
		popForm.appendChild(popDebugRow);
		popForm.appendChild(popButtonsRow);

		popForm.addEventListener("submit", (e) => {
			e.preventDefault();
			const url = (popUrlInput.value || "").trim();
			const bufferPx = parseInt(popBufferSelect.value, 10) || 0;
			const debugColors = !!popDebugChk.checked;

			S.set({ url, bufferPx, debugColors });
			applyBuffer();
			applyDebug();
			render(url);
			hidePopover();
			collapseSoon(800);
		});

		popCancelBtn.addEventListener("click", () => {
			hidePopover();
			collapseSoon(800);
		});

		// Keep iframe disabled while popover active (already handled by tools-open)
		pop.addEventListener("mouseenter", expand);
		pop.addEventListener("mouseleave", () => collapseSoon(2000));

		pop.appendChild(popForm);
		root.appendChild(pop);

		// Wire ✏️ button to popover toggle
		tEdit.addEventListener("click", (e) => {
			e.stopPropagation();
			expand();
			togglePopover();
		});

		// --- helpers inside mount --- //
		function render(url) {
			hideError();
			if (!url) {
				root.classList.add("blank");
				iframe.removeAttribute("src");
				return;
			}
			root.classList.remove("blank");
			iframe.src = url;
		}

		function showError() {
			errorChip.classList.add("show");
		}
		function hideError() {
			errorChip.classList.remove("show");
		}

		function el(tag, cls, attrs, text) {
			const x = document.createElement(tag);
			if (cls) x.className = cls;
			if (attrs) for (const k in attrs) x.setAttribute(k, attrs[k]);
			if (text != null) x.textContent = text;
			return x;
		}
		function btn(label, title) {
			const b = el("button", "vi-ew-toolbtn", { type: "button", title });
			b.textContent = label;
			return b;
		}

		// expose a tiny per-instance API for chrome / Info / Settings
		root.__api = {
			toggleBar,
			togglePopover,
			showPopover,
			hidePopover
		};

		// per-instance teardown with timer cleanup
		root.__vi_unmount = () => {
			try {
				clearTimeout(collapseTimer);
			} catch {}
			try {
				delete root.__api;
			} catch {}
			root.innerHTML = "";
			delete root.__vi_unmount;
		};
	}

	// global unmount simply delegates
	function unmount(root) {
		if (root && root.__vi_unmount) root.__vi_unmount();
	}

	// Title-bar icon click → open/close toolbar (if API is present)
	function onInfoClick(ctx, { body }) {
		try {
			if (body && body.__api && typeof body.__api.toggleBar === "function") {
				body.__api.toggleBar(true);
				return;
			}
		} catch (e) {
			// if this fails, loader will show legacy Info dialog instead
		}
	}

	// ---------------------------------------------------------------------
	// Settings Panel (gear icon) — delegate to inline ✏️ popover
	// ---------------------------------------------------------------------

	function onSettingsRequested(ctx, shell = {}) {
		// We do NOT build a separate modal here.
		// Instead, we delegate to the existing inline ✏️ popover
		// so that:
		// - first gear-click opens it
		// - second gear-click closes it
		// - Save/Cancel inside the popover close it and return to the gadget
		const host = (shell && (shell.body || shell.slot)) || null;
		const body = host || null;
		if (!body) return;

		const root =
			(body.closest && body.closest(".vi-embedweb")) ||
			(body.querySelector && body.querySelector(".vi-embedweb")) ||
			null;
		if (!root) return;

		// Prefer the explicit instance API if present
		if (root.__api && typeof root.__api.togglePopover === "function") {
			root.__api.togglePopover();
			return;
		}

		// Fallback: try to click the ✏️ button directly
		const editBtn =
			root.querySelector(".vi-ew-tools .vi-ew-toolbtn") ||
			root.querySelector(".vi-ew-toolbtn");
		if (editBtn) {
			editBtn.click();
		}
	}
})();
