// ---- localStorage-backed settings (file:// friendly) + gadget chrome ----
(async function () {
  const KEY = 'portalSettings';

  // Dynamic default enablement list (from Registry.js)
  const DEFAULT_ENABLED = (window.REGISTRY?.GADGETS || [])
    .filter(g => g.defaultEnabled)
    .map(g => g.id);

  // Keep full metadata from REGISTRY (we may need icon, labels, etc.)
  const GADGET_CATALOG = (window.REGISTRY?.GADGETS || []);
  const GADGET_TITLES  = Object.fromEntries(GADGET_CATALOG.map(g => [g.id, g.label]));

  // === Theme support ===
  const DEFAULT_THEME = 'light';

  function applyTheme(theme) {
    document.body.classList.toggle('dark', theme === 'dark');
    window.dispatchEvent(new CustomEvent('theme:changed', { detail: { theme }}));
  }
  function initTheme(settings) {
    const theme = settings.theme || DEFAULT_THEME;
    applyTheme(theme);
    window.addEventListener('theme:toggle', () => {
      const next = (document.body.classList.contains('dark') ? 'light' : 'dark');
      applyTheme(next);
      const s = getSettings();
      setSettings({ ...s, theme: next });
    });
  }

  // ---------- settings storage ----------
  function lsGet()       { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
  function lsSet(obj)    { try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch {} }

  function normalizeEnabled(list) {
    const known = new Set(GADGET_CATALOG.map(g => g.id));
    const out  = [];
    const seen = new Set();
    for (const id of Array.isArray(list) ? list : DEFAULT_ENABLED) {
      if (!known.has(id)) continue;
      if (!seen.has(id)) { out.push(id); seen.add(id); }
    }
    if (!seen.has('settings')) out.push('settings'); // always on
    if (!seen.has('header'))   out.unshift('header'); // ensure header present
    return out;
  }

  function getSettings() {
    const s = lsGet();
    const enabledGadgets = normalizeEnabled(s && s.enabledGadgets);
    return { ...(s || {}), enabledGadgets };
  }

  function setSettings(next) {
    const prev   = getSettings();
    const merged = { ...prev, ...next };
    merged.enabledGadgets = normalizeEnabled(merged.enabledGadgets);
    lsSet(merged);
    return merged;
  }

  // ---------- shared library wiring (ctx.libs + deprecated ctx.shared) ----------

  // Build the shared-library surface once per render.
  // For now this just forwards to globals; Chronus/Atlas internals stay independent.
  function buildLibs() {
    const Core    = window.Core    || window.SHARED_CORE || {};
    const Chronus = window.Chronus || {};
    const Atlas   = window.Atlas   || {};
    const Nexus   = window.Nexus   || {};

    return { Core, Chronus, Atlas, Nexus };
  }

  // Soft-deprecated ctx.shared shim:
  // - forwards to ctx.libs
  // - logs a warning on first get / first set
  function makeSharedShim(libs) {
    const warned = { get: false, set: false };
    return new Proxy(libs, {
      get(target, prop, recv) {
        if (!warned.get) {
          console.warn('[VizInt] ctx.shared is deprecated; use ctx.libs instead (will be removed in a future version).');
          warned.get = true;
        }
        return Reflect.get(target, prop, recv);
      },
      set(target, prop, value, recv) {
        if (!warned.set) {
          console.warn('[VizInt] ctx.shared mutation is deprecated; update callers to use ctx.libs instead.');
          warned.set = true;
        }
        return Reflect.set(target, prop, value, recv);
      }
    });
  }

  // Registry loader
  async function loadGadget(name) {
    if (!window.REGISTRY || typeof window.REGISTRY.loadGadget !== 'function') {
      throw new Error('Registry not loaded');
    }
    return window.REGISTRY.loadGadget(name);
  }

  // Built-in header (unchanged content)
  window.GADGETS = window.GADGETS || {};
  window.GADGETS.header = {
    info: `VizInt · ${window.VIZINT_VERSION || '$VER: #???'}`,
    mount(host /* el */, ctx) {
      const HISTORY = window.VIZINT_HISTORY || [];
      host.innerHTML = `
        <div class="vizint-history">
          ${HISTORY.map(h => `
            <details>
              <summary><strong>${h.ver}</strong> — ${h.title} <span class="muted">· ${h.status}</span></summary>
              <ul>${h.bullets.map(b => `<li>${b}</li>`).join('')}</ul>
            </details>
          `).join('')}
        </div>
      `;
    }
  };

  // ---------- chrome builder ----------
  // returns { slot, body, iconEl }
  function buildChrome(name, dock, ctx) {
    const gadgetInfo = ctx.gadgetCatalog.find(g => g.id === name);

    const slot = document.createElement('div');
    slot.className = 'cell3d gadget-slot';
    slot.dataset.gadget = name;

    const titleId = `gtitle-${name}-${Math.random().toString(36).slice(2)}`;
    slot.setAttribute('role', 'region');
    slot.setAttribute('aria-labelledby', titleId);

    const bar   = document.createElement('div');  bar.className   = 'g-titlebar';
    const title = document.createElement('div');  title.className = 'g-title'; title.id = titleId;
    const act   = document.createElement('div');  act.className   = 'g-actions';

    // --- Icon (info trigger). If registry has icon, use it; otherwise default ℹ️
    const box = document.createElement('span');
    box.className = 'g-iconbox';
    if (gadgetInfo?.iconBg)    box.style.background = gadgetInfo.iconBg;
    if (gadgetInfo?.iconBorder)box.style.border     = `1px solid ${gadgetInfo.iconBorder}`;
    if (gadgetInfo?.iconEmoji) {
      box.classList.add('emoji');
      box.textContent = gadgetInfo.iconEmoji;
    } else if (gadgetInfo?.iconPng) {
      const img = document.createElement('img');
      img.src = gadgetInfo.iconPng; img.alt = '';
      img.decoding = 'async';
      box.appendChild(img);
    } else {
      box.textContent = 'ℹ️';
    }
    const iconEl = box;
    title.appendChild(box);

    // Title
    title.append(document.createTextNode(gadgetInfo?.label || name));

    // Optional tiny chips container (inserted later after we know manifest)
    const chipsSpan = document.createElement('span');
    chipsSpan.className = 'g-chips';
    title.appendChild(chipsSpan);

    // Theme toggle on header
    if (name === 'header') {
      const ver = window.VIZINT_VERSION || '$VER: #---';
      const verSpan = document.createElement('span');
      verSpan.className = 'vizint-ver muted';
      verSpan.textContent = `· ${ver}`;
      title.appendChild(verSpan);
      const btnTrash = document.createElement('button');
      btnTrash.className = 'gbtn g-trash';
      btnTrash.title = 'Clear all gadget settings';
      btnTrash.textContent = '🗑️';
      btnTrash.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all settings?')) {
          ctx.setSettings({ flashcards: {} });
          //Object.assign(my, { parsed: [], index: 0, history: [], pool: [] });
          try {
            localStorage.removeItem('portalSettings');
            localStorage.removeItem('vizint.registry');
            console.log('[VizInt SafeStart] Cleared portalSettings + vizint.registry');
          } catch(e) {
            console.warn('[VizInt SafeStart] Cleanup failed', e);
          }

          render();
        }
      });
      act.prepend(btnTrash);

      const btnTheme = document.createElement('button');
      btnTheme.className = 'gbtn g-theme';
      btnTheme.title = 'Toggle dark / light mode';
      btnTheme.textContent = document.body.classList.contains('dark') ? '🌞' : '🌜';
      btnTheme.addEventListener('click', () => {
        window.dispatchEvent(new CustomEvent('theme:toggle'));
        btnTheme.textContent = document.body.classList.contains('dark') ? '🌞' : '🌜';
      });
      window.addEventListener('theme:changed', (e) => {
        btnTheme.textContent = e.detail.theme === 'dark' ? '🌞' : '🌜';
      });
      act.prepend(btnTheme);
    }

    // ---------- state helpers ----------
    function persist(partial) {
      const s  = getSettings();
      const st = s.gadgetState || {};
      st[name] = { ...(st[name] || {}), ...partial };
      setSettings({ ...s, gadgetState: st });
    }
    function setCollapsed(isCollapsed) {
      slot.classList.toggle('g-minimized', isCollapsed);
      persist({ collapsed: isCollapsed });
    }
    function setFullWidth(isWide) {
      slot.classList.toggle('g-spanwide', isWide);
      persist({ wide: isWide });
    }
    function setFullscreen(isFs) {
      slot.classList.toggle('g-maximized', isFs);
      if (isFs) slot.classList.remove('g-minimized');
      persist({ fullscreen: isFs });
    }

    // --- Controls: folded (💠) vs inline ---
    const s  = getSettings();
    const folded = !!s.foldedHubControls; // global toggle (default false)

    if (folded) {
      // 💠 hub button that expands the three controls
      const btnHub = document.createElement('button');
      btnHub.className = 'gbtn g-hub';
      btnHub.title = 'Window controls';
      btnHub.textContent = '💠';

      let hubOpen = false;
      let hubBtns = null;

      function openHub() {
        const bCollapse = document.createElement('button');
        bCollapse.className = 'gbtn';
        bCollapse.title = 'Minimize / Restore';
        bCollapse.textContent = '▁';
        bCollapse.addEventListener('click', (e) => {
          e.stopPropagation();
          setCollapsed(!slot.classList.contains('g-minimized'));
        });

        const bWide = document.createElement('button');
        bWide.className = 'gbtn';
        bWide.title = 'Toggle Full Width';
        bWide.textContent = '⟷';
        bWide.addEventListener('click', (e) => {
          e.stopPropagation();
          setFullWidth(!slot.classList.contains('g-spanwide'));
        });

        const bFs = document.createElement('button');
        bFs.className = 'gbtn';
        bFs.title = 'Toggle Fullscreen';
        bFs.textContent = '▢';
        bFs.addEventListener('click', (e) => {
          e.stopPropagation();
          setFullscreen(!slot.classList.contains('g-maximized'));
        });

        hubBtns = [bCollapse, bWide, bFs];
        const nextSibling = btnHub.nextSibling;
        for (const b of hubBtns) act.insertBefore(b, nextSibling);
        hubOpen = true;
      }
      function closeHub() {
        if (!hubBtns) return;
        for (const b of hubBtns) { try { b.remove(); } catch {} }
        hubBtns = null; hubOpen = false;
      }

      btnHub.addEventListener('click', (e) => {
        e.stopPropagation();
        if (hubOpen) closeHub(); else openHub();
      });
      bar.addEventListener('click', () => { if (hubOpen) closeHub(); }, { capture: true });

      act.append(btnHub);
    } else {
      // Inline buttons: ▁ ⟷ ▢ (no hub)
      const bCollapse = document.createElement('button');
      bCollapse.className = 'gbtn';
      bCollapse.title = 'Minimize / Restore';
      bCollapse.textContent = '▁';
      bCollapse.addEventListener('click', () => setCollapsed(!slot.classList.contains('g-minimized')));

      const bWide = document.createElement('button');
      bWide.className = 'gbtn';
      bWide.title = 'Toggle Full Width';
      bWide.textContent = '⟷';
      bWide.addEventListener('click', () => setFullWidth(!slot.classList.contains('g-spanwide')));

      const bFs = document.createElement('button');
      bFs.className = 'gbtn';
      bFs.title = 'Toggle Fullscreen';
      bFs.textContent = '▢';
      bFs.addEventListener('click', () => setFullscreen(!slot.classList.contains('g-maximized')));

      act.append(bCollapse, bWide, bFs);
    }

    // ✕ close (disabled for header/settings)
    const btnClose = document.createElement('button');
    btnClose.className = 'gbtn g-close';
    btnClose.title = 'Close';
    btnClose.textContent = '✕';
    if (name === 'settings' || name === 'header') {
      btnClose.disabled = true;
      btnClose.title = `${name} cannot be closed`;
    } else {
      btnClose.addEventListener('click', () => {
        const s = getSettings();
        const next = { ...s, enabledGadgets: (s.enabledGadgets || []).filter(id => id !== name) };
        const merged = setSettings(next);
        window.dispatchEvent(new CustomEvent('gadgets:update', { detail: { enabled: merged.enabledGadgets }}));
      });
    }

    act.append(btnClose);
    bar.append(title, act);

    const body = document.createElement('div');
    body.className = 'g-body';

    slot.append(bar, body);
    dock.appendChild(slot);

    // ---------- initial visual state ----------
    const st = (s.gadgetState && s.gadgetState[name]) || {};
    if (st.wide)       setFullWidth(true);
    if (st.fullscreen) setFullscreen(true);
    if (st.collapsed)  setCollapsed(true);
    if (!(s.gadgetState && s.gadgetState[name])) {
      if (name === 'header') { setFullWidth(true); setCollapsed(true); }
      else { setFullWidth(false); setCollapsed(false); }
    }

    return { slot, body, iconEl, chipsSpan };
  }

  function unmountAll(dock) {
    for (const el of Array.from(dock.children)) {
      try { el._unmount && el._unmount(); } catch {}
    }
    dock.innerHTML = '';
  }

  // Map capability → chip + tooltip
  const CAP_CHIPS = {
    chronus: { emoji:'🕰️', title:'Uses Chronus (time/tz helpers)' },
    atlas:   { emoji:'📍',  title:'Uses Atlas (geo helpers)' },
    served:  { emoji:'🖥️',  title:'Must be served (not file://)' },
    network: { emoji:'🌐',  title:'Contacts remote APIs' }
  };

  async function mountGadget(name, ctx, dock) {
    const { slot, body, iconEl, chipsSpan } = buildChrome(name, dock, ctx);

    // 1) Load API (built-in header vs dynamic)
    let api;
    if (name === 'header') {
      api = window.GADGETS.header;
    } else {
      try {
        api = await loadGadget(name);
      } catch (err) {
        console.error(err);
        body.innerHTML = `<div class="err">Load error</div>`;
        return;
      }
    }

    // 2) Apply bidi from manifest (default ltr). Do before mount so gadget sees host.dir
    const bidi = (api.manifest && api.manifest.bidi) || 'ltr';
    slot.setAttribute('dir', bidi);
    slot.classList.toggle('g-ltr', bidi === 'ltr');

    // 3) Titlebar chips (optional; portal-level toggle)
    const s = getSettings();
    const showChips = !!s.showTitleChips; // default true in ensureDefaults()
    if (showChips && chipsSpan && api.manifest && Array.isArray(api.manifest.capabilities)) {
      chipsSpan.innerHTML = '';
      for (const cap of api.manifest.capabilities) {
        const meta = CAP_CHIPS[cap];
        if (!meta) continue;
        const span = document.createElement('span');
        span.className = 'g-chip';
        span.textContent = meta.emoji;
        span.title = meta.title;
        chipsSpan.appendChild(span);
      }
    }

    // 4) Mount
    try {
      const unmount = api.mount(body, ctx);
      if (typeof unmount === 'function') slot._unmount = unmount;
    } catch (err) {
      console.error(err);
      body.innerHTML = `<div class="err">Mount error</div>`;
    }

    // 5) Info affordance via icon (always available)
    if (iconEl) {
      iconEl.classList.add('is-interactive');
      iconEl.title = 'Info';
      iconEl.addEventListener('click', (e) => {
        e.stopPropagation();
        if (api && typeof api.onInfoClick === 'function') {
          api.onInfoClick(ctx, { slot, body });
          return;
        }
        // Default info: render manifest summary if available, else api.info
        if (api && api.manifest) {
          const m = api.manifest;
          const caps = (m.capabilities || []).join(', ');
          const lines = [
            `${m._class}:${m._id}`,
            m.label ? `Title: ${m.label}` : '',
            m._ver ? `Version: ${m._ver}` : '',
            m.verBlurb ? `Notes: ${m.verBlurb}` : '',
            caps ? `Capabilities: ${caps}` : '',
            m.publisher ? `Publisher: ${m.publisher}` : '',
            m.contact_email ? `Email: ${m.contact_email}` : '',
            m.contact_url ? `URL: ${m.contact_url}` : '',
            m.contact_socials ? `Socials: ${m.contact_socials}` : '',
            m.description ? `—\n${m.description}` : ''
          ].filter(Boolean);
          try { alert(lines.join('\n')); } catch {}
        } else if (api && typeof api.info === 'string' && api.info.trim()) {
          try { alert(api.info); } catch {}
        }
      });
    }
  }

  // ---------- render ----------
  function render() {
    const dock = document.getElementById('dock');

    // Apply defaults once
    const settings = ensureDefaults(getSettings());
    const enabled  = settings.enabledGadgets;

    // Build shared libs + deprecated shared shim
    const libs    = buildLibs();
    const shared  = makeSharedShim(libs);

    const ctx = {
      settings,
      setSettings(next) {
        const merged = setSettings(next);
        window.dispatchEvent(new CustomEvent('gadgets:update', {
          detail: { enabled: merged.enabledGadgets }
        }));
      },
      bus: window,
      gadgetCatalog: GADGET_CATALOG,
      getSettings,
      // New surfaces for v1.2:
      libs,
      shared
    };

    unmountAll(dock);
    for (const g of enabled) mountGadget(g, ctx, dock);
  }

  // ---------- defaults initializer ----------
  function ensureDefaults(s) {
    const next = { ...s };
    if (typeof next.showDiag === 'undefined')          next.showDiag = false;
    if (typeof next.foldedHubControls === 'undefined') next.foldedHubControls = false; // off by default
    if (typeof next.showTitleChips === 'undefined')    next.showTitleChips = true;     // chips on by default
    return next;
  }

  // ---------- events ----------
  window.addEventListener('gadgets:update', () => render());

  // ---------- Portal exports ----------
  window.Portal = {
    render,
    getSettings,
    setSettings,
    DEFAULT_ENABLED,
    GADGET_CATALOG
  };

  // ---------- auto-start ----------
  if (window.Portal && typeof window.Portal.render === 'function') {
    initTheme(getSettings());
    window.Portal.render();
  }
})();
