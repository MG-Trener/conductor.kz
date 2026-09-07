from pathlib import Path
import json

UID1 = "98l4qLx3yzX9XZ2ye8REhURyiRi2"
UID2 = "sIUV6byir4VALmrKBIpJLzD8Evz2"


def replace_exact(path, old, new, count=1):
    p = Path(path)
    text = p.read_text()
    actual = text.count(old)
    if actual != count:
        raise SystemExit(f"{path}: expected {count} matches, found {actual}")
    p.write_text(text.replace(old, new))


replace_exact(
    "firestore.rules",
    """    // Only the two explicitly approved Firebase Authentication accounts can
    // access warehouse data. There is no public sign-up in the application.
    function isStaff() {
      return request.auth != null
        && request.auth.token.keys().hasAll(['email'])
        && request.auth.token.email in [
          'mihagavr@gmail.com',
          'a.kalashin@gmail.com'
        ];
    }
""",
    f"""    // Only the two explicitly approved Firebase Authentication UIDs can
    // access warehouse data. Email addresses are metadata, never authorization.
    function isStaff() {{
      return request.auth != null
        && request.auth.uid in [
          '{UID1}',
          '{UID2}'
        ];
    }}
""",
)

replace_exact(
    "mobile/app.js",
    """const STAFF_NAMES = new Map([
  [\"mihagavr@gmail.com\", \"Михаил\"],
  [\"a.kalashin@gmail.com\", \"Алексей\"]
]);
""",
    f"""const STAFF_BY_UID = new Map([
  [\"{UID1}\", \"Михаил\"],
  [\"{UID2}\", \"Алексей\"]
]);
""",
)
replace_exact(
    "mobile/app.js",
    """function employeeNameFromEmail(email = \"\") {
  const normalized = String(email).trim().toLowerCase();
  return STAFF_NAMES.get(normalized) || \"Сотрудник\";
}

function isAllowedStaffEmail(email = \"\") { return STAFF_NAMES.has(String(email).trim().toLowerCase()); }

function currentEmployeeName() {
  return employeeNameFromEmail(state.user?.email || \"\");
}
""",
    """function employeeNameFromUser(user) {
  return STAFF_BY_UID.get(String(user?.uid || \"\")) || \"Сотрудник\";
}

function isAllowedStaffUser(user) { return STAFF_BY_UID.has(String(user?.uid || \"\")); }

function currentEmployeeName() {
  return employeeNameFromUser(state.user);
}
""",
)
replace_exact(
    "mobile/app.js",
    "if (!isAllowedStaffEmail(user.email || \"\")) {",
    "if (!isAllowedStaffUser(user)) {",
)

replace_exact(
    "push-worker/src/index.js",
    """const ALLOWED_EMAILS = new Set([
  \"mihagavr@gmail.com\",
  \"a.kalashin@gmail.com\"
]);
""",
    f"""const ALLOWED_UIDS = new Set([
  \"{UID1}\",
  \"{UID2}\"
]);
""",
)
replace_exact(
    "push-worker/src/index.js",
    "if (!user?.localId || !ALLOWED_EMAILS.has(email)) return null;",
    "if (!user?.localId || !ALLOWED_UIDS.has(user.localId)) return null;",
)

replace_exact(
    "mobile/sw.js",
    '  "./app.js", "./catalog-core.js",',
    '  "./app.js", "./auth-throttle.js", "./catalog-core.js",',
)

replace_exact(
    "tests/firestore.rules.test.mjs",
    'const staffUid = "employee-1";\nconst staffEmail = "mihagavr@gmail.com";\nconst secondStaffEmail = "a.kalashin@gmail.com";',
    f'const staffUid = "{UID1}";\nconst secondStaffUid = "{UID2}";\nconst staffEmail = "mihagavr@gmail.com";\nconst secondStaffEmail = "a.kalashin@gmail.com";',
)
replace_exact(
    "tests/firestore.rules.test.mjs",
    'return testEnv.authenticatedContext("employee-2", { email: secondStaffEmail }).firestore();',
    'return testEnv.authenticatedContext(secondStaffUid, { email: secondStaffEmail }).firestore();',
)
replace_exact(
    "tests/firestore.rules.test.mjs",
    'test("only the two approved email accounts can read warehouse products", async () => {',
    'test("only the two approved Firebase UIDs can read warehouse products", async () => {',
)
needle = '  await assertFails(getDoc(doc(testEnv.authenticatedContext("outsider", { email: "other@example.com" }).firestore(), "products", "DM30_BLUE")));\n'
replace_exact(
    "tests/firestore.rules.test.mjs",
    needle,
    needle + '  await assertFails(getDoc(doc(testEnv.authenticatedContext("spoofed-uid", { email: staffEmail }).firestore(), "products", "DM30_BLUE")));\n',
)

p = Path("tests/auth-security.test.mjs")
text = p.read_text()
marker = 'test("authorization allowlist is pinned to the two Firebase UIDs"'
if marker not in text:
    text += f'''\n\ntest("authorization allowlist is pinned to the two Firebase UIDs", async () => {{
  const [app, rules, push] = await Promise.all([
    read("mobile/app.js"), read("firestore.rules"), read("push-worker/src/index.js")
  ]);
  for (const uid of ["{UID1}", "{UID2}"]) {{
    assert.ok(app.includes(uid));
    assert.ok(rules.includes(uid));
    assert.ok(push.includes(uid));
  }}
  assert.match(app, /STAFF_BY_UID/);
  assert.doesNotMatch(app, /isAllowedStaffEmail/);
  assert.doesNotMatch(rules, /request\\.auth\\.token\\.email in/);
  assert.doesNotMatch(push, /ALLOWED_EMAILS/);
}});\n'''
    p.write_text(text)

replace_exact(
    "tests/mobile-architecture.test.mjs",
    'for (const file of ["app.js", "catalog-core.js"',
    'for (const file of ["app.js", "auth-throttle.js", "catalog-core.js"',
)

wf = Path(".github/workflows/build-android-apk.yml")
wtext = wf.read_text()
if "node --check mobile/auth-throttle.js" not in wtext:
    if "node --check mobile/app.js" not in wtext:
        raise SystemExit("Android workflow syntax check marker missing")
    wtext = wtext.replace(
        "node --check mobile/app.js",
        "node --check mobile/app.js\n          node --check mobile/auth-throttle.js",
        1,
    )
    wf.write_text(wtext)

manifest_path = Path("mobile/app-version.json")
manifest = json.loads(manifest_path.read_text())
manifest["version"] = "1.1.2"
manifest["versionCode"] = 10102
manifest["notes"] = "1.1.2: закрытая авторизация переведена на два разрешённых Firebase UID. Саморегистрация отсутствует в приложении. После 5 неверных попыток вход блокируется на 5 минут, затем на 30 минут и далее на 24 часа; защита сохраняется после перезапуска."
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

package_path = Path("android-app/package.json")
package = json.loads(package_path.read_text())
package["version"] = "1.1.2"
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n")

lock_path = Path("android-app/package-lock.json")
lock = json.loads(lock_path.read_text())
lock["version"] = "1.1.2"
if "" in lock.get("packages", {}):
    lock["packages"][""]["version"] = "1.1.2"
lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + "\n")

vh = Path("mobile/version-history.js")
vtext = vh.read_text()
if 'version: "1.1.2"' not in vtext:
    entry = '''const VERSIONS = [
  {
    version: "1.1.2",
    date: "07.09.2026",
    changes: [
      "Доступ к складу переведён с email на два фиксированных Firebase UID; посторонняя учётная запись не получит доступ даже при совпадении email.",
      "В интерфейсе отсутствует регистрация новых аккаунтов; Firebase sign-up отключается административно в Authentication.",
      "После 5 неверных паролей вход блокируется на 5 минут, следующая серия — на 30 минут, затем на 24 часа; блокировка сохраняется после перезапуска."
    ]
  },
'''
    header = "const VERSIONS = [\n"
    if not vtext.startswith(header):
        raise SystemExit("Unexpected version-history header")
    vh.write_text(entry + vtext[len(header):])
