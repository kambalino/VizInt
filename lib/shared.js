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
async function ipApiJSONP(maxWaitMs = 4000) {
  // Local files or HTTP servers → use ip-api.com JSONP
  if (location.protocol === 'file:' || location.protocol === 'http:') {
    return new Promise(resolve => {
      const cb = 'ipcb_' + Date.now() + '_' + Math.floor(Math.random() * 1e6);
      const done = v => { try { delete window[cb]; } catch {} resolve(v); };
      window[cb] = resp => {
        if (resp && resp.status === 'success' && isFinite(resp.lat) && isFinite(resp.lon)) {
          done({
            lat: resp.lat,
            lng: resp.lon,
            country: resp.countryCode || 'NA',
            source: 'ip-api'
          });
        } else done(null);
      };
      const s = document.createElement('script');
      s.src = 'http://ip-api.com/json/?fields=status,countryCode,lat,lon&callback=' + cb;
      s.onerror = () => done(null);
      document.head.appendChild(s);
      setTimeout(() => done(null), maxWaitMs);
    });
  }

  // HTTPS pages → use ipapi.co JSON API
  try {
    const r = await fetch('https://ipapi.co/json/');
    if (r.ok) {
      const d = await r.json();
      if (d.latitude && d.longitude) {
        return {
          lat: d.latitude,
          lng: d.longitude,
          country: d.country_code || 'NA',
          source: 'ipapi.co'
        };
      }
    }
  } catch (_) {}

  return null;
}

window.httpSafe = httpSafe;
window.ipApiJSONP = ipApiJSONP;
window.setCookie = setCookie;
window.getCookie = getCookie;
