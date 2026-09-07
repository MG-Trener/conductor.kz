const VERSIONS = [
  {
    version: "1.0.13",
    date: "07.09.2026",
    changes: [
      "Исправлена цена гендерного дыма DM60G в мобильном складе: ошибочные 3 000 ₸ автоматически приводятся к правильным 3 500 ₸.",
      "Исправление выполняется в общем каталоге, поэтому правильная цена используется не только в карточке склада, но и при продаже, расчёте стоимости склада и на сайте.",
      "Миграция ограничена исходной ошибочной записью DM60G и не будет перезаписывать последующие ручные изменения цены."
    ]
  }
];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function renderCurrentVersionCard() {
  const item = VERSIONS[0];
  return `
    <article class="version-history-card latest" data-current-version="${escapeHtml(item.version)}">
      <div class="version-history-meta">
        <div class="version-history-version">v${escapeHtml(item.version)}<span class="version-history-badge">Последняя</span></div>
        <span class="version-history-date">${escapeHtml(item.date)}</span>
      </div>
      <ul>${item.changes.map((change) => `<li>${escapeHtml(change)}</li>`).join("")}</ul>
    </article>`;
}

function patchCurrentVersionUi() {
  const button = document.getElementById("version-history-button");
  const copy = button?.querySelector(".version-history-btn-copy small");
  if (copy) copy.textContent = "Актуальная версия: 1.0.13";

  const root = document.getElementById("version-history-list");
  if (!root || root.querySelector('[data-current-version="1.0.13"]')) return;
  root.querySelectorAll(".version-history-card.latest").forEach((card) => card.classList.remove("latest"));
  root.querySelectorAll(".version-history-badge").forEach((badge) => badge.remove());
  root.insertAdjacentHTML("afterbegin", renderCurrentVersionCard());
}

async function startVersionHistory() {
  try {
    await import("./version-history-105-archive.js?v=1");
    patchCurrentVersionUi();
  } catch (error) {
    console.error("Version history failed to load", error);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startVersionHistory, { once: true });
} else {
  startVersionHistory();
}
