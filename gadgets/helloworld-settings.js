/* helloworld-settings.js
 *
 * Demo gadget for v1.2:
 * - Proper manifest with _api: "1.0"
 * - supportsSettings: true (manifest-first)
 * - onSettingsRequested: in-viewport settings UI (no modal)
 * - onInfoClick: produces/toggles inline help text
 */
// $VER: HelloWorld v1.2.0 (2025-11-29)
// $HISTORY:
// - 2025-11-29: Canonical v1.2 HelloWorld gadget with inline settings + info help (U:Gx)

(function () {
	'use strict';

	// --- Constants ---------------------------------------------------------
	const DEFAULT_MESSAGE = "Hello World";

	// --- Manifest (API 1.0, manifest-first) -------------------------------
	const manifest = {
		_api: "1.0",
		_class: "HelloWorld",   // canonical identity (Portal will normalize)
		_type: "single",
		_id: "default",
		_ver: "v1.2.0",

		label: "Hello World",
		bidi: "ltr",

		supportsSettings: true,
		capabilities: [],

		description: "Demo gadget showing a configurable greeting via the v1.2 settings gear.",
		verBlurb: "Reference Hello World gadget for API 1.0 with settings + info.",
		publisherLabel: "VizInt Core",
		publisherContact: "core@vizint.local"
	};

	// --- Helpers -----------------------------------------------------------
	function getDom(ctx) {
		return ctx && ctx._helloWorld && ctx._helloWorld.dom || null;
	}

	function getMessage(ctx) {
		// Prefer the portal settings wrapper if available
		if (ctx && ctx.settings && typeof ctx.settings.get === "function") {
			return ctx.settings.get("message", DEFAULT_MESSAGE);
		}
		// Fallback: in-memory only (still useful in a harness)
		if (ctx && ctx._helloWorld && typeof ctx._helloWorld.message === "string") {
			return ctx._helloWorld.message;
		}
		return DEFAULT_MESSAGE;
	}

	function setMessage(ctx, value) {
		var next = value;
		if (!next || !next.trim) {
			next = DEFAULT_MESSAGE;
		}
		next = next.trim() || DEFAULT_MESSAGE;

		if (ctx && ctx.settings && typeof ctx.settings.set === "function") {
			ctx.settings.set({ message: next });
		} else {
			ctx._helloWorld = ctx._helloWorld || {};
			ctx._helloWorld.message = next;
		}
	}

	function renderView(ctx) {
		var dom = getDom(ctx);
		if (!dom) return;

		var msg = getMessage(ctx);
		if (dom.messageEl) {
			dom.messageEl.textContent = msg;
		}

		// Hint behavior:
		// - If message is the default → show a small “use ⚙️ to edit” hint.
		// - If message is customized → hide hint unless info is explicitly requested.
		if (dom.hintEl) {
			if (!msg || msg === DEFAULT_MESSAGE) {
				dom.hintEl.textContent = "Use ⚙️ in the titlebar to change this greeting.";
				dom.hintEl.style.display = "block";
			} else {
				dom.hintEl.textContent = "";
				dom.hintEl.style.display = "none";
			}
		}
	}

	function closeSettingsPanel(dom) {
		if (!dom || !dom.settingsEl) return;
		dom.settingsEl.style.display = "none";
		dom.settingsEl.innerHTML = "";
	}

	// --- API: mount -------------------------------------------------------
	function mount(host, ctx) {
		// Canonical pattern: store host on ctx so settings/info can reuse it
		ctx.host = host;

		host.innerHTML = (
			'<div class="vzg-helloworld">' +
				'<div data-role="message" class="hw-message"></div>' +
				'<div data-role="hint" class="hw-hint"></div>' +
				'<div data-role="settings" class="hw-settings" style="display:none;"></div>' +
			'</div>'
		);

		var root = host.firstElementChild;
		var dom = {
			root: root,
			messageEl: root.querySelector('[data-role="message"]'),
			hintEl: root.querySelector('[data-role="hint"]'),
			settingsEl: root.querySelector('[data-role="settings"]')
		};

		ctx._helloWorld = ctx._helloWorld || {};
		ctx._helloWorld.dom = dom;

		// Initial render from settings
		renderView(ctx);

		// Canonical cleanup: unmount returns a disposer for Portal to call
		return function unmount() {
			if (ctx && ctx._helloWorld) {
				ctx._helloWorld.dom = null;
			}
			if (host) {
				host.innerHTML = "";
			}
			if (ctx && ctx.host === host) {
				ctx.host = null;
			}
		};
	}

	// --- API: onSettingsRequested ----------------------------------------
	function onSettingsRequested(ctx, shell) {
		var dom = getDom(ctx);
		if (!dom || !dom.settingsEl) return;

		var settingsEl = dom.settingsEl;
		var current = getMessage(ctx);

		settingsEl.innerHTML = "";
		settingsEl.style.display = "block";

		// Row container keeps everything on one line (subject to CSS)
		var row = document.createElement("div");
		row.className = "hw-settings-row";

		var input = document.createElement("input");
		input.type = "text";
		input.value = current;
		input.className = "hw-input";

		var btnSave = document.createElement("button");
		btnSave.type = "button";
		btnSave.className = "gbtn gbtn-sm";
		btnSave.textContent = "✔"; // keep checkmark per U:Ox preference

		var btnCancel = document.createElement("button");
		btnCancel.type = "button";
		btnCancel.className = "gbtn gbtn-sm";
		btnCancel.textContent = "✖";

		row.appendChild(input);
		row.appendChild(btnSave);
		row.appendChild(btnCancel);
		settingsEl.appendChild(row);

		function doSave() {
			setMessage(ctx, input.value);
			renderView(ctx);
			closeSettingsPanel(dom);
		}

		function doCancel() {
			closeSettingsPanel(dom);
		}

		btnSave.onclick = function () {
			doSave();
		};

		btnCancel.onclick = function () {
			doCancel();
		};

		input.onkeydown = function (ev) {
			if (ev.key === "Enter") {
				ev.preventDefault();
				doSave();
			} else if (ev.key === "Escape") {
				ev.preventDefault();
				doCancel();
			}
		};

		// Focus after render so the user can type immediately
		setTimeout(function () {
			try { input.focus(); } catch (e) {}
		}, 0);
	}

	// --- API: onInfoClick -------------------------------------------------
	function onInfoClick(ctx, shell) {
		var dom = getDom(ctx);
		var hintEl = dom && dom.hintEl;

		// If we have a hint element, use it; otherwise fall back to alert
		if (hintEl) {
			hintEl.textContent =
				"This gadget shows a configurable greeting for this slot. " +
				"Use the ⚙️ button in the titlebar to open settings, edit the message, " +
				"then save with ✔ or cancel with ✖.";
			hintEl.style.display = "block";
		} else {
			alert(
				"This gadget shows a configurable greeting. " +
				"Use the ⚙️ button in the titlebar to open settings, edit the message, " +
				"then save with ✔ or cancel with ✖."
			);
		}
	}

	// --- Global registration (IIFE, API 1.0 style) -----------------------
	window.GADGETS = window.GADGETS || {};
	window.GADGETS[manifest._class] = {
		manifest: manifest,
		mount: mount,
		onSettingsRequested: onSettingsRequested,
		onInfoClick: onInfoClick,
		info: "Hello World demo gadget with per-instance settings."
	};
})();
