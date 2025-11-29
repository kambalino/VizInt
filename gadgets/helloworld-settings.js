/* helloworld-settings.js
 *
 * Demo gadget for v1.2:
 * - Proper manifest with _api: "1.0"
 * - supportsSettings: true (manifest-first)
 * - onSettingsRequested: in-viewport settings UI (no modal)
 * - onInfoClick: produces/toggles inline help text
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
		return escapeHtml(str).replace(/`/g, '&#96;');
	}

	const DEFAULT_MESSAGE = 'Hello World';
	const HINT_TEXT =
		'Use the ⚙️ settings gear in the titlebar to configure this message. ' +
		'Click the ℹ️ icon for help if you need it.';

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

		iconEmoji: '👋',
		iconPng: '',
		iconBg: 'rgba(0,0,0,.2)',
		iconBorder: '#888',

		capabilities: [],

		description:
			'Minimal demo showing how a gadget can expose settings and react to the titlebar settings gear.',

		supportsSettings: true
	};

	// Helper: canonical get/set wrappers (primary: ctx.settings, fallback: ctx._hwMessage)
	function getMessage(ctx) {
		if (ctx && ctx.settings && typeof ctx.settings.get === 'function') {
			return ctx.settings.get('message', DEFAULT_MESSAGE);
		}
		return ctx && ctx._hwMessage ? ctx._hwMessage : DEFAULT_MESSAGE;
	}

	function setMessage(ctx, next) {
		if (ctx && ctx.settings && typeof ctx.settings.set === 'function') {
			ctx.settings.set({ message: next });
		} else if (ctx) {
			ctx._hwMessage = next;
		}
	}

	// Render main view (message + optional hint)
	function renderView(host, ctx) {
		const msg = getMessage(ctx);
		const showHint = msg === DEFAULT_MESSAGE;

		const parts = [
			'<div class="hw-root">',
				'<p class="hw-message">', escapeHtml(msg), '</p>'
		];

		if (showHint) {
			parts.push(
				'<p class="hw-hint">',
					escapeHtml(HINT_TEXT),
				'</p>'
			);
		}

		parts.push('</div>');

		host.innerHTML = parts.join('');
	}

	// Render settings UI (same viewport), with input + buttons on one row
	function renderSettings(body, ctx, shell) {
		const current = getMessage(ctx);

		body.innerHTML = [
			'<div class="hw-settings settings-compact">',
				'<div class="hw-settings-row" ',
					'style="display:flex;align-items:center;gap:6px;">',
					'<span class="hw-settings-label">Message:</span>',
					'<input type="text" class="hw-settings-input" ',
						'style="flex:1 1 auto;min-width:0;padding:4px 6px;font-size:1rem;" ',
						'value="', escapeAttr(current), '" />',
					'<button type="button" ',
						'class="gbtn gbtn-xs hw-btn-save" ',
						'title="Save">',
						'✅',
					'</button>',
					'<button type="button" ',
						'class="gbtn gbtn-xs hw-btn-cancel" ',
						'title="Cancel">',
						'✖',
					'</button>',
				'</div>',
				'<p class="hw-settings-note">',
					'Edit the message, then click ✅ to apply changes or ✖ to discard them.',
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

		function getViewHost() {
			if (shell && shell.body) return shell.body;
			if (ctx && ctx.host) return ctx.host;
			return body;
		}

		if (btnSave && input) {
			btnSave.addEventListener('click', function () {
				const next = input.value;
				setMessage(ctx, next);
				renderView(getViewHost(), ctx);
			});
		}

		if (btnCancel) {
			btnCancel.addEventListener('click', function () {
				renderView(getViewHost(), ctx);
			});
		}
	}

	const api = {
		manifest,

		mount(host, ctx) {
			// Store host on ctx so settings/views have a canonical anchor if needed
			if (ctx && typeof ctx === 'object') {
				ctx.host = host;
			}

			renderView(host, ctx);

			return function unmount() {
				// --------------------------------------------------------
				// UNMOUNT EXPLANATION:
				// All event listeners live on nodes under `host`.
				// Clearing host.innerHTML removes those nodes entirely,
				// so listeners + closures become eligible for GC.
				// --------------------------------------------------------
				host.innerHTML = '';
			};
		},

		// Called when the settings gear is activated
		onSettingsRequested(ctx, shell) {
			if (!shell || !shell.body) return;
			renderSettings(shell.body, ctx, shell);
		},

		// Called when the ℹ️ icon is clicked (once chrome wiring is fixed)
		onInfoClick(ctx, shell) {
			const host =
				(shell && shell.body) ||
				(ctx && ctx.host) ||
				null;

			if (!host) {
				// Fallback: basic alert if we can't locate the DOM root
				try {
					alert(HINT_TEXT);
				} catch {
					/* no-op */
				}
				return;
			}

			let hint = host.querySelector('.hw-hint');
			if (!hint) {
				hint = document.createElement('p');
				hint.className = 'hw-hint';
				hint.textContent = HINT_TEXT;
				host.appendChild(hint);
			} else {
				// Toggle visibility
				const hidden = hint.style.display === 'none';
				hint.style.display = hidden ? '' : 'none';
			}
		},

		info: 'Demo gadget showing configurable "Hello World" text via the v1.2 settings gear.'
	};

	window.GADGETS = window.GADGETS || {};
	window.GADGETS['helloworld-settings'] = api;

})();
