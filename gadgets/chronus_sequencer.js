// gadgets/chronus_sequencer.js
(function(){
	// ───────────────────────────────────────────────────────────────────────────
	// VizInt Gadget API v1.0 manifest
	// ───────────────────────────────────────────────────────────────────────────
	const manifest = {
		_api: "1.0",
		_class: "Sequencer",
		_type: "singleton",
		_id: "chronus_sequencer",
		_ver: "v0.3.1",
		verBlurb: "Responsive compaction: aligned headers, 10–15% tighter grids, clearer highlight.",
		bidi: "ltr",
		label: "Chronus Sequencer",
		capabilities: ["chronus"],
		description: "Define/edit reusable step sequences; compact grid UI.",
		defaults: {},
		propsSchema: {}
	};

	// Tiny DOM helper
	function h(tag, attrs={}, ...kids){
		const el = document.createElement(tag);
		for (const [k,v] of Object.entries(attrs||{})){
			if (k === 'class') el.className = v;
			else if (k === 'style') el.setAttribute('style', v);
			else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
			else el.setAttribute(k, v);
		}
		for (const kid of kids){
			if (kid == null) continue;
			el.appendChild(typeof kid === 'string' ? document.createTextNode(kid) : kid);
		}
		return el;
	}

	// Lightweight persistence (swap later with Chronus IPC)
	const LS_KEY = 'chronus.sequences.v2';
	const loadAll = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]'); } catch { return []; } };
	const saveAll = (list) => { try { localStorage.setItem(LS_KEY, JSON.stringify(list)); } catch {} };

	// In-memory state
	const state = {
		list: normalize(loadAll()),	// [{id,label,desc,steps:[{text,min,mode}]}]
		editing: null,				// active seq.id or null
		draft: null					// deep copy while editing (auto-commit)
	};

	function normalize(list){
		return (Array.isArray(list)?list:[]).map(s=>({
			id: s.id || autoId(),
			label: s.label || '',
			desc: s.desc || '',
			steps: Array.isArray(s.steps) ? s.steps.map(t=>({
				text: t.text || t.label || '',
				min: (t.min==='' || t.min==null) ? '' : +t.min,
				mode: (t.mode==='bg'?'bg':'fg')
			})) : []
		}));
	}

	function autoId(){
		let n = 1;
		while (state.list.some(s => s.id === `seq${n}`)) n++;
		return `seq${n}`;
	}

	// ───────────────────────────────────────────────────────────────────────────
	// mount(host)
	// ───────────────────────────────────────────────────────────────────────────
	function mount(host){
		host.innerHTML = `
			<div style="--fs:12px; font-size:var(--fs); line-height:1.25;">
				<!-- Sequence Gallery -->
				<div style="margin-bottom:10px;">
					<div style="font-size:calc(var(--fs) + 2px); font-weight:600; margin:6px 0 8px;">Sequence Gallery</div>

					<!-- Responsive variables:
					     --galLabelCol  : label column (shrinks ~10% on small, grows with width)
					     --galDescMin   : description min width
					-->
					<div class="sq-gallery" style="
						--galLabelCol: minmax(9.5ch, 12ch);
						--galDescMin: minmax(14ch, 1fr);
						border:1px solid var(--card-border); border-radius:8px; padding:6px; background:var(--card-bg); max-width:420px;
					">
						<div class="sq-head" style="display:grid; grid-template-columns:auto var(--galLabelCol) var(--galDescMin) auto; gap:6px; align-items:center; padding:4px 0; border-bottom:1px solid rgba(255,255,255,.12);">
							<button class="gbtn sq-add" title="Add new sequence" style="padding:2px 6px; font-size:11px; min-width:1.6rem;">+</button>
							<div style="font-weight:600; font-style:italic;">Label</div>
							<div style="font-weight:600; font-style:italic;">Description</div>
							<button class="gbtn" title="Click ✎ on a row to edit its steps" style="padding:0 6px; font-size:11px;">ℹ️</button>
						</div>
						<div class="sq-body"></div>
					</div>
				</div>

				<!-- Sequence Editor -->
				<div class="sq-editor-wrap" style="display:none; max-width:420px;">
					<div style="display:flex; align-items:center; margin:10px 0 6px;">
						<div style="font-size:calc(var(--fs) + 2px); font-weight:600;">Sequence Editor</div>
						<div style="flex:1;"></div>
						<button class="gbtn act-close" title="Close editor" style="padding:2px 6px; font-size:11px;">×</button>
					</div>

					<!-- Read-only preview -->
					<div class="sq-preview" style="display:flex; gap:8px; align-items:center; margin:0 0 6px;">
						<div class="muted">Label:</div><div class="sq-prev-label" style="min-width:8ch;"></div>
						<div class="muted" style="margin-left:12px;">Desc:</div><div class="sq-prev-desc" style="flex:1;"></div>
					</div>

					<!-- Editor grid variables:
					     --colOrd  : width of order column
					     --colMin  : width of minutes (slightly smaller)
					     --colMode : width of mode select (smaller)
					     --colGrip : drag-handle
					-->
					<div class="sq-editor" style="
						--colOrd: 3ch;
						--colMin: 3.4ch;
						--colMode: 5.2ch;
						--colGrip: 1.6rem;
						border:1px dashed var(--card-border); border-radius:8px; padding:6px; background:var(--card-bg);
					">
						<!-- Header aligned EXACTLY with body columns -->
						<div class="sq-row sq-head" style="display:grid; grid-template-columns:auto var(--colOrd) 1fr var(--colMin) var(--colMode) var(--colGrip); gap:6px; align-items:center; padding:2px 0; border-bottom:1px solid rgba(255,255,255,.12);">
							<button class="gbtn step-add" title="Add step" style="padding:2px 6px; font-size:11px;">+</button>
							<div style="font-weight:600; text-align:center;">#</div>
							<div style="font-weight:600;">Step</div>
							<div style="font-weight:600; text-align:center;" title="Minutes">🕑</div>
							<div style="font-weight:600; text-align:center;" title="Mode">🚦</div>
							<div style="text-align:center;" title="Drag to reorder">⠿</div>
						</div>

						<!-- Body -->
						<div class="sq-steps"></div>
					</div>
				</div>
			</div>
		`;

		// Nodes
		const galleryBody = host.querySelector('.sq-body');
		const addSeqBtn   = host.querySelector('.sq-add');
		const editorWrap  = host.querySelector('.sq-editor-wrap');
		const prevLabel   = host.querySelector('.sq-prev-label');
		const prevDesc    = host.querySelector('.sq-prev-desc');
		const stepsBody   = host.querySelector('.sq-steps');

		// ——— Gallery rendering ———
		function renderGallery(){
			galleryBody.innerHTML = state.list.map(seq => `
				<div class="sq-row" data-id="${seq.id}" style="
					display:grid; grid-template-columns:auto var(--galLabelCol) var(--galDescMin) auto; gap:6px; align-items:center;
					padding:4px 0; border-top:1px dashed rgba(255,255,255,.10);
					${state.editing===seq.id ? 'background:rgba(90,140,255,.15); border:1px solid rgba(90,140,255,.35); border-radius:6px; padding:6px;' : ''}
				">
					<button class="gbtn sq-del" title="Remove sequence" style="padding:2px 6px; font-size:11px;">−</button>
					<input class="sq-label" value="${esc(seq.label)}" placeholder="Label" style="width:100%; box-sizing:border-box; max-width:100%; font-size:11px; padding:3px 6px;">
					<input class="sq-desc"  value="${esc(seq.desc||'')}" placeholder="Description" style="width:100%; box-sizing:border-box; max-width:100%; font-size:11px; padding:3px 6px;">
					<button class="gbtn sq-edit" title="Edit steps" style="padding:2px 6px; font-size:11px;">✎</button>
				</div>
			`).join('') || `<div class="muted" style="padding:8px 2px;">No sequences yet.</div>`;

			// Wire row events (auto-save on change)
			galleryBody.querySelectorAll('.sq-row').forEach(row=>{
				const id = row.dataset.id;
				const seq = state.list.find(s=>s.id===id);
				if (!seq) return;

				row.querySelector('.sq-label').addEventListener('input', e=>{
					seq.label = e.target.value; saveAll(state.list);
					if (state.editing===id && state.draft){ state.draft.label = seq.label; renderEditor(); }
				});
				row.querySelector('.sq-desc').addEventListener('input', e=>{
					seq.desc = e.target.value; saveAll(state.list);
					if (state.editing===id && state.draft){ state.draft.desc = seq.desc; renderEditor(); }
				});
				row.querySelector('.sq-del').addEventListener('click', ()=>{
					const ix = state.list.findIndex(s=>s.id===id);
					if (ix<0) return;
					state.list.splice(ix,1); saveAll(state.list);
					if (state.editing===id){ state.editing=null; state.draft=null; editorWrap.style.display='none'; }
					renderGallery();
				});
				row.querySelector('.sq-edit').addEventListener('click', ()=>{
					openDraft(id);
					state.editing = id;
					renderGallery();	// update highlight
					renderEditor();
				});
			});
		}

		// ——— Editor rendering ———
		function openDraft(id){
			const src = state.list.find(s=>s.id===id);
			if (!src){ state.draft=null; return; }
			state.draft = JSON.parse(JSON.stringify(src));
		}
		function commitDraft(){
			if (!state.draft) return;
			const ix = state.list.findIndex(s=>s.id===state.draft.id);
			if (ix>=0) state.list[ix] = JSON.parse(JSON.stringify(state.draft));
			else state.list.push(JSON.parse(JSON.stringify(state.draft)));
			saveAll(state.list);
		}

		function renderEditor(){
			if (!state.draft){ editorWrap.style.display='none'; return; }
			editorWrap.style.display = '';
			prevLabel.textContent = state.draft.label || '';
			prevDesc.textContent  = state.draft.desc  || '';

			stepsBody.innerHTML = state.draft.steps.map((st, i)=> stepRowHTML(st, i)).join('') ||
				`<div class="muted" style="padding:6px 2px;">No steps yet — click + to add.</div>`;

			wireStepRowEvents();
		}

		function stepRowHTML(st, i){
			const mode = st.mode==='bg' ? 'bg' : 'fg';
			const modeIcon = (mode==='bg') ? '🔵' : '🔴';
			return `
			<div class="step-row" data-idx="${i}" draggable="true" style="
				display:grid; grid-template-columns:auto var(--colOrd) 1fr var(--colMin) var(--colMode) var(--colGrip); gap:6px; align-items:center;
				padding:4px 0; border-top:1px dashed rgba(255,255,255,.10);
			">
				<!-- delete -->
				<button class="gbtn step-del" title="Remove step" style="padding:1px 6px; font-size:10px;">−</button>

				<!-- order (read-only) -->
				<input class="step-order" value="${i+1}" readonly title="Order"
					style="width:var(--colOrd); text-align:center; font-size:10px; padding:2px 0; background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.15); border-radius:4px; box-sizing:border-box;">

				<!-- step text -->
				<input class="step-text" value="${esc(st.text||'')}" placeholder="Step"
					style="width:100%; box-sizing:border-box; font-size:11px; padding:3px 6px;">

				<!-- minutes (two digits, ~15% smaller via var) -->
				<input class="step-min" value="${min2(st.min)}" inputmode="numeric" maxlength="2"
					placeholder="00" title="Minutes"
					style="width:var(--colMin); text-align:center; font-size:10px; padding:2px 0; box-sizing:border-box;">

				<!-- 🚦 mode (🔴/🔵 only), ~15% smaller -->
				<select class="step-mode" title="Mode"
					style="width:var(--colMode); font-size:10px; padding:2px 4px; text-align:center; box-sizing:border-box;">
					<option value="fg" ${mode==='fg'?'selected':''}>🔴</option>
					<option value="bg" ${mode==='bg'?'selected':''}>🔵</option>
				</select>

				<!-- drag handle (4-dot grip), slightly smaller -->
				<div class="step-grip" title="Drag to reorder" style="
					cursor:grab; user-select:none; text-align:center; font-size:14px; line-height:1;">⠿</div>
			</div>`;
		}

		function wireStepRowEvents(){
			stepsBody.querySelectorAll('.step-row').forEach(row=>{
				const idx = +row.dataset.idx;
				const st = state.draft.steps[idx];

				// typing (auto-commit)
				row.querySelector('.step-text').addEventListener('input', e=>{
					st.text = e.target.value; commitDraft();
				});
				row.querySelector('.step-min').addEventListener('input', e=>{
					const v = e.target.value.replace(/[^\d]/g,'').slice(0,2);
					e.target.value = v;
					st.min = v==='' ? '' : Math.min(99, Math.max(0, +v));
					commitDraft();
				});
				row.querySelector('.step-mode').addEventListener('change', e=>{
					st.mode = (e.target.value==='bg') ? 'bg' : 'fg';
					commitDraft();
				});
				row.querySelector('.step-del').addEventListener('click', ()=>{
					state.draft.steps.splice(idx,1);
					commitDraft(); renderEditor();
				});

				// Drag & drop reorder (row-level; grip is visual cue)
				row.addEventListener('dragstart', ev=>{
					ev.dataTransfer.setData('text/plain', String(idx));
					row.style.opacity = '.6';
				});
				row.addEventListener('dragend', ()=>{
					row.style.opacity = '';
				});
				row.addEventListener('dragover', ev=>{
					ev.preventDefault();
					row.style.background = 'rgba(100,150,255,.10)';
				});
				row.addEventListener('dragleave', ()=>{
					row.style.background = '';
				});
				row.addEventListener('drop', ev=>{
					ev.preventDefault();
					row.style.background = '';
					const from = +ev.dataTransfer.getData('text/plain');
					const to   = idx;
					if (isNaN(from) || from===to) return;
					const item = state.draft.steps.splice(from,1)[0];
					state.draft.steps.splice(to,0,item);
					commitDraft(); renderEditor();
				});
			});
		}

		// Actions
		addSeqBtn.addEventListener('click', ()=>{
			const id = autoId();
			state.list.push({ id, label:'', desc:'', steps:[] });
			saveAll(state.list);
			renderGallery();
		});
		host.querySelector('.step-add').addEventListener('click', ()=>{
			if (!state.draft) return;
			state.draft.steps.push({ text:'', min:'', mode:'fg' });
			commitDraft(); renderEditor();
		});
		host.querySelector('.act-close').addEventListener('click', ()=>{
			editorWrap.style.display = 'none';
			state.editing = null; state.draft = null;
			renderGallery();	// remove row highlight
		});

		// Initial paint
		renderGallery();

		// Helpers
		function esc(s){ return (s||'').replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
		function min2(m){ if (m==='' || m==null || isNaN(+m)) return ''; const v = Math.max(0, Math.min(99, +m|0)); return (v<10?'0':'') + v; }

		return ()=>{/* unmount no-op for now */}
	}

	// Register gadget
	window.GADGETS = window.GADGETS || {};
	window.GADGETS[manifest._id] = { manifest, mount };

})();
