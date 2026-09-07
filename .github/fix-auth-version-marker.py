from pathlib import Path

path = Path("mobile/version-history.js")
text = path.read_text()
old = 'if (copy) copy.textContent = "Актуальная версия: 1.1.1";'
new = 'if (copy) copy.textContent = "Актуальная версия: 1.1.2";'
if text.count(old) != 1:
    raise SystemExit(f"version label marker mismatch: {text.count(old)}")
text = text.replace(old, new)
old_guard = 'root.querySelector(\'[data-current-version="1.1.0"]\')'
new_guard = 'root.querySelector(\'[data-current-version="1.1.2"]\')'
if text.count(old_guard) != 1:
    raise SystemExit(f"version guard marker mismatch: {text.count(old_guard)}")
path.write_text(text.replace(old_guard, new_guard))
