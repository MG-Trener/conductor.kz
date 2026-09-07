from pathlib import Path

path = Path("firestore.rules")
text = path.read_text()
old = "        && validModelId(data.modelId)\n"
new = "        && modelExists(data.modelId)\n"
if text.count(old) != 1:
    raise SystemExit(f"expected one validModelId(data.modelId) guard, found {text.count(old)}")
path.write_text(text.replace(old, new, 1))
