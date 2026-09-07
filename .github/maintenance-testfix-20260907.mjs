import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);

let rules = read("firestore.rules");
rules = rules.replace(`    function validProductId(productId, modelId) {
      return validModelId(modelId)
        && productId.matches('^' + modelId + '_[A-Z0-9]+$');
    }
`, `    function validProductId(productId) {
      return productId is string
        && productId.matches('^[A-Z0-9]{2,24}_[A-Z0-9]+$');
    }
`);
rules = rules.replaceAll("validProductId(productId, request.resource.data.modelId)", "validProductId(productId)");
if (rules.includes("productId.matches('^' + modelId")) throw new Error("Dynamic regex concatenation survived");
write("firestore.rules", rules);

let architecture = read("tests/mobile-architecture.test.mjs");
architecture = architecture.replaceAll("});});", "});");
write("tests/mobile-architecture.test.mjs", architecture);

let prices = read("tests/public-prices-pages.test.mjs");
const startMarker = 'test("warehouse Android build loads and registers sale push notifications"';
const start = prices.indexOf(startMarker);
if (start < 0) throw new Error("Android push test not found");
const next = prices.indexOf("\ntest(", start + startMarker.length);
const end = next >= 0 ? next : prices.length;
const replacement = `test("warehouse Android build loads and registers sale push notifications", async () => {
  const [app, domain, html, worker, bootstrap, push, endpointConfig] = await Promise.all([
    readFile(mobileApp, "utf8"),
    readFile(warehouseDomain, "utf8"),
    readFile(mobileHtml, "utf8"),
    readFile(mobileWorker, "utf8"),
    readFile(mobileBootstrap, "utf8"),
    readFile(pushNotifications, "utf8"),
    readFile(pushConfig, "utf8")
  ]);
  assert.match(html, /push-config\\.js/);
  assert.match(html, /bootstrap\\.js/);
  assert.match(bootstrap, /import "\\.\\/push-notifications\\.js"/);
  assert.match(worker, /push-config\\.js/);
  assert.match(worker, /"\\.\\/push-notifications\\.js"/);
  assert.match(push, /registerPlugin\\("PushNotifications"\\)/);
  assert.match(push, /"pushDevices"/);
  assert.match(push, /platform: "android"/);
  assert.match(push, /deleteDoc\\(doc\\(window\\.CONDUCTOR_FIRESTORE, "pushDevices"/);
  assert.match(endpointConfig, /CONDUCTOR_PUSH_ENDPOINT/);
  assert.match(domain, /state\\.user\\.getIdToken\\(\\)/);
  assert.match(domain, /JSON\\.stringify\\(\\{ orderId \\}\\)/);
});
`;
prices = prices.slice(0, start) + replacement + prices.slice(end);
write("tests/public-prices-pages.test.mjs", prices);

console.log("Maintenance compatibility repairs applied");
