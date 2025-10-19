// Cookie-backed portal settings (serverless, file:// friendly)
const COOKIE = 'portalSettings';
const COOKIE_DAYS = 30;

// default gadgets (all four listed; two implemented)

// --- Safe protocol helper ---
// Works with HTTPS, HTTP, or file:// origins
/*
window.httpSafe = function(url) {
  return (location.protocol === 'file:' ? 'https:' : '') + '//' + url;
};*/

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
