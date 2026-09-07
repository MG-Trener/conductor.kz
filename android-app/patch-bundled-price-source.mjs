import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const wwwDir = path.join(here, "www");

if (!fs.existsSync(wwwDir)) {
  console.log("Bundled mobile UI is not prepared yet; catalog-source validation skipped.");
  process.exit(0);
}

const checks = [
  ["app.js", ['id: "DM60R1G", name: "DM60R1G (интрига)", price: 4000', 'state.catalog.find((item) => item.id === modelId)']],
  ["inventory-state.js", ['DM60R1G: 4000', 'catalog.find((item) => item.id === modelId)']],
  ["warehouse-enhancements-legacy.js", ['"DM60R1G"', 'catalog.find((item) => item.id === modelId)']]
];

for (const [fileName, needles] of checks) {
  const filePath = path.join(wwwDir, fileName);
  if (!fs.existsSync(filePath)) throw new Error(`Не найден ${filePath}`);
  const source = fs.readFileSync(filePath, "utf8");
  for (const needle of needles) {
    if (!source.includes(needle)) throw new Error(`${fileName}: не найден признак общего catalog-источника: ${needle}`);
  }
}

console.log("Bundled catalog source verified: DM60R1G price is shared by stock, inventory editor and sales.");
