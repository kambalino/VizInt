// atlas-debug.js
// VizInt Gadget: Atlas Debug Panel
// VERSION: 1.0.1
// HISTORY
// 2025-11-23  U:Atlas   v1.0.1  Hardened Atlas detection; added status line, ts display, and raw envelope JSON.
// 2025-02-22  U:Portal  v1.0.0  Initial Gadget API 1.0 conversion.

/*
	High-level intent

	This gadget is a pure debug viewer for whatever Atlas thinks
	the current GeoEnvelope ("best geo") is.

	Architectural goals:

	- Show how a Gadget API 1.0 gadget:
		* declares a manifest,
		* declares capabilities (["atlas"]),
		* consumes ctx.libs.Atlas,
		* uses Atlas.ready and Atlas.subscribe().

	- Avoid any special portal hooks:
		* We rely only on ctx.libs + host,
		* No direct DOM access outside host.

	- Make it safe to run under file:// and under HTTP(S).

	Manifest decisions:

	- _class: "AtlasDebug"
		=> logical gadget family name.
	- _id: "Local"
		=> instance name; Portal will compose Vz:AtlasDebug:Local.
	- _type: "singleton"
		=> we only ever want one instance for now.
	- capabilities: ["atlas"]
		=> semantically advertises that this gadget expects Atlas.
*/

(function () {
	// ─────────────────────────────────────────────────────────────
	// Manifest — Gadget API 1.0 metadata
	// ─────────────────────────────────────────────────────────────
	/** @type {VizGadgetManifest} */
	const manifest = {
		_api: "1.0",               // Gadget API version (mandatory)
		_class: "AtlasDebug",      // Gadget class/family (mandatory)
		_type: "singleton",        // "singleton" | "instantiable"
		_id: "Local",              // Instance id within class
		_ver: "v1.0.1",            // Gadget version (mandatory)
		verBlurb: "Debugs the current Atlas GeoEnvelope in real time.",
		bidi: "ltr",               // Text direction

		label: "Atlas Debug",      // Display title for chrome & settings

		// Optional publisher / contact fields
		publisher: "VizInt Core Team",
		contact_email: "",
		contact_url: "",
		contact_socials: "",       // e.g. "x:@vizint; ig:@vizint"

		// Visuals — Portal will use these in chrome and Settings
		iconEmoji: "🧭",           // Compass emoji = geo/debug
		iconPng: "",               // Optional PNG icon; not used here
		iconBg: "rgba(0,0,0,.20)",
		iconBorder: "transparent",

		// Capabilities:
		// - "atlas" signals that the gadget is geo-aware and expects ctx.libs.Atlas.
		// - In v1.2 the Portal MAY still provide Atlas even without this flag, but
		//   capabilities drive badges and future stricter wiring.
		capabilities: ["atlas"],

		description:
			"Displays the current Atlas GeoEnvelope (city, country, tz, lat/lon, " +
			"confidence, fallback, source) and updates live when Atlas changes.",

		// For future multi-instance scenarios; left empty here.
		defaults: {},
		propsSchema: {}
	};

	// ─────────────────────────────────────────────────────────────
	// mount(host, ctx) — main gadget entrypoint
	// ─────────────────────────────────────────────────────────────
	/**
	 * @param {HTMLElement} host - The DOM node allocated by Portal.
	 * @param {VizGadgetContext} ctx - Portal context (libs, env, settings, etc.).
	 */
	function mount(host, ctx) {
		// Pull Atlas from the shared libs surface.
		const { Atlas } = (ctx.libs || {});

		// Basic structure; we intentionally keep styling minimal so this
		// remains easy to read and copy for other gadget authors.
		host.innerHTML = `
<div style="
	font-family:sans-serif;
	padding:1em;
	line-height:1.4;
	color:var(--fg,black);
	text-align:left;
	white-space:pre-wrap;
	font-size:0.9rem;
">
	<b>Atlas Debug Gadget</b>
	<div id="atlas-debug-output" style="margin-top:0.5em;">
		Loading Atlas geo context…
	</div>
</div>
		`;

		/** @type {HTMLDivElement|null} */
		const el = host.querySelector("#atlas-debug-output");

		if (!el) {
			host.textContent = "Atlas Debug: failed to initialize DOM.";
			return;
		}

		// Helper: compute a human-readable status line from the GeoEnvelope.
		function computeStatus(geo) {
			if (!geo) {
				return "[ERROR] Atlas not available.";
			}

			const source = geo.source || "unknown";
			const fb = geo.fallback || null;

			if (fb === "permission-denied") {
				return "[WARN] Permission denied for device geo; using " + source + ".";
			}
			if (fb === "offline") {
				return "[WARN] Offline; using cached / tz-only geo from " + source + ".";
			}
			if (fb === "file-mode") {
				return "[INFO] file:// mode; using " + source + " (likely tz/IP based).";
			}
			if (fb === "unknown") {
				return "[INFO] Fallback unknown; using " + source + ".";
			}
			// fb === null → normal success
			return "[OK] Using " + source + " geo.";
		}

		// Helper: render a single GeoEnvelope object from Atlas.
		function render(geo) {
			if (!geo) {
				el.textContent = "Atlas not available (missing capability, wiring, or init failure).";
				return;
			}

			const status = computeStatus(geo);
			const latStr = (typeof geo.lat === "number") ? String(geo.lat) : "(null)";
			const lonStr = (typeof geo.lon === "number") ? String(geo.lon) : "(null)";

			// ts is not part of the formal GeoEnvelope, but Atlas may include it
			// in cache; we display it if present to help diagnose staleness.
			let tsLine = "ts:          (none)";
			if (geo.ts) {
				try {
					const d = new Date(geo.ts);
					const human = isNaN(d.getTime()) ? "(invalid date)" : d.toLocaleString();
					tsLine = "ts:          " + geo.ts + "  (" + human + ")";
				} catch {
					tsLine = "ts:          " + geo.ts + "  (unparsable)";
				}
			}

			const lines =
				status + "\n\n" +
				"city:        " + (geo.city || "(unknown)") + "\n" +
				"country:     " + (geo.country || "(unknown)") + "\n" +
				"tz:          " + (geo.tz || "(unknown)") + "\n" +
				"lat/lon:     " + latStr + ", " + lonStr + "\n" +
				"confidence:  " + (geo.confidence ?? "(n/a)") + "\n" +
				"fallback:    " + (geo.fallback || "(none)") + "\n" +
				"source:      " + (geo.source || "(unknown)") + "\n" +
				tsLine + "\n" +
				"updated:     " + new Date().toLocaleString() + "\n\n" +
				"raw envelope:\n" +
				JSON.stringify(geo, null, 2);

			el.textContent = lines;
		}

		// Defensive detection: distinguish between a real Atlas and an empty shell.
		const hasRealAtlas =
			Atlas &&
			typeof Atlas === "object" &&
			Atlas !== null &&
			Atlas.ready &&
			typeof Atlas.ready.then === "function" &&
			typeof Atlas.getBestGeo === "function";

		if (!hasRealAtlas) {
			render(null);
			return;
		}

		/*
			Expected Atlas API (as of v1.2.x):

			- Atlas.ready: Promise that resolves once initial geo resolution is complete.
			- Atlas.getBestGeo(): returns the current GeoEnvelope.
			- Atlas.subscribe(fn): registers a listener; fn(geo) is called whenever
			  Atlas updates its notion of "best" geo. Returns an unsubscribe handle
			  (or void, depending on implementation).

			This pattern is intentionally similar to a simple observable so
			gadget authors can re-use the idea.
		*/

		Atlas.ready
			.then(() => {
				try {
					// Initial render.
					render(Atlas.getBestGeo());
				} catch (err) {
					el.textContent = "Atlas Debug: error during getBestGeo(): " + err;
					return;
				}

				// Subscribe for live updates (if supported).
				if (typeof Atlas.subscribe === "function") {
					try {
						Atlas.subscribe(render);
					} catch (err) {
						el.textContent = "Atlas Debug: error during subscribe(): " + err;
					}
				}
			})
			.catch(err => {
				el.textContent = "Atlas Debug: Atlas.ready rejected: " + err;
			});
	}

	// ─────────────────────────────────────────────────────────────
	// Registration with Portal
	// ─────────────────────────────────────────────────────────────
	/*
		Registration pattern:

		- window.GADGETS is the canonical global registry surface.
		- Keying strategy is Portal-controlled; for now we use the filename-like key
		  "atlas-debug" so existing registry entries or future registry generation
		  can discover it without surprises.

		- Portal / registry will:
			* read manifest._class / _id / _type,
			* compute the canonical instance name (Vz:AtlasDebug:Local),
			* wire ctx.name, ctx.env, ctx.libs, etc.,
			* be responsible for mounting/unmounting.

		Nothing in this file assumes a specific Portal naming strategy beyond
		being addressable by its key.
	*/
	window.GADGETS = window.GADGETS || {};
	window.GADGETS["atlas-debug"] = {
		manifest,
		mount
	};
})();
