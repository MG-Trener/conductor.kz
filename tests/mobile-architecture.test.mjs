import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const execFileAsync = promisify(execFile);

test("1.0.5 uses the compact stock UI entry points", async () => {
  const [index, bootstrap, firebaseConfig, errorHelper, push] = await Promise.all([
    read("mobile/index.html"),
    read("mobile/bootstrap-104.js"),
    read("mobile/firebase-config.js"),
    read("mobile/firestore-error-help.js"),
    read("mobile/push-notifications.js")
  ]);

  assert.match(index, /app\.js\?v=104/);
  assert.match(index, /bootstrap-104\.js/);
  assert.match(index, /core-ui-105\.js/);
  assert.match(index, /version-history-105\.js/);
  assert.match(index, /startup-guard-104\.js/);
  assert.match(index, /release-103\.css/);
  assert.match(index, /release-105\.css/);
  assert.match(index, /Content-Security-Policy/);

  for (const moduleName of [
    "app-update.js",
    "analytics.js",
    "sales-history.js",
    "warehouse-enhancements.js",
    "inventory-state.js",
    "push-notifications.js",
    "firestore-error-help.js"
  ]) {
    assert.equal(bootstrap.split(`./${moduleName}?v=104`).length - 1, 1, `${moduleName} must be imported once by bootstrap-104.js`);
  }

  assert.doesNotMatch(firebaseConfig, /loadUiModule|setTimeout\(.*inventory-state/s);
  assert.doesNotMatch(errorHelper, /import\s+["']\.\//);
  assert.doesNotMatch(push, /analytics\.js/);
});

test("1.0.5 startup UI cannot self-trigger an endless mutation loop", async () => {
  const [coreUi, guard] = await Promise.all([
    read("mobile/core-ui-105.js"),
    read("mobile/startup-guard-104.js")
  ]);
  assert.doesNotMatch(coreUi, /new MutationObserver/);
  assert.match(coreUi, /decorateStockRows/);
  assert.match(coreUi, /setInterval\(refreshCompactStockUi, 1200\)/);
  assert.match(guard, /window\.setTimeout\(finishStuckBoot, 9000\)/);
  assert.match(guard, /ALLOWED_EMAILS/);
  assert.match(guard, /boot\.classList\.add\("hide"\)/);
});

test("operations and movement journal remain structurally correct", async () => {
  const [index, coreUi, releaseCss] = await Promise.all([
    read("mobile/index.html"),
    read("mobile/core-ui-105.js"),
    read("mobile/release-103.css")
  ]);

  const salesView = index.match(/<section id="view-sales"[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(salesView, /<h1>Операции<\/h1>/);
  assert.doesNotMatch(salesView, /data-nav="sale"/);

  const stockView = index.match(/<section id="view-stock"[\s\S]*?<\/section>/)?.[0] || "";
  assert.match(stockView, /id="open-stock-movements"/);
  assert.doesNotMatch(stockView, /id="movement-list"/);
  assert.doesNotMatch(stockView, /<h2>Журнал движения<\/h2>/);

  const movementDialog = index.match(/<dialog id="movement-dialog"[\s\S]*?<\/dialog>/)?.[0] || "";
  assert.match(movementDialog, /id="movement-list"/);
  assert.match(movementDialog, /<h2>Журнал движения<\/h2>/);

  assert.match(releaseCss, /#view-stock \.stock-color-summary\s*\{[\s\S]*display:grid!important/);
  assert.match(releaseCss, /grid-template-columns:1fr!important/);
  assert.match(coreUi, /stripColorCount/);
  assert.match(coreUi, /open-stock-movements/);
});

test("compact stock rows keep quantities right aligned and expose zero/low states", async () => {
  const [coreUi, compactCss] = await Promise.all([
    read("mobile/core-ui-105.js"),
    read("mobile/release-105.css")
  ]);
  assert.match(coreUi, /stock-zero/);
  assert.match(coreUi, /stock-low/);
  assert.match(coreUi, /value > 0 && value <= 2/);
  assert.match(compactCss, /border-bottom:1px solid rgba\(148,163,184,\.11\)!important/);
  assert.match(compactCss, /margin-left:auto!important/);
  assert.match(compactCss, /text-align:right!important/);
  assert.match(compactCss, /stock-zero/);
  assert.match(compactCss, /stock-low/);
});

test("version history starts with 1.0.5 and contains recent releases", async () => {
  const history = await read("mobile/version-history-105.js");
  assert.match(history, /const VERSIONS = \[\s*\{\s*version: "1\.0\.5"/);
  assert.match(history, /version: "1\.0\.4"/);
  assert.match(history, /version: "1\.0\.3"/);
  assert.match(history, /version: "1\.0\.2"/);
  assert.match(history, /version: "1\.0\.1"/);
  assert.match(history, /Актуальная версия: 1\.0\.5/);
});

test("new 1.0.5 scripts pass syntax validation", async () => {
  for (const file of ["mobile/bootstrap-104.js", "mobile/core-ui-105.js", "mobile/version-history-105.js", "mobile/startup-guard-104.js"]) {
    await execFileAsync(process.execPath, ["--check", new URL(file, root).pathname]);
  }
});

test("production Android configuration uses bundled web assets and no-cache mode", async () => {
  const [capacitorConfigText, workflow, activity] = await Promise.all([
    read("android-app/capacitor.config.json"),
    read(".github/workflows/build-android-apk.yml"),
    read("android-app/MainActivity.template.java")
  ]);
  const capacitorConfig = JSON.parse(capacitorConfigText);

  assert.equal(capacitorConfig.webDir, "www");
  assert.equal(capacitorConfig.server?.url, undefined);
  assert.match(workflow, /Prepare bundled mobile web app/);
  assert.match(workflow, /cp -R mobile\/\. android-app\/www\//);
  assert.match(workflow, /Production Android build must not use remote server\.url/);
  assert.match(activity, /WebSettings\.LOAD_NO_CACHE/);
  assert.match(activity, /webView\.clearCache\(true\)/);
});

test("native updater accepts only the warehouse release and verifies SHA-256", async () => {
  const [webUpdater, nativeUpdater] = await Promise.all([
    read("mobile/app-update.js"),
    read("android-app/configure-updater.mjs")
  ]);

  assert.match(webUpdater, /asset\.digest/);
  assert.match(webUpdater, /sha256:\s*lastRelease\.sha256/);
  assert.match(webUpdater, /browser_download_url !== APK_DOWNLOAD_URL/);
  assert.match(nativeUpdater, /ALLOWED_HOST = \\"github\.com\\"|ALLOWED_HOST = "github\.com"/);
  assert.match(nativeUpdater, /verifySha256/);
  assert.match(nativeUpdater, /MessageDigest\.getInstance\(\\?"SHA-256\\?"\)/);
});

test("PWA cache contains 1.0.5 compact stock assets", async () => {
  const sw = await read("mobile/sw.js");
  assert.match(sw, /const CACHE = "conductor-mobile-v54"/);
  for (const asset of ["release-103.css", "release-105.css", "app.js?v=104", "bootstrap-104.js", "core-ui-105.js", "version-history-105.js", "startup-guard-104.js"]) {
    assert.ok(sw.includes(`./${asset}`), `${asset} must be cached`);
  }
  assert.match(sw, /fetch\(request, \{ cache: "no-store" \}\)/);
});
