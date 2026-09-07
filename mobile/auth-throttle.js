export const ATTEMPTS_PER_STAGE = 5;
export const LOCK_DURATIONS_MS = Object.freeze([
  5 * 60 * 1000,
  30 * 60 * 1000,
  24 * 60 * 60 * 1000
]);

const STORAGE_PREFIX = "conductor.login-throttle.v1:";

export function normalizeLogin(value = "") {
  return String(value).trim().toLowerCase();
}

function fallbackStorage() {
  const values = new Map();
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); }
  };
}

function storageKey(email) {
  return `${STORAGE_PREFIX}${encodeURIComponent(normalizeLogin(email))}`;
}

function cleanState(value) {
  const failures = Math.max(0, Math.trunc(Number(value?.failures || 0)));
  const stage = Math.max(0, Math.min(2, Math.trunc(Number(value?.stage || 0))));
  const lockedUntil = Math.max(0, Math.trunc(Number(value?.lockedUntil || 0)));
  return { failures, stage, lockedUntil };
}

export function createLoginThrottle(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  let storage = options.storage;
  if (!storage) {
    try { storage = globalThis.localStorage; } catch { storage = null; }
  }
  if (!storage) storage = fallbackStorage();

  function read(email) {
    const key = storageKey(email);
    try {
      const raw = storage.getItem(key);
      return raw ? cleanState(JSON.parse(raw)) : cleanState();
    } catch {
      return cleanState();
    }
  }

  function write(email, state) {
    try { storage.setItem(storageKey(email), JSON.stringify(cleanState(state))); } catch {}
    return cleanState(state);
  }

  function status(email) {
    const state = read(email);
    const current = now();
    if (state.lockedUntil && state.lockedUntil <= current) {
      state.lockedUntil = 0;
      write(email, state);
    }
    return {
      ...state,
      locked: state.lockedUntil > current,
      remainingMs: Math.max(0, state.lockedUntil - current)
    };
  }

  function recordFailure(email) {
    const normalized = normalizeLogin(email);
    if (!normalized) return status(normalized);
    const current = status(normalized);
    if (current.locked) return current;

    const next = cleanState(current);
    next.failures += 1;
    if (next.failures >= ATTEMPTS_PER_STAGE) {
      const duration = LOCK_DURATIONS_MS[Math.min(next.stage, LOCK_DURATIONS_MS.length - 1)];
      next.failures = 0;
      next.lockedUntil = now() + duration;
      next.stage = Math.min(next.stage + 1, LOCK_DURATIONS_MS.length - 1);
    }
    write(normalized, next);
    return status(normalized);
  }

  function forceDayLock(email) {
    const normalized = normalizeLogin(email);
    const next = read(normalized);
    next.failures = 0;
    next.stage = LOCK_DURATIONS_MS.length - 1;
    next.lockedUntil = now() + LOCK_DURATIONS_MS[LOCK_DURATIONS_MS.length - 1];
    write(normalized, next);
    return status(normalized);
  }

  function clear(email) {
    try { storage.removeItem(storageKey(email)); } catch {}
  }

  return Object.freeze({ status, recordFailure, forceDayLock, clear });
}

export function formatRemaining(ms) {
  const totalSeconds = Math.max(1, Math.ceil(Number(ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours} ч ${minutes} мин`;
  if (minutes) return `${minutes} мин ${seconds} сек`;
  return `${seconds} сек`;
}
