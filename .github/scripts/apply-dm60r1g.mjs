import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const read = (file) => fs.readFileSync(file, "utf8");
const write = (file, text) => fs.writeFileSync(file, text);

function replaceOnce(text, before, after, label) {
  const count = text.split(before).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`);
  return text.replace(before, () => after);
}

function replaceRegexOnce(text, regex, replacement, label) {
  const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const matches = [...text.matchAll(new RegExp(regex.source, flags))];
  if (matches.length !== 1) throw new Error(`${label}: expected 1 match, found ${matches.length}`);
  return text.replace(regex, () => replacement);
}

function patch(file, fn) {
  const before = read(file);
  const after = fn(before);
  if (before === after) throw new Error(`${file}: patch made no changes`);
  write(file, after);
}

// Reassemble the uploaded product artwork from temporary base64 chunks.
const imagePartsDir = ".github/dm60r1g-image";
const imageParts = fs.readdirSync(imagePartsDir).filter((name) => name.endsWith(".b64")).sort();
if (!imageParts.length) throw new Error("DM60R1G image chunks are missing");
const imageBase64 = imageParts.map((name) => read(path.join(imagePartsDir, name)).trim()).join("");
const imageBuffer = Buffer.from(imageBase64, "base64");
const imageSha = crypto.createHash("sha256").update(imageBuffer).digest("hex");
if (imageSha !== "dad53a7914da1a20c56d3dba4d7146ed7a190fffa7c49ed0bd80f05da59687b6") {
  throw new Error(`Unexpected DM60R1G image SHA-256: ${imageSha}`);
}
fs.mkdirSync("assets/images", { recursive: true });
fs.writeFileSync("assets/images/dm60r1g.webp", imageBuffer);

patch("mobile/app.js", (text) => {
  const anchor = `  {\n    id: "DM90", name: "Цветной дым DM90", price: 3500, lowStock: 2, sort: 30,`;
  const model = `  {\n    id: "DM60R1G", name: "DM60R1G (интрига)", price: 4000, lowStock: 2, sort: 27,\n    variants: [\n      ["BLUE", "Синий", "#258cff"],\n      ["PINK", "Розовый", "#ff6bab"]\n    ]\n  },\n`;
  text = replaceOnce(text, anchor, model + anchor, "Add DM60R1G warehouse model");
  return text;
});

patch("mobile/inventory-state.js", (text) => replaceOnce(
  text,
  `const DEFAULT_PRICES = { DM30: 2500, DM60: 3000, DM60G: 3500, DM90: 3500, HOLI: 1000 };`,
  `const DEFAULT_PRICES = { DM30: 2500, DM60: 3000, DM60G: 3500, DM60R1G: 4000, DM90: 3500, HOLI: 1000 };`,
  "Add DM60R1G inventory default",
));

patch("mobile/warehouse-enhancements-legacy.js", (text) => replaceOnce(
  text,
  `const SMOKE_MODELS = new Set(["DM30", "DM60", "DM60G", "DM90"]);`,
  `const SMOKE_MODELS = new Set(["DM30", "DM60", "DM60G", "DM60R1G", "DM90"]);`,
  "Add DM60R1G to smoke sale models",
));

patch("mobile/warehouse-enhancements.js", (text) => replaceOnce(
  text,
  `await import("./warehouse-enhancements-legacy.js?v=3");`,
  `await import("./warehouse-enhancements-legacy.js?v=4");`,
  "Bust warehouse legacy cache",
));

patch("firestore.rules", (text) => {
  text = replaceOnce(
    text,
    `return modelId in ['DM30', 'DM60', 'DM60G', 'DM90', 'HOLI'];`,
    `return modelId in ['DM30', 'DM60', 'DM60G', 'DM60R1G', 'DM90', 'HOLI'];`,
    "Allow DM60R1G model",
  );
  text = replaceOnce(
    text,
    `return productId.matches('^(DM30|DM60|DM60G|DM90|HOLI)_[A-Z0-9]+$');`,
    `return productId.matches('^(DM30|DM60|DM60G|DM60R1G|DM90|HOLI)_[A-Z0-9]+$');`,
    "Allow DM60R1G variant ids",
  );
  return text;
});

patch("assets/public-prices.js", (text) => {
  text = replaceOnce(
    text,
    `const MODELS = new Set(["DM30", "DM60", "DM60G", "DM90", "HOLI"]);`,
    `const MODELS = new Set(["DM30", "DM60", "DM60G", "DM60R1G", "DM90", "HOLI"]);`,
    "Public catalog DM60R1G",
  );
  text = replaceOnce(
    text,
    `&& ["DM30", "DM60", "DM60G", "DM90"].every((modelId) => prices.has(modelId))) {\n          entry.acceptedAnswer.text = \`DM30 стоит \${KZT.format(prices.get("DM30"))}, DM60 — \${KZT.format(prices.get("DM60"))}, DM60G — \${KZT.format(prices.get("DM60G"))}, DM90 — \${KZT.format(prices.get("DM90"))}.\`;`,
    `&& ["DM30", "DM60", "DM60G", "DM60R1G", "DM90"].every((modelId) => prices.has(modelId))) {\n          entry.acceptedAnswer.text = \`DM30 стоит \${KZT.format(prices.get("DM30"))}, DM60 — \${KZT.format(prices.get("DM60"))}, DM60G — \${KZT.format(prices.get("DM60G"))}, DM60R1G — \${KZT.format(prices.get("DM60R1G"))}, DM90 — \${KZT.format(prices.get("DM90"))}.\`;`,
    "Dynamic FAQ price",
  );
  text = replaceOnce(
    text,
    `  const dm60g = prices.get("DM60G");\n  const dm90 = prices.get("DM90");`,
    `  const dm60g = prices.get("DM60G");\n  const dm60r1g = prices.get("DM60R1G");\n  const dm90 = prices.get("DM90");`,
    "Read DM60R1G public price",
  );
  text = replaceOnce(
    text,
    `  if (![dm30, dm60, dm60g, dm90, holi].every(Boolean)) return;`,
    `  if (![dm30, dm60, dm60g, dm60r1g, dm90, holi].every(Boolean)) return;`,
    "Require current catalog models",
  );
  text = replaceOnce(
    text,
    `description = \`Цветной дым в Казахстане: DM30 — \${KZT.format(dm30)}, DM60 — \${KZT.format(dm60)}, гендерный дым DM60G — \${KZT.format(dm60g)}, DM90 — \${KZT.format(dm90)}.\`;\n    social = \`DM30, DM60, DM60G и DM90 — от \${KZT.format(Math.min(dm30, dm60, dm60g, dm90))}. Заказ в Казахстане.\`;`,
    `description = \`Цветной дым в Казахстане: DM30 — \${KZT.format(dm30)}, DM60 — \${KZT.format(dm60)}, гендерный дым DM60G — \${KZT.format(dm60g)}, DM60R1G «интрига» — \${KZT.format(dm60r1g)}, DM90 — \${KZT.format(dm90)}.\`;\n    social = \`DM30, DM60, DM60G, DM60R1G и DM90 — от \${KZT.format(Math.min(dm30, dm60, dm60g, dm60r1g, dm90))}. Заказ в Казахстане.\`;`,
    "Smoke SEO price metadata",
  );
  text = replaceOnce(
    text,
    `description = \`Купить цветной и гендерный дым, краски Холи в Казахстане. DM30 — \${KZT.format(dm30)}, DM60 — \${KZT.format(dm60)}, DM60G — \${KZT.format(dm60g)}, DM90 — \${KZT.format(dm90)}, Холи — \${KZT.format(holi)}.\`;\n    social = \`DM30, DM60, гендерный дым DM60G, DM90 и краски Холи. Актуальные цены и заказ в Казахстане.\`;`,
    `description = \`Купить цветной и гендерный дым, краски Холи в Казахстане. DM30 — \${KZT.format(dm30)}, DM60 — \${KZT.format(dm60)}, DM60G — \${KZT.format(dm60g)}, DM60R1G — \${KZT.format(dm60r1g)}, DM90 — \${KZT.format(dm90)}, Холи — \${KZT.format(holi)}.\`;\n    social = \`DM30, DM60, гендерный дым DM60G и DM60R1G, DM90 и краски Холи. Актуальные цены и заказ в Казахстане.\`;`,
    "Home SEO price metadata",
  );
  return text;
});

patch("assets/js/request-form.js", (text) => replaceOnce(
  text,
  `  DM60G: "гендерный дым DM60G",\n  DM90: "цветной дым DM90",`,
  `  DM60G: "гендерный дым DM60G",\n  DM60R1G: "дым DM60R1G для гендер-пати из белого в цвет",\n  DM90: "цветной дым DM90",`,
  "Add DM60R1G WhatsApp order",
));

patch("index.html", (text) => {
  text = replaceOnce(text, `grid-template-columns:repeat(5,minmax(0,1fr))`, `grid-template-columns:repeat(6,minmax(0,1fr))`, "Six home product columns");
  text = replaceOnce(
    text,
    `.dm60g{--accent:#ff6bab;--shade1:rgba(52,19,74,.94);--shade2:rgba(12,12,35,.98)}.dm90`,
    `.dm60g{--accent:#ff6bab;--shade1:rgba(52,19,74,.94);--shade2:rgba(12,12,35,.98)}.dm60r1g{--accent:#6db8ff;--shade1:rgba(18,43,78,.96);--shade2:rgba(34,10,45,.98)}.dm90`,
    "DM60R1G home card colors",
  );
  text = replaceOnce(text, `.dm60g .product-art img{border-radius:10px}`, `.dm60g .product-art img,.dm60r1g .product-art img{border-radius:10px}`, "DM60R1G image radius");
  const dm90Card = `<article class="card dm90" id="dm90">`;
  const newCard = `<article class="card dm60r1g" id="dm60r1g">\n<div class="product-art">\n<img src="/assets/images/dm60r1g.webp?v=1" alt="Дым DM60R1G для гендер-пати из белого в синий или розовый цвет" width="800" height="800" loading="lazy" decoding="async">\n</div>\n<h2>DM60R1G</h2>\n<div class="pill">ИНТРИГА</div>\n<p>Дым для гендер пати из белого в цвет.</p>\n<div class="features">\n<div>Сначала белый дым</div>\n<div>Затем синий или розовый</div>\n<div>Для гендер-пати</div>\n</div>\n<p class="note">Цвет результата — синий или розовый.</p>\n<div class="spacer"></div>\n<div class="pricebox">\n<div class="price" data-public-price="DM60R1G">4 000 ₸</div>\n</div>\n<a class="order" href="#request-form" data-request-product-id="DM60R1G">Заказать</a>\n<a class="learn" href="/cvetnoy-dym/#dm60r1g">Подробнее</a>\n</article>\n`;
  text = replaceOnce(text, dm90Card, newCard + dm90Card, "Add DM60R1G home card");

  const dm90JsonAnchor = `        {\n          "@type": "ListItem",\n          "position": 4,\n          "item": {\n            "@type": "Product",\n            "name": "Цветной дым DM90",`;
  const dm60r1gJson = `        {\n          "@type": "ListItem",\n          "position": 4,\n          "item": {\n            "@type": "Product",\n            "name": "Дым для гендер пати из белого в цвет",\n            "sku": "DM60R1G",\n            "url": "https://conductor.kz/cvetnoy-dym/#dm60r1g",\n            "brand": {\n              "@type": "Brand",\n              "name": "CONDUCTOR.KZ"\n            },\n            "image": "https://conductor.kz/assets/images/dm60r1g.webp",\n            "description": "Дым для гендер-пати: сначала белый, затем синий или розовый.",\n            "offers": {\n              "@type": "Offer",\n              "url": "https://conductor.kz/cvetnoy-dym/#dm60r1g",\n              "price": "4000",\n              "priceCurrency": "KZT",\n              "availability": "https://schema.org/InStock",\n              "seller": {\n                "@id": "https://conductor.kz/#org"\n              }\n            }\n          }\n        },\n`;
  text = replaceOnce(text, dm90JsonAnchor, dm60r1gJson + dm90JsonAnchor.replace(`"position": 4`, `"position": 5`), "Add DM60R1G home JSON-LD");
  text = replaceOnce(
    text,
    `"position": 5,\n          "item": {\n            "@type": "Product",\n            "name": "Краски Холи"`,
    `"position": 6,\n          "item": {\n            "@type": "Product",\n            "name": "Краски Холи"`,
    "Shift Holi JSON-LD position",
  );
  text = text.replaceAll(`/assets/public-prices.js?v=5`, `/assets/public-prices.js?v=6`);
  text = text.replaceAll(`/assets/js/request-form.js?v=2`, `/assets/js/request-form.js?v=3`);
  text = replaceOnce(text, `гендерный дым DM60G и краски Холи`, `гендерный дым DM60G и DM60R1G и краски Холи`, "Home description DM60R1G");
  return text;
});

patch("cvetnoy-dym/index.html", (text) => {
  text = replaceOnce(text, `grid-template-columns:repeat(4,minmax(0,1fr))`, `grid-template-columns:repeat(5,minmax(0,1fr))`, "Five smoke product columns");
  text = replaceOnce(text, `.dm60g img{border-radius:12px}`, `.dm60g img,.dm60r1g img{border-radius:12px}`, "DM60R1G smoke image radius");
  text = replaceOnce(text, `.dm60g h2{color:#ff6bab}.dm90 h2`, `.dm60g h2{color:#ff6bab}.dm60r1g h2{color:#6db8ff}.dm90 h2`, "DM60R1G smoke title color");
  text = replaceOnce(text, `.dm60g .price{color:#ff6bab}.dm90 .price`, `.dm60g .price{color:#ff6bab}.dm60r1g .price{color:#6db8ff}.dm90 .price`, "DM60R1G smoke price color");

  const dm90Card = `<article class="card dm90" id="dm90">`;
  const newCard = `<article class="card dm60r1g" id="dm60r1g">\n<img src="/assets/images/dm60r1g.webp?v=1" alt="Дым DM60R1G для гендер-пати из белого в синий или розовый цвет" width="800" height="800" loading="lazy" decoding="async">\n<h2>DM60R1G</h2>\n<div class="duration">Интрига: из белого в цвет</div>\n<p>Дым для гендер пати из белого в цвет. Сначала появляется белый дым, затем раскрывается синий или розовый цвет.</p>\n<div class="price" data-public-price="DM60R1G">4 000 ₸</div>\n<a class="cta" href="#request-form" data-request-product-id="DM60R1G">Заказать DM60R1G</a>\n</article>\n`;
  text = replaceOnce(text, dm90Card, newCard + dm90Card, "Add DM60R1G smoke card");

  const dm90JsonAnchor = `        {\n          "@type": "ListItem",\n          "position": 4,\n          "item": {\n            "@type": "Product",\n            "name": "Цветной дым DM90",`;
  const newJson = `        {\n          "@type": "ListItem",\n          "position": 4,\n          "item": {\n            "@type": "Product",\n            "name": "Дым для гендер пати из белого в цвет",\n            "sku": "DM60R1G",\n            "url": "https://conductor.kz/cvetnoy-dym/#dm60r1g",\n            "image": "https://conductor.kz/assets/images/dm60r1g.webp",\n            "description": "Дым для гендер-пати: сначала белый, затем синий или розовый.",\n            "brand": {\n              "@type": "Brand",\n              "name": "CONDUCTOR.KZ"\n            },\n            "offers": {\n              "@type": "Offer",\n              "price": "4000",\n              "priceCurrency": "KZT",\n              "availability": "https://schema.org/InStock",\n              "seller": {\n                "@type": "Organization",\n                "name": "CONDUCTOR.KZ",\n                "url": "https://conductor.kz/"\n              }\n            }\n          }\n        },\n`;
  text = replaceOnce(text, dm90JsonAnchor, newJson + dm90JsonAnchor.replace(`"position": 4`, `"position": 5`), "Add DM60R1G smoke JSON-LD");
  text = replaceOnce(
    text,
    `Выберите DM30, DM60 или DM90 по продолжительности эффекта либо DM60G с синим и розовым дымом для гендер-пати.`,
    `Выберите DM30, DM60 или DM90 по продолжительности эффекта, DM60G для классического гендер-пати или DM60R1G «интрига» — из белого дыма в синий либо розовый.`,
    "Smoke intro DM60R1G",
  );
  text = replaceOnce(
    text,
    `DM60G создан специально для гендер-пати и представлен в синем и розовом цветах. Для продолжительного эффекта выбирайте DM90.`,
    `DM60G создан специально для гендер-пати и представлен в синем и розовом цветах. DM60R1G добавляет интригу: сначала идёт белый дым, затем проявляется синий или розовый. Для продолжительного эффекта выбирайте DM90.`,
    "Smoke chooser DM60R1G",
  );
  text = replaceRegexOnce(
    text,
    /<p>DM30 — <span data-public-price="DM30">[^<]+<\/span>, DM60 — <span data-public-price="DM60">[^<]+<\/span>, DM60G — <span data-public-price="DM60G">[^<]+<\/span>, DM90 — <span data-public-price="DM90">[^<]+<\/span>\.<\/p>/,
    `<p>DM30 — <span data-public-price="DM30">2 500 ₸</span>, DM60 — <span data-public-price="DM60">3 000 ₸</span>, DM60G — <span data-public-price="DM60G">3 500 ₸</span>, DM60R1G — <span data-public-price="DM60R1G">4 000 ₸</span>, DM90 — <span data-public-price="DM90">3 500 ₸</span>.</p>`,
    "Smoke FAQ price line",
  );
  text = replaceRegexOnce(
    text,
    /"text": "DM30 стоит [^"]+DM90 — 3 500 ₸\."/,
    `"text": "DM30 стоит 2 500 ₸, DM60 — 3 000 ₸, DM60G — 3 500 ₸, DM60R1G — 4 000 ₸, DM90 — 3 500 ₸."`,
    "Smoke JSON FAQ price",
  );
  text = text.replaceAll(`/assets/public-prices.js?v=5`, `/assets/public-prices.js?v=6`);
  text = text.replaceAll(`/assets/js/request-form.js?v=2`, `/assets/js/request-form.js?v=3`);
  return text;
});

patch("kraski-holi/index.html", (text) => {
  const before = text;
  text = text.replaceAll(`/assets/public-prices.js?v=5`, `/assets/public-prices.js?v=6`);
  text = text.replaceAll(`/assets/js/request-form.js?v=2`, `/assets/js/request-form.js?v=3`);
  if (text === before) throw new Error("Holi module cache versions were not updated");
  return text;
});

patch("mobile/bootstrap-104.js", (text) => {
  text = replaceOnce(text, `import "./warehouse-enhancements.js?v=107";`, `import "./warehouse-enhancements.js?v=108";`, "Warehouse enhancement cache");
  text = replaceOnce(text, `import "./inventory-state.js?v=105";`, `import "./inventory-state.js?v=106";`, "Inventory cache");
  return text;
});

patch("mobile/index.html", (text) => {
  text = text.replaceAll(`app.js?v=105`, `app.js?v=106`);
  text = text.replaceAll(`bootstrap-104.js?v=2`, `bootstrap-104.js?v=3`);
  text = replaceOnce(text, `src="./version-history-105.js"`, `src="./version-history-105.js?v=2"`, "Version-history cache");
  return text;
});

patch("mobile/sw.js", (text) => {
  text = replaceOnce(text, `const CACHE = "conductor-mobile-v59";`, `const CACHE = "conductor-mobile-v60";`, "PWA cache version");
  text = text.replaceAll(`./app.js?v=105`, `./app.js?v=106`);
  text = text.replaceAll(`./bootstrap-104.js?v=2`, `./bootstrap-104.js?v=3`);
  text = text.replaceAll(`./warehouse-enhancements.js?v=105`, `./warehouse-enhancements.js?v=108`);
  text = text.replaceAll(`./inventory-state.js?v=105`, `./inventory-state.js?v=106`);
  text = replaceOnce(text, `"./version-history-105.js",`, `"./version-history-105.js?v=2",`, "PWA version-history cache");
  return text;
});

patch("android-app/patch-bundled-price-source.mjs", () => `import fs from "node:fs";\nimport path from "node:path";\nimport { fileURLToPath } from "node:url";\n\nconst here = path.dirname(fileURLToPath(import.meta.url));\nconst wwwDir = path.join(here, "www");\n\nif (!fs.existsSync(wwwDir)) {\n  console.log("Bundled mobile UI is not prepared yet; catalog-source validation skipped.");\n  process.exit(0);\n}\n\nconst checks = [\n  ["app.js", ['id: "DM60R1G", name: "DM60R1G (интрига)", price: 4000', 'state.catalog.find((item) => item.id === modelId)']],\n  ["inventory-state.js", ['DM60R1G: 4000', 'catalog.find((item) => item.id === modelId)']],\n  ["warehouse-enhancements-legacy.js", ['"DM60R1G"', 'catalog.find((item) => item.id === modelId)']]\n];\n\nfor (const [fileName, needles] of checks) {\n  const filePath = path.join(wwwDir, fileName);\n  if (!fs.existsSync(filePath)) throw new Error(\`Не найден \${filePath}\`);\n  const source = fs.readFileSync(filePath, "utf8");\n  for (const needle of needles) {\n    if (!source.includes(needle)) throw new Error(\`\${fileName}: не найден признак общего catalog-источника: \${needle}\`);\n  }\n}\n\nconsole.log("Bundled catalog source verified: DM60R1G price is shared by stock, inventory editor and sales.");\n`);

patch("android-app/package.json", (text) => replaceOnce(text, `"version": "1.0.15"`, `"version": "1.0.16"`, "Android version 1.0.16"));

patch("mobile/app-version.json", (text) => {
  const manifest = JSON.parse(text);
  manifest.version = "1.0.16";
  manifest.versionCode = 10016;
  manifest.notes = "1.0.16: добавлен товар DM60R1G — дым для гендер-пати из белого в цвет. На складе появилась карточка «DM60R1G (интрига)» с синим и розовым вариантами, а в форме продаж — новая модель. Цена 4 000 ₸ создаётся в общем catalog/DM60R1G и затем именно этот единый источник используется сайтом, складом и продажами.";
  return `${JSON.stringify(manifest, null, 2)}\n`;
});

patch("mobile/version-history-105.js", (text) => {
  const entry = `  {\n    version: "1.0.16",\n    date: "07.09.2026",\n    changes: [\n      "Добавлен DM60R1G — дым для гендер-пати из белого в цвет; на сайте используется подготовленное изображение товара.",\n      "На складе добавлена карточка «DM60R1G (интрига)» с синим и розовым вариантами, модель также доступна в новой продаже.",\n      "Цена DM60R1G хранится в общем catalog и одинаково используется публичным сайтом, складом и продажами; стартовая цена — 4 000 ₸."\n    ]\n  },\n`;
  text = replaceOnce(text, `const VERSIONS = [\n`, `const VERSIONS = [\n${entry}`, "Add 1.0.16 history");
  text = text.replaceAll(`Актуальная версия: 1.0.15`, `Актуальная версия: 1.0.16`);
  return text;
});

patch("tests/public-prices-pages.test.mjs", (text) => {
  text = text.replaceAll(`/\\/assets\\/public-prices\\.js\\?v=5/`, `/\\/assets\\/public-prices\\.js\\?v=6/`);
  text = replaceOnce(text, `["DM30", "DM60", "DM60G", "DM90"]`, `["DM30", "DM60", "DM60G", "DM60R1G", "DM90"]`, "Smoke public model test");
  text = replaceOnce(text, `for (const modelId of ["DM30", "DM60", "DM60G", "DM90", "HOLI"])`, `for (const modelId of ["DM30", "DM60", "DM60G", "DM60R1G", "DM90", "HOLI"])`, "Order model test");
  text = text.replaceAll(`assets\\/js\\/request-form\\.js\\?v=2`, `assets\\/js\\/request-form\\.js\\?v=3`);
  const marker = `test("home and Holi detail pages bind the retail Holi price", async () => {`;
  const added = `test("DM60R1G uses one catalog price and blue/pink warehouse variants", async () => {\n  const [app, prices, rules, home, smoke, requestScript] = await Promise.all([\n    readFile(mobileApp, "utf8"),\n    readFile(publicPriceModule, "utf8"),\n    readFile(new URL("../firestore.rules", import.meta.url), "utf8"),\n    readFile(pages.home, "utf8"),\n    readFile(pages.smoke, "utf8"),\n    readFile(publicRequestModule, "utf8")\n  ]);\n  assert.match(app, /id: "DM60R1G", name: "DM60R1G \\(интрига\\)", price: 4000/);\n  assert.match(app, /\\["BLUE", "Синий", "#258cff"\\][\\s\\S]*\\["PINK", "Розовый", "#ff6bab"\\]/);\n  assert.match(prices, /"DM60R1G"/);\n  assert.match(rules, /'DM60R1G'/);\n  assert.match(rules, /DM60G\\|DM60R1G\\|DM90/);\n  for (const html of [home, smoke]) {\n    assert.match(html, /data-public-price="DM60R1G"/);\n    assert.match(html, /dm60r1g\\.webp\\?v=1/);\n  }\n  assert.match(requestScript, /DM60R1G/);\n});\n\n`;
  text = replaceOnce(text, marker, added + marker, "Add DM60R1G public regression test");
  return text;
});

patch("tests/firestore.rules.test.mjs", (text) => {
  const marker = `test("historical requests are read-only for staff and closed to public visitors", async () => {`;
  const added = `test("approved staff can create DM60R1G catalog and its two warehouse variants", async () => {\n  const db = staffDb();\n  await assertSucceeds(setDoc(doc(db, "catalog", "DM60R1G"), {\n    modelId: "DM60R1G",\n    name: "DM60R1G (интрига)",\n    price: 4000,\n    updatedAt: serverTimestamp(),\n    updatedBy: staffUid,\n    updatedByName: "Сотрудник"\n  }));\n\n  for (const [key, colorName, colorHex, colorId, sort] of [\n    ["BLUE", "Синий", "#258cff", "blue", 28],\n    ["PINK", "Розовый", "#ff6bab", "pink", 29]\n  ]) {\n    await assertSucceeds(setDoc(doc(db, "products", \`DM60R1G_\${key}\`), {\n      ...product,\n      id: \`DM60R1G_\${key}\`,\n      modelId: "DM60R1G",\n      colorId,\n      colorName,\n      colorHex,\n      name: \`DM60R1G · \${colorName}\`,\n      sort,\n      createdAt: serverTimestamp(),\n      updatedAt: serverTimestamp()\n    }));\n  }\n\n  const publicDb = testEnv.unauthenticatedContext().firestore();\n  assert.equal((await assertSucceeds(getDoc(doc(publicDb, "catalog", "DM60R1G")))).data().price, 4000);\n  await assertFails(getDoc(doc(publicDb, "products", "DM60R1G_BLUE")));\n});\n\n`;
  return replaceOnce(text, marker, added + marker, "Add DM60R1G rules test");
});

patch("tests/mobile-architecture.test.mjs", (text) => {
  text = text.replaceAll(`/app\\.js\\?v=105/`, `/app\\.js\\?v=106/`);
  text = text.replaceAll(`/bootstrap-104\\.js\\?v=2/`, `/bootstrap-104\\.js\\?v=3/`);
  text = replaceOnce(text, `/const CACHE = "conductor-mobile-v59"/`, `/const CACHE = "conductor-mobile-v60"/`, "PWA cache test");
  text = replaceOnce(
    text,
    `for (const asset of ["release-103.css", "release-105.css?v=2", "app.js?v=105", "bootstrap-104.js?v=2", "core-ui-105.js?v=2", "version-history-105.js", "startup-guard-104.js", "ui-sounds.js?v=1"])`,
    `for (const asset of ["release-103.css", "release-105.css?v=2", "app.js?v=106", "bootstrap-104.js?v=3", "core-ui-105.js?v=2", "version-history-105.js?v=2", "startup-guard-104.js", "ui-sounds.js?v=1"])`,
    "PWA asset test",
  );
  return text;
});

// Final invariants: one shared Firestore catalog price source at runtime.
for (const file of ["mobile/app.js", "mobile/inventory-state.js", "mobile/warehouse-enhancements-legacy.js", "assets/public-prices.js"]) {
  const source = read(file);
  if (!source.includes("catalog")) throw new Error(`${file}: catalog source missing`);
  if (!source.includes("DM60R1G")) throw new Error(`${file}: DM60R1G missing`);
}
if (!read("index.html").includes(`data-public-price="DM60R1G"`)) throw new Error("Home DM60R1G live price binding missing");
if (!read("cvetnoy-dym/index.html").includes(`data-public-price="DM60R1G"`)) throw new Error("Smoke page DM60R1G live price binding missing");
if (!fs.existsSync("assets/images/dm60r1g.webp")) throw new Error("DM60R1G image missing");

console.log("DM60R1G product update prepared: site + warehouse + sales + shared catalog price + Android 1.0.16");
