import "./app-update.js?v=1";
import "./analytics.js?v=2";
import "./sales-history.js?v=1";

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

  root.querySelectorAll(".analytics-sale-card").forEach((card) => {
    if (card.querySelector(".analytics-sale-status.cancelled")) card.remove();
  });

  root.querySelectorAll(".analytics-sale-title b").forEach((node) => {
    if (/^Продажа\s+#/i.test(node.textContent || "")) node.textContent = "Продажа";
  });

  root.querySelectorAll(".analytics-sale-status").forEach((node) => node.remove());

  const meta = document.querySelector("#analytics-journal-meta");
  if (meta) meta.textContent = String(meta.textContent || "").replace(/\s*·\s*\d+\s+отменено/i, "");

  if (!root.querySelector(".analytics-sale-card") && !root.querySelector(".empty") && !root.querySelector(".analytics-loading")) {
    root.innerHTML = `<div class="empty">В этом месяце продаж нет.</div>`;
  }
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
