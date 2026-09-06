function stripColorCount(text = "") {
  return String(text)
    .replace(/^\s*\d+\s+цвет(?:ов|а)?\s*[·•\-]?\s*/i, "")
    .replace(/^\s*[·•\-]\s*/, "")
    .trim();
}

function normalizeUi() {
  document.querySelector("#view-sales .sticky-head > [data-nav=\"sale\"]")?.remove();

  const salesTitle = document.querySelector("#view-sales .sticky-head h1");
  if (salesTitle) salesTitle.textContent = "Операции";
  const salesNav = document.querySelector('.bottom-nav [data-nav="sales"] small');
  if (salesNav) salesNav.textContent = "Операции";

  document.querySelectorAll("#view-stock .stock-name small").forEach((node) => {
    const cleaned = stripColorCount(node.textContent);
    if (cleaned !== node.textContent.trim()) node.textContent = cleaned;
  });
  document.querySelectorAll("#view-sale .sale-model-title > small:not(.sale-tier-hint)").forEach((node) => {
    const cleaned = stripColorCount(node.textContent);
    if (cleaned !== node.textContent.trim()) node.textContent = cleaned;
  });
}

function bindJournal() {
  const dialog = document.getElementById("movement-dialog");
  const open = document.getElementById("open-stock-movements");
  const close = document.getElementById("movement-dialog-close");
  if (!dialog || !open || open.dataset.bound103 === "1") return;
  open.dataset.bound103 = "1";
  open.addEventListener("click", () => dialog.showModal());
  close?.addEventListener("click", () => dialog.close());
}

function start() {
  normalizeUi();
  bindJournal();
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      normalizeUi();
      bindJournal();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
