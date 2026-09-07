import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const wwwDir = path.join(here, "www");

if (!fs.existsSync(wwwDir)) {
  console.log("Bundled mobile UI is not prepared yet; price-source patch skipped.");
  process.exit(0);
}

function replaceExactly(fileName, before, after, label) {
  const filePath = path.join(wwwDir, fileName);
  if (!fs.existsSync(filePath)) throw new Error(`Не найден ${filePath}`);
  const source = fs.readFileSync(filePath, "utf8");
  const occurrences = source.split(before).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${label}: ожидалось одно совпадение в ${fileName}, найдено ${occurrences}`);
  }
  fs.writeFileSync(filePath, source.replace(before, after));
}

// The editable model card already defines DM60G as 3 500 ₸. Older catalog data can
// still contain the accidental 3 000 ₸ value inherited from DM60. Treat only that
// exact stale value as invalid; any other later manually saved price remains authoritative.
replaceExactly(
  "app.js",
  `function modelSalePrice(modelId) {
  const catalogModel = state.catalog.find((item) => item.id === modelId);
  return Number(catalogModel?.price || modelById(modelId)?.price || 0);
}`,
  `function modelSalePrice(modelId) {
  const model = modelById(modelId);
  const catalogModel = state.catalog.find((item) => item.id === modelId);
  const catalogPrice = Number(catalogModel?.price || 0);
  if (modelId === "DM60G" && catalogPrice === 3000) return Number(model?.price || 3500);
  return Number(catalogPrice || model?.price || 0);
}`,
  "Core DM60G price source",
);

replaceExactly(
  "inventory-state.js",
  `function currentModelPrice(modelId) {
  const model = catalog.find((item) => item.id === modelId);
  return Number(model?.price || DEFAULT_PRICES[modelId] || 0);
}`,
  `function currentModelPrice(modelId) {
  const model = catalog.find((item) => item.id === modelId);
  const catalogPrice = Number(model?.price || 0);
  if (modelId === "DM60G" && catalogPrice === 3000) return Number(DEFAULT_PRICES[modelId] || 3500);
  return Number(catalogPrice || DEFAULT_PRICES[modelId] || 0);
}`,
  "Inventory-card DM60G price source",
);

replaceExactly(
  "warehouse-enhancements-legacy.js",
  `function modelPrice(modelId) {
  const row = catalog.find((item) => item.id === modelId);
  return Number(row?.price || 0);
}`,
  `function modelPrice(modelId) {
  const row = catalog.find((item) => item.id === modelId);
  const catalogPrice = Number(row?.price || 0);
  if (modelId === "DM60G" && catalogPrice === 3000) return 3500;
  return catalogPrice;
}`,
  "Sale-confirmation DM60G price source",
);

for (const fileName of ["app.js", "inventory-state.js", "warehouse-enhancements-legacy.js"]) {
  const text = fs.readFileSync(path.join(wwwDir, fileName), "utf8");
  if (!text.includes('modelId === "DM60G" && catalogPrice === 3000')) {
    throw new Error(`${fileName}: защита от старой цены DM60G не применена`);
  }
}

console.log("Bundled price source patched: DM60G stale 3 000 ₸ -> configured 3 500 ₸ across stock, inventory editor and sales.");
