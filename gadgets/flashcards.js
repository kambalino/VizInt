// gadgets/flashcards.js
// $VER: FlashCards v0.3.1 — toolbar button on/off styling; smaller buttons; settings click-to-toggle
// $HISTORY:
//   v0.3.1 — toolbar button on/off styling; smaller buttons; settings click-to-toggle
//   v0.3.0 — toolbar 🆎 answer-display toggle; hide in-gadget settings button
//   v0.2.9 — auto-reparse on mount; parseCSV instrumentation; silent toggleConfig after save

(function () {
	// ===== Manifest (VizInt v1.0) =====
	const manifest = {
		_api: "1.0",
		_class: "FlashCards",
		_type: "singleton",
		_id: "Local",
		_ver: "v0.3.1",
		verblurb:
			"toolbar button on/off styling; smaller buttons; settings click-to-toggle",
		label: "Flash Cards",
		iconEmoji: "🎓",
		capabilities: ["network"], // URL fetch (paste works offline)
		description:
			"CSV-powered flash cards with sequential or diminishing-random rotation.",
		supportsSettings: true // 👈 THIS is the important bit
	};

	const info =
		"CSV → Cards. Diminishing-random or sequential. Auto-advance. Flip or include answers. 🎓";

	// ===== Utils =====
	const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
	const isStr = (v) => typeof v === "string";
	const stripBOM = (s) => (s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s);

	function sanitizeHTML(html) {
		if (!isStr(html) || !html) return "";
		const temp = document.createElement("div");
		temp.innerHTML = html;

		const ALLOWED = new Set([
			"B",
			"I",
			"EM",
			"STRONG",
			"SMALL",
			"SPAN",
			"SUB",
			"SUP",
			"BR"
		]);

		const walk = (node) => {
			for (const n of Array.from(node.childNodes)) {
				if (n.nodeType === Node.ELEMENT_NODE) {
					if (!ALLOWED.has(n.tagName)) {
						while (n.firstChild) node.insertBefore(n.firstChild, n);
						node.removeChild(n);
						continue;
					}
					const atts = Array.from(n.attributes);
					for (const a of atts) n.removeAttribute(a.name);
					walk(n);
				} else if (n.nodeType === Node.COMMENT_NODE) {
					node.removeChild(n);
				}
			}
		};
		walk(temp);
		return temp.innerHTML;
	}

	// Heuristic delimiter detection: comma, semicolon, tab, or pipe
	function detectDelimiter(sampleText) {
		const firstLines = sampleText.split(/\r?\n/).slice(0, 5);
		const count = (re) =>
			firstLines
				.map((l) => (l.match(re) || []).length)
				.reduce((a, b) => a + b, 0);

		const C = count(/,/g);
		const S = count(/;/g);
		const T = count(/\t/g);
		const P = count(/\|/g); // pipe

		const best = Math.max(C, S, T, P);

		// If we saw no delimiters at all, just fall back to comma
		if (best === 0) return ",";

		// Tie-breaking: prefer pipe, then tab, then semicolon, then comma
		if (best === P) return "|";
		if (best === T) return "\t";
		if (best === S) return ";";
		return ",";
	}

	// CSV → { records:[{a,b,notes}], errors, delimiter }
	function parseCSV(raw) {
		const text = stripBOM(raw || "");
		const delim = detectDelimiter(text);
		const rows = [];

		let i = 0;
		let field = "";
		let row = [];
		let inQ = false;

		while (i < text.length) {
			const ch = text[i];
			if (inQ) {
				if (ch === '"') {
					if (text[i + 1] === '"') {
						field += '"';
						i += 2;
					} else {
						inQ = false;
						i++;
					}
				} else {
					field += ch;
					i++;
				}
			} else {
				if (ch === '"') {
					inQ = true;
					i++;
				} else if (ch === delim) {
					row.push(field);
					field = "";
					i++;
				} else if (ch === "\r") {
					i++;
				} else if (ch === "\n") {
					row.push(field);
					rows.push(row);
					row = [];
					field = "";
					i++;
				} else {
					field += ch;
					i++;
				}
			}
		}
		row.push(field);
		rows.push(row);

		// Header-aware (literal, conservative)
		let startIdx = 0;
		if (rows.length > 1) {
			const hdr = rows[0].map((x) => (x || "").trim().toLowerCase());
			const looksHeader =
				hdr.includes("side a") ||
				hdr.includes("side b") ||
				hdr.includes("notes");
			if (looksHeader) startIdx = 1;
		}

		const records = [];
		const errors = [];

		for (let r = startIdx; r < rows.length; r++) {
			const cols = rows[r];
			if (!cols || cols.length < 2) {
				if (cols && cols.join("").trim().length === 0) continue;
				errors.push({ row: r + 1, reason: "Less than 2 columns" });
				continue;
			}
			const a = sanitizeHTML((cols[0] || "").trim());
			const b = sanitizeHTML((cols[1] || "").trim());
			const notes = sanitizeHTML((cols[2] || "").trim());
			if (!a && !b) continue;
			records.push({ a, b, notes });
		}

		console.debug("[Flashcards] parseCSV()", {
			rawLen: text.length,
			delimiter: delim,
			rows: rows.length,
			outLen: records.length,
			errs: errors
		});

		return { records, errors, delimiter: delim };
	}

	// Shuffle utility (Fisher–Yates)
	function shuffle(arr) {
		const a = arr.slice();
		for (let i = a.length - 1; i > 0; i--) {
			const j = (Math.random() * (i + 1)) | 0;
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

	// Fit text to container (simple heuristic: vary font-size by text length + container)
	function fitText(el, minPx, maxPx) {
		if (!el) return;
		const txt = el.textContent || el.innerText || "";
		const len = Math.max(1, txt.trim().length);
		const box = el.getBoundingClientRect();
		if (!box.width || !box.height) return;

		const base = Math.sqrt((box.width * box.height) / len);
		const px = Math.max(minPx, Math.min(maxPx, base * 0.9));

		el.style.fontSize = px.toFixed(1) + "px";
		el.style.lineHeight = "1.08";
		el.style.wordBreak = "break-word";
		el.style.hyphens = "auto";
		el.style.textAlign = "center";
	}

	// ===== Gadget =====
	function mount(host, ctx) {
		console.debug("[Flashcards] mount() ENTER", {
			hostTag: host && host.tagName,
			hasCtx: !!ctx,
			///! I suspect one of these is redundant
			hasGetSettings: !!(ctx && ctx.getSettings),
			hasSetSettings: !!(ctx && ctx.setSettings)
		});

		try {
			// Mark host as flashcards root so CSS can target it for modal overlay
			host.classList.add("fc-root");

			// Persisted (user intent only)
			const s =
				(ctx && typeof ctx.getSettings === "function" && ctx.getSettings()) ||
				{};
			console.debug("[Flashcards] mount() settings snapshot", s);

			const my = s.flashcards || {
				rawCSV: "",
				sourceUrl: "",
				parsed: [],
				mode: "drand", // "sequential" | "drand"
				auto: true,
				intervalMs: 5000,
				flipStyle: "reveal", // "reveal" | "inline"
				ui: { showConfig: false }
			};

			console.debug("[Flashcards] mount() initial my", {
				mode: my.mode,
				auto: my.auto,
				intervalMs: my.intervalMs,
				flipStyle: my.flipStyle,
				ui: my.ui,
				parsedLen: my.parsed && my.parsed.length
			});

			// If we have rawCSV but parsed is empty, reparse at runtime (no ctx writes here)
			if (
				typeof my.rawCSV === "string" &&
				my.rawCSV.trim() &&
				(!Array.isArray(my.parsed) || !my.parsed.length)
			) {
				console.debug(
					"[Flashcards] mount() reparsing rawCSV because parsed is empty"
				);
				const parsed = parseCSV(my.rawCSV);
				console.debug("[Flashcards] mount() reparsed snapshot", {
					records: parsed.records.length,
					errors: parsed.errors
				});
				my.parsed = parsed.records;
			}

			// Runtime-only (not meant to be persisted)
			my.index = my.index || 0;
			my.pool = my.pool || [];
			my.history = my.history || [];

			// Diminishing-random cycle state (runtime only – session-local)
			my.cycleOrder = null;
			my.cyclePos = 0;
			my.prevCycleOrder = null;
			my.futureCycleOrder = null;

			// Debounced, non-destructive writer: re-read latest, merge only our subtree
			let __saveT = null;
			function cancelPendingSave() {
				if (__saveT) {
					clearTimeout(__saveT);
					__saveT = null;
				}
			}

			function patternOr(a, b, fallback) {
				if (a !== undefined) return a;
				if (b !== undefined) return b;
				return fallback;
			}

			// Persist only stable state (not runtime indexing)
			function save(patch) {
				console.debug("[Flashcards] save() called", patch);

				const all =
					(ctx && typeof ctx.getSettings === "function" && ctx.getSettings()) ||
					{};
				const current = all.flashcards || {};

				const nextPersist = {
					rawCSV: patch.rawCSV !== undefined ? patch.rawCSV : current.rawCSV || "",
					sourceUrl:
						patch.sourceUrl !== undefined
							? patch.sourceUrl
							: current.sourceUrl || "",
					parsed:
						patternOr(patch.parsed, current.parsed, []) || [],
					mode: patch.mode !== undefined ? patch.mode : current.mode || "drand",
					auto:
						patch.auto !== undefined
							? !!patch.auto
							: current.auto !== undefined
							? !!current.auto
							: true,
					intervalMs:
						patch.intervalMs !== undefined
							? patch.intervalMs
							: current.intervalMs || 5000,
					flipStyle: patternOr(patch.flipStyle, current.flipStyle, "reveal"),
					ui: patch.ui !== undefined ? patch.ui : current.ui || { showConfig: false }
				};

				console.debug("[Flashcards] save() nextPersist", {
					...nextPersist,
					parsedLen: Array.isArray(nextPersist.parsed)
						? nextPersist.parsed.length
						: "n/a"
				});

				clearTimeout(__saveT);

				if (!ctx || typeof ctx.setSettings !== "function") {
					console.warn("[Flashcards] save() abort: ctx.setSettings missing", {
						hasCtx: !!ctx
					});
					return nextPersist;
				}

				__saveT = setTimeout(() => {
					try {
						const latestAll =
							(ctx &&
								typeof ctx.getSettings === "function" &&
								ctx.getSettings()) || {};
						const merged = { ...latestAll, flashcards: nextPersist };
						console.debug("[Flashcards] save() writing settings", {
							keys: Object.keys(merged.flashcards || {}),
							parsedLen: Array.isArray(
								merged.flashcards && merged.flashcards.parsed
							)
								? merged.flashcards.parsed.length
								: "n/a"
						});
						ctx.setSettings(merged);
					} catch (err) {
						console.error("[Flashcards] save() writing FAILED", err);
					}
				}, 120);

				return nextPersist;
			}

			// DOM
			host.innerHTML = `
				<div class="fc-wrap">
					<div class="fc-card">
						<div class="fc-front" aria-live="polite"></div>
						<div class="fc-back" aria-live="polite"></div>
						<div class="fc-inline" aria-live="polite"></div>
					</div>

					<div class="fc-status muted fineprint"></div>
					<hr class="fc-hr" />
					<div class="fc-controls">
						<button type="button" class="gbtn" data-fc="prev"  title="Previous">⏮️</button>
						<button type="button" class="gbtn" data-fc="next"  title="Next">⏭️</button> |
						<button
							type="button"
							class="gbtn"
							data-fc="mode"
							title="Toggle Mode (Sequential / Diminishing Random)"
							aria-pressed="false"
						>🔁</button>
						<button
							type="button"
							class="gbtn"
							data-fc="auto"
							title="Auto On/Off"
							aria-pressed="false"
						>▶️</button> 
						<button type="button" class="gbtn" data-fc="reset" title="Reset Deck">🧹</button> |
						<button type="button" class="gbtn" data-fc="flip"  title="Flip / Reveal">🔄</button>
						<span class="fc-flex"></span>
						<button
							type="button"
							class="gbtn"
							data-fc="flipmode"
							title="Toggle Answer Display (Flip / Inline)"
							aria-pressed="false"
						>🆎</button>
						<button
							type="button"
							class="gbtn fc-config-hidden"
							data-fc="config"
							title="Settings"
						>⚙️</button>
						<button type="button" class="gbtn" data-fc="purge"  title="Erase Flash Cards data">🗑️</button>
					</div>
				</div>

				<div class="fc-config cell3d" style="display:none">
					<div class="fc-cfg-head">
						<div class="fc-cfg-title">🎓 Flash Cards — Settings</div>
						<div class="fc-cfg-actions">
							<button type="button" class="gbtn" data-cfg="close" title="Close">✕</button>
						</div>
					</div>
					<div class="fc-cfg-body">
						<div class="field fc-url-row">
							<label for="fc-url">Deck URL</label>
							<div class="fc-url-input-row">
								<input type="text" id="fc-url" name="fc-url" placeholder="https://example.com/deck.csv" />
								<button type="button" class="gbtn" id="fc-load" title="Load from URL">⬆️</button>
							</div>
							<span class="muted fineprint" id="fc-load-note"></span>
						</div>
						<div class="muted fineprint">Examples: https://kambalino.github.io/VizInt/res/flashcards_it_100.csv</div>
						<div class="field" style="grid-template-columns:1fr;">
							<label for="fc-csv">Paste CSV</label>
							<textarea id="fc-csv" name="fc-csv" rows="8" placeholder='"Side A","Side B","Notes"'></textarea>
						</div>

						<div class="field">
							<label for="fc-mode">Mode</label>
							<select id="fc-mode" name="fc-mode">
								<option value="drand">Diminishing Random</option>
								<option value="sequential">Sequential</option>
							</select>
						</div>
						<div class="field">
							<label for="fc-auto">Auto</label>
							<select id="fc-auto" name="fc-auto">
								<option value="on">On</option>
								<option value="off">Off</option>
							</select>
						</div>
						<div class="field">
							<label for="fc-interval">Interval (seconds)</label>
							<input type="number" id="fc-interval" name="fc-interval" min="1" max="60" />
						</div>

						<div class="field">
							<label for="fc-flip">Answer Display</label>
							<select id="fc-flip" name="fc-flip">
								<option value="reveal">Flip to Answers</option>
								<option value="inline">Include Answers</option>
							</select>
						</div>

						<div class="field" style="grid-template-columns:1fr;">
							<button type="button" class="gbtn" id="fc-save">Save</button>
							<span id="fc-save-note" class="muted fineprint"></span>
						</div>

						<div id="fc-err" class="muted" style="white-space:pre-wrap;"></div>
					</div>
				</div>
			`;

			const elWrap = host.querySelector(".fc-wrap");
			const elFront = host.querySelector(".fc-front");
			const elBack = host.querySelector(".fc-back");
			const elInline = host.querySelector(".fc-inline");
			const elStatus = host.querySelector(".fc-status");
			const elControls = host.querySelector(".fc-controls");
			const elConfig = host.querySelector(".fc-config");

			const urlIn = host.querySelector("#fc-url");
			const csvIn = host.querySelector("#fc-csv");
			const modeIn = host.querySelector("#fc-mode");
			const autoIn = host.querySelector("#fc-auto");
			const intIn = host.querySelector("#fc-interval");
			const flipIn = host.querySelector("#fc-flip");
			const loadBtn = host.querySelector("#fc-load");
			const loadNote = host.querySelector("#fc-load-note");
			const saveBtn = host.querySelector("#fc-save");
			const saveNote = host.querySelector("#fc-save-note");
			const errOut = host.querySelector("#fc-err");

			const modeBtn = elControls.querySelector('[data-fc="mode"]');
			const autoBtn = elControls.querySelector('[data-fc="auto"]');
			const flipModeBtn = elControls.querySelector('[data-fc="flipmode"]');

			let timer = null;
			let cdTimer = null; // countdown timer (for auto rem/total s)
			let nextDueTs = 0;
			let showingAnswer = false;
			let ro = null;
			let painting = false;

			function syncCfgInputs() {
				urlIn.value = my.sourceUrl || "";
				csvIn.value = my.rawCSV || "";
				modeIn.value = my.mode;
				autoIn.value = my.auto ? "on" : "off";
				intIn.value = Math.round((my.intervalMs || 5000) / 1000);
				flipIn.value = my.flipStyle;
				console.debug("[Flashcards] syncCfgInputs()", {
					mode: my.mode,
					auto: my.auto,
					intervalMs: my.intervalMs,
					flipStyle: my.flipStyle
				});
			}

			function wireAutosave() {
				const saveField = () => {
					console.debug("[Flashcards] AUTOSAVE blur");
					const next = save({
						...my,
						sourceUrl: urlIn.value.trim(),
						rawCSV: csvIn.value
					});
					Object.assign(my, next);
					saveNote.textContent = "Autosaved.";
					setTimeout(() => (saveNote.textContent = ""), 1000);
				};
				urlIn.addEventListener("blur", saveField);
				csvIn.addEventListener("blur", saveField);

				modeIn.addEventListener("change", () => {
					console.debug("[Flashcards] modeIn change", { value: modeIn.value });
					const next = save({ mode: modeIn.value });
					Object.assign(my, next);
					reseedIfNeeded(true);
					ensureInitialIndex();
					showingAnswer = false;
					render();
					if (my.auto) restartTimer();
				});

				autoIn.addEventListener("change", () => {
					const on = autoIn.value === "on";
					console.debug("[Flashcards] autoIn change", { on });
					const next = save({ auto: on });
					Object.assign(my, next);
					restartTimer();
					render();
				});

				intIn.addEventListener("change", () => {
					const sec = clamp(parseInt(intIn.value, 10) || 5, 1, 60);
					console.debug("[Flashcards] interval change", { sec });
					const next = save({ intervalMs: sec * 1000 });
					Object.assign(my, next);
					restartTimer();
					render();
				});

				flipIn.addEventListener("change", () => {
					console.debug("[Flashcards] flipIn change", { flipStyle: flipIn.value });
					const next = save({ flipStyle: flipIn.value });
					Object.assign(my, next);
					showingAnswer = false;
					render();
				});
			}

			// NOTE: now supports { silent } to avoid stomping parsed right after Save.
			function toggleConfig(show, { silent = false } = {}) {
				console.debug("[Flashcards] toggleConfig()", { show, silent });

				elConfig.style.display = show ? "" : "none";
				if (elWrap) elWrap.style.display = show ? "none" : "";

				const nextState = !!show;
				const prevState = !!(my.ui && my.ui.showConfig);

				my.ui = { ...(my.ui || {}), showConfig: nextState };

				if (!silent && nextState !== prevState) {
					const next = save({ ui: my.ui });
					Object.assign(my, next);
				}

				if (show) stopTimer();
				else restartTimer();
			}

			function buildCycle() {
				const n = my.parsed.length;
				const cycle = shuffle([...Array(n).keys()]);
				console.debug("[Flashcards] buildCycle()", { n, cycle });
				return cycle;
			}

			function ensureInitialIndex() {
				const n = my.parsed.length;
				console.debug("[Flashcards] ensureInitialIndex()", {
					n,
					mode: my.mode,
					historyLen: my.history.length
				});
				if (!n) {
					my.index = 0;
					my.history = [];
					my.cycleOrder = null;
					my.cyclePos = 0;
					my.prevCycleOrder = null;
					my.futureCycleOrder = null;
					return;
				}

				if (my.mode === "drand") {
					my.cycleOrder = buildCycle();
					my.cyclePos = 0;
					my.index = my.cycleOrder[0];
					my.history = [my.index];
					my.prevCycleOrder = null;
					my.futureCycleOrder = null;
					console.debug("[Flashcards] ensureInitialIndex() drand start", {
						index: my.index,
						cycleOrder: my.cycleOrder
					});
					return;
				}

				// sequential
				if (!Array.isArray(my.history) || !my.history.length) {
					my.index = clamp(my.index || 0, 0, n - 1);
					my.history = [my.index];
				} else {
					my.index = clamp(my.index || 0, 0, n - 1);
				}
				console.debug("[Flashcards] ensureInitialIndex() seq start", {
					index: my.index,
					history: my.history
				});
			}

			function reseedIfNeeded(force = false) {
				const n = my.parsed.length;
				console.debug("[Flashcards] reseedIfNeeded()", {
					force,
					n,
					mode: my.mode,
					hasCycleOrder: !!(my.cycleOrder && my.cycleOrder.length)
				});
				if (!n) {
					my.pool = [];
					my.history = [];
					my.index = 0;
					my.cycleOrder = null;
					my.prevCycleOrder = null;
					my.futureCycleOrder = null;
					my.cyclePos = 0;
					return;
				}

				if (my.mode === "drand") {
					if (force || !Array.isArray(my.cycleOrder) || !my.cycleOrder.length) {
						my.prevCycleOrder = null;
						my.futureCycleOrder = null;
						my.cycleOrder = buildCycle();
						my.cyclePos = 0;
					}
				}
			}

			function takeNextIndex() {
				const n = my.parsed.length;
				if (!n) return 0;

				if (my.mode === "sequential") {
					const idx = (my.index + 1) % n;
					my.history.push(idx);
					my.index = idx;
					console.debug("[Flashcards] takeNextIndex() seq", {
						idx,
						historyLen: my.history.length
					});
					return idx;
				}

				// drand
				if (!Array.isArray(my.cycleOrder) || !my.cycleOrder.length) {
					my.cycleOrder = buildCycle();
					my.cyclePos = 0;
				}

				if (my.cyclePos < my.cycleOrder.length - 1) {
					my.cyclePos++;
				} else {
					if (Array.isArray(my.futureCycleOrder) && my.futureCycleOrder.length) {
						my.prevCycleOrder = my.cycleOrder.slice();
						my.cycleOrder = my.futureCycleOrder.slice();
						my.futureCycleOrder = null;
						my.cyclePos = 0;
					} else {
						my.prevCycleOrder = my.cycleOrder.slice();
						my.cycleOrder = buildCycle();
						my.cyclePos = 0;
					}
				}

				const idx = my.cycleOrder[my.cyclePos];
				my.history.push(idx);
				my.index = idx;
				console.debug("[Flashcards] takeNextIndex() drand", {
					idx,
					cyclePos: my.cyclePos,
					cycleOrder: my.cycleOrder
				});
				return idx;
			}

			function takePrevIndex() {
				if (my.flipStyle === "reveal" && showingAnswer) {
					showingAnswer = false;
					console.debug("[Flashcards] takePrevIndex() flip back to question", {
						index: my.index
					});
					return my.index || 0;
				}

				const n = my.parsed.length;
				if (!n) return 0;

				if (my.mode === "sequential") {
					const idx = Math.max(0, (my.index || 0) - 1);
					my.index = idx;
					console.debug("[Flashcards] takePrevIndex() seq", { idx });
					return idx;
				}

				// drand
				if (!Array.isArray(my.cycleOrder) || !my.cycleOrder.length) {
					my.cycleOrder = buildCycle();
					my.cyclePos = 0;
				}

				if (my.cyclePos > 0) {
					my.cyclePos--;
				} else if (Array.isArray(my.prevCycleOrder) && my.prevCycleOrder.length) {
					my.futureCycleOrder = my.cycleOrder.slice();
					my.cycleOrder = my.prevCycleOrder.slice();
					my.prevCycleOrder = null;
					my.cyclePos = my.cycleOrder.length - 1;
				} else {
					// Already at earliest allowed position
				}

				const idx = my.cycleOrder[my.cyclePos];
				my.index = idx;
				console.debug("[Flashcards] takePrevIndex() drand", {
					idx,
					cyclePos: my.cyclePos,
					cycleOrder: my.cycleOrder
				});
				return idx;
			}

			function renderCard(idx) {
				const n = my.parsed.length;
				if (!n) {
					elFront.innerHTML =
						'<div class="muted">No deck loaded. Click 🎓 (title) or ⚙️ to configure.</div>';
					elBack.innerHTML = "";
					elInline.innerHTML = "";
					return;
				}

				const rec = my.parsed[idx] || my.parsed[0];
				const A = rec.a || "";
				const B = rec.b || "";
				const N = rec.notes ? rec.notes : "";

				console.debug("[Flashcards] renderCard()", {
					idx,
					A,
					B,
					notes: N,
					flipStyle: my.flipStyle,
					showingAnswer
				});

				if (my.flipStyle === "inline") {
					elFront.style.display = "none";
					elBack.style.display = "none";
					const noteBlock = N
						? `<div class="fc-notes muted">${N}</div>`
						: "";
					elInline.style.display = "";
					elInline.innerHTML = `<div class="fc-q">${A}</div><div class="fc-a">(${B})</div>${noteBlock}`;
				} else {
					elInline.style.display = "none";
					elFront.style.display = showingAnswer ? "none" : "";
					elBack.style.display = showingAnswer ? "" : "none";
					elFront.innerHTML = `<div class="fc-q">${A}</div>`;
					const notesLine = N
						? `<div class="fc-notes muted">${N}</div>`
						: "";
					elBack.innerHTML = `<div class="fc-a">${B}</div>${notesLine}`;
				}

				requestAnimationFrame(() => {
					if (my.flipStyle === "inline") {
						fitText(elInline.querySelector(".fc-q"), 32, 140);
						fitText(elInline.querySelector(".fc-a"), 24, 96);
						const nt = elInline.querySelector(".fc-notes");
						if (nt) fitText(nt, 12, 28);
					} else {
						if (!showingAnswer) {
							fitText(elFront.querySelector(".fc-q"), 52, 140);
						} else {
							fitText(elBack.querySelector(".fc-a"), 34, 96);
						}
						const nt = elBack.querySelector(".fc-notes");
						if (nt) fitText(nt, 12, 28);
					}
				});
			}

			function updateStatus() {
				const n = my.parsed.length;
				const idx = clamp(my.index || 0, 0, Math.max(0, n - 1));
				const total = n;
				const actual = total ? idx + 1 : 0;

				let drandPos = actual;
				if (
					my.mode === "drand" &&
					Array.isArray(my.cycleOrder) &&
					my.cycleOrder.length
				) {
					drandPos = my.cyclePos + 1;
				}

				const modeTxt = my.mode === "drand" ? "drand" : "seq";
				const totSec = (my.intervalMs || 5000) / 1000;
				let autoTxt = "manual";

				if (my.auto) {
					const rem = Math.max(
						0,
						Math.ceil((nextDueTs - Date.now()) / 1000)
					);
					autoTxt = `auto ${rem}/${totSec | 0}s`;
				}

				elStatus.textContent = `[ #${actual}~${drandPos}/${total} ] · ${modeTxt} · ${autoTxt}`;
			}

			function updateToggleButtonStates() {
				if (modeBtn) {
					const on = my.mode === "drand";
					modeBtn.classList.toggle("is-on", on);
					modeBtn.setAttribute("aria-pressed", on ? "true" : "false");
				}
				if (autoBtn) {
					const on = !!my.auto;
					autoBtn.classList.toggle("is-on", on);
					autoBtn.setAttribute("aria-pressed", on ? "true" : "false");
				}
				if (flipModeBtn) {
					const on = my.flipStyle === "inline";
					flipModeBtn.classList.toggle("is-on", on);
					flipModeBtn.setAttribute("aria-pressed", on ? "true" : "false");
				}
			}

			function render() {
				if (painting) return;
				painting = true;

				const n = my.parsed.length;
				const idx = clamp(my.index || 0, 0, Math.max(0, n - 1));
				console.debug("[Flashcards] render()", {
					n,
					idx,
					mode: my.mode,
					auto: my.auto,
					flipStyle: my.flipStyle,
					showingAnswer
				});

				updateStatus();
				renderCard(idx);

				if (autoBtn) autoBtn.textContent = my.auto ? "⏸️" : "▶️";
				updateToggleButtonStates();

				painting = false;
			}

			function stopTimer() {
				console.debug("[Flashcards] stopTimer()");
				if (timer) {
					clearInterval(timer);
					timer = null;
				}
				if (cdTimer) {
					clearInterval(cdTimer);
					cdTimer = null;
				}
				nextDueTs = 0;
				updateStatus();
			}

			function restartTimer() {
				console.debug("[Flashcards] restartTimer()", {
					auto: my.auto,
					parsedLen: my.parsed.length,
					uiShowConfig: my.ui && my.ui.showConfig
				});

				stopTimer();
				if (!my.auto || !my.parsed.length || (my.ui && my.ui.showConfig))
					return;

				const ivl = my.intervalMs || 5000;
				nextDueTs = Date.now() + ivl;

				cdTimer = setInterval(updateStatus, 250);

				timer = setInterval(() => {
					console.debug("[Flashcards] auto tick", {
						flipStyle: my.flipStyle,
						showingAnswer,
						index: my.index
					});
					if (my.flipStyle === "reveal") {
						if (!showingAnswer) {
							showingAnswer = true;
							render();
						} else {
							showingAnswer = false;
							my.index = takeNextIndex();
							render();
						}
					} else {
						my.index = takeNextIndex();
						render();
					}
					nextDueTs = Date.now() + ivl;
					updateStatus();
				}, ivl);
			}

			elControls.addEventListener("click", (e) => {
				const b = e.target.closest("button[data-fc]");
				if (!b) return;

				e.preventDefault();
				e.stopPropagation();

				const act = b.dataset.fc;
				console.debug("[Flashcards] controls click", { act, auto: my.auto });

				if (act === "prev") {
					my.index = takePrevIndex();
					render();
					if (my.auto) restartTimer();
				} else if (act === "next") {
					showingAnswer = false;
					my.index = takeNextIndex();
					render();
					if (my.auto) restartTimer();
				} else if (act === "mode") {
					my.mode = my.mode === "drand" ? "sequential" : "drand";
					console.debug("[Flashcards] mode toggle", { mode: my.mode });
					save({ mode: my.mode });
					reseedIfNeeded(true);
					ensureInitialIndex();
					showingAnswer = false;
					render();
					if (my.auto) restartTimer();
				} else if (act === "auto") {
					my.auto = !my.auto;
					console.debug("[Flashcards] auto toggle", { auto: my.auto });
					save({ auto: my.auto });
					restartTimer();
					render();
				} else if (act === "flip") {
					console.debug("[Flashcards] flip button", {
						flipStyle: my.flipStyle,
						showingAnswer
					});
					if (my.flipStyle === "reveal") {
						showingAnswer = !showingAnswer;
						render();
						if (my.auto) restartTimer();
					}
				} else if (act === "flipmode") {
					my.flipStyle = my.flipStyle === "inline" ? "reveal" : "inline";
					console.debug("[Flashcards] flipmode toggle", {
						flipStyle: my.flipStyle
					});
					flipIn.value = my.flipStyle;
					const next = save({ flipStyle: my.flipStyle });
					Object.assign(my, next);
					showingAnswer = false;
					render();
					if (my.auto) restartTimer();
				} else if (act === "reset") {
					console.debug("[Flashcards] reset button");
					stopTimer();
					showingAnswer = false;
					my.auto = false;
					const next = save({ auto: false });
					Object.assign(my, next);

					my.index = 0;
					my.history = my.parsed.length ? [0] : [];
					my.pool = [];
					reseedIfNeeded(true);
					ensureInitialIndex();
					render();
				} else if (act === "config") {
					console.debug("[Flashcards] config button");
					// Toggle config open/close based on current ui.showConfig
					const nextShow = !(my.ui && my.ui.showConfig);
					toggleConfig(nextShow);
				} else if (act === "purge") {
					console.debug("[Flashcards] purge button");
					stopTimer();
					cancelPendingSave();

					const latestAll =
						(ctx &&
							typeof ctx.getSettings === "function" &&
							ctx.getSettings()) || {};
					const nextAll = { ...latestAll };
					delete nextAll.flashcards;
					console.debug("[Flashcards] purge writing settings", nextAll);
					ctx.setSettings(nextAll);

					Object.assign(my, {
						rawCSV: "",
						sourceUrl: "",
						parsed: [],
						mode: "drand",
						auto: false,
						intervalMs: 5000,
						flipStyle: "reveal",
						index: 0,
						pool: [],
						history: [],
						ui: { showConfig: false }
					});

					urlIn.value = "";
					csvIn.value = "";
					modeIn.value = "drand";
					autoIn.value = "off";
					intIn.value = 5;
					flipIn.value = "reveal";

					showingAnswer = false;
					reseedIfNeeded(true);
					ensureInitialIndex();
					render();
				}
			});

			host
				.querySelector('[data-cfg="close"]')
				.addEventListener("click", () => {
					console.debug("[Flashcards] config close");
					toggleConfig(false);
				});

			loadBtn.addEventListener("click", async () => {
				const url = urlIn.value.trim();
				if (!url) return;

				console.debug("[Flashcards] load from URL", { url });

				loadNote.textContent = "Loading…";
				errOut.textContent = "";

				try {
					const resp = await fetch(url, { cache: "no-store" });
					if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

					const txt = await resp.text();
					csvIn.value = txt;

					const next = save({
						sourceUrl: url,
						rawCSV: txt
					});
					Object.assign(my, next);

					loadNote.textContent = "Loaded. (Remember to Save)";
					setTimeout(() => (loadNote.textContent = ""), 1200);
				} catch (err) {
					console.error("[Flashcards] load from URL error", err);
					loadNote.textContent =
						"CORS or fetch error. Please paste CSV instead.";
					errOut.textContent = String(
						err && err.message ? err.message : err
					);
				}
			});

			saveBtn.addEventListener("click", () => {
				console.debug("[Flashcards] SAVE button clicked");

				const csvText = csvIn.value || "";
				console.debug("[Flashcards] SAVE csv snapshot", {
					len: csvText.length,
					head: csvText.slice(0, 160)
				});

				const parsed = parseCSV(csvText);
				console.debug("[Flashcards] SAVE parsed result", {
					records: parsed.records.length,
					errors: parsed.errors
				});

				my.parsed = parsed.records;
				my.index = 0;
				my.history = my.parsed.length ? [0] : [];
				my.pool = [];

				reseedIfNeeded(true);
				ensureInitialIndex();

				const next = save({
					rawCSV: csvText,
					sourceUrl: urlIn.value.trim(),
					parsed: my.parsed
				});
				Object.assign(my, next);

				errOut.textContent =
					parsed.errors.length > 0
						? "Imported with some row issues:\n" +
						  parsed.errors
								.map((e) => `Row ${e.row}: ${e.reason}`)
								.join("\n")
						: "Imported successfully.";

				saveNote.textContent = "Saved.";
				setTimeout(() => (saveNote.textContent = ""), 1000);

				// IMPORTANT: close config WITHOUT another save() so we don't overwrite parsed
				toggleConfig(false, { silent: true });
				showingAnswer = false;
				render();
				restartTimer();
			});

			// Initial glue
			syncCfgInputs();
			wireAutosave();

			// Honor persisted ui.showConfig WITHOUT saving from inside mount
			if (my.ui && my.ui.showConfig) {
				console.debug(
					"[Flashcards] mount() honoring persisted ui.showConfig=true without toggleConfig"
				);
				elConfig.style.display = "";
				if (elWrap) elWrap.style.display = "none";
				stopTimer();
			}

			reseedIfNeeded(false);
			ensureInitialIndex();
			showingAnswer = false;
			render();
			restartTimer();

			// Resize observer for better fit
			ro = new ResizeObserver(() => {
				console.debug("[Flashcards] resize observer");
				render();
			});
			ro.observe(host);

			// Return unmount cleanup
			return () => {
				console.debug("[Flashcards] unmount cleanup");
				stopTimer();
				if (ro) {
					try {
						ro.disconnect();
					} catch {
						// noop
					}
				}
			};
		} catch (err) {
			console.error("[Flashcards] mount() FATAL", err);
			throw err;
		}
	}

	function onSettingsRequested(ctx, { slot, body }) {
		console.debug("[Flashcards] onSettingsRequested()", { slot });
		const cfgBtn =
			body && body.querySelector('.fc-controls button[data-fc="config"]');
		if (cfgBtn) {
			// delegate to the same toggle logic as in-gadget settings
			cfgBtn.click();
			return;
		}
		const cfg = body && body.querySelector(".fc-config");
		if (cfg) {
			const isShown = cfg.style.display !== "none";
			cfg.style.display = isShown ? "none" : "";
		}
	}

	// Titlebar info-click → open the same config overlay (uses the gadget's own handler)
	function onInfoClick(ctx, { slot, body }) {
		console.debug("[Flashcards] onInfoClick()", { slot });
		const cfgBtn =
			body && body.querySelector('.fc-controls button[data-fc="config"]');
		if (cfgBtn) {
			cfgBtn.click();
			return;
		}
		const cfg = body && body.querySelector(".fc-config");
		if (cfg) {
			const isShown = cfg.style.display !== "none";
			cfg.style.display = isShown ? "none" : "";
		}
	}

	// Expose
	window.GADGETS = window.GADGETS || {};
	window.GADGETS.flashcards = {
		manifest,
		info,
		mount,
		onInfoClick,
		onSettingsRequested
	};

	// ===== Styles (scoped-ish) =====
	const css = `	
		.fc-root {
			position:relative;
			height:100%;
			min-height:0;
			display:flex;
			flex-direction:column;
			padding-bottom:24px;   /* reserve space for toolbar row */
			box-sizing:border-box;
		}
	

		.fc-wrap {
			display:flex;
			flex-direction:column;
			flex:1 1 auto;
			min-height:0;
			overflow:hidden;              /* no scroll here – keeps toolbar pinned */
		}

		.fc-card {
			display:flex;
			flex-direction:column;
			align-items:center;
			justify-content:center;
			flex:1 1 auto;
			min-height: 0;
			padding:8px;
			overflow:auto;                /* if space is tight, *card* scrolls, not controls */
		}

		.fc-front, .fc-back, .fc-inline {
			width: 100%;
			height: 100%;
			display:flex;
			flex-direction:column;
			align-items:center;
			justify-content:center;
		}
		.fc-q, .fc-a {
			font-weight:600;
			text-align:center;
		}
		.fc-a { margin-top: 6px; }
		.fc-notes { margin-top: 6px; font-size: 0.85em; }
		.fc-status { text-align:right; }

		.fc-hr { margin: 4px 0; opacity: 0.25; }
		.fc-controls {
			display:flex;
			align-items:center;
			gap:4px;
			flex-wrap:wrap;
		}
		.fc-flex {
			flex:1 1 auto;
			min-width:8px; /* will collapse away when space is tight */
		}

		/* smaller, more compact toolbar buttons */
		.fc-controls .gbtn {
			padding:2px 4px;
			font-size:0.9em;
			line-height:1.1;
			min-width:0;
		}

		/* visual pressed / toggled state for mode/auto/flipmode */
		.fc-controls .gbtn.is-on {
			outline:1px solid currentColor;
			border-radius:999px;
			box-shadow:0 0 0 1px rgba(255,255,255,0.15);
		}
		.fc-controls .gbtn:active {
			transform:translateY(1px);
			opacity:0.75;
		}

		.fc-config-hidden {
			display:none;
		}

		.fc-config {
			/* when hidden, JS sets display:none; when shown, we want full-height flex */
			display:flex;
			flex-direction:column;
			flex:1 1 auto;
			min-height:0;
			padding:8px;
		}

		.fc-cfg-head {
			display:flex;
			align-items:center;
			justify-content:space-between;
			margin:-8px -8px 8px -8px;
			padding:6px 8px;
			border-bottom:1px solid rgba(0,0,0,0.08);
		}

		.fc-cfg-body {
			flex:1 1 auto;
			overflow-y:auto;      /* vertical only */
			overflow-x:hidden;    /* suppress horizontal slider */
		}

		.fc-cfg-title { font-weight:600; }
		.fc-config .field label { font-weight:600; }
		.fc-config .field textarea,
		.fc-config .field input,
		.fc-config .field select {
			width:100%;
		}
		
		.fc-url-row .fc-url-input-row {
			display:flex;
			align-items:center;
			gap:4px;
		}
		.fc-url-row .fc-url-input-row input {
			flex:1 1 auto;
		}
		.fc-url-row .fc-url-input-row button {
			flex:0 0 auto;
		}

		/* Theme-aware tweaks via existing CSS vars */
		.fc-notes { color: var(--muted); }
	`;
	if (!document.getElementById("vizint-flashcards-css")) {
		const style = document.createElement("style");
		style.id = "vizint-flashcards-css";
		style.textContent = css;
		document.head.appendChild(style);
	}
})();
