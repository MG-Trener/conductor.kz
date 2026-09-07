import { readFile, writeFile } from "node:fs/promises";
import { cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const root = process.cwd();
const read = (path) => readFile(`${root}/${path}`, "utf8");
const write = (path, value) => writeFile(`${root}/${path}`, value);

function countOf(text, needle) {
  return text.split(needle).length - 1;
}

function replaceExact(text, oldValue, newValue, label, expected = 1) {
  const count = countOf(text, oldValue);
  if (count !== expected) throw new Error(`${label}: expected ${expected} matches, found ${count}`);
  return text.replaceAll(oldValue, newValue);
}

function replaceRegexOnce(text, pattern, replacement, label) {
  if (!pattern.test(text)) throw new Error(`${label}: pattern not found`);
  pattern.lastIndex = 0;
  return text.replace(pattern, replacement);
}

function credentialJson() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_CONDUCTOR_REQUESTS
    || process.env.FIREBASE_SERVICE_ACCOUNT_JSON
    || process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) throw new Error("Firebase service account secret is missing");
  return JSON.parse(raw);
}

async function discoverApprovedStaff() {
  const app = await read("mobile/app.js");
  const block = app.match(/const STAFF_BY_UID = new Map\(\[([\s\S]*?)\]\);/u);
  if (!block) throw new Error("STAFF_BY_UID block not found");
  const entries = [...block[1].matchAll(/\[\"([^\"]+)\",\s*\"([^\"]+)\"\]/gu)]
    .map((match) => ({ uid: match[1], name: match[2] }));
  if (entries.length !== 2 || new Set(entries.map((item) => item.uid)).size !== 2) {
    throw new Error(`Expected exactly 2 approved users, found ${entries.length}`);
  }
  return entries;
}

async function setServerClaims(entries) {
  const adminApp = initializeApp({
    credential: cert(credentialJson()),
    projectId: "conductor-requests"
  });
  const auth = getAuth(adminApp);
  const approved = new Map(entries.map((item) => [item.uid, item.name]));

  for (const { uid, name } of entries) {
    const user = await auth.getUser(uid);
    await auth.setCustomUserClaims(uid, {
      ...(user.customClaims || {}),
      warehouseStaff: true,
      warehouseName: name
    });
  }

  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const user of page.users) {
      if (approved.has(user.uid)) continue;
      const claims = { ...(user.customClaims || {}) };
      if (!("warehouseStaff" in claims) && !("warehouseName" in claims)) continue;
      delete claims.warehouseStaff;
      delete claims.warehouseName;
      await auth.setCustomUserClaims(user.uid, claims);
    }
    pageToken = page.pageToken;
  } while (pageToken);

  for (const { uid, name } of entries) {
    const verified = await auth.getUser(uid);
    if (verified.customClaims?.warehouseStaff !== true || verified.customClaims?.warehouseName !== name) {
      throw new Error("Custom claim verification failed");
    }
  }

  return getFirestore(adminApp);
}

async function scrubEmailAuditFields(db) {
  const targets = [
    ["orders", ["createdByEmail", "cancelledByEmail"]],
    ["stockMovements", ["createdByEmail"]],
    ["cashWithdrawals", ["createdByEmail"]],
    ["pushDevices", ["email"]]
  ];

  for (const [collectionName, fields] of targets) {
    const snapshot = await db.collection(collectionName).get();
    const writer = db.bulkWriter();
    let changed = 0;
    for (const document of snapshot.docs) {
      const data = document.data();
      const update = {};
      for (const field of fields) {
        if (Object.prototype.hasOwnProperty.call(data, field)) update[field] = FieldValue.delete();
      }
      if (Object.keys(update).length) {
        writer.update(document.ref, update);
        changed += 1;
      }
    }
    await writer.close();
    console.log(`Scrubbed ${changed} documents in ${collectionName}`);
  }

  const cashRef = db.doc("finance/cash");
  const cash = await cashRef.get();
  if (cash.exists && Object.prototype.hasOwnProperty.call(cash.data(), "updatedByEmail")) {
    await cashRef.update({ updatedByEmail: FieldValue.delete() });
    console.log("Scrubbed finance/cash updatedByEmail");
  }
}

async function migrateRules() {
  let text = await read("firestore.rules");
  text = replaceRegexOnce(
    text,
    /    \/\/ Authorization is bound to the two explicitly approved Firebase Authentication UIDs\.\n    \/\/ Email addresses are metadata, never authorization\.\n    function isStaff\(\) \{\n      return request\.auth != null\n        && request\.auth\.uid in \[\n          '[^']+',\n          '[^']+'\n        \];\n    \}/u,
    `    // Warehouse access is granted only by a server-managed Firebase Authentication claim.\n    function isStaff() {\n      return request.auth != null\n        && request.auth.token.warehouseStaff == true;\n    }`,
    "Firestore UID allowlist"
  );

  for (const line of [
    "        && data.createdByEmail == request.auth.token.email\n",
    "        && request.resource.data.cancelledByEmail == request.auth.token.email\n",
    "        && data.updatedByEmail == request.auth.token.email\n",
    "        && request.resource.data.createdByEmail == request.auth.token.email\n",
    "        && data.email == request.auth.token.email\n"
  ]) text = text.replaceAll(line, "");

  text = text
    .replaceAll("'createdBy', 'createdByEmail', 'createdByName'", "'createdBy', 'createdByName'")
    .replaceAll("'createdBy', 'createdByEmail', 'createdByName'", "'createdBy', 'createdByName'")
    .replaceAll("'status', 'cancelledAt', 'cancelledBy', 'cancelledByEmail',\n          'cancelledByName'", "'status', 'cancelledAt', 'cancelledBy', 'cancelledByName'")
    .replaceAll("'balance', 'initializedAt', 'updatedAt', 'updatedBy',\n          'updatedByEmail', 'updatedByName'", "'balance', 'initializedAt', 'updatedAt', 'updatedBy',\n          'updatedByName'")
    .replaceAll("'balance', 'updatedAt', 'updatedBy', 'updatedByEmail', 'updatedByName'", "'balance', 'updatedAt', 'updatedBy', 'updatedByName'")
    .replaceAll("['uid', 'email', 'token', 'platform', 'updatedAt']", "['uid', 'token', 'platform', 'updatedAt']");

  if (/createdByEmail|cancelledByEmail|updatedByEmail|data\.email == request\.auth\.token\.email/u.test(text)) {
    throw new Error("Firestore email audit references remain");
  }
  if (/request\.auth\.uid in \[/u.test(text)) throw new Error("Firestore UID allowlist remains");
  await write("firestore.rules", text);
}

async function migrateApp() {
  let text = await read("mobile/app.js");
  text = replaceRegexOnce(text, /const STAFF_BY_UID = new Map\(\[[\s\S]*?\]\);\n\n/u, "", "client UID map");
  text = replaceExact(text, "  user: null,\n", "  user: null,\n  staffName: \"Сотрудник\",\n", "state staffName");
  text = replaceRegexOnce(
    text,
    /function employeeNameFromUser\(user\) \{[\s\S]*?function currentEmployeeName\(\) \{\n  return employeeNameFromUser\(state\.user\);\n\}/u,
    `async function loadStaffClaims(user) {\n  const token = await user.getIdTokenResult(true);\n  if (token.claims?.warehouseStaff !== true) return null;\n  const name = String(token.claims?.warehouseName || \"\").trim();\n  return { name: name || \"Сотрудник\" };\n}\n\nfunction currentEmployeeName() {\n  return state.staffName || \"Сотрудник\";\n}`,
    "client staff helpers"
  );

  const oldAuth = `      if (!user) {\n        stopRealtime();\n        showOnly(\"#login\");\n        hideBoot();\n        return;\n      }\n      if (!isAllowedStaffUser(user)) {\n        stopRealtime();\n        showOnly(\"#login\");\n        $(\"#login-error\").textContent = \"У этой учётной записи нет доступа к складу.\";\n        hideBoot();\n        signOut(state.auth);\n        return;\n      }\n      const employee = currentEmployeeName();`;
  const newAuth = `      if (!user) {\n        state.staffName = \"Сотрудник\";\n        stopRealtime();\n        showOnly(\"#login\");\n        hideBoot();\n        return;\n      }\n      const staffClaims = await loadStaffClaims(user).catch(() => null);\n      if (!staffClaims) {\n        state.staffName = \"Сотрудник\";\n        stopRealtime();\n        showOnly(\"#login\");\n        $(\"#login-error\").textContent = \"У этой учётной записи нет доступа к складу.\";\n        hideBoot();\n        signOut(state.auth);\n        return;\n      }\n      state.staffName = staffClaims.name;\n      const employee = currentEmployeeName();`;
  text = replaceExact(text, oldAuth, newAuth, "auth state claim gate");

  for (const field of ["createdByEmail", "updatedByEmail", "cancelledByEmail"]) {
    text = text.replace(new RegExp(`\\s*${field}: state\\.user\\.email \\|\\| \"\",?`, "gu"), "");
  }
  text = text.replace(/function saleEmployee\(sale\) \{\n  return [^\n]+;\n\}/u, `function saleEmployee(sale) {\n  return sale.createdByName || \"Сотрудник\";\n}`);
  text = text.replace(/function movementEmployee\(movement\) \{\n  return [^\n]+;\n\}/u, `function movementEmployee(movement) {\n  return movement.createdByName || \"Сотрудник\";\n}`);

  if (/STAFF_BY_UID|isAllowedStaffUser|employeeNameFromEmail/u.test(text)) throw new Error("Client allowlist helper remains");
  await write("mobile/app.js", text);
}

async function migrateWarehouseDomain() {
  let text = await read("mobile/warehouse-domain.js");
  for (const field of ["createdByEmail", "updatedByEmail", "cancelledByEmail"]) {
    text = text.replace(new RegExp(`\\s*${field}: state\\.user\\.email \\|\\| \"\",?`, "gu"), "");
  }
  await write("mobile/warehouse-domain.js", text);
}

async function migrateWarehouseUi() {
  let text = await read("mobile/warehouse-ui.js");
  text = text
    .replaceAll("updatedBy: user.uid, updatedByEmail: user.email || \"\", updatedByName", "updatedBy: user.uid, updatedByName")
    .replaceAll("createdBy: user.uid, createdByEmail: user.email || \"\", createdByName", "createdBy: user.uid, createdByName");
  await write("mobile/warehouse-ui.js", text);
}

async function migratePushClient() {
  let text = await read("mobile/push-notifications.js");
  text = text.replaceAll("    email: user.email || \"\",\n", "");
  await write("mobile/push-notifications.js", text);
}

async function migrateAnalytics() {
  let text = await read("mobile/analytics.js");
  text = replaceRegexOnce(
    text,
    /function employeeName\(sale\) \{[\s\S]*?\n\}/u,
    `function employeeName(sale) {\n  return sale.createdByName || \"Сотрудник\";\n}`,
    "analytics employee fallback"
  );
  await write("mobile/analytics.js", text);
}

async function migrateSalesHistory() {
  let text = await read("mobile/sales-history.js");
  text = replaceRegexOnce(text, /const STAFF_NAMES = new Map\(\[[\s\S]*?\]\);\n\n/u, "", "sales history email map");
  text = replaceRegexOnce(
    text,
    /function employeeName\(email = \"\", explicit = \"\"\) \{[\s\S]*?function createdByName\(item\) \{[\s\S]*?\n\}/u,
    `function createdByName(item) {\n  return item.createdByName || \"Сотрудник\";\n}`,
    "sales history employee fallback"
  );
  text = text.replaceAll(
    "  const cancelName = employeeName(sale.cancelledByEmail || \"\", sale.cancelledByName || \"\");",
    "  const cancelName = sale.cancelledByName || \"Сотрудник\";"
  );
  await write("mobile/sales-history.js", text);
}

async function migratePushWorker() {
  let text = await read("push-worker/src/index.js");
  text = replaceRegexOnce(text, /const ALLOWED_UIDS = new Set\(\[[\s\S]*?\]\);\n\n/u, "", "push worker UID allowlist");
  text = replaceExact(
    text,
    "let cachedAccessToken = null;\n",
    `let cachedAccessToken = null;\n\nfunction parseIdTokenClaims(idToken) {\n  const payload = String(idToken || \"\").split(\".\")[1];\n  if (!payload) return null;\n  const normalized = payload.replaceAll(\"-\", \"+\").replaceAll(\"_\", \"/\");\n  const padded = normalized + \"=\".repeat((4 - (normalized.length % 4)) % 4);\n  try {\n    const binary = atob(padded);\n    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));\n    return JSON.parse(new TextDecoder().decode(bytes));\n  } catch {\n    return null;\n  }\n}\n`,
    "push worker token claim decoder"
  );
  const oldAuth = `  const user = (await response.json()).users?.[0];\n  const email = String(user?.email || \"\").toLowerCase();\n  if (!user?.localId || !ALLOWED_UIDS.has(user.localId)) return null;\n  return { uid: user.localId, email };`;
  const newAuth = `  const user = (await response.json()).users?.[0];\n  const claims = parseIdTokenClaims(idToken);\n  if (!user?.localId || claims?.warehouseStaff !== true) return null;\n  return { uid: user.localId };`;
  text = replaceExact(text, oldAuth, newAuth, "push worker claim authorization");
  await write("push-worker/src/index.js", text);
}

async function migrateAuthSecurityTests() {
  let text = await read("tests/auth-security.test.mjs");
  text = text.replaceAll("mihagavr@gmail.com", "staff@example.test");
  text = text.replaceAll("a.kalashin@gmail.com", "staff2@example.test");
  text = replaceRegexOnce(
    text,
    /test\(\"authorization allowlist is pinned to the two Firebase UIDs\", async \(\) => \{[\s\S]*?\n\}\);\n?$/u,
    `test(\"authorization uses server-managed custom claims and publishes no staff identifiers\", async () => {\n  const [app, rules, push, analytics, sales] = await Promise.all([\n    read(\"mobile/app.js\"),\n    read(\"firestore.rules\"),\n    read(\"push-worker/src/index.js\"),\n    read(\"mobile/analytics.js\"),\n    read(\"mobile/sales-history.js\")\n  ]);\n  const combined = [app, rules, push, analytics, sales].join(\"\\n\");\n  assert.match(app, /getIdTokenResult\\(true\\)/);\n  assert.match(rules, /request\\.auth\\.token\\.warehouseStaff == true/);\n  assert.match(push, /claims\\?\\.warehouseStaff !== true/);\n  assert.doesNotMatch(combined, /STAFF_BY_UID|ALLOWED_UIDS|STAFF_NAMES/);\n  assert.doesNotMatch(combined, /@gmail\\.com/);\n  assert.doesNotMatch(combined, /createdByEmail|cancelledByEmail|updatedByEmail/);\n});\n`,
    "auth security allowlist test"
  );
  await write("tests/auth-security.test.mjs", text);
}

async function migrateRulesTests() {
  let text = await read("tests/firestore.rules.test.mjs");
  text = replaceRegexOnce(
    text,
    /const staffUid = \"[^\"]+\";\nconst secondStaffUid = \"[^\"]+\";\nconst staffEmail = \"[^\"]+\";\nconst secondStaffEmail = \"[^\"]+\";/u,
    `const staffUid = \"staff-user-1\";\nconst secondStaffUid = \"staff-user-2\";\nconst staffClaims = { warehouseStaff: true, warehouseName: \"Сотрудник\" };`,
    "rules test identities"
  );
  text = replaceExact(text, "  return testEnv.authenticatedContext(staffUid, { email: staffEmail }).firestore();", "  return testEnv.authenticatedContext(staffUid, staffClaims).firestore();", "staff test context");
  text = replaceExact(text, "  return testEnv.authenticatedContext(secondStaffUid, { email: secondStaffEmail }).firestore();", "  return testEnv.authenticatedContext(secondStaffUid, staffClaims).firestore();", "second staff test context");
  text = text
    .replaceAll("    createdByEmail: staffEmail,\n", "")
    .replaceAll("      createdByEmail: staffEmail,\n", "")
    .replaceAll("    updatedByEmail: staffEmail,\n", "")
    .replaceAll("      updatedByEmail: staffEmail,\n", "")
    .replaceAll("      cancelledByEmail: staffEmail,\n", "")
    .replaceAll("    email: staffEmail,\n", "")
    .replaceAll("      email: staffEmail,\n", "");
  text = text.replace(
    "test(\"only the two approved Firebase UIDs can read warehouse products\", async () => {",
    "test(\"only identities with the warehouseStaff custom claim can read warehouse products\", async () => {"
  );
  text = text.replace(
    "  await assertFails(getDoc(doc(testEnv.authenticatedContext(\"outsider\", { email: \"other@example.com\" }).firestore(), \"products\", \"DM30_BLUE\")));\n  await assertFails(getDoc(doc(testEnv.authenticatedContext(\"spoofed-uid\", { email: staffEmail }).firestore(), \"products\", \"DM30_BLUE\")));",
    "  await assertFails(getDoc(doc(testEnv.authenticatedContext(\"outsider\").firestore(), \"products\", \"DM30_BLUE\")));\n  await assertFails(getDoc(doc(testEnv.authenticatedContext(\"email-only\", { email: \"staff@example.test\" }).firestore(), \"products\", \"DM30_BLUE\")));"
  );
  if (/staffEmail|secondStaffEmail|createdByEmail|cancelledByEmail|updatedByEmail/u.test(text)) {
    throw new Error("Rules tests still contain email audit fixtures");
  }
  await write("tests/firestore.rules.test.mjs", text);
}

async function bumpVersion() {
  const manifestPath = "mobile/app-version.json";
  const manifest = JSON.parse(await read(manifestPath));
  manifest.version = "1.1.3";
  manifest.versionCode = 10103;
  manifest.notes = "1.1.3: доступ к складу переведён на серверный Firebase custom claim без публикации UID или email в клиентском коде. Персональные email удалены из новых служебных записей и очищены из существующего журнала. Защита от перебора пароля сохранена.";
  await write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  for (const path of ["android-app/package.json", "android-app/package-lock.json"]) {
    const data = JSON.parse(await read(path));
    data.version = "1.1.3";
    if (path.endsWith("package-lock.json") && data.packages?.[""]) data.packages[""].version = "1.1.3";
    await write(path, `${JSON.stringify(data, null, 2)}\n`);
  }

  const historyPath = "mobile/version-history.js";
  let history = await read(historyPath);
  if (!history.includes('version: "1.1.3"')) {
    history = replaceExact(
      history,
      "const VERSIONS = [\n",
      `const VERSIONS = [\n  {\n    version: \"1.1.3\",\n    date: \"07.09.2026\",\n    changes: [\n      \"Доступ к складу переведён на серверный Firebase custom claim: списки UID и email больше не публикуются в клиентском коде.\",\n      \"Персональные email больше не записываются в продажи, движения, кассу и push-устройства; старые служебные email очищены из Firestore.\",\n      \"Пятиступенчатая защита входа 5 минут → 30 минут → 24 часа сохранена.\"\n    ]\n  },\n`,
      "version history header"
    );
  }
  history = history.replaceAll("Актуальная версия: 1.1.2", "Актуальная версия: 1.1.3");
  history = history.replaceAll('data-current-version="1.1.2"', 'data-current-version="1.1.3"');
  await write(historyPath, history);
}

async function assertNoPublishedStaffIdentifiers() {
  const paths = [
    "firestore.rules",
    "mobile/app.js",
    "mobile/analytics.js",
    "mobile/sales-history.js",
    "mobile/warehouse-domain.js",
    "mobile/warehouse-ui.js",
    "mobile/push-notifications.js",
    "push-worker/src/index.js",
    "tests/auth-security.test.mjs",
    "tests/firestore.rules.test.mjs"
  ];
  const combined = (await Promise.all(paths.map(read))).join("\n");
  if (/@gmail\.com/u.test(combined)) throw new Error("Personal Gmail address remains in protected sources");
  if (/STAFF_BY_UID|ALLOWED_UIDS/u.test(combined)) throw new Error("UID allowlist remains in protected sources");
}

const approvedStaff = await discoverApprovedStaff();
const db = await setServerClaims(approvedStaff);
await scrubEmailAuditFields(db);
await migrateRules();
await migrateApp();
await migrateWarehouseDomain();
await migrateWarehouseUi();
await migratePushClient();
await migrateAnalytics();
await migrateSalesHistory();
await migratePushWorker();
await migrateAuthSecurityTests();
await migrateRulesTests();
await bumpVersion();
await assertNoPublishedStaffIdentifiers();
console.log("Private custom-claim authorization migration completed.");
