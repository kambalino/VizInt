// Cookie-backed portal settings (serverless, file:// friendly)
const COOKIE = 'portalSettings';
const COOKIE_DAYS = 30;

// default gadgets (all four listed; two implemented)

// ——— VizInt global one-shot script loader ———
(function(){
	// shared set across the whole portal so multiple gadgets don't double-load
	const _once = (window.__VIZINT_SCRIPT_ONCE__ = window.__VIZINT_SCRIPT_ONCE__ || new Set());

	async function loadExternalScriptOnce(src, check, timeoutMs=8000){
		// If already loaded and the check passes, bail out fast
		try { if (_once.has(src) && check && check()) return true; } catch(_){}

		// If a tag with same src already exists, don’t append a second one
		let tag = Array.from(document.scripts).find(s => s.src && s.src.endsWith(src));
		if (!tag){
			tag = document.createElement('script');
			tag.src = src;
			tag.async = true;
			document.head.appendChild(tag);
		}

		// Wait until the check passes (or timeout)
		const t0 = Date.now();
		return await new Promise((resolve, reject)=>{
			function poll(){
				try{
					if (!check || check()){
						_once.add(src);
						return resolve(true);
					}
				}catch(_){}
				if (Date.now()-t0 >= timeoutMs) return reject(new Error('Timeout loading '+src));
				setTimeout(poll, 80);
			}
			tag.onload = poll;
			tag.onerror = ()=> reject(new Error('Failed to load '+src));
			// If the script was already cached/loaded, start polling immediately
			setTimeout(poll, 0);
		});
	}

	// Expose globally for gadgets
	window.loadExternalScriptOnce = window.loadExternalScriptOnce || loadExternalScriptOnce;
})();


// --- Safe protocol helper ---
// Chooses HTTP for local files, HTTPS for secure origins
function httpSafe(url) {
  // Local development (file://) → prefer HTTP
  if (location.protocol === 'file:') {
    return 'http://' + url;
  }

  // HTTPS pages (like GitHub Pages) → force HTTPS
  if (location.protocol === 'https:') {
    return 'https://' + url;
  }

  // HTTP servers → stay protocol-relative
  return '//' + url;
}



function setCookie(name, value, days=COOKIE_DAYS) {
  const d = new Date(Date.now() + days*864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d}; path=/`;
}
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^| )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// --- Shared adaptive IP-based geolocation helper ---
// Automatically picks best provider depending on protocol.
// Returns {lat, lng, country, source} or null.

// --- JSONP IP geo (works on file/http/https, bypasses CORS) ---

function ipApiJSONP(maxWaitMs = 4500) {
  return new Promise(resolve => {
    const cb = 'ipcb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
    const done = v => { try { delete window[cb]; } catch {} resolve(v || null); };
    window[cb] = resp => {
      if (resp && resp.success !== false && isFinite(resp.latitude) && isFinite(resp.longitude)) {
        done({
          lat: resp.latitude,
          lng: resp.longitude,
          country: (resp.country_code || 'NA'),
		  city: resp.city || '',
          source: 'ipwho.is'
        });
      } else done(null);
    };
    const s = document.createElement('script');
    s.src = httpSafe('ipwho.is/?callback=' + cb);
    s.onerror = () => done(null);
    document.head.appendChild(s);
    setTimeout(() => done(null), maxWaitMs);
  });
}


// --- Best-geo resolver (device → IP → Cairo), no prompts on file/http ---
async function getBestGeo({ ipTimeoutMs = 4500 } = {}) {
  const CAIRO = { lat: 30.0444, lng: 31.2357, country: 'EG', source: 'CairoFallback' };

  // If we're not in a secure context (file:// or http://), skip device geo → IP only
  const secure = window.isSecureContext && location.protocol === 'https:';
  if (!secure) {
    const ip = await ipApiJSONP(ipTimeoutMs);
    return ip || CAIRO;
  }

  // Secure (https): try to use device geolocation *silently* when already granted
  try {
    if (navigator.permissions && navigator.permissions.query) {
      const p = await navigator.permissions.query({ name: 'geolocation' });
      if (p.state === 'granted') {
        // Device position + race an IP call in parallel for country code
        const posP = new Promise(res => {
          navigator.geolocation.getCurrentPosition(
            pos => res({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'geo' }),
            () => res(null),
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
          );
        });
        const [pos, ip] = await Promise.all([posP, ipApiJSONP(ipTimeoutMs)]);
        if (pos) return { ...pos, country: (ip && ip.country) || 'NA', source: pos.source };
      }
      // If state is 'prompt' or 'denied', do NOT trigger a prompt → go to IP fallback
    }
  } catch {
    // ignore and fall through
  }

  // IP fallback (JSONP) → Cairo
  const ip = await ipApiJSONP(ipTimeoutMs);
  return ip || CAIRO;
}



window.httpSafe = httpSafe;
window.ipApiJSONP = ipApiJSONP;
window.setCookie = setCookie;
window.getCookie = getCookie;

// === Registry helpers (serverless discovery) ===
// These work under file:// or http/https. Safe to include here since they
// don't depend on DOM elements until called.

window.hydrateRegistryFromStorage = function() {
  try {
    const saved = JSON.parse(localStorage.getItem('vizint.registry') || 'null');
    if (saved && Array.isArray(saved)) {
      window.REGISTRY = window.REGISTRY || {};
      const byId = new Map(saved.map(g => [g.id, g]));
      const shipped = (window.REGISTRY.GADGETS || []);
      for (const g of shipped) byId.set(g.id, { ...g, ...byId.get(g.id) });
      window.REGISTRY.GADGETS = Array.from(byId.values());
    }
  } catch {}
};

window.persistRegistry = function() {
  const list = (window.REGISTRY?.GADGETS || []);
  localStorage.setItem('vizint.registry', JSON.stringify(list));
};

window.pickAndScanGadgets = async function() {
  if (!window.showDirectoryPicker)
    throw new Error('Directory picker not supported in this browser.');
  const root = await showDirectoryPicker();
  const found = [];
  async function walk(dirHandle, base = ".") {
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.js')) {
        const id = entry.name.replace(/\.js$/, '');
        found.push({
          id,
          path: base + '/' + entry.name,
          label: id[0].toUpperCase() + id.slice(1),
          defaultEnabled: false
        });
      } else if (entry.kind === 'directory') {
        await walk(entry, base + '/' + entry.name);
      }
    }
  }
  await walk(root, ".");
  window.mergeDiscovered(found);
  alert(`Discovered ${found.length} gadget(s). See Settings to enable them.`);
};

window.initFolderUploadScanner = function(fileInputEl) {
  fileInputEl.addEventListener('change', e => {
    const files = Array.from(e.target.files).filter(f => f.name.endsWith('.js'));
    const found = files.map(f => ({
      id: f.name.replace(/\.js$/, ''),
      path: './gadgets/' + f.name,
      label: f.name.replace(/\.js$/, ''),
      defaultEnabled: false
    }));
    window.mergeDiscovered(found);
    alert(`Discovered ${found.length} gadget(s). See Settings to enable them.`);
  });
};

window.installByUrl = async function(id, url, label = id, defaultEnabled = false) {
  const entry = { id, path: url, label, defaultEnabled };
  window.mergeDiscovered([entry]);
};

window.mergeDiscovered = function(items) {
	window.REGISTRY = window.REGISTRY || {};
	const current = window.REGISTRY.GADGETS || [];
	const byId = new Map(current.map(g => [g.id, g]));
	for (const g of items) byId.set(g.id, { ...byId.get(g.id), ...g });
	window.REGISTRY.GADGETS = Array.from(byId.values());
	// keep derived tables in sync for anyone still reading them
	window.REGISTRY.GADGET_CATALOG = (window.REGISTRY.GADGETS || [])
	.map(({ id, label }) => ({ id, label }));
	window.REGISTRY.PATHS = Object.fromEntries((window.REGISTRY.GADGETS || [])
	.filter(g => g.path).map(g => [g.id, g.path]));
	window.persistRegistry();
	window.dispatchEvent(new CustomEvent('registry:updated'));
};
