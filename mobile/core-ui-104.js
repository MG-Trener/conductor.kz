function stripColorCount(text = "") {
  return String(text)
    .replace(/^\s*\d+\s+цвет(?:ов|а)?\s*[·•\-]?\s*/i, "")
    .replace(/^\s*[·•\-]\s*/, "")
    .trim();
}

function normalizeUiOnce() {
  document.querySelector("#view-sales .sticky-head > [data-nav=\"sale\"]")?.remove();

  const salesTitle = document.querySelector("#view-sales .sticky-head h1");
  if (salesTitle && salesTitle.textContent !== "Операции") salesTitle.textContent = "Операции";
  const salesNav = document.querySelector('.bottom-nav [data-nav="sales"] small');
  if (salesNav && salesNav.textContent !== "Операции") salesNav.textContent = "Операции";

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
  if (!dialog || !open || open.dataset.bound104 === "1") return;
  open.dataset.bound104 = "1";
  open.addEventListener("click", () => dialog.showModal());
  close?.addEventListener("click", () => dialog.close());
}

function start() {
  // 1.0.4 deliberately has no MutationObserver here. In 1.0.3 the observer
  // modified the same subtree it watched and could starve Firebase startup.
  normalizeUiOnce();
  bindJournal();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
