import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const pages = {
  home: new URL("../index.html", import.meta.url),
  smoke: new URL("../cvetnoy-dym/index.html", import.meta.url),
  holi: new URL("../kraski-holi/index.html", import.meta.url)
};

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
