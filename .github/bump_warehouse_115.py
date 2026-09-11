import json
from pathlib import Path

VERSION = "1.1.5"
VERSION_CODE = 10105
DATE = "11.09.2026"

pkg_path = Path("android-app/package.json")
pkg = json.loads(pkg_path.read_text())
pkg["version"] = VERSION
pkg_path.write_text(json.dumps(pkg, ensure_ascii=False, indent=2) + "\n")

lock_path = Path("android-app/package-lock.json")
lock = json.loads(lock_path.read_text())
lock["version"] = VERSION
lock["packages"][""]["version"] = VERSION
lock_path.write_text(json.dumps(lock, ensure_ascii=False, indent=2) + "\n")

manifest_path = Path("mobile/app-version.json")
manifest = json.loads(manifest_path.read_text())
manifest["version"] = VERSION
manifest["versionCode"] = VERSION_CODE
manifest["notes"] = (
    "1.1.5: исправлено движение денег в кассе. Пополнение и «Пилорама» снова сохраняются "
    "для обоих разрешённых аккаунтов через связанную атомарную операцию, совместимую с усиленными Firestore Rules."
)
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

history_path = Path("mobile/version-history.js")
history = history_path.read_text()
if 'version: "1.1.5"' not in history:
    entry = f'''  {{
    version: "{VERSION}",
    date: "{DATE}",
    changes: [
      "Исправлено движение денег: «Пополнение» и «Пилорама» снова сохраняются для обоих разрешённых аккаунтов.",
      "Клиент теперь связывает изменение баланса с отдельной атомарной операцией кассы, как требуют усиленные Firestore Rules.",
      "Production Firestore Rules обновлены и проверены тестами; прямое неподтверждённое изменение баланса по-прежнему запрещено."
    ]
  }},
'''
    marker = "const VERSIONS = [\n"
    if marker not in history:
        raise SystemExit("version history marker not found")
    history = history.replace(marker, marker + entry, 1)

history = history.replace("Актуальная версия: 1.1.4", "Актуальная версия: 1.1.5")
history = history.replace("data-current-version=\"1.1.4\"", "data-current-version=\"1.1.5\"")
history_path.write_text(history)
