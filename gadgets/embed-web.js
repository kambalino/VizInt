(function () {
	const GID = 'EmbedWeb';

	// --- VizInt v1.0 manifest (per your schema) ---
	const manifest = {
		_api: "1.0",
		_class: "EmbedWeb",
		_type: "singleton",
		_id: "EmbedWeb",
		_ver: "v0.3.2", // bump per #code:versioning (adjust if your pipeline says otherwise)
		label: "Embed Web",
		iconEmoji: "🌐",
		capabilities: ["network"],
		description:
			"Embed external web content via <iframe>. Hover the very top edge to reveal a tiny toolbar (✏️ Edit / 🔄 Refresh / 🔗 Open).",
	};

	window.GADGETS = window.GADGETS || {};
	window.GADGETS[GID] = {
		manifest,
		info: manifest.description,
		mount,
		unmount,
		onInfoClick
	};

	function mount(root, ctx) {
		// --- settings helper: { url, bufferPx } ---
		const S = (() => {
			const read = () =>
				(ctx && typeof ctx.getSettings === "function")
					? (ctx.getSettings() || {})
					: (root.__settings || {});
			const write = (next) => {
				if (ctx && typeof ctx.setSettings === "function") ctx.setSettings(next);
				else root.__settings = next;
			};
			return {
				get() { return read(); },
				set(partial) { write({ ...read(), ...partial }); },
			};
		})();

		// --- DOM scaffold ---
		root.innerHTML = "";
		root.classList.add("vi-embedweb");

		const css = document.createElement("style");
		css.textContent = `
			.vi-embedweb { position: relative; display: flex; flex-direction: column; }

			/* BLANK mode hides iframe panel entirely, only shows instructions */
			.vi-embedweb.blank .vi-ew-body { display: none; }
			.vi-embedweb.blank .vi-ew-hint { display: block; }

			/* Handle bar (slightly taller, larger hit-zone; pushes content when expanded) */
			.vi-ew-handle {
				height: 5px;
				background: rgba(0,0,0,.12);
				position: relative;
				overflow: hidden;
				transition: height .15s ease;
				z-index: 3;
			}
			/* Invisible hover/click zone to survive zoom quirks */
			.vi-ew-handle::before {
				content: "";
				position: absolute;
				left: 0; right: 0; top: 0;
				height: 14px;
				background: transparent;
				pointer-events: auto;
			}
			.vi-ew-handle.expanded {
				height: 32px; /* a bit taller than before */
				background: rgba(255,255,255,.96);
				border-bottom: 1px solid rgba(0,0,0,.12);
			}

			/* Micro-toolbar centered inside the handle bar */
			.vi-ew-tools {
				position: absolute; left: 50%; top: 50%;
				transform: translate(-50%, -50%);
				display: flex; gap: 6px; align-items: center;
				opacity: 0; pointer-events: none;
				transition: opacity .12s ease;
				z-index: 4; /* sits above iframe/body */
			}
			.vi-ew-handle.expanded .vi-ew-tools {
				opacity: 1; pointer-events: auto;
			}
			.vi-ew-toolbtn {
				border: 0; background: transparent; cursor: pointer;
				padding: 2px 6px; font-size: 12px; border-radius: 6px;
			}
			.vi-ew-toolbtn:hover { background: rgba(0,0,0,.06); }

			/* Popover: URL + buffer dropdown */
			.vi-ew-pop {
				position: absolute; z-index: 20; top: 10px; left: 10px;
				display: none; padding: 6px; border: 1px solid #ccc; border-radius: 6px;
				background: var(--vi-panel, #fff); box-shadow: 0 2px 8px rgba(0,0,0,.15);
				font-size: 12px;
			}
			.vi-ew-pop.show { display: block; }
			.vi-ew-pop form { display: flex; flex-direction: column; gap: 4px; }

			.vi-ew-input {
				width: 360px; max-width: 62vw; height: 24px; padding: 0 6px;
				border: 1px solid #ccc; border-radius: 4px; font-size: 12px;
			}
			.vi-ew-row {
				display: flex; align-items: center; gap: 4px;
			}
			.vi-ew-row label { white-space: nowrap; }
			.vi-ew-buffer-select {
				height: 22px;
				font-size: 12px;
			}

			/* Iframe panel; extra whitespace buffer is applied as margin-top on this */
			.vi-ew-body { position: relative; z-index: 1; }
			.vi-ew-iframe {
				width: 100%; height: 480px; border: 0; display: block;
				background: #fff; position: relative; z-index: 1;
			}
			/* While tools are open, prevent iframe from eating pointer events */
			.vi-embedweb.tools-open .vi-ew-iframe {
				pointer-events: none;
			}

			/* Compact inline error */
			.vi-ew-error {
				position: absolute; top: 8px; right: 8px; z-index: 5;
				font-size: 12px; background: #fff7f7; color: #a40000;
				border: 1px solid #f0b3b3; border-radius: 6px; padding: 6px 8px;
				display: none; gap: 8px; align-items: center;
			}
			.vi-ew-error.show { display: inline-flex; }
			.vi-ew-errlink { text-decoration: underline; cursor: pointer; }

			/* Minimal instructions when blank (no giant white panel) */
			.vi-ew-hint {
				display: none;
				font-size: 12px; color: #555; padding: 8px 6px;
			}
	`;
		root.appendChild(css);

		// Handle bar + centered toolbar
		const handle = el("div", "vi-ew-handle");
		const tools = el("div", "vi-ew-tools");
		const tEdit = btn("✏️", "Edit URL & buffer");
		const tRefresh = btn("🔄", "Refresh");
		const tOpen = btn("🔗", "Open in new tab");
		tools.append(tEdit, tRefresh, tOpen);
		handle.appendChild(tools);

		// Popover: URL + buffer dropdown
		const pop = el("div", "vi-ew-pop");
		const form = el("form");

		const urlInput = el("input", "vi-ew-input", {
			type: "text",
			placeholder: "Paste a URL (http/https/file) and press Enter",
		});

		const settingsRow = el("div", "vi-ew-row");
		const bufferLabel = el("label", "", null, "Toolbar buffer:");
		const bufferSelect = el("select", "vi-ew-buffer-select");
		[0, 3, 5, 8, 10, 15].forEach((v) => {
			const opt = document.createElement("option");
			opt.value = String(v);
			opt.textContent = v + " px";
			bufferSelect.appendChild(opt);
		});
		settingsRow.append(bufferLabel, bufferSelect);

		const buttonsRow = el("div", "vi-ew-row");
		const bSave = btn("Save", "Save URL & buffer");
		bSave.type = "submit";
		const bCancel = btn("Cancel", "Cancel");
		bCancel.type = "button";
		buttonsRow.append(bSave, bCancel);

		form.append(urlInput, settingsRow, buttonsRow);
		pop.appendChild(form);

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

		const hint = el("div", "vi-ew-hint", null,
			"No URL saved. Hover the very top edge to reveal the tiny toolbar, then click ✏️ to set one. Example: https://example.com or file:///C:/path/to/local.html"
		);

		root.append(handle, pop, body, hint);

		// --- expand/collapse helpers ---
		let collapseTimer = null;

		const isExpanded = () => handle.classList.contains("expanded");

		// apply buffer whitespace (uses gadget settings)
		const applyBuffer = () => {
			const s = S.get() || {};
			const buf = typeof s.bufferPx === "number" ? s.bufferPx : 5;
			bufferSelect.value = String(buf);
			body.style.marginTop = buf ? buf + "px" : "0px";
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

		// expose control API for onInfoClick
		root.__api = { toggleBar };

		// Hover & click behaviour
		handle.addEventListener("mouseenter", expand);
		handle.addEventListener("mouseleave", () => collapseSoon(2000));
		tools.addEventListener("mouseenter", expand);
		tools.addEventListener("mouseleave", () => collapseSoon(2000));
		handle.addEventListener("click", (e) => {
			if (e.target.closest(".vi-ew-tools")) return;
			toggleBar(true); // explicit click → stay open
		});

		// Popover interactions
		tEdit.addEventListener("click", () => {
			const s = S.get() || {};
			urlInput.value = s.url || "";
			const buf = typeof s.bufferPx === "number" ? s.bufferPx : 5;
			bufferSelect.value = String(buf);
			pop.classList.add("show");
			setTimeout(() => urlInput.focus(), 0);
		});
		bCancel.addEventListener("click", () => pop.classList.remove("show"));

		form.addEventListener("submit", (e) => {
			e.preventDefault();
			const url = (urlInput.value || "").trim();
			const bufferPx = parseInt(bufferSelect.value, 10) || 0;
			S.set({ url, bufferPx });
			pop.classList.remove("show");
			applyBuffer();
			render(url);
		});

		// Refresh / open / error link
		tRefresh.addEventListener("click", () => {
			const url = (S.get().url || "").trim();
			if (url) {
				iframe.src = "";
				requestAnimationFrame(() => { iframe.src = url; });
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

		// Initial render + buffer application
		const initial = S.get() || {};
		applyBuffer();
		render(initial.url || "");

		// --- helpers inside mount ---
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

		function showError() { errorChip.classList.add("show"); }
		function hideError() { errorChip.classList.remove("show"); }

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

		// per-instance teardown with timer cleanup
		root.__vi_unmount = () => {
			try { clearTimeout(collapseTimer); } catch {}
			try { delete root.__api; } catch {}
			root.innerHTML = "";
			delete root.__vi_unmount;
		};
	}

	// global unmount simply delegates
	function unmount(root) {
		if (root && root.__vi_unmount) root.__vi_unmount();
	}

	// Title-bar icon click → open/close toolbar
	function onInfoClick(ctx, { body }) {
		try {
			body && body.__api && typeof body.__api.toggleBar === "function" && body.__api.toggleBar(true);
		} catch (e) {
			// if this fails, loader will show legacy Info dialog instead
		}
	}
})();
