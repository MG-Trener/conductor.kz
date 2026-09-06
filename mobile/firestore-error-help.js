const permissionPatterns = [
  /permission-denied/i,
  /missing or insufficient permissions/i,
  /insufficient permissions/i,
  /permission/i
];

const friendly = "Firebase отклонил запись: у аккаунта нет доступа или на сервере не опубликованы актуальные Firestore Rules из репозитория.";

function isPermissionError(text = "") {
  return permissionPatterns.some((pattern) => pattern.test(String(text)));
}

function normalizeErrorNode(node) {
  if (!node || !isPermissionError(node.textContent)) return;
  node.textContent = friendly;
}

const watchedSelectors = [
  "#model-balance-error",
  "#stock-operation-error",
  "#sale-error",
  "#cash-withdrawal-error",
  "#cash-movement-error",
  "#sale-confirm-error",
  "#login-error"
];

function watchNode(node) {
  if (!node || node.dataset.permissionWatch === "1") return;
  node.dataset.permissionWatch = "1";
  normalizeErrorNode(node);
  new MutationObserver(() => normalizeErrorNode(node)).observe(node, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

function start() {
  watchedSelectors.forEach((selector) => watchNode(document.querySelector(selector)));
  new MutationObserver(() => {
    watchedSelectors.forEach((selector) => watchNode(document.querySelector(selector)));
  }).observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
