import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("PWA contains the verified splash artwork and vintage title", () => {
  for (const name of ["warehouse-splash-clean.png", "conductor-vintage-title.png"]) {
    const asset = fs.readFileSync(path.join(root, "mobile", name));
    assert.ok(asset.length > 1_000_000, `${name} is unexpectedly small`);
    assert.deepEqual([...asset.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
});

test("startup screens remain visible and return after app resume", () => {
  const androidActivity = fs.readFileSync(path.join(root, "android-app", "MainActivity.template.java"), "utf8");
  const webApp = fs.readFileSync(path.join(root, "mobile", "app.js"), "utf8");
  const webPage = fs.readFileSync(path.join(root, "mobile", "index.html"), "utf8");
  const splashCss = fs.readFileSync(path.join(root, "mobile", "splash.css"), "utf8");

  assert.match(androidActivity, /setStatusBarColor\(Color\.rgb\(7, 10, 18\)\)/);
  assert.match(androidActivity, /WindowInsetsCompat\.Type\.systemBars\(\)/);
  assert.match(androidActivity, /params\.topMargin = bars\.top/);
  assert.match(webApp, /document\.addEventListener\("visibilitychange"/);
  assert.match(webPage, /warehouse-splash-clean\.png\?v=1/);
  assert.match(webPage, /conductor-vintage-title\.png\?v=1/);
  assert.match(webPage, /splash\.css\?v=3/);
  assert.match(splashCss, /bottom: max\(28px, env\(safe-area-inset-bottom\) \+ 18px\)/);
  assert.match(webPage, /data-min-display-ms="6200"/);
});
