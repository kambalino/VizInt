// gadgets/flashcards.js
(function () {
	// ===== Manifest (VizInt v1.0) =====
	const manifest = {
		_api: "1.0",
		_class: "FlashCards",
		_type: "singleton",
		_id: "Local",
		_ver: "v0.2.3",
		label: "Flash Cards",
		iconEmoji: "🎓",
		capabilities: ["network"], // URL fetch (paste works offline)
		description: "CSV-powered flash cards with sequential or diminishing-random rotation."
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

		const ALLOWED = new Set(["B", "I", "EM", "STRONG", "SMALL", "SPAN", "SUB", "SUP", "BR"]);

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

	// Heuristic delimiter detection: comma, semicolon, or tab
	function detectDelimiter(sampleText) {
		const firstLines = sampleText.split(/\r?\n/).slice(0, 5);
		const count = (re) =>
			firstLines
				.map((l) => (l.match(re) || []).length)
				.reduce((a, b) => a + b, 0);
		const C = count(/,/g);
		const S = count(/;/g);
		const T = count(/\t/g);
		const best = Math.max(C, S, T);
		return best === S ? ";" : best === T ? "\t" : ",";
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
				hdr.includes("side a") || hdr.includes("side b") || hdr.includes("notes");
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

		return { records, errors, delimiter: delim };
	}

	function shuffle(arr) {
		const a = arr.slice();
		for (let i = a.length - 1; i > 0; i--) {
			const j = (Math.random() * (i + 1)) | 0;
			[a[i], a[j]] = [a[j], a[i]];
		}
		return a;
	}

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
		// host is our viewport root; we make it positioning context for the local overlay
		host.classList.add("fc-host");

		// Persisted (user intent only)
		const s = ctx.getSettings();
		const my = s.flashcards || {
			rawCSV: "",
			sourceUrl: "",
			parsed: [],
			mode: "drand", // "sequential" | "drand"
			auto: true,
			intervalMs: 5000,
			flipStyle: "reveal", // "reveal" (Flip to Answers) | "inline" (Include Answers)
			ui: { showConfig: false }
		};

		// Runtime-only (not meant to be persisted)
		my.index = my.index || 0;
		my.pool = my.pool || [];
		my.history = my.history || [];

		// Diminishing-random cycle state (runtime only – we treat it as session-local)
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

		// Persist only stable state (not runtime indexing)
		function save(patch) {
			const all = ctx.getSettings();
			const current = all.flashcards || {};

			const nextPersist = {
				rawCSV: patch.rawCSV !== undefined ? patch.rawCSV : current.rawCSV || "",
				sourceUrl: patch.sourceUrl !== undefined ? patch.sourceUrl : current.sourceUrl || "",
				parsed: patch.parsed !== undefined ? patch.parsed : current.parsed || [],
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
				flipStyle:
					patternOr(patch.flipStyle, current.flipStyle, "reveal"),
				ui: patch.ui !== undefined ? patch.ui : current.ui || { showConfig: false }
			};

			clearTimeout(__saveT);
			__saveT = setTimeout(() => {
				const latestAll = ctx.getSettings();
				ctx.setSettings({ ...latestAll, flashcards: nextPersist });
			}, 120);

			return nextPersist;
		}

		function patternOr(a, b, fallback) {
			if (a !== undefined) return a;
			if (b !== undefined) return b;
			return fallback;
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
					<button class="gbtn" data-act="prev"  title="Previous">⏮️</button>
					<button class="gbtn" data-act="next"  title="Next">⏭️</button>
					<button class="gbtn" data-act="mode"  title="Toggle Mode (Sequential / Diminishing Random)">🔁</button>
					<button class="gbtn" data-act="auto"  title="Auto On/Off">▶️</button>
					<button class="gbtn" data-act="flip"  title="Flip / Reveal">🔄</button>
					<button class="gbtn" data-act="reset" title="Reset Deck">🧹</button>
					<span class="fc-flex"></span>
					<button class="gbtn" data-act="config" title="Settings">⚙️</button>
					<button class="gbtn" data-act="purge"  title="Erase Flash Cards data">🗑️</button>
				</div>
			</div>

			<!-- Local (in-gadget) overlay; fills only the gadget body -->
			<div class="fc-overlay" style="display:none">
				<div class="fc-cfg-panel cell3d">
					<div class="fc-cfg-head">
						<div class="fc-cfg-title">🎓 Flash Cards — Settings</div>
						<div class="fc-cfg-actions">
							<button class="gbtn" data-cfg="close" title="Close">✕</button>
						</div>
					</div>
					<div class="fc-cfg-body">
						<div class="field">
							<label>Deck URL</label>
							<input type="text" id="fc-url" placeholder="https://example.com/deck.csv" />
						</div>
						<div class="field">
							<button class="gbtn" id="fc-load">Load from URL</button>
							<span class="muted fineprint" id="fc-load-note"></span>
						</div>
						<div class="field" style="grid-template-columns:1fr;">
							<label>Paste CSV</label>
							<textarea id="fc-csv" rows="8" placeholder='"Side A","Side B","Notes"'></textarea>
						</div>

						<div class="field">
							<label>Mode</label>
							<select id="fc-mode">
								<option value="drand">Diminishing Random</option>
								<option value="sequential">Sequential</option>
							</select>
						</div>

						<div class="field">
							<label>Auto</label>
							<select id="fc-auto">
								<option value="on">On</option>
								<option value="off">Off</option>
							</select>
						</div>

						<div class="field">
							<label>Interval (seconds)</label>
							<input type="number" id="fc-interval" min="1" max="60" />
						</div>

						<div class="field">
							<label>Answer Display</label>
							<select id="fc-flip">
								<option value="reveal">Flip to Answers</option>
								<option value="inline">Include Answers</option>
							</select>
						</div>

						<div class="field" style="grid-template-columns:1fr;">
							<button class="gbtn" id="fc-save">Save</button>
							<span id="fc-save-note" class="muted fineprint"></span>
						</div>

						<div id="fc-err" class="muted" style="white-space:pre-wrap;"></div>
					</div>
				</div>
			</div>
		`;

		const elFront = host.querySelector(".fc-front");
		const elBack = host.querySelector(".fc-back");
		const elInline = host.querySelector(".fc-inline");
		const elStatus = host.querySelector(".fc-status");
		const elControls = host.querySelector(".fc-controls");
		const elOverlay = host.querySelector(".fc-overlay");

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
		}

		function wireAutosave() {
			const saveField = () => {
				const next = save({
					rawCSV: csvIn.value,
					sourceUrl: urlIn.value.trim()
				});
				Object.assign(my, next);
				saveNote.textContent = "Autosaved.";
				setTimeout(() => (saveNote.textContent = ""), 1000);
			};

			urlIn.addEventListener("blur", saveField);
			csvIn.addEventListener("blur", saveField);

			modeIn.addEventListener("change", () => {
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
				const next = save({ auto: on });
				Object.assign(my, next);
				restartTimer();
				render();
			});

			intIn.addEventListener("change", () => {
				const sec = clamp(parseInt(intIn.value, 10) || 5, 1, 60);
				const next = save({ intervalMs: sec * 1000 });
				Object.assign(my, next);
				restartTimer();
				render();
			});

			flipIn.addEventListener("change", () => {
				const next = save({ flipStyle: flipIn.value });
				Object.assign(my, next);
				showingAnswer = false;
				render();
			});
		}

		function toggleConfig(show, { silent = false } = {}) {
			elOverlay.style.display = show ? "block" : "none";
			elOverlay.classList.toggle("open", !!show);

			const nextState = !!show;
			const prevState = !!(my.ui && my.ui.showConfig);

			if (!silent && nextState !== prevState) {
				const ui = { ...(my.ui || {}), showConfig: nextState };
				const next = save({ ui });
				my.ui = ui;
				Object.assign(my, next);
			}
			if (show) stopTimer();
			else restartTimer();
		}

		function buildCycle() {
			const n = my.parsed.length;
			return shuffle([...Array(n).keys()]);
		}

		// Ensures we have a valid starting index:
		// - In drand: always build a fresh cycle and pick a random first card (per session).
		// - In sequential: respect existing index if present; otherwise start at 0.
		function ensureInitialIndex() {
			const n = my.parsed.length;
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
				return;
			}

			// sequential
			if (!Array.isArray(my.history) || !my.history.length) {
				my.index = clamp(my.index || 0, 0, n - 1);
				my.history = [my.index];
			} else {
				my.index = clamp(my.index || 0, 0, n - 1);
			}
		}

		function reseedIfNeeded(force = false) {
			const n = my.parsed.length;
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
			return idx;
		}

		function takePrevIndex() {
			// In reveal mode: first Prev just flips back to Side A of the current card
			if (my.flipStyle === "reveal" && showingAnswer) {
				showingAnswer = false;
				return my.index || 0;
			}

			const n = my.parsed.length;
			if (!n) return 0;

			if (my.mode === "sequential") {
				const idx = Math.max(0, (my.index || 0) - 1);
				my.index = idx;
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
				// Jump back into the previous cycle; remember current as the future path
				my.futureCycleOrder = my.cycleOrder.slice();
				my.cycleOrder = my.prevCycleOrder.slice();
				my.prevCycleOrder = null;
				my.cyclePos = my.cycleOrder.length - 1;
			} else {
				// Already at earliest allowed position
			}

			const idx = my.cycleOrder[my.cyclePos];
			my.index = idx;
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

			if (my.flipStyle === "inline") {
				elFront.style.display = "none";
				elBack.style.display = "none";
				const noteBlock = N ? `<div class="fc-notes muted">${N}</div>` : "";
				elInline.style.display = "";
				elInline.innerHTML = `<div class="fc-q">${A}</div><div class="fc-a">(${B})</div>${noteBlock}`;
			} else {
				elInline.style.display = "none";
				elFront.style.display = showingAnswer ? "none" : "";
				elBack.style.display = showingAnswer ? "" : "none";
				elFront.innerHTML = `<div class="fc-q">${A}</div>`;
				const notesLine = N ? `<div class="fc-notes muted">${N}</div>` : "";
				elBack.innerHTML = `<div class="fc-a">${B}</div>${notesLine}`;
			}

			requestAnimationFrame(() => {
				if (my.flipStyle === "inline") {
					fitText(elInline.querySelector(".fc-q"), 18, 48);
					fitText(elInline.querySelector(".fc-a"), 12, 24);
					const nt = elInline.querySelector(".fc-notes");
					if (nt) fitText(nt, 10, 16);
				} else {
					if (!showingAnswer) {
						fitText(elFront.querySelector(".fc-q"), 18, 56);
					} else {
						fitText(elBack.querySelector(".fc-a"), 18, 56);
					}
					const nt = elBack.querySelector(".fc-notes");
					if (nt) fitText(nt, 10, 16);
				}
			});
		}

		function updateStatus() {
			const n = my.parsed.length;
			const idx = clamp(my.index || 0, 0, Math.max(0, n - 1));
			const total = n;
			const actual = total ? idx + 1 : 0;

			let drandPos = actual;
			if (my.mode === "drand" && Array.isArray(my.cycleOrder) && my.cycleOrder.length) {
				drandPos = my.cyclePos + 1;
			}

			const modeTxt = my.mode === "drand" ? "drand" : "seq";
			const totSec = (my.intervalMs || 5000) / 1000;
			let autoTxt = "manual";

			if (my.auto) {
				const rem = Math.max(0, Math.ceil((nextDueTs - Date.now()) / 1000));
				autoTxt = `auto ${rem}/${totSec | 0}s`;
			}

			elStatus.textContent = `[ #${actual}~${drandPos}/${total} ] · ${modeTxt} · ${autoTxt}`;
		}

		function render() {
			if (painting) return;
			painting = true;

			const n = my.parsed.length;
			const idx = clamp(my.index || 0, 0, Math.max(0, n - 1));

			updateStatus();
			renderCard(idx);

			const autoBtn = elControls.querySelector('[data-act="auto"]');
			autoBtn.textContent = my.auto ? "⏸️" : "▶️";

			painting = false;
		}

		function stopTimer() {
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
			stopTimer();
			if (!my.auto || !my.parsed.length || (my.ui && my.ui.showConfig)) return;

			const ivl = my.intervalMs || 5000;
			nextDueTs = Date.now() + ivl;

			// countdown tick for status line
			cdTimer = setInterval(updateStatus, 250);

			timer = setInterval(() => {
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
			const b = e.target.closest("button[data-act]");
			if (!b) return;

			const act = b.dataset.act;

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
				save({ mode: my.mode });
				reseedIfNeeded(true);
				ensureInitialIndex();
				showingAnswer = false;
				render();
				if (my.auto) restartTimer();
			} else if (act === "auto") {
				my.auto = !my.auto;
				save({ auto: my.auto });
				restartTimer();
				render();
			} else if (act === "flip") {
				if (my.flipStyle === "reveal") {
					showingAnswer = !showingAnswer;
					render();
					if (my.auto) restartTimer(); // avoid spurious auto flip
				}
			} else if (act === "reset") {
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
				// no restartTimer(); auto is now off
			} else if (act === "config") {
				toggleConfig(true);
			} else if (act === "purge") {
				stopTimer();
				cancelPendingSave();

				const latestAll = ctx.getSettings();
				const nextAll = { ...latestAll };
				delete nextAll.flashcards;
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
			.addEventListener("click", () => toggleConfig(false));
		elOverlay.addEventListener("click", (e) => {
			if (e.target === elOverlay) toggleConfig(false);
		});

		loadBtn.addEventListener("click", async () => {
			const url = urlIn.value.trim();
			if (!url) return;

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
				loadNote.textContent = "CORS or fetch error. Please paste CSV instead.";
				errOut.textContent = String(err && err.message ? err.message : err);
			}
		});

		saveBtn.addEventListener("click", () => {
			const parsed = parseCSV(csvIn.value || "");
			my.parsed = parsed.records;
			my.index = 0;
			my.history = my.parsed.length ? [0] : [];
			my.pool = [];

			reseedIfNeeded(true);
			ensureInitialIndex();

			const next = save({
				rawCSV: csvIn.value || "",
				sourceUrl: urlIn.value.trim(),
				parsed: my.parsed
			});
			Object.assign(my, next);

			errOut.textContent =
				parsed.errors.length > 0
					? "Imported with some row issues:\n" +
					  parsed.errors.map((e) => `Row ${e.row}: ${e.reason}`).join("\n")
					: "Imported successfully.";

			saveNote.textContent = "Saved.";
			setTimeout(() => (saveNote.textContent = ""), 1000);

			toggleConfig(false);
			showingAnswer = false;
			render();
			restartTimer();
		});

		// Initial glue
		syncCfgInputs();
		wireAutosave();
		if (my.ui && my.ui.showConfig) {
			toggleConfig(true, { silent: true }); // don't write during mount
		}

		reseedIfNeeded(false);
		ensureInitialIndex();
		showingAnswer = false;
		render();
		restartTimer();

		ro = new ResizeObserver(() => render());
		ro.observe(host);

		return () => {
			stopTimer();
			try {
				ro && ro.disconnect();
			} catch (e) {
				/* ignore */
			}
		};
	}

	// Titlebar info-click → same path as ⚙
	function onInfoClick(ctx, { slot, body }) {
		const cfgBtn =
			body && body.querySelector('.fc-controls button[data-act="config"]');
		if (cfgBtn) {
			cfgBtn.click();
			return;
		}
		const overlay = body && body.querySelector(".fc-overlay");
		if (overlay) {
			overlay.style.display = "block";
			overlay.classList.add("open");
		}
	}

	// Expose
	window.GADGETS = window.GADGETS || {};
	window.GADGETS.flashcards = { manifest, info, mount, onInfoClick };

	// ===== Styles (scoped-ish) =====
	const css = `
	/* host becomes positioning context for in-gadget overlay */
	.fc-host { position: relative; }

	.fc-wrap { display:flex; flex-direction:column; gap:8px; }
	.fc-card { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:160px; padding:8px; }
	.fc-front, .fc-back, .fc-inline { width:100%; }

	.fc-q, .fc-a { font-weight:600; }
	.fc-a { margin-top:6px; }
	.fc-notes { margin-top:6px; font-size:0.85em; color: var(--muted); }
	.fc-status { text-align:right; }

	.fc-hr { margin:2px 0; opacity:0.25; }
	.fc-controls { display:flex; align-items:center; gap:4px; flex-wrap:nowrap; }
	.fc-controls .gbtn { padding:1px 4px; min-width:unset; line-height:1.05; font-size:12px; }

	/* In-gadget overlay fills only the gadget body */
	.fc-overlay {
		position:absolute; inset:0; display:none;
		background:rgba(0,0,0,0.35); backdrop-filter:saturate(120%) blur(1px);
		z-index: 5;
	}
	.fc-overlay.open { display:block; }
	.fc-cfg-panel {
		position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
		width:min(820px, 92%); max-height:86%; overflow:auto; padding:8px;
	}
	.fc-cfg-head { display:flex; align-items:center; justify-content:space-between; margin:-8px -8px 8px -8px; padding:6px 8px; border-bottom:1px solid rgba(0,0,0,0.08); }
	.fc-cfg-title { font-weight:600; }
	.fc-cfg-body { display:block; }
	.fc-overlay .field label { font-weight:600; }
	.fc-overlay .field textarea, .fc-overlay .field input, .fc-overlay .field select { width:100%; }
	`;
	const style = document.createElement("style");
	style.textContent = css;
	document.head.appendChild(style);
})();
