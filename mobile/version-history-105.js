const VERSIONS = [
  {
    version: "1.0.18",
    date: "07.09.2026",
    changes: [
      "DM60R1G теперь всегда показывает разновидности «Синий» и «Розовый» на складе и в новой продаже, даже если старые документы Firestore ещё не были созданы.",
      "При сохранении остатков недостающие позиции DM60R1G создаются автоматически; инициализация выполняется до запуска realtime-подписок.",
      "Исправлены известные старые цены: DM60R1G 3 000 ₸ → 4 000 ₸ и DM60G 3 000 ₸ → 3 500 ₸; сайт, склад и продажи используют одинаковую эффективную цену."
    ]
  },
  {
    version: "1.0.17",
    date: "07.09.2026",
    changes: [
      "Исправлен DM60R1G на существующей базе: недостающие разновидности «Синий» и «Розовый» теперь создаются и восстанавливаются автоматически.",
      "DM60R1G снова отображается с разновидностями и на складе, и в блоке новой продажи.",
      "Ошибочная цена DM60R1G 3 000 ₸ автоматически исправляется на 4 000 ₸; другие вручную изменённые цены не затрагиваются."
    ]
  },
  {
    version: "1.0.16",
    date: "07.09.2026",
    changes: [
      "Добавлен DM60R1G — дым для гендер-пати из белого в цвет; на сайте используется подготовленное изображение товара.",
      "На складе добавлена карточка «DM60R1G (интрига)» с синим и розовым вариантами, модель также доступна в новой продаже.",
      "Цена DM60R1G хранится в общем catalog и одинаково используется публичным сайтом, складом и продажами; стартовая цена — 4 000 ₸."
    ]
  },
  {
    version: "1.0.15",
    date: "07.09.2026",
    changes: [
      "Устранено расхождение цены DM60G: внешняя карточка склада и цена внутри модели теперь используют одну эффективную цену.",
      "Старая ошибочная запись DM60G = 3 000 ₸ больше не перекрывает настроенную для модели цену 3 500 ₸.",
      "Одинаковая цена применяется в карточке склада, стоимости склада, выборе товара и подтверждении продажи; другие вручную сохранённые цены продолжают учитываться."
    ]
  },
  {
    version: "1.0.14",
    date: "07.09.2026",
    changes: [
      "Повторно исправлена цена гендерного дыма DM60G после подтверждения, что версия 1.0.13 оставляла в карточке 3 000 ₸.",
      "Проверка цены теперь запускается независимо от дополнительной логики склада и напрямую работает с catalog/DM60G после авторизации.",
      "После записи 3 500 ₸ приложение повторно читает документ и проверяет, что исправление действительно сохранилось."
    ]
  },
  {
    version: "1.0.13",
    date: "07.09.2026",
    changes: [
      "Первая попытка исправить цену гендерного дыма DM60G с 3 000 ₸ на 3 500 ₸ через миграцию каталога.",
      "По фактической проверке на устройстве миграция не сработала, поэтому механизм заменён в версии 1.0.14."
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
  if (copy) copy.textContent = "Актуальная версия: 1.0.18";

  const root = document.getElementById("version-history-list");
  if (!root || root.querySelector('[data-current-version="1.0.18"]')) return;
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
