import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const execFileAsync = promisify(execFile);

async function missing(path) {
  try { await access(new URL(path, root)); return false; } catch { return true; }
}

test("mobile has one core owner for catalog, products and sale transactions", async () => {
  const [app, bootstrap, ui, analytics, sales] = await Promise.all([
    read("mobile/app.js"), read("mobile/bootstrap.js"), read("mobile/warehouse-ui.js"), read("mobile/analytics.js"), read("mobile/sales-history.js")
  ]);
  assert.match(app, /window\.CONDUCTOR_APP_API/);
  assert.match(app, /function modelSalePrice/);
  assert.match(app, /async function commitSale/);
  assert.equal((app.match(/tx\.set\(saleRef/g) || []).length, 1, "sale write must exist once in the core app");
  assert.match(ui, /api\.commitSale/);
  assert.doesNotMatch(ui, /onSnapshot\s*\(/);
  assert.doesNotMatch(ui, /collection\([^\n]*"products"/);
  assert.doesNotMatch(ui, /collection\([^\n]*"catalog"/);
  assert.doesNotMatch(analytics, /onSnapshot\s*\(/);
  assert.doesNotMatch(sales, /onSnapshot\s*\(/);
  assert.match(bootstrap, /warehouse-ui\.js/);
  assert.doesNotMatch(bootstrap, /inventory-state|warehouse-enhancements/);
});

test("DM60R1G variants, model price and inventory save live in the core app", async () => {
  const [app, publicPrices] = await Promise.all([read("mobile/app.js"), read("assets/public-prices.js")]);
  assert.match(app, /id: "DM60R1G", name: "DM60R1G \(интрига\)", price: 4000/);
  assert.match(app, /\["BLUE", "Синий", "#258cff"\]/);
  assert.match(app, /\["PINK", "Розовый", "#ff6bab"\]/);
  assert.match(app, /virtual: true/);
  assert.match(app, /id="model-sale-price"/);
  assert.match(app, /tx\.set\(catalogRef/);
  assert.match(app, /if \(!snap\.exists\(\)\)/);
  assert.match(publicPrices, /DM60R1G/);
});

test("sale UI uses the exact items and prices calculated by the core", async () => {
  const [app, ui] = await Promise.all([read("mobile/app.js"), read("mobile/warehouse-ui.js")]);
  assert.match(app, /getSelectedItems: \(\) => selectedItems\(\)/);
  assert.match(ui, /api\?\.getSelectedItems/);
  assert.doesNotMatch(ui, /function modelPrice/);
  assert.doesNotMatch(ui, /catalog\.find/);
  assert.equal((ui.match(/tx\.set\(saleRef/g) || []).length, 0);
});

test("orders are read once and shared with analytics and operations", async () => {
  const [app, analytics, sales] = await Promise.all([read("mobile/app.js"), read("mobile/analytics.js"), read("mobile/sales-history.js")]);
  assert.match(app, /conductor:orders-changed/);
  assert.match(app, /getOrders: \(\) => state\.sales/);
  assert.match(analytics, /getOrders\(\)/);
  assert.match(sales, /getOrders\(\)/);
  assert.match(sales, /api\.cancelSale/);
  assert.doesNotMatch(sales, /runTransaction/);
});

test("service worker is registered only by bootstrap and never in native Android", async () => {
  const [app, bootstrap] = await Promise.all([read("mobile/app.js"), read("mobile/bootstrap.js")]);
  assert.doesNotMatch(app, /serviceWorker\.register/);
  assert.match(bootstrap, /!isNativeApp\(\)/);
  assert.match(bootstrap, /serviceWorker\.register/);
});

test("active mobile entry points use stable filenames", async () => {
  const index = await read("mobile/index.html");
  for (const name of ["app.js?v=109", "bootstrap.js?v=1", "core-ui.js?v=1", "version-history.js?v=1", "startup-guard.js?v=1", "release.css?v=1"]) assert.ok(index.includes(name), `${name} must be loaded`);
  assert.doesNotMatch(index, /bootstrap-10|core-ui-10|version-history-10|release-10|inventory-state|warehouse-enhancements/);
});

test("legacy mobile and temporary DM60R1G artifacts are absent", async () => {
  const dead = [
    "mobile/bootstrap-103.js", "mobile/bootstrap-104.js", "mobile/core-ui-103.js", "mobile/core-ui-104.js", "mobile/core-ui-105.js",
    "mobile/inventory-state.js", "mobile/warehouse-enhancements.js", "mobile/warehouse-enhancements-legacy.js", "mobile/ui-fixes-070.js", "mobile/release-20260906.js",
    "mobile/warehouse-splash-vintage.png", "mobile/warehouse-splash.png", "android-app/patch-bundled-price-source.mjs", "android-app/release-1.0.18-trigger.txt",
    ".github/dm60r1g-image", ".github/dm60r1g-ready", ".github/dm60r1g-v1018-ready", ".github/workflows/apply-dm60r1g.yml",
    ".github/workflows/fix-dm60r1g-v1017.yml", ".github/workflows/fix-dm60r1g-v1017b.yml", ".github/workflows/fix-dm60r1g-v1018.yml"
  ];
  for (const path of dead) assert.equal(await missing(path), true, `${path} must be removed`);
});

test("operations and compact stock UI remain available", async () => {
  const [index, coreUi, css] = await Promise.all([read("mobile/index.html"), read("mobile/core-ui.js"), read("mobile/release.css")]);
  assert.match(index, /<h1>Операции<\/h1>/);
  assert.match(index, /id="open-stock-movements"/);
  assert.match(index, /id="movement-dialog"/);
  assert.match(coreUi, /stock-zero/);
  assert.match(coreUi, /stock-low/);
  assert.match(css, /stock-zero/);
  assert.match(css, /stock-low/);
  assert.match(css, /model-sale-price-row/);
});

test("settings keep updater, latest changes and section sounds", async () => {
  const [updater, sounds] = await Promise.all([read("mobile/app-update.js"), read("mobile/ui-sounds.js")]);
  assert.match(updater, /Последние изменения/);
  assert.match(updater, /app-update-latest-notes/);
  for (const fn of ["playNavigation", "playStock", "playSales", "playAnalytics", "playSettings"]) assert.ok(sounds.includes(fn));
});

test("version history begins with the current release", async () => {
  const [history, manifestText] = await Promise.all([read("mobile/version-history.js"), read("mobile/app-version.json")]);
  const manifest = JSON.parse(manifestText);
  const first = history.match(/const VERSIONS = \[\s*\{\s*version: "([^"]+)"/)?.[1];
  assert.equal(first, manifest.version);
  assert.ok(history.includes(`Актуальная версия: ${manifest.version}`));
  assert.ok(manifest.notes.length >= 40);
});

test("active mobile scripts pass syntax validation", async () => {
  for (const file of ["app.js", "bootstrap.js", "core-ui.js", "version-history.js", "version-history-archive.js", "startup-guard.js", "app-update.js", "analytics.js", "sales-history.js", "warehouse-ui.js", "push-notifications.js", "firestore-error-help.js", "ui-sounds.js"]) {
    await execFileAsync(process.execPath, ["--check", fileURLToPath(new URL(`mobile/${file}`, root))]);
  }
});

test("Android release build validates bundle, version and APK size", async () => {
  const [workflow, packageText] = await Promise.all([read(".github/workflows/build-android-apk.yml"), read("android-app/package.json")]);
  const pkg = JSON.parse(packageText);
  assert.equal(pkg.scripts?.postinstall, undefined);
  assert.match(workflow, /node --check mobile\/app\.js/);
  assert.match(workflow, /node --check mobile\/warehouse-ui\.js/);
  assert.match(workflow, /test ! -f android-app\/www\/inventory-state\.js/);
  assert.match(workflow, /APK unexpectedly exceeds 8 MiB/);
  assert.doesNotMatch(workflow, /feature\/in-app-updates/);
});

test("native updater remains pinned to GitHub release and SHA-256", async () => {
  const [webUpdater, nativeUpdater] = await Promise.all([read("mobile/app-update.js"), read("android-app/configure-updater.mjs")]);
  assert.match(webUpdater, /asset\.digest/);
  assert.match(webUpdater, /sha256:\s*lastRelease\.sha256/);
  assert.match(nativeUpdater, /ALLOWED_HOST = "github\.com"/);
  assert.match(nativeUpdater, /verifySha256/);
});

test("PWA cache contains only current application modules", async () => {
  const sw = await read("mobile/sw.js");
  assert.match(sw, /conductor-mobile-v63/);
  for (const asset of ["app.js?v=109", "bootstrap.js?v=1", "core-ui.js?v=1", "version-history.js?v=1", "warehouse-ui.js?v=1", "release.css?v=1"]) assert.ok(sw.includes(asset));
  assert.doesNotMatch(sw, /inventory-state|warehouse-enhancements|bootstrap-10|core-ui-10/);
});
