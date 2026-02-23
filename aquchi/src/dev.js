const DEV_MODE_STORAGE_KEY = 'aquatab_dev_mode';
const DEV_MODE_EVENT = 'aquatab:dev-mode-changed';

function readStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function isDevMode() {
  const storage = readStorage();
  if (!storage) return false;
  return storage.getItem(DEV_MODE_STORAGE_KEY) === '1';
}

export function setDevMode(on) {
  const storage = readStorage();
  if (!storage) return;
  storage.setItem(DEV_MODE_STORAGE_KEY, on ? '1' : '0');
  window.dispatchEvent(new CustomEvent(DEV_MODE_EVENT, { detail: { on: Boolean(on) } }));
}

export function toggleDevMode() {
  const next = !isDevMode();
  setDevMode(next);
  return next;
}

export function onDevModeChanged(callback) {
  if (typeof callback !== 'function') return () => {};
  const handler = (event) => callback(Boolean(event?.detail?.on));
  window.addEventListener(DEV_MODE_EVENT, handler);
  return () => window.removeEventListener(DEV_MODE_EVENT, handler);
}

export function getMaxSimSpeedMultiplier() {
  return isDevMode() ? 16 : 3;
}
