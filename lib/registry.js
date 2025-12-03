// registry.js — Unified Gadget Registry (file:// friendly, no CORS)
(function () {
  window.REGISTRY = {
    GADGETS: [
      { id:'header',			singleton:true,  path:null,                          label:'VizInt',                 defaultEnabled:true,  iconEmoji:'🧭', iconBorder:'var(--chronus)', supportsSettings:true },
      { id:'settings',			singleton:true,  path:'./gadgets/settings.js',       label:'Settings',               defaultEnabled:true,  iconEmoji:'⚙️'},

	  { id:'chronus-dev',		singleton:true,  path:'./gadgets/chronus-dev.js',   label:'Chronus Timer',          defaultEnabled:false },
      { id:'daily',				singleton:false, path:'./gadgets/daily.js',          label:'Daily Milestones',       defaultEnabled:true,  iconEmoji:'⏳', iconBg:'#2b2f3b', iconBorder:'rgba(255,255,255,0.3)'},
      { id:'prayers',			singleton:false, path:'./gadgets/prayers.js',        label:'Prayer Times (legacy)',  defaultEnabled:true,  iconEmoji:'🕋' },
      { id:'prayer_vizint',		singleton:false, path:'./gadgets/prayer_vizint.js',	label:'Prayer Times (VizInt)',  defaultEnabled:false, iconEmoji:'🕋', iconBorder:'var(--chronus)' },
      { id:'eom',				singleton:false, path:'./gadgets/eom.js',            label:'Days Left in Month',     defaultEnabled:true,  iconEmoji:'📆' },
      { id:'worldtz',			singleton:false, path:'./gadgets/worldtz.js',        label:'World Time Zone',        defaultEnabled:true,  iconEmoji:'🌐' },
      { id:'embed',				singleton:false, path:'./gadgets/embed.js',          label:'Custom Embed',           defaultEnabled:true,  iconEmoji:'🖼️' },
      { id:'helloworld',		singleton:false, path:'./gadgets/helloworld.js',     label:'Hello World',            defaultEnabled:false, iconEmoji:'👋' },
      { id:'prayertimes-chronus', singleton:false, path:'./gadgets/prayertimes-chronus.js', label:'Prayer Times (Chronus)', defaultEnabled:false },
      { id:'runway-viewport',	singleton:false, path:'./gadgets/runway-viewport.js', label:'Runway Viewport',   defaultEnabled:false, iconEmoji:'🛫', iconBorder:'var(--chronus)'},
	  { id:'chronus_sequencer',	singleton:true, path:'./gadgets/chronus_sequencer.js',  label:'Chronus Sequencer', defaultEnabled:false, iconEmoji:'🧩', iconBorder:'var(--chronus)' },
	  { id:'flashcards',		singleton:true, path:'./gadgets/flashcards.js',       label:'Flash Cards',       defaultEnabled:false, iconEmoji:'🃏', iconBorder:'var(--chronus)', supportsSettings:true },
	  { id:'EmbedWeb',		singleton:false, path:'./gadgets/embed-web.js',       label:'Embed Web',       defaultEnabled:false, iconEmoji:'🌐', iconBorder:'var(--chronus)' },
	  // Should be upgraded to new 1.2 API - has never worked yet btw.
	  { id:'atlas-debug',		singleton:true, path:'./gadgets/atlas-debug.js',   label:'Atlas Debug',     defaultEnabled:true, iconEmoji:'🗺️', iconBorder:'var(--chronus)' },
	  { id:'helloworld++', singleton:true, path:'./gadgets/helloworld-settings.js', label:'Hello World (+⚙️)', defaultEnabled:false, iconEmoji:'👋', iconBorder:'var(--chronus)', supportsSettings:true },

    ]
  };

  // Derived lookups
  const PATHS = Object.fromEntries((window.REGISTRY.GADGETS || [])
    .filter(g => g.path)
    .map(g => [g.id, g.path]));

  const GADGET_CATALOG = window.REGISTRY.GADGETS || [];

  const _loaded = new Set();
  async function loadGadget(name) {
    const path = PATHS[name];
    if (!path) {
      if (window.GADGETS && window.GADGETS[name]) return window.GADGETS[name];
      throw new Error(`No path defined for gadget: ${name}`);
    }
    if (!_loaded.has(path)) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = path; s.async = true;
        s.onload = () => { _loaded.add(path); resolve(); };
        s.onerror = () => reject(new Error('Failed to load ' + path));
        document.head.appendChild(s);
      });
    }
    const api = window.GADGETS && window.GADGETS[name];
    if (!api || typeof api.mount !== 'function') {
      // Legacy HTML-only support: if file extension is .html, inject later in loader
      if (String(path).toLowerCase().endsWith('.html')) {
        return {
          manifest: { _api:'0.0', _class:name, _type:'singleton', _id:'Main', _ver:'v0.0.0', bidi:'rtl', capabilities:[] },
          mount(host) { fetch(path).then(r=>r.text()).then(html => host.innerHTML = html).catch(()=> host.innerHTML = '<div class="err">Failed to load HTML.</div>'); }
        };
      }
      throw new Error(`Gadget ${name} missing mount() API`);
    }
    return api;
  }

  // Export
  window.REGISTRY.loadGadget      = loadGadget;
  window.REGISTRY.GADGET_CATALOG  = GADGET_CATALOG;
  window.REGISTRY.PATHS           = PATHS;
})();
