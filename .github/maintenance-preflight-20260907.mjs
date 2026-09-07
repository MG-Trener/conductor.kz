import fs from "node:fs";

const refactorPath = ".github/maintenance-refactor-20260907.mjs";
let refactor = fs.readFileSync(refactorPath, "utf8");
const oldHelper = '  const next = typeof search === "string" ? text.replace(search, replacement) : text.replace(search, replacement);';
const newHelper = '  const next = typeof search === "string" ? text.replace(search, () => replacement) : text.replace(search, () => replacement);';
if (!refactor.includes(oldHelper)) throw new Error("Maintenance replacement helper was not found");
refactor = refactor.replace(oldHelper, newHelper);
fs.writeFileSync(refactorPath, refactor);

const fixPath = ".github/maintenance-testfix-20260907.mjs";
let fix = fs.readFileSync(fixPath, "utf8");
fix = fix.replace(
  'rules = rules.replace(\n  /    function validProductId\\(productId, modelId\\) \\{[\\s\\S]*?\\n    \\}\\n\\n    function validProductState/,\n  `    function validProductId(productId) {',
  'rules = rules.replace(\n  /    function validProductId\\(productId, modelId\\) \\{[\\s\\S]*?\\n    \\}\\n\\n    function validProductState/,\n  () => `    function validProductId(productId) {'
);
if (!fix.includes('() => `    function validProductId(productId) {')) {
  throw new Error("Firestore compatibility replacement was not converted to a callback");
}
fs.writeFileSync(fixPath, fix);

console.log("Replacement callbacks normalized");
