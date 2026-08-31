const permissionPatterns = [
  /permission-denied/i,
  /missing or insufficient permissions/i,
  /insufficient permissions/i,
  /permission/i
];

const friendly = "Firebase запретил запись. Обновите Firestore Rules из файла firestore.rules в Firebase Console → Firestore Database → Rules → Publish.";

function isPermissionError(text = "") {
  return permissionPatterns.some((pattern) => pattern.test(String(text)));
}

function normalizeErrorNode(node) {
  if (!node || !isPermissionError(node.textContent)) return;
  node.textContent = friendly;
}

const watchedSelectors = ["#model-balance-error", "#stock-operation-error", "#sale-error", "#login-error"];

function watchNode(node) {
  if (!node) return;
  normalizeErrorNode(node);
  new MutationObserver(() => normalizeErrorNode(node)).observe(node, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

function start() {
  watchedSelectors.forEach((selector) => watchNode(document.querySelector(selector)));
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
