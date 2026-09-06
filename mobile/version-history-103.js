const VERSIONS = [
  {
    version: "1.0.3",
    date: "06.09.2026",
    changes: [
      "Критические правки интерфейса перенесены из временных DOM-надстроек в основную HTML-разметку и отдельные неизменяемые ресурсы 1.0.3.",
      "В разделе «Операции» физически удалена дублирующая кнопка «+ Продажа».",
      "Журнал движения остатков физически убран из-под карточек товаров и перенесён в отдельное компактное окно по кнопке «Журнал» в верхнем блоке склада.",
      "Разновидности товара выводятся строго вертикально с цветными кружками, а подписи вида «0 цветов» удаляются.",
      "Для критических модулей введены новые имена файлов и cache-busting, чтобы Android WebView не мог использовать старые JS/CSS после обновления APK.",
      "История изменений переведена на отдельный модуль 1.0.3 и теперь содержит релизы 1.0.1, 1.0.2 и 1.0.3."
    ]
  },
  {
    version: "1.0.2",
    date: "06.09.2026",
    changes: [
      "Добавлена очистка WebView-кэша при смене Android-версии приложения.",
      "Добавлены правки компактного склада, вертикального списка разновидностей, отдельного журнала и удаления дублирующей кнопки продажи.",
      "Усилена синхронизация выбранного количества при продаже DM60."
    ]
  },
  {
    version: "1.0.1",
    date: "06.09.2026",
    changes: [
      "Первая попытка исправить отображение склада, журнала движения и кнопку продажи в разделе операций.",
      "Добавлена синхронизация выбранного количества между основной формой продажи и расширенным подтверждением."
    ]
  },
  {
    version: "1.0.0",
    date: "06.09.2026",
    changes: [
      "Первый стабильный релиз новой архитектуры: Android-приложение содержит интерфейс склада внутри APK.",
      "Дополнительные функции запускаются через единый bootstrap, добавлены проверки сборки и постоянная Android-подпись.",
      "Обновления APK проверяются по SHA-256 перед системной установкой Android."
    ]
  },
  { version: "0.7.0", date: "06.09.2026", changes: ["Мобильная сборка синхронизирована с актуальным интерфейсом склада.", "В Настройки добавлена история версий."] },
  { version: "0.6.9", date: "06.09.2026", changes: ["Раздел «Продажи» переработан в журнал «Операции».", "Добавлено ручное движение кассы: пополнение и «Пилорама»."] },
  { version: "0.6.8", date: "03.09.2026", changes: ["Добавлена фильтрация журнала продаж по году и месяцу."] },
  { version: "0.6.7", date: "03.09.2026", changes: ["Добавлена аналитика продаж и календарь 12 месяцев."] },
  { version: "0.6.6", date: "03.09.2026", changes: ["Добавлены Android Push-уведомления о новой продаже второму сотруднику."] },
  { version: "0.6.5", date: "01.09.2026", changes: ["Исправлено наложение системных панелей Android на интерфейс."] },
  { version: "0.6.4", date: "01.09.2026", changes: ["Добавлен фирменный значок приложения с ретро-паровозом."] },
  { version: "0.6.3", date: "01.09.2026", changes: ["Обновление APK переведено на стандартную проверку версии."] },
  { version: "0.6.2", date: "01.09.2026", changes: ["Убрана дублирующая нативная заставка Android."] },
  { version: "0.6.1", date: "01.09.2026", changes: ["Исправлено отображение заставки на широких экранах."] },
  { version: "0.6.0", date: "01.09.2026", changes: ["Добавлена анимированная ретро-заставка CONDUCTOR.KZ."] },
  { version: "0.5.1", date: "01.09.2026", changes: ["Обновлена винтажная заставка приложения."] },
  { version: "0.5.0", date: "01.09.2026", changes: ["Добавлена работа с заявками покупателей."] },
  { version: "0.4.3", date: "01.09.2026", changes: ["Исправлено отображение складской заставки в PWA и Android."] },
  { version: "0.4.2", date: "01.09.2026", changes: ["Исправлен встроенный механизм обновления APK."] },
  { version: "0.4.1", date: "01.09.2026", changes: ["Восстановлено изображение ретро-локомотива вместо чёрного экрана."] },
  { version: "0.4.0", date: "01.09.2026", changes: ["Добавлена шестисекундная полноэкранная заставка склада."] },
  { version: "0.3.0", date: "01.09.2026", changes: ["Добавлены первый фирменный значок и полноэкранная заставка."] },
  { version: "0.2.0", date: "01.09.2026", changes: ["Добавлена встроенная проверка обновлений и постоянный GitHub Release."] },
  { version: "0.1.0", date: "31.08.2026", changes: ["Первая Android-сборка CONDUCTOR Склад."] }
];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function renderHistory() {
  const root = document.getElementById("version-history-list");
  if (!root) return;
  root.innerHTML = VERSIONS.map((item, index) => `
    <article class="version-history-card${index === 0 ? " latest" : ""}">
      <div class="version-history-meta">
        <div class="version-history-version">v${escapeHtml(item.version)}${index === 0 ? '<span class="version-history-badge">Последняя</span>' : ""}</div>
        <span class="version-history-date">${escapeHtml(item.date)}</span>
      </div>
      <ul>${item.changes.map((change) => `<li>${escapeHtml(change)}</li>`).join("")}</ul>
    </article>`).join("");
}

function ensureHistoryUi() {
  const settings = document.getElementById("view-settings");
  if (!settings) return;

  let button = document.getElementById("version-history-button");
  if (!button) {
    button = document.createElement("button");
    button.id = "version-history-button";
    button.type = "button";
    button.className = "btn full version-history-btn";
    button.innerHTML = '<span class="version-history-btn-copy"><b>История изменений</b><small>Актуальная версия: 1.0.3</small></span><span aria-hidden="true">›</span>';
    settings.querySelector(".settings-panel")?.insertAdjacentElement("afterend", button);
  }

  let dialog = document.getElementById("version-history-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "version-history-dialog";
    dialog.className = "stock-dialog version-history-dialog";
    dialog.innerHTML = `
      <div class="stock-dialog-card">
        <div class="dialog-head">
          <div><div class="eyebrow">CONDUCTOR Склад</div><h2>История изменений</h2></div>
          <button id="version-history-close" class="dialog-close" type="button" aria-label="Закрыть">×</button>
        </div>
        <div id="version-history-list" class="version-history-list"></div>
      </div>`;
    document.body.appendChild(dialog);
  }

  renderHistory();
  if (button.dataset.bound103 !== "1") {
    button.dataset.bound103 = "1";
    button.addEventListener("click", () => dialog.showModal());
    dialog.querySelector("#version-history-close")?.addEventListener("click", () => dialog.close());
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ensureHistoryUi, { once: true });
} else {
  ensureHistoryUi();
}
