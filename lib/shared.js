// Cookie-backed portal settings (serverless, file:// friendly)
const COOKIE = 'portalSettings';
const COOKIE_DAYS = 30;

// default gadgets (all four listed; two implemented)
export const DEFAULT_ENABLED = ['daily','prayers','eom','settings'];

function setCookie(name, value, days=COOKIE_DAYS) {
  const d = new Date(Date.now() + days*864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${d}; path=/`;
}
function getCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^| )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

export function getSettings() {
  const raw = getCookie(COOKIE);
  if (!raw) return { enabledGadgets: DEFAULT_ENABLED.slice() };
  try {
    const parsed = JSON.parse(raw);
    // ensure enabledGadgets exists
    if (!Array.isArray(parsed.enabledGadgets)) parsed.enabledGadgets = DEFAULT_ENABLED.slice();
    return parsed;
  } catch {
    return { enabledGadgets: DEFAULT_ENABLED.slice() };
  }
}

export function setSettings(next) {
  const prev = getSettings();
  const merged = { ...prev, ...next };
  setCookie(COOKIE, JSON.stringify(merged));
  return merged;
}
