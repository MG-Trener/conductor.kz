import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("mobile features have one bootstrap entry point", async () => {
  const [index, bootstrap, firebaseConfig, errorHelper, push] = await Promise.all([
    read("mobile/index.html"),
    read("mobile/bootstrap.js"),
    read("mobile/firebase-config.js"),
    read("mobile/firestore-error-help.js"),
    read("mobile/push-notifications.js")
  ]);

  assert.match(index, /bootstrap\.js\?v=1/);
  assert.doesNotMatch(index, /type="module"[^>]+push-notifications\.js/);
  assert.doesNotMatch(index, /type="module"[^>]+firestore-error-help\.js/);
  assert.match(index, /Content-Security-Policy/);

  for (const moduleName of [
    "app-update.js",
    "analytics.js",
    "sales-history.js",
    "warehouse-enhancements.js",
    "version-history.js",
    "ui-fixes-070.js",
    "inventory-state.js",
    "push-notifications.js",
    "firestore-error-help.js"
  ]) {
    assert.equal(bootstrap.split(`./${moduleName}`).length - 1, 1, `${moduleName} must be imported once by bootstrap.js`);
  }

  assert.doesNotMatch(firebaseConfig, /loadUiModule|setTimeout\(.*inventory-state/s);
  assert.doesNotMatch(errorHelper, /import\s+["']\.\//);
  assert.doesNotMatch(push, /analytics\.js/);
});

test("production Android configuration uses bundled web assets", async () => {
  const [capacitorConfigText, workflow] = await Promise.all([
    read("android-app/capacitor.config.json"),
    read(".github/workflows/build-android-apk.yml")
  ]);
  const capacitorConfig = JSON.parse(capacitorConfigText);

  assert.equal(capacitorConfig.webDir, "www");
  assert.equal(capacitorConfig.server?.url, undefined);
  assert.match(workflow, /Prepare bundled mobile web app/);
  assert.match(workflow, /cp -R mobile\/\. android-app\/www\//);
  assert.match(workflow, /Production Android build must not use remote server\.url/);
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

test("PWA cache uses canonical feature module URLs", async () => {
  const sw = await read("mobile/sw.js");
  assert.match(sw, /conductor-mobile-v48/);
  for (const moduleName of ["analytics.js", "sales-history.js", "version-history.js", "ui-fixes-070.js"]) {
    assert.match(sw, new RegExp(`\\./${moduleName.replace(".", "\\.")}\\"`));
    assert.doesNotMatch(sw, new RegExp(`${moduleName.replace(".", "\\.")}\\?v=`));
  }
});
