import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const execFileAsync = promisify(execFile);

test("mobile app uses the compact stock UI entry points", async () => {
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
  assert.equal(bootstrap.split("./ui-sounds.js?v=1").length - 1, 1, "ui-sounds.js must be imported once by bootstrap-104.js");

  assert.doesNotMatch(firebaseConfig, /loadUiModule|setTimeout\(.*inventory-state/s);
  assert.doesNotMatch(errorHelper, /import\s+["']\.\//);
  assert.doesNotMatch(push, /analytics\.js/);
});

test("startup UI cannot self-trigger an endless mutation loop", async () => {
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

test("bottom navigation stays in one row and Settings label is rendered once", async () => {
  const [index, compactCss, coreUi] = await Promise.all([
    read("mobile/index.html"),
    read("mobile/release-105.css"),
    read("mobile/core-ui-105.js")
  ]);
  const nav = index.match(/<nav class="bottom-nav"[\s\S]*?<\/nav>/)?.[0] || "";
  assert.equal((nav.match(/class="nav-btn/g) || []).length, 4);
  assert.match(nav, /data-nav="settings"/);
  assert.match(compactCss, /display:flex!important/);
  assert.match(compactCss, /flex-wrap:nowrap!important/);
  assert.doesNotMatch(compactCss, /content:"Настройки"/);
  assert.match(coreUi, /settingsNav\.textContent !== "Настройки"/);
  assert.match(coreUi, /settingsNav\.textContent = "Настройки"/);
});

test("settings keep update checker and latest changes visible", async () => {
  const [compactCss, updater] = await Promise.all([
    read("mobile/release-105.css"),
    read("mobile/app-update.js")
  ]);
  assert.match(compactCss, /settings-row:has\(#settings-project\)/);
  assert.match(compactCss, /#view-settings > \.panel:not\(\.settings-panel\):not\(\.app-update-card\)/);
  assert.match(compactCss, /#view-settings > \.app-update-card/);
  assert.match(compactCss, /#view-settings #app-update-check/);
  assert.match(compactCss, /#view-settings #app-update-download/);
  assert.match(updater, /id="app-update-check"/);
  assert.match(updater, /Проверить ещё раз/);
  assert.match(updater, /id="app-update-download"/);
  assert.match(updater, /Последние изменения/);
  assert.match(updater, /app-update-latest-notes/);
  assert.match(updater, /release\?\.body/);
  assert.match(updater, /checkForUpdate\(\)/);
});

test("version history starts with the current 1.0.12 release and contains recent releases", async () => {
  const history = await read("mobile/version-history-105.js");
  assert.match(history, /const VERSIONS = \[\s*\{\s*version: "1\.0\.12"/);
  for (const version of ["1.0.11", "1.0.10", "1.0.9", "1.0.8", "1.0.7", "1.0.6", "1.0.5", "1.0.4", "1.0.3", "1.0.2", "1.0.1"]) {
    assert.ok(history.includes(`version: "${version}"`), `version history must contain ${version}`);
  }
  assert.match(history, /Актуальная версия: 1\.0\.12/);
});

test("section-specific UI sounds cover navigation, stock, sales, analytics and settings", async () => {
  const sounds = await read("mobile/ui-sounds.js");
  assert.match(sounds, /playNavigation/);
  assert.match(sounds, /playStock/);
  assert.match(sounds, /playSales/);
  assert.match(sounds, /playAnalytics/);
  assert.match(sounds, /playSettings/);
  assert.match(sounds, /\.bottom-nav/);
  assert.match(sounds, /#view-stock/);
  assert.match(sounds, /#sale-form/);
  assert.match(sounds, /#view-analytics/);
  assert.match(sounds, /#view-settings/);
});

test("mobile UI scripts pass syntax validation", async () => {
  for (const file of ["mobile/bootstrap-104.js", "mobile/core-ui-105.js", "mobile/version-history-105.js", "mobile/startup-guard-104.js", "mobile/ui-sounds.js"]) {
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

test("PWA cache contains current settings and UI sound assets", async () => {
  const sw = await read("mobile/sw.js");
  assert.match(sw, /const CACHE = "conductor-mobile-v58"/);
  for (const asset of ["release-103.css", "release-105.css?v=2", "app.js?v=104", "bootstrap-104.js", "core-ui-105.js?v=2", "version-history-105.js", "startup-guard-104.js", "ui-sounds.js?v=1"]) {
    assert.ok(sw.includes(`./${asset}`), `${asset} must be cached`);
  }
  assert.match(sw, /fetch\(request, \{ cache: "no-store" \}\)/);
});
