from pathlib import Path
import re

p = Path("tests/public-prices-pages.test.mjs")
s = p.read_text(encoding="utf-8")

s = s.replace(
    'const mobileBootstrap = new URL("../mobile/bootstrap-103.js", import.meta.url);',
    'const mobileBootstrap = new URL("../mobile/bootstrap.js", import.meta.url);'
)
s = s.replace('const inventoryState = new URL("../mobile/inventory-state.js", import.meta.url);\n', '')
s = s.replace('/app\\.js\\?v=103/', '/app\\.js\\?v=109/')

old = re.compile(
    r'test\("Firestore is initialized once before any asynchronous auth setup", async \(\) => \{[\s\S]*?\n\}\);\n\n(?=test\("the header contains a visible warehouse login)',
    re.M,
)
new = r'''test("Firestore is initialized once before any asynchronous auth setup", async () => {
  const [app, ui, html, worker, bootstrap] = await Promise.all([
    readFile(mobileApp, "utf8"),
    readFile(new URL("../mobile/warehouse-ui.js", import.meta.url), "utf8"),
    readFile(mobileHtml, "utf8"),
    readFile(mobileWorker, "utf8"),
    readFile(mobileBootstrap, "utf8")
  ]);
  const initializeIndex = app.indexOf("state.db = initializeFirestore(");
  const firstAwaitIndex = app.indexOf("await setPersistence(");
  assert.ok(initializeIndex >= 0 && initializeIndex < firstAwaitIndex);
  assert.match(app, /window\.CONDUCTOR_FIRESTORE = state\.db/);
  assert.doesNotMatch(ui, /initializeFirestore|getFirestore/);
  assert.match(html, /firebase-config\.js\?v=\d+/);
  assert.match(html, /bootstrap\.js\?v=1/);
  assert.doesNotMatch(bootstrap, /inventory-state/);
  assert.doesNotMatch(worker, /inventory-state/);
});

'''
s, count = old.subn(lambda _: new, s, count=1)
if count != 1:
    raise SystemExit("Failed to modernize Firestore ownership test")

s = s.replace('/bootstrap-103\\.js/', '/bootstrap\\.js\\?v=1/')
s = s.replace(
    '/import "\\.\\/push-notifications\\.js\\?v=103"/',
    '/import "\\.\\/push-notifications\\.js\\?v=1"/'
)
s = s.replace(
    '/"\\.\\/push-notifications\\.js\\?v=103"/',
    '/"\\.\\/push-notifications\\.js\\?v=1"/'
)

p.write_text(s, encoding="utf-8")
print("Legacy tests migrated to the consolidated mobile architecture")
