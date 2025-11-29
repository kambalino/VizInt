/* helloworld.js
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
		_api: '1.0',                 // mandatory
		_class: 'HelloWorld',       // logical gadget class
		_type: 'single',            // single | multi | system
		_id: 'Default',             // instance id within class
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

	function renderView(host, ctx) {
		const msg = ctx.getSettings('message', DEFAULT_MESSAGE);
		host.innerHTML = [
			'<div class="hw-root">',
				'<p class="hw-message">', escapeHtml(msg), '</p>',
				'<p class="hw-hint">Use the ⚙️ icon in the titlebar to configure this message.</p>',
			'</div>'
		].join('');
	}

	function renderSettings(body, ctx) {
		const current = ctx.getSettings('message', DEFAULT_MESSAGE);

		body.innerHTML = [
			'<div class="hw-settings">',
				'<label class="hw-settings-row">',
					'<span class="hw-settings-label">Message:</span>',
					'<input type="text" class="hw-settings-input" value="', escapeAttr(current), '" />',
				'</label>',
				'<p class="hw-settings-note">',
					'Changes are saved immediately and reflected in the main view.',
				'</p>',
			'</div>'
		].join('');

		const input = body.querySelector('.hw-settings-input');
		if (input) {
			input.addEventListener('input', function () {
				ctx.setSettings({ message: input.value });
				// Re-render view using the same ctx + host
				renderView(ctx.host, ctx);
			});
			// optional: select-all on focus for quick overwrite
			input.addEventListener('focus', function () {
				input.select();
			});
		}
	}

	const api = {
		manifest,

		mount(host, ctx) {
			// Keep host on ctx for convenience (view + settings share it)
			ctx.host = host;
			renderView(host, ctx);

			// Simple unmount
			return function () {
				host.innerHTML = '';
			};
		},

		// Called by Portal when the settings gear is activated (per v1.2 contract)
		onSettingsRequested(ctx, shell) {
			// shell: { slot, body, ... } — we care about body only
			renderSettings(shell.body, ctx);
		},

		// Called by chrome when the info icon is clicked
		onInfoClick(ctx, shell) {
			// For now, keep this simple: later we could inline a richer popover.
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
	//window.GADGETS.helloworld = api;
	window.GADGETS['helloworld-settings'] = api;

})();
