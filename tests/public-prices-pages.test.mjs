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
const warehouseCss = new URL("../mobile/warehouse.css", import.meta.url);
const inventoryState = new URL("../mobile/inventory-state.js", import.meta.url);
const publicPriceModule = new URL("../assets/public-prices.js", import.meta.url);
const publicRequestModule = new URL("../assets/js/request-form.js", import.meta.url);
const requestsCss = new URL("../mobile/requests.css", import.meta.url);

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
  assert.match(html, /app\.js\?v=24/);
  assert.match(worker, /conductor-mobile-v34/);
  assert.match(worker, /app\.js\?v=24/);
});

test("Firestore is initialized once before any asynchronous auth setup", async () => {
  const [app, helper, html, worker] = await Promise.all([
    readFile(mobileApp, "utf8"),
    readFile(inventoryState, "utf8"),
    readFile(mobileHtml, "utf8"),
    readFile(mobileWorker, "utf8")
  ]);
  const initializeIndex = app.indexOf("state.db = initializeFirestore(");
  const firstAwaitIndex = app.indexOf("await setPersistence(");
  assert.ok(initializeIndex >= 0 && initializeIndex < firstAwaitIndex);
  assert.match(app, /window\.CONDUCTOR_FIRESTORE = state\.db/);
  assert.match(helper, /db = window\.CONDUCTOR_FIRESTORE/);
  assert.doesNotMatch(helper, /\bgetFirestore\s*\(/);
  assert.match(html, /firebase-config\.js\?v=21/);
  assert.match(worker, /inventory-state\.js\?v=24/);
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
  assert.match(worker, /warehouse\.css\?v=20/);
});

test("warehouse stays behind the boot screen until initial live data is ready", async () => {
  const [app, html] = await Promise.all([
    readFile(mobileApp, "utf8"),
    readFile(mobileHtml, "utf8")
  ]);

  assert.match(app, /const initialCollections = new Set\(\["catalog", "products", "orders", "movements", "cash", "withdrawals", "requests"\]\)/);
  assert.match(app, /if \(!initialCollections\.size && !initialDataDelivered\)/);
  assert.match(app, /initialDataDelivered = true/);
  assert.match(app, /startRealtime\(\(\) => \{/);
  assert.doesNotMatch(app, /finally \{ hideBoot\(\); \}/);
  assert.doesNotMatch(html, /document\.getElementById\("login"\)\?\.classList\.remove\("hidden"\)/);
  assert.doesNotMatch(html, /id="stock-units-hero"|id="metric-low"|id="metric-movements"|id="stock-total"|id="stock-units"/);
});

test("new sale groups variants by model and keeps the selected total visible", async () => {
  const [app, html, css] = await Promise.all([
    readFile(mobileApp, "utf8"),
    readFile(mobileHtml, "utf8"),
    readFile(warehouseCss, "utf8")
  ]);

  assert.match(html, /class="section-head sticky-head sale-sticky-head"/);
  assert.match(html, /id="sale-header-total"/);
  assert.match(app, /saleOpenModelId: null/);
  assert.match(app, /saleQuantities: new Map\(\)/);
  assert.match(app, /data-sale-model="\$\{model\.id\}"/);
  assert.match(app, /if \(isOpen\) html \+= `<div class="sale-model-variants"/);
  assert.match(app, /state\.saleQuantities\.get\(product\.id\)/);
  assert.match(app, /\$\("#sale-header-total"\).*textContent = formatted/);
  assert.match(css, /\.sale-sticky-head\{top:70px/);
  assert.match(css, /\.sale-model-toggle\{/);
});

test("Holi sale pricing uses the total quantity across all selected colors", async () => {
  const app = await readFile(mobileApp, "utf8");

  assert.match(app, /function selectedModelQuantity\(modelId\)/);
  assert.match(app, /if \(quantity > 2000\) return 650/);
  assert.match(app, /if \(quantity >= 500\) return 850/);
  assert.match(app, /salePriceForQuantity\(modelId, selectedModelQuantity\(modelId\)\)/);
  assert.match(app, /500–2000 шт\. — 850 ₸ · от 2001 шт\. — 650 ₸/);
});

test("dashboard cash balance is updated by sales, cancellations and withdrawals", async () => {
  const [app, html, css] = await Promise.all([
    readFile(mobileApp, "utf8"),
    readFile(mobileHtml, "utf8"),
    readFile(warehouseCss, "utf8")
  ]);

  assert.match(html, /id="open-cash-dialog"/);
  assert.match(html, /id="metric-cash"/);
  assert.match(html, /id="cash-withdrawal-form"/);
  assert.match(app, /function availableCash\(\)/);
  assert.match(app, /async function ensureCashBalance\(\)/);
  assert.match(app, /balance: Number\(cashSnap\.data\(\)\.balance \|\| 0\) \+ total/);
  assert.match(app, /balance: Number\(cashSnap\.data\(\)\.balance \|\| 0\) - Number\(sale\.total \|\| 0\)/);
  assert.match(app, /if \(amount > before\)/);
  assert.match(app, /tx\.set\(withdrawalRef/);
  assert.match(css, /\.cash-metric\{/);
});

test("product order buttons open the shared request form while contact links keep WhatsApp", async () => {
  const [home, smoke, holi, requestScript] = await Promise.all([
    readFile(pages.home, "utf8"),
    readFile(pages.smoke, "utf8"),
    readFile(pages.holi, "utf8"),
    readFile(publicRequestModule, "utf8")
  ]);
  for (const [name, html] of Object.entries({ home, smoke, holi })) {
    assert.match(html, /assets\/css\/request-form\.css\?v=1/, `${name} has no request form styles`);
    assert.match(html, /assets\/js\/request-form\.js\?v=1/, `${name} has no request form module`);
    assert.match(html, /href="#request-form" data-request-product-id=/, `${name} has no request button`);
  }
  assert.match(home, /https:\/\/wa\.me\//, "home lost the WhatsApp contact link");
  for (const modelId of ["DM30", "DM60", "DM90", "HOLI"]) {
    assert.match(home, new RegExp(`data-request-product-id="${modelId}"`));
  }
  assert.match(requestScript, /addDoc\(collection\(db, "requests"\)/);
  assert.match(requestScript, /status: "new"/);
  assert.match(requestScript, /managerComment: ""/);
});

test("warehouse app lists requests, starts phone calls and saves processing fields", async () => {
  const [app, html, worker, css] = await Promise.all([
    readFile(mobileApp, "utf8"),
    readFile(mobileHtml, "utf8"),
    readFile(mobileWorker, "utf8"),
    readFile(requestsCss, "utf8")
  ]);
  assert.match(html, /id="view-requests"/);
  assert.match(html, /data-nav="requests"/);
  assert.match(html, /id="requests-nav-badge"/);
  assert.match(app, /collection\(state\.db, "requests"\)/);
  assert.match(app, /return normalized \? `tel:\$\{normalized\}`/);
  assert.match(app, /status: button\.dataset\.nextStatus/);
  assert.match(app, /managerComment: form\.elements\.comment\.value\.trim\(\)/);
  assert.match(worker, /requests\.css\?v=1/);
  assert.match(css, /\.request-card/);
});
