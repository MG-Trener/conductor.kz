import "./app-update.js?v=1";
import "./analytics.js?v=2";

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

const watchedSelectors = ["#model-balance-error", "#stock-operation-error", "#sale-error", "#cash-withdrawal-error", "#login-error"];

function watchNode(node) {
  if (!node) return;
  normalizeErrorNode(node);
  new MutationObserver(() => normalizeErrorNode(node)).observe(node, {
    childList: true,
    characterData: true,
    subtree: true
  });
}

function normalizeAnalyticsSaleCards(root) {
  if (!root) return;

  root.querySelectorAll(".analytics-sale-title b").forEach((node) => {
    if (/^Продажа\s+#/i.test(node.textContent || "")) node.textContent = "Продажа";
  });

  root.querySelectorAll(".analytics-sale-status:not(.cancelled)").forEach((node) => node.remove());
}

function watchAnalyticsSaleCards() {
  const root = document.querySelector("#analytics-sales-list");
  if (!root) return;
  normalizeAnalyticsSaleCards(root);
  new MutationObserver(() => normalizeAnalyticsSaleCards(root)).observe(root, {
    childList: true,
    subtree: true
  });
}

function start() {
  watchedSelectors.forEach((selector) => watchNode(document.querySelector(selector)));
  watchAnalyticsSaleCards();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
