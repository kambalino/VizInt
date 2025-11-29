/* helloworld-settings.js
 *
 * Demo gadget for v1.2:
 * - Proper manifest with _api: "1.0"
 * - supportsSettings: true (manifest-first)
 * - onSettingsRequested: in-viewport settings UI (no modal)
 * - onInfoClick: explains use of the ⚙️ settings gear
 */

(function () {
  'use strict';

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttr(str) {
    // basic attribute-safe escaping
    return escapeHtml(str).replace(/`/g, '&#96;');
  }

  const manifest = {
    _api: '1.0',              // mandatory
    _class: 'HelloWorld',     // logical gadget class
    _type: 'single',          // single | multi | system
    _id: 'Default',           // instance id within class
    _ver: 'v0.1.0',
    verBlurb: 'Demo gadget: configurable "Hello World" message.',
    bidi: 'ltr',

    label: 'Hello World',
    publisher: 'K&K',
    contact_email: '',
    contact_url: '',
    contact_socials: '',

    // Visual hints (optional; chrome may use these later)
    iconEmoji: '👋',
    iconPng: '',
    iconBg: 'rgba(0,0,0,.2)',
    iconBorder: '#888',

    // Capabilities: none required for this demo
    capabilities: [],

    description:
      'Minimal demo showing how a gadget can expose settings and react to the titlebar settings gear.',

    // v1.2 settings contract
    supportsSettings: true
  };

  const DEFAULT_MESSAGE = 'Hello World';

  // Renders the "normal" view
  function renderView(host, ctx) {
    // Canonical API: ctx.settings.get(key, defaultValue)
    const msg =
      ctx.settings && typeof ctx.settings.get === 'function'
        ? ctx.settings.get('message', DEFAULT_MESSAGE)
        : DEFAULT_MESSAGE;

    host.innerHTML = [
      '<div class="hw-root">',
        '<p class="hw-message">', escapeHtml(msg), '</p>',
        '<p class="hw-hint">Use the ⚙️ icon in the titlebar to configure this message.</p>',
      '</div>'
    ].join('');
  }

  // Renders the settings UI into the same viewport
  function renderSettings(body, ctx) {
    const current =
      ctx.settings && typeof ctx.settings.get === 'function'
        ? ctx.settings.get('message', DEFAULT_MESSAGE)
        : DEFAULT_MESSAGE;

    body.innerHTML = [
      '<div class="hw-settings">',
        '<label class="hw-settings-row">',
          '<span class="hw-settings-label">Message:</span>',
          '<input type="text" class="hw-settings-input" value="', escapeAttr(current), '" />',
        '</label>',
        '<div class="hw-settings-actions">',
          '<button type="button" class="hw-btn hw-btn-save">✓ Save</button>',
          '<button type="button" class="hw-btn hw-btn-cancel">✖ Cancel</button>',
        '</div>',
        '<p class="hw-settings-note">',
          'Edit the message, then click “Save” to apply changes or “Cancel” to discard them.',
        '</p>',
      '</div>'
    ].join('');

    const input     = body.querySelector('.hw-settings-input');
    const btnSave   = body.querySelector('.hw-btn-save');
    const btnCancel = body.querySelector('.hw-btn-cancel');

    if (input) {
      input.focus();
      input.select();
    }

    if (btnSave && input) {
      btnSave.addEventListener('click', function () {
        const next = input.value;

        if (ctx.settings && typeof ctx.settings.set === 'function') {
          // Assumes ctx.settings.set merges the patch into existing settings
          ctx.settings.set({ message: next });
        }

        // Return to main view with updated message
        renderView(body, ctx);
      });
    }

    if (btnCancel) {
      btnCancel.addEventListener('click', function () {
        // Discard edits and return to main view
        renderView(body, ctx);
      });
    }
  }

  const api = {
    manifest,

    mount(host, ctx) {
      // Initial render of the main view
      renderView(host, ctx);

      // Simple unmount: clear the host contents
      return function () {
        host.innerHTML = '';
      };
    },

    // Called by Portal when the settings gear is activated (per v1.2 contract)
    onSettingsRequested(ctx, shell) {
      // shell: { slot, body, ... } — we care about body only
      // We deliberately do NOT mutate ctx; we treat shell.body as the active viewport.
      if (!shell || !shell.body) return;
      renderSettings(shell.body, ctx);
    },

    // Called by chrome when the info icon is clicked
    onInfoClick(ctx, shell) {
      void shell; // unused in this simple example
      try {
        alert(
          [
            'Hello World Gadget',
            '',
            '- The main view shows a configurable greeting.',
            '- Use the ⚙️ settings gear in the titlebar to change the message.',
            '- This example demonstrates the v1.2 settings contract.'
          ].join('\n')
        );
      } catch {
        // no-op in restricted environments
      }
    },

    // Simple text fallback for environments that only look at api.info
    info: 'Demo gadget showing configurable "Hello World" text via the v1.2 settings gear.'
  };

  window.GADGETS = window.GADGETS || {};
  // Register under the runtime ID used by registry.js
  window.GADGETS['helloworld-settings'] = api;

})();
