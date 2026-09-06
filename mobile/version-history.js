const VERSIONS = [
  {
    version: "1.0.0",
    date: "06.09.2026",
    changes: [
      "Первый стабильный релиз новой архитектуры: Android-приложение содержит интерфейс склада внутри APK и больше не использует удалённый сайт как основной экран приложения.",
      "Все дополнительные функции запускаются через единый bootstrap без дублирующих импортов и конфликтующих версий модулей; PWA-кэш приведён к единой схеме.",
      "Безопасность обновлений усилена: разрешён только официальный GitHub Release CONDUCTOR, а скачанный APK проверяется по SHA-256 до открытия системной установки Android.",
      "Добавлена Content Security Policy, исправлена повторная регистрация Push и удаление токена устройства при выходе из аккаунта.",
      "Усилены Firestore Rules для продаж, отмен, движения денег и кассы; добавлены архитектурные регрессионные тесты и полный тестовый барьер перед Android-сборкой.",
      "Зафиксированы проверенные версии Capacitor, обновлён GitHub Actions workflow и убрана устаревшая перезагрузка WebView после обновления APK."
    ]
  },
  {
    version: "0.7.0",
    date: "06.09.2026",
    changes: [
      "Крупное Android-обновление: мобильная сборка синхронизирована с актуальным интерфейсом conductor.kz и при смене APK-версии очищает устаревший WebView-кэш, чтобы сразу загрузить свежие модули.",
      "В мобильное приложение включены крупные переработки разделов «Операции», кассы, обзора и склада, а также актуальная аналитика и фильтры по периодам.",
      "В Настройки добавлена полная «История версий» со значимыми изменениями от первой сборки 0.1.0.",
      "Цветовая индикация разновидностей товара на складе приведена к компактным цветным кружкам вместо растянутых цветных полос."
    ]
  },
  {
    version: "0.6.9",
    date: "06.09.2026",
    changes: [
      "Раздел «Продажи» переработан в общий журнал «Операции»: продажи, отмены и движение денег собраны в одном месте; фиксируется автор отмены.",
      "Добавлено ручное движение кассы: «Пополнение» и «Пилорама» с суммой, комментарием и автором операции.",
      "Обзор и склад стали компактнее; перед сохранением продажи можно проверить структуру, скорректировать сумму и применить скидку −10% к дымам без изменения логики Холи.",
      "Убрана повторная заставка при возврате в уже запущенное приложение."
    ]
  },
  {
    version: "0.6.8",
    date: "03.09.2026",
    changes: [
      "В журнале продаж добавлена фильтрация по году и месяцу и просмотр полной истории.",
      "В аналитике период учёта начинается с сентября 2026 года; предыдущие месяцы 2026 года отключены.",
      "Упрощён журнал продаж выбранного месяца в аналитике."
    ]
  },
  {
    version: "0.6.7",
    date: "03.09.2026",
    changes: [
      "Добавлена аналитика продаж: общая сумма за год и календарь 12 месяцев в формате 3×4.",
      "Добавлена подсветка текущего месяца и журнал продаж выбранного месяца."
    ]
  },
  {
    version: "0.6.6",
    date: "03.09.2026",
    changes: [
      "Добавлены Android Push-уведомления о новой продаже второму сотруднику.",
      "В уведомлении показываются сумма продажи и текущий баланс кассы.",
      "Push работает через Firebase Cloud Messaging и защищённый Cloudflare Worker."
    ]
  },
  {
    version: "0.6.5",
    date: "01.09.2026",
    changes: [
      "Исправлено наложение верхней и нижней системных панелей Android на интерфейс приложения."
    ]
  },
  {
    version: "0.6.4",
    date: "01.09.2026",
    changes: [
      "Добавлен новый фирменный значок приложения с ретро-паровозом, подготовленный для адаптивной маски Android."
    ]
  },
  {
    version: "0.6.3",
    date: "01.09.2026",
    changes: [
      "Исправлено наложение интерфейса на верхнюю системную строку Android.",
      "Обновление APK в мобильном приложении переведено на стандартную проверку версии без лишней отдельной кнопки скачивания."
    ]
  },
  {
    version: "0.6.2",
    date: "01.09.2026",
    changes: [
      "Убрана дублирующая нативная заставка Android; при запуске остаётся одна фирменная анимированная заставка CONDUCTOR.KZ."
    ]
  },
  {
    version: "0.6.1",
    date: "01.09.2026",
    changes: [
      "Исправлено отображение заставки на широких экранах.",
      "Добавлена постоянная возможность загрузить актуальный APK."
    ]
  },
  {
    version: "0.6.0",
    date: "01.09.2026",
    changes: [
      "Добавлена анимированная ретро-заставка CONDUCTOR.KZ: движение поезда, цветной дым, пульсация фары и световой блик по названию."
    ]
  },
  {
    version: "0.5.1",
    date: "01.09.2026",
    changes: [
      "Обновлена винтажная заставка приложения.",
      "Добавлен безопасный отступ под строку состояния Android."
    ]
  },
  {
    version: "0.5.0",
    date: "01.09.2026",
    changes: [
      "Добавлена работа с заявками покупателей: новые обращения с сайта, звонок по номеру, статусы обработки и комментарии сотрудников."
    ]
  },
  {
    version: "0.4.3",
    date: "01.09.2026",
    changes: [
      "Исправлено отображение складской заставки в PWA и Android."
    ]
  },
  {
    version: "0.4.2",
    date: "01.09.2026",
    changes: [
      "Исправлен встроенный механизм обновления: приложение определяет установленную версию и после загрузки APK открывает системную установку Android."
    ]
  },
  {
    version: "0.4.1",
    date: "01.09.2026",
    changes: [
      "Исправлена полноэкранная заставка: восстановлено изображение ретро-локомотива вместо чёрного экрана."
    ]
  },
  {
    version: "0.4.0",
    date: "01.09.2026",
    changes: [
      "Добавлена шестисекундная полноэкранная заставка склада с ретро-локомотивом и плавным открытием приложения."
    ]
  },
  {
    version: "0.3.0",
    date: "01.09.2026",
    changes: [
      "Добавлен первый фирменный значок с ретро-паровозом и цветным дымом.",
      "Появилась полноэкранная заставка с локомотивом, въезжающим на склад."
    ]
  },
  {
    version: "0.2.0",
    date: "01.09.2026",
    changes: [
      "Добавлена встроенная проверка обновлений и загрузка новой версии APK.",
      "Создан постоянный GitHub Release для публикации актуальной сборки."
    ]
  },
  {
    version: "0.1.0",
    date: "31.08.2026",
    changes: [
      "Первая Android-сборка CONDUCTOR Склад.",
      "Создана оболочка Capacitor для существующего мобильного склада conductor.kz с использованием той же Firebase Authentication и Firestore."
    ]
  }
];

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function injectStyles() {
  if (document.querySelector("#version-history-styles")) return;
  const style = document.createElement("style");
  style.id = "version-history-styles";
  style.textContent = `
    .version-history-btn{margin:12px 0;display:flex!important;align-items:center;justify-content:space-between;gap:14px;text-align:left}
    .version-history-btn-copy{min-width:0}.version-history-btn-copy b,.version-history-btn-copy small{display:block}.version-history-btn-copy b{font-size:13px}.version-history-btn-copy small{margin-top:3px;color:var(--muted);font-size:10px;font-weight:700}.version-history-chevron{font-size:24px;color:var(--muted)}
    .version-history-dialog{width:min(calc(100% - 20px),620px);max-height:90dvh}
    .version-history-intro{margin:-2px 0 2px;color:var(--muted);font-size:11px;line-height:1.45}
    .version-history-list{display:grid;gap:10px}
    .version-history-card{padding:13px 14px;border:1px solid var(--line);border-radius:16px;background:#090e16}
    .version-history-card.latest{border-color:rgba(56,166,255,.42);background:linear-gradient(145deg,rgba(56,166,255,.1),transparent 58%),#090e16}
    .version-history-meta{display:flex;align-items:center;justify-content:space-between;gap:12px}.version-history-version{display:flex;align-items:center;gap:8px;font-size:14px;font-weight:950}.version-history-date{color:var(--muted);font-size:10px;white-space:nowrap}
    .version-history-badge{padding:4px 7px;border-radius:999px;background:rgba(56,166,255,.12);border:1px solid rgba(56,166,255,.28);color:#9bd1ff;font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
    .version-history-card ul{margin:9px 0 0;padding-left:18px;color:#d7dde6;font-size:11px;line-height:1.48}.version-history-card li+li{margin-top:5px}
    @media(max-width:430px){.version-history-card{padding:12px}.version-history-card ul{font-size:10.5px}.version-history-dialog .stock-dialog-card{padding:15px}}
  `;
  document.head.appendChild(style);
}

function renderHistory() {
  const root = document.querySelector("#version-history-list");
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

function ensureUi() {
  const settings = document.querySelector("#view-settings");
  if (!settings) return false;
  injectStyles();

  let button = document.querySelector("#version-history-button");
  if (!button) {
    button = document.createElement("button");
    button.id = "version-history-button";
    button.type = "button";
    button.className = "btn full version-history-btn";
    button.innerHTML = `<span class="version-history-btn-copy"><b>История изменений</b><small>Ключевые изменения с первой Android-сборки</small></span><span class="version-history-chevron" aria-hidden="true">›</span>`;
    const settingsPanel = settings.querySelector(".settings-panel");
    settingsPanel?.insertAdjacentElement("afterend", button);
  }

  let dialog = document.querySelector("#version-history-dialog");
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
        <div class="version-history-intro">Только заметные изменения приложения — без служебных коммитов и внутренних номеров кэша.</div>
        <div id="version-history-list" class="version-history-list"></div>
      </div>`;
    document.body.appendChild(dialog);
    renderHistory();
    dialog.querySelector("#version-history-close")?.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  }

  if (!button.dataset.historyBound) {
    button.dataset.historyBound = "1";
    button.addEventListener("click", () => {
      renderHistory();
      dialog.showModal();
    });
  }
  return true;
}

function start() {
  if (ensureUi()) return;
  const observer = new MutationObserver(() => {
    if (ensureUi()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
