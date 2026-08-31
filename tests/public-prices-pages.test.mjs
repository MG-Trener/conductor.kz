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
const publicEnhancements = new URL("../assets/order-form.js", import.meta.url);

test("all public product pages load the shared live price module", async () => {
  for (const [name, url] of Object.entries(pages)) {
    const html = await readFile(url, "utf8");
    assert.match(html, /\/assets\/public-prices\.js\?v=2/, `${name} is missing the price module`);
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

  assert.match(app, /function modelSalePrice\(modelId\)/);
  assert.match(app, /KZT\.format\(modelSalePrice\(model\.id\)\)/);
  assert.doesNotMatch(app, /цветов · цена \$\{KZT\.format\(model\.price\)\}/);
  assert.match(html, /app\.js\?v=17/);
  assert.match(worker, /conductor-mobile-v25/);
  assert.match(worker, /app\.js\?v=17/);
});

test("the hero image contains a hidden desktop link to the warehouse", async () => {
  const script = await readFile(publicEnhancements, "utf8");
  assert.match(script, /document\.querySelector\("\.hero-shell"\)/);
  assert.match(script, /link\.href = "\/mobile\/"/);
  assert.match(script, /right:4\.8%;top:38%;width:10%;height:42%/);
  assert.match(script, /@media\(max-width:1000px\)/);
});
