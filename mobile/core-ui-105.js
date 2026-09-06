function stripColorCount(text = "") {
  return String(text)
    .replace(/^\s*\d+\s+цвет(?:ов|а)?\s*[·•\-]?\s*/i, "")
    .replace(/^\s*[·•\-]\s*/, "")
    .trim();
}

function normalizeUi() {
  document.querySelectorAll('.bottom-nav [data-nav="sale"], #view-dashboard .quick[data-nav="sale"], #view-sales .sticky-head > [data-nav="sale"]').forEach((node) => node.remove());

  const salesTitle = document.querySelector("#view-sales .sticky-head h1");
  if (salesTitle && salesTitle.textContent !== "Операции") salesTitle.textContent = "Операции";
  const salesNav = document.querySelector('.bottom-nav [data-nav="sales"] small');
  if (salesNav && salesNav.textContent !== "Операции") salesNav.textContent = "Операции";

  document.querySelectorAll("#view-stock .stock-name small").forEach((node) => {
    const cleaned = stripColorCount(node.textContent);
    if (cleaned !== node.textContent.trim()) node.textContent = cleaned;
  });
  document.querySelectorAll("#sale-products .sale-model-title > small:not(.sale-tier-hint)").forEach((node) => {
    const cleaned = stripColorCount(node.textContent);
    if (cleaned !== node.textContent.trim()) node.textContent = cleaned;
  });
}

function decorateStockRows() {
  document.querySelectorAll("#view-stock .stock-color-summary > span").forEach((row) => {
    const countNode = row.querySelector(":scope > b");
    if (!countNode) return;
    const count = Number.parseInt(String(countNode.textContent || "0").replace(/\s+/g, ""), 10);
    const value = Number.isFinite(count) ? count : 0;
    row.classList.toggle("stock-zero", value === 0);
    row.classList.toggle("stock-low", value > 0 && value <= 2);
    countNode.setAttribute("aria-label", `Остаток: ${value}`);
  });
}

function bindJournal() {
  const dialog = document.getElementById("movement-dialog");
  const open = document.getElementById("open-stock-movements");
  const close = document.getElementById("movement-dialog-close");
  if (!dialog || !open || open.dataset.bound105 === "1") return;
  open.dataset.bound105 = "1";
  open.addEventListener("click", () => dialog.showModal());
  close?.addEventListener("click", () => dialog.close());
}

function refreshCompactStockUi() {
  normalizeUi();
  decorateStockRows();
  bindJournal();
}

function start() {
  // No MutationObserver: 1.0.5 keeps the startup path safe after the 1.0.3 regression.
  refreshCompactStockUi();
  window.setInterval(refreshCompactStockUi, 1200);
  document.addEventListener("click", (event) => {
    if (event.target.closest('[data-nav="stock"]')) window.setTimeout(refreshCompactStockUi, 60);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) window.setTimeout(refreshCompactStockUi, 60);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
