// Cookie-backed portal settings (serverless, file:// friendly)
const COOKIE = 'portalSettings';
const COOKIE_DAYS = 30;

// default gadgets (all four listed; two implemented)

// --- Safe protocol helper ---
// Works with HTTPS, HTTP, or file:// origins
window.httpSafe = function(url) {
  return (location.protocol === 'file:' ? 'https:' : '') + '//' + url;
};


function setCookie(name, value, days=COOKIE_DAYS) {
  const d = new Date(Date.now() + days*864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d}; path=/`;
}
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^| )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
