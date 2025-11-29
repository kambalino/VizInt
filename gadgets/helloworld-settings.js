(function () {
  "use strict";

  /** ------------------------------------------------------------------
   *  Manifest — canonical identity & metadata
   *  ------------------------------------------------------------------ */
  const manifest = {
    _api: "1.0",
    _class: "HelloWorld",        // canonical class identity
    _type: "single",             // single-instance gadget
    _id: "default",
    _ver: "v1.2.0",

    label: "Hello World",
    description: "Demonstrates v1.2 settings-gear and info icon for a simple greeting.",
    supportsSettings: true,
    capabilities: [],            // no Atlas/Chronus/etc. in this minimal sample

    // Optional, but recommended for richer info-modal experiences:
    verBlurb: "Initial v1.2 template: settings gear + inline settings + info affordance.",
    publisher: "VizInt Gx",
    contact: "gadget-author@example.invalid"
  };

  /** ------------------------------------------------------------------
   *  Fallback info string (used if onInfoClick not wired, or as text-only fallback)
   *  ------------------------------------------------------------------ */
  const info = "HelloWorld shows a configurable greeting. Use the ⚙️ button to change the message.";

  /** ------------------------------------------------------------------
   *  Internal helper: render main view
   *  ------------------------------------------------------------------ */
  function renderView(host, message, helpText) {
    host.innerHTML = "";

    const container = document.createElement("div");
    container.className = "g-helloworld";

    const msgEl = document.createElement("div");
    msgEl.className = "g-helloworld-message";
    msgEl.textContent = message;

    container.appendChild(msgEl);

    if (helpText) {
      const helpEl = document.createElement("div");
      helpEl.className = "g-helloworld-help muted";
      helpEl.textContent = helpText;
      container.appendChild(helpEl);
    }

    host.appendChild(container);
  }

  /** ------------------------------------------------------------------
   *  mount(host, ctx)
   *  ------------------------------------------------------------------ */
  function mount(host, ctx) {
    const get = ctx.settings?.get || (() => ({}));
    const stored = get() || {};
    const message = stored.message || "Hello World!";

    // Remember host & simple state so settings callbacks can reuse them
    ctx.host = host;
    ctx.state = {
      message,
      helpVisible: !stored.message   // show help only until user customizes
    };

    const helpText = ctx.state.helpVisible
      ? "Use the ⚙️ button in the title bar to change this greeting."
      : "";

    renderView(host, message, helpText);

    // Return unmount for cleanup
    return function unmount() {
      // Canonical pattern: clear our DOM; Portal will remove the slot.
      host.innerHTML = "";
    };
  }

  /** ------------------------------------------------------------------
   *  onSettingsRequested(ctx, shell)
   *  ------------------------------------------------------------------ */
  function onSettingsRequested(ctx, shell) {
    const host = ctx.host;
    if (!host) {
      // Defensive: if mount hasn't run or Portal is miswired
      return;
    }

    const get = ctx.settings?.get || (() => ({}));
    const set = ctx.settings?.set || (() => {});

    const current = (ctx.state && ctx.state.message) ||
                    (get().message) ||
                    "Hello World!";

    const body = shell.body;
    body.innerHTML = "";

    const wrapper = document.createElement("div");
    wrapper.className = "g-helloworld-settings inline-form";

    const label = document.createElement("label");
    label.textContent = "Greeting:";
    label.className = "g-label";

    const input = document.createElement("input");
    input.type = "text";
    input.className = "g-input";
    input.value = current;

    // Controls container (inline with input)
    const controls = document.createElement("span");
    controls.className = "g-controls";

    const btnSave = document.createElement("button");
    btnSave.className = "gbtn gbtn-small";
    btnSave.title = "Save";
    btnSave.textContent = "✓";

    const btnCancel = document.createElement("button");
    btnCancel.className = "gbtn gbtn-small";
    btnCancel.title = "Cancel";
    btnCancel.textContent = "✖";

    controls.appendChild(btnSave);
    controls.appendChild(btnCancel);

    // Inline layout: [Label] [Input][Buttons]
    const row = document.createElement("div");
    row.className = "g-row";
    row.appendChild(label);
    row.appendChild(input);
    row.appendChild(controls);

    wrapper.appendChild(row);
    body.appendChild(wrapper);

    // Live preview (optional): update main view as user types, before commit
    input.addEventListener("input", () => {
      const nextMsg = input.value || "Hello World!";
      ctx.state.message = nextMsg;
      ctx.state.helpVisible = false;
      renderView(host, nextMsg, "");
    });

    function commitAndClose() {
      const nextMsg = input.value || "Hello World!";
      set({ message: nextMsg });
      ctx.state.message = nextMsg;
      ctx.state.helpVisible = false;
      renderView(host, nextMsg, "");
      body.innerHTML = ""; // shrink settings UI when done
    }

    function cancelAndClose() {
      // Re-render prior state
      const msg = ctx.state.message || current;
      const helpText = ctx.state.helpVisible
        ? "Use the ⚙️ button in the title bar to change this greeting."
        : "";
      renderView(host, msg, helpText);
      body.innerHTML = "";
    }

    btnSave.addEventListener("click", (ev) => {
      ev.preventDefault();
      commitAndClose();
    });

    btnCancel.addEventListener("click", (ev) => {
      ev.preventDefault();
      cancelAndClose();
    });
  }

  /** ------------------------------------------------------------------
   *  onInfoClick(ctx, shell)
   *  ------------------------------------------------------------------ */
  function onInfoClick(ctx, shell) {
    // Minimal, non-intrusive info behavior:
    const message =
      "HelloWorld is a reference gadget.\n\n" +
      "- Change the greeting via the ⚙️ button in the title bar.\n" +
      "- Your greeting is stored per-portal using ctx.settings.\n" +
      "- This gadget is single-instance (_type: \"single\").";

    // For now keep it simple; later UX may replace this with a richer modal.
    // Using alert() is acceptable for a reference gadget.
    alert(message);
  }

  /** ------------------------------------------------------------------
   *  Registration (IIFE scope → window.GADGETS[manifest._class])
   *  ------------------------------------------------------------------ */
  window.GADGETS = window.GADGETS || {};
  window.GADGETS[manifest._class] = {
    manifest,
    info,
    mount,
    onSettingsRequested,
    onInfoClick
  };
})();
