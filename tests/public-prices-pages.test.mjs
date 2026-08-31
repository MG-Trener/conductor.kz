import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const pages = {
  home: new URL("../index.html", import.meta.url),
  smoke: new URL("../cvetnoy-dym/index.html", import.meta.url),
  holi: new URL("../kraski-holi/index.html", import.meta.url)
};

const mobileApp = new URL("../mobile/app.js", import.meta.url);
const mobileHtml = new URL("../mobile/index.html", import.meta.url);
const mobileWorker = new URL("../mobile/sw.js", import.meta.url);
const publicPriceModule = new URL("../assets/public-prices.js", import.meta.url);

test("all public product pages load the shared live price module", async () => {
  for (const [name, url] of Object.entries(pages)) {
    const html = await readFile(url, "utf8");
    assert.match(html, /\/assets\/public-prices\.js\?v=4/, `${name} is missing the current price module`);
    assert.equal((html.match(/assets\/public-prices\.js/g) || []).length, 1, `${name} loads public prices more than once`);
    assert.match(html, /data-public-price-ready/, `${name} is missing the loading-state CSS`);
  }
});

test("home and smoke pages bind every smoke model price", async () => {
  for (const name of ["home", "smoke"]) {
    const html = await readFile(pages[name], "utf8");
    for (const modelId of ["DM30", "DM60", "DM90"]) {
      assert.match(html, new RegExp(`data-public-price="${modelId}"`), `${name} is missing ${modelId}`);
    }
  }
});

test("home and Holi detail pages bind the retail Holi price", async () => {
  for (const name of ["home", "holi"]) {
    const html = await readFile(pages[name], "utf8");
    assert.match(html, /data-public-price="HOLI"/, `${name} is missing HOLI`);
  }
});

test("the warehouse model card renders the saved Firestore price", async () => {
  const [app, html, worker] = await Promise.all([
    readFile(mobileApp, "utf8"),
    readFile(mobileHtml, "utf8"),
    readFile(mobileWorker, "utf8")
  ]);

  assert.match(app, /state\.catalog\.find/);
  assert.match(app, /KZT\.format\(modelSalePrice\(model\.id\)\)/);
  assert.match(app, /Number\(item\.stock \|\| 0\) \* modelSalePrice/);
  assert.doesNotMatch(app, /stockValue\(\).*avgCost/);
  assert.match(html, /Потенциальная стоимость/);
  assert.match(html, /app\.js\?v=18/);
  assert.match(worker, /conductor-mobile-v27/);
  assert.match(worker, /app\.js\?v=18/);
});

test("the header contains a visible warehouse login and no hidden hotspot", async () => {
  const home = await readFile(pages.home, "utf8");
  assert.match(home, /<a class="contact warehouse-login" href="\/mobile\/">Войти<\/a>/);
  assert.doesNotMatch(home, /warehouse-hotspot/);
  assert.doesNotMatch(home, /assets\/(?:order-form|site-ui)\.(?:js|css)/);
  assert.doesNotMatch(home, /\/mobile\/firebase-config\.js/);
});

test("product images are optimized, watermark-free assets with stable dimensions", async () => {
  const [home, smoke] = await Promise.all([readFile(pages.home, "utf8"), readFile(pages.smoke, "utf8")]);
  for (const html of [home, smoke]) {
    for (const modelId of ["dm30", "dm60", "dm90"]) {
      assert.match(html, new RegExp(`${modelId}-clean\\.webp\\?v=1`));
    }
    assert.doesNotMatch(html, /dm(?:30|60|90)-natural\.png/);
    assert.match(html, /width="960" height="\d+"/);
    assert.match(html, /decoding="async"/);
  }
});

test("public pages expose keyboard navigation and readable controls", async () => {
  for (const [name, url] of Object.entries(pages)) {
    const html = await readFile(url, "utf8");
    assert.match(html, /class="skip-link" href="#main-content"/, `${name} is missing a skip link`);
    assert.match(html, /<main id="main-content"/, `${name} is missing the main landmark target`);
    assert.match(html, /focus-visible/, `${name} is missing visible keyboard focus`);
    assert.match(html, /class="brand" href="\/" aria-label=/, `${name} logo is not a home link`);
  }
});

test("public prices and SEO metadata use the single catalog collection", async () => {
  const script = await readFile(publicPriceModule, "utf8");
  assert.match(script, /collection\(getFirestore\(app\), "catalog"\)/);
  assert.doesNotMatch(script, /"publicProducts"/);
  assert.match(script, /function updateSeoMetadata\(prices\)/);
});

test("the warehouse header has one logout button wired to Firebase sign-out", async () => {
  const [app, html, worker] = await Promise.all([
    readFile(mobileApp, "utf8"),
    readFile(mobileHtml, "utf8"),
    readFile(mobileWorker, "utf8")
  ]);
  assert.match(html, /<button id="logout" class="site-btn logout-btn"[^>]*>Выйти<\/button>/);
  assert.equal((html.match(/id="logout"/g) || []).length, 1);
  assert.match(app, /\$\("#logout"\)\.addEventListener\("click", \(\) => signOut\(state\.auth\)\)/);
  assert.match(worker, /warehouse\.css\?v=17/);
});
