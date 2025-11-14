(function () {
  const GID = 'EmbedWeb'; // align with _id below

  // --- VizInt v1.0 manifest (per your schema) ---
  const manifest = {
    _api: "1.0",
    _class: "EmbedWeb",
    _type: "singleton",
    _id: "EmbedWeb",
    _ver: "v0.3.2",
    label: "Embed Web",
    iconEmoji: "🌐",
    capabilities: ["network"], // URL fetch (paste works offline)
    description:
      "Embed external web content via <iframe>. Hover the very top edge to reveal a tiny toolbar (✏️ Edit / 🔄 Refresh / 🔗 Open).",
  };

  // Register with VizInt
  window.GADGETS = window.GADGETS || {};
  window.GADGETS[GID] = {
    manifest,
    info: manifest.description,
    mount,
    unmount,
	onInfoClick       // <-- new: lets the title-bar icon toggle the toolbar
  };

  function mount(root, ctx) {
    // --- settings helpers ---
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

      /* Handle bar (expands downward to reveal toolbar; pushes content) */
      .vi-ew-handle {
        height: 3px;
        background: rgba(0,0,0,.1);
        position: relative;
        overflow: hidden;
        transition: height .15s ease;
      }
      .vi-ew-handle.expanded {
        height: 28px; /* room for the toolbar */
        background: rgba(255,255,255,.96);
        border-bottom: 1px solid rgba(0,0,0,.1);
      }

      /* Micro-toolbar centered inside the handle bar */
      .vi-ew-tools {
        position: absolute; left: 50%; top: 50%;
        transform: translate(-50%, -50%);
        display: flex; gap: 6px; align-items: center;
        opacity: 0; pointer-events: none;
        transition: opacity .12s ease;
      }
      .vi-ew-handle.expanded .vi-ew-tools {
        opacity: 1; pointer-events: auto;
      }
      .vi-ew-toolbtn {
        border: 0; background: transparent; cursor: pointer;
        padding: 2px 6px; font-size: 12px; border-radius: 6px;
      }
      .vi-ew-toolbtn:hover { background: rgba(0,0,0,.06); }

      /* Inline popover for URL entry (triggered by ✏️ Edit) */
      .vi-ew-pop {
        position: absolute; z-index: 20; top: 10px; left: 10px;
        display: none; padding: 6px; border: 1px solid #ccc; border-radius: 6px;
        background: var(--vi-panel, #fff); box-shadow: 0 2px 8px rgba(0,0,0,.15);
      }
      .vi-ew-pop.show { display: block; }
      .vi-ew-pop form { display: flex; gap: 6px; align-items: center; }
      .vi-ew-input {
        width: 360px; max-width: 62vw; height: 24px; padding: 0 6px;
        border: 1px solid #ccc; border-radius: 4px; font-size: 12px;
      }

      /* Iframe panel (fixed height, per spec) */
      .vi-ew-body { position: relative; }
      .vi-ew-iframe { width: 100%; height: 480px; border: 0; display: block; background: #fff; }

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
    const tEdit = btn("✏️", "Edit URL");
    const tRefresh = btn("🔄", "Refresh");
    const tOpen = btn("🔗", "Open in new tab");
    tools.append(tEdit, tRefresh, tOpen);
    handle.appendChild(tools);

    // Popover for URL (invoked by ✏️)
    const pop = el("div", "vi-ew-pop");
    const form = el("form");
    const input = el("input", "vi-ew-input", { type: "text", placeholder: "Paste a URL (http/https/file) and press Enter" });
    const bSave = btn("Save", "Save URL"); bSave.type = "submit";
    const bCancel = btn("Cancel", "Cancel"); bCancel.type = "button";
    form.append(input, bSave, bCancel);
    pop.appendChild(form);

    // Iframe body + error chip
    const body = el("div", "vi-ew-body");
    const iframe = el("iframe", "vi-ew-iframe", {
      sandbox: "allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
    });
    const errorChip = el("div", "vi-ew-error");
    errorChip.append(
      el("span", "", null, "This site may block embedding."),
      el("span", "vi-ew-errlink", null, "Open in new tab")
    );
    body.append(iframe, errorChip);

    // Blank-state instructions
    const hint = el("div", "vi-ew-hint", null,
      "No URL saved. Hover the very top edge to reveal the tiny toolbar, then click ✏️ to set one. Example: https://example.com or file:///C:/path/to/local.html"
    );

    root.append(handle, pop, body, hint);
// --- Expand/collapse helpers (hover + click + icon-bridge) ---
    let collapseTimer = null;
    const isExpanded = () => handle.classList.contains("expanded");
    const expand = () => {
      clearTimeout(collapseTimer);
      handle.classList.add("expanded");
    };
    const collapseSoon = (ms = 2000) => {
      clearTimeout(collapseTimer);
      collapseTimer = setTimeout(() => handle.classList.remove("expanded"), ms);
    };

    const collapseNow = () => {
      clearTimeout(collapseTimer);
      handle.classList.remove("expanded");
    };
    const toggleBar = (persistOpen = false) => {
      if (isExpanded()) {
        // explicit toggle close
        collapseNow();
      } else {
        expand();
        if (!persistOpen) collapseSoon(2000);
      }
    };

	// Expose a tiny control API so onInfoClick can reach us later
	root.__api = { toggleBar };

    // Hover behavior (unchanged dwell)
    handle.addEventListener("mouseenter", expand);
    handle.addEventListener("mouseleave", () => collapseSoon(2000));
    tools.addEventListener("mouseenter", expand);
    tools.addEventListener("mouseleave", () => collapseSoon(2000));

    // NEW: Click the thin handle to toggle
    handle.addEventListener("click", (e) => {
      // avoid stealing clicks from buttons inside the tools
      if (e.target.closest(".vi-ew-tools")) return;
      toggleBar(true); // explicit user click: stay open until clicked again
    });
	
    // --- Popover actions ---
    tEdit.addEventListener("click", () => {
      input.value = S.get().url || "";
      pop.classList.add("show");
      setTimeout(() => input.focus(), 0);
    });
    bCancel.addEventListener("click", () => pop.classList.remove("show"));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const url = (input.value || "").trim();
      S.set({ url });                // persist
      pop.classList.remove("show");  // close
      render(url);                    // update view immediately
    });

    // --- Other actions ---
    tRefresh.addEventListener("click", () => {
      const url = S.get().url || "";
      if (url) {
        iframe.src = "";
        requestAnimationFrame(() => { iframe.src = url; });
      }
    });
    tOpen.addEventListener("click", () => {
      const url = S.get().url || "";
      if (url) window.open(url, "_blank", "noopener");
    });
    errorChip.querySelector(".vi-ew-errlink").addEventListener("click", () => tOpen.click());

    // --- Iframe best-effort error signal ---
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

    // --- Bridge portal icon → toggle toolbar (support several possible APIs) ---
    try {
      if (ctx && typeof ctx.onIconClick === "function") {
        ctx.onIconClick(() => toggleBar(true));
      } else if (ctx && typeof ctx.on === "function") {
        // event-bus style
        ctx.on("icon", () => toggleBar(true));
      }
    } catch {}
    // Fallback for loaders that call gadget method directly
    try {
      window.GADGETS = window.GADGETS || {};
      if (window.GADGETS.EmbedWeb) {
        window.GADGETS.EmbedWeb.onIconClick = () => toggleBar(true);
      }
    } catch {}

    // Initial render
	render(S.get().url || "");

    // helpers
    function render(url) {
      hideError();
      if (!url) {
        root.classList.add("blank");
        iframe.removeAttribute("src");
        return;
      }
      root.classList.remove("blank");
      iframe.src = url; // allow http/https/file
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

	root.__vi_unmount = () => {
		try { clearTimeout(collapseTimer); } catch {}
		try { if (root.__api) delete root.__api; } catch {}
		root.innerHTML = '';
		delete root.__vi_unmount;
	};

  }

	//

	function onInfoClick(ctx, { body }) {
		try {
			// Use the control API we attached during mount
			body?.__api?.toggleBar?.(true);
		} catch (e) {
			// If anything goes wrong, do nothing; loader will show the default info.
		}
	}

	function unmount(root) {
		if (root && root.__vi_unmount) root.__vi_unmount();
	}
})();
