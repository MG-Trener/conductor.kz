import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("PWA uses the same verified splash artwork as Android", () => {
  const pwaSplash = fs.readFileSync(path.join(root, "mobile", "warehouse-splash.png"));
  assert.ok(pwaSplash.length > 1_000_000, "verified splash asset is unexpectedly small");
  assert.deepEqual([...pwaSplash.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});

test("startup screens remain visible and return after app resume", () => {
  const androidConfig = fs.readFileSync(path.join(root, "android-app", "configure-android.mjs"), "utf8");
  const webApp = fs.readFileSync(path.join(root, "mobile", "app.js"), "utf8");
  const webPage = fs.readFileSync(path.join(root, "mobile", "index.html"), "utf8");

  assert.match(androidConfig, /mobile", "warehouse-splash\.png"/);
  assert.match(androidConfig, /public void onResume\(\)/);
  assert.match(androidConfig, /returningFromBackground/);
  assert.match(webApp, /document\.addEventListener\("visibilitychange"/);
  assert.match(webPage, /warehouse-splash\.png\?v=1/);
  assert.match(webPage, /data-min-display-ms="2200"/);
});
