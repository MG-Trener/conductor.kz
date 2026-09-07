import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  ATTEMPTS_PER_STAGE,
  LOCK_DURATIONS_MS,
  createLoginThrottle
} from "../mobile/auth-throttle.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

function buildThrottle() {
  let current = Date.UTC(2026, 8, 7, 12, 0, 0);
  const throttle = createLoginThrottle({
    storage: new MemoryStorage(),
    now: () => current
  });
  return {
    throttle,
    advance(ms) { current += ms; }
  };
}

function failFive(throttle, email) {
  let status;
  for (let i = 0; i < ATTEMPTS_PER_STAGE; i += 1) status = throttle.recordFailure(email);
  return status;
}

test("login throttle locks after 5 failures for 5 minutes, then 30 minutes, then 24 hours", () => {
  const { throttle, advance } = buildThrottle();
  const email = "User@Example.com";

  for (let i = 0; i < ATTEMPTS_PER_STAGE - 1; i += 1) {
    assert.equal(throttle.recordFailure(email).locked, false);
  }
  let status = throttle.recordFailure(email);
  assert.equal(status.locked, true);
  assert.equal(status.remainingMs, LOCK_DURATIONS_MS[0]);

  advance(LOCK_DURATIONS_MS[0] + 1);
  assert.equal(throttle.status(email).locked, false);
  status = failFive(throttle, email);
  assert.equal(status.locked, true);
  assert.equal(status.remainingMs, LOCK_DURATIONS_MS[1]);

  advance(LOCK_DURATIONS_MS[1] + 1);
  status = failFive(throttle, email);
  assert.equal(status.locked, true);
  assert.equal(status.remainingMs, LOCK_DURATIONS_MS[2]);

  advance(LOCK_DURATIONS_MS[2] + 1);
  status = failFive(throttle, email);
  assert.equal(status.locked, true);
  assert.equal(status.remainingMs, LOCK_DURATIONS_MS[2], "all further lockouts remain 24 hours");
});

test("successful login clears the escalation history", () => {
  const { throttle, advance } = buildThrottle();
  const email = "mihagavr@gmail.com";
  let status = failFive(throttle, email);
  assert.equal(status.locked, true);
  advance(LOCK_DURATIONS_MS[0] + 1);
  throttle.clear(email);
  status = failFive(throttle, email);
  assert.equal(status.remainingMs, LOCK_DURATIONS_MS[0]);
});

test("Firebase server abuse response forces a local 24 hour lock", () => {
  const { throttle } = buildThrottle();
  const status = throttle.forceDayLock("a.kalashin@gmail.com");
  assert.equal(status.locked, true);
  assert.equal(status.remainingMs, LOCK_DURATIONS_MS[2]);
});

test("mobile has sign-in and password reset only, with no account-registration code or UI", async () => {
  const [app, index, guard] = await Promise.all([
    read("mobile/app.js"),
    read("mobile/index.html"),
    read("mobile/startup-guard.js")
  ]);
  const combined = `${app}\n${index}`;
  assert.doesNotMatch(combined, /createUserWithEmailAndPassword|signUpWithEmail|accounts:signUp/i);
  assert.doesNotMatch(index, /(?:создать|зарегистрировать)\s+(?:аккаунт|уч[её]тн)/i);
  assert.match(app, /signInWithEmailAndPassword/);
  assert.match(app, /sendPasswordResetEmail/);
  assert.doesNotMatch(guard, /ALLOWED_EMAILS|ALLOWED_EMAILS\.has/);
  assert.match(guard, /event\.stopImmediatePropagation\(\)/);
});
