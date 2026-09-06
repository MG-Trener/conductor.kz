function injectReleaseUiFixes() {
  if (document.getElementById("release-070-ui-fixes")) return;
  const style = document.createElement("style");
  style.id = "release-070-ui-fixes";
  style.textContent = `
    #view-sales .sticky-head > [data-nav="sale"] { display:none!important; }

    #view-stock .stock-summary {
      display:grid!important;
      grid-template-columns:64px minmax(0,1fr) 76px!important;
      align-items:stretch!important;
      gap:5px!important;
      padding:6px 7px!important;
      margin:2px 0 8px!important;
      border-radius:13px!important;
    }
    #view-stock .stock-summary > div {
      min-width:0!important;
      padding:2px 3px!important;
      display:flex!important;
      flex-direction:column!important;
      justify-content:center!important;
    }
    #view-stock .stock-summary span { font-size:7px!important; line-height:1.12!important; letter-spacing:.045em!important; }
    #view-stock .stock-summary b { margin-top:2px!important; font-size:12px!important; line-height:1.1!important; }
    .stock-journal-btn {
      min-width:0!important;
      min-height:38px!important;
      padding:4px 6px!important;
      border:1px solid rgba(56,166,255,.28)!important;
      border-radius:9px!important;
      background:rgba(56,166,255,.07)!important;
      color:#a9d8ff!important;
      font-size:8.5px!important;
      font-weight:900!important;
      cursor:pointer!important;
    }

    #view-stock .stock-color-summary {
      display:grid!important;
      grid-template-columns:1fr!important;
      flex-wrap:nowrap!important;
      align-items:stretch!important;
      gap:1px!important;
      margin:6px 0 7px!important;
    }
    #view-stock .stock-color-summary > span {
      display:flex!important;
      width:100%!important;
      min-width:0!important;
      max-width:none!important;
      justify-content:flex-start!important;
      align-items:center!important;
      gap:5px!important;
      padding:3px 1px!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      font-size:9.5px!important;
      line-height:1.15!important;
    }
    #view-stock .stock-color-summary > span b { margin-left:auto!important; font-size:10px!important; color:#fff!important; }
    #view-stock .stock-color-summary .color-dot {
      display:inline-block!important;
      flex:0 0 10px!important;
      width:10px!important;
      min-width:10px!important;
      max-width:10px!important;
      height:10px!important;
      min-height:10px!important;
      max-height:10px!important;
      padding:0!important;
      margin:0 2px 0 0!important;
      border-radius:50%!important;
      border:1px solid rgba(255,255,255,.42)!important;
      box-shadow:0 0 0 1px rgba(255,255,255,.04)!important;
    }
    #view-stock .stock-color-summary > span.warning { color:#ffd57f!important; }
    #view-stock .stock-model-card { padding:9px 10px!important; }
    #view-stock .stock-name b { font-size:13px!important; }
    #view-stock .stock-name small { margin-top:2px!important; font-size:9px!important; }
    #view-stock .model-balance-btn { min-height:33px!important; margin-top:2px!important; padding:6px 8px!important; border-radius:9px!important; font-size:9px!important; }

    .movement-dialog { width:min(calc(100% - 18px),560px)!important; max-height:88dvh!important; }
    .movement-dialog .stock-dialog-card { gap:7px!important; padding:11px!important; }
    .movement-dialog .dialog-head h2 { margin-top:2px!important; font-size:16px!important; }
    .movement-dialog-intro { margin:-1px 1px 1px!important; color:var(--muted)!important; font-size:8.5px!important; line-height:1.25!important; }
    .movement-dialog #movement-list { display:grid!important; gap:5px!important; }
    .movement-dialog .movement-card { padding:7px 8px!important; border-radius:11px!important; }
    .movement-dialog .movement-top { gap:7px!important; }
    .movement-dialog .movement-top b { font-size:10px!important; line-height:1.2!important; }
    .movement-dialog .movement-top small { margin-top:2px!important; font-size:8px!important; line-height:1.2!important; }
    .movement-dialog .movement-top strong { font-size:14px!important; }
    .movement-dialog .movement-meta { margin-top:4px!important; font-size:7.8px!important; }
    .movement-dialog .movement-reason { margin-top:4px!important; padding-top:4px!important; font-size:8px!important; line-height:1.25!important; }

    #view-settings .section-head { margin:8px 2px 7px!important; }
    #view-settings .section-head h1 { font-size:20px!important; }
    #view-settings .settings-panel { padding:8px 12px!important; border-radius:15px!important; }
    #view-settings .settings-row { gap:10px!important; padding:7px 0!important; font-size:10px!important; line-height:1.25!important; }
    #view-settings .settings-row b { font-size:10px!important; font-weight:850!important; }
    #view-settings .site-settings-btn,
    #view-settings #reset-password,
    #view-settings .version-history-btn { min-height:36px!important; margin:7px 0!important; padding:8px 10px!important; border-radius:11px!important; font-size:10px!important; }
    #view-settings .panel:not(.settings-panel) { padding:10px 12px!important; border-radius:15px!important; margin:7px 0!important; }
    #view-settings .panel:not(.settings-panel) h3 { margin:0 0 5px!important; font-size:12px!important; }
    #view-settings .panel:not(.settings-panel) p { margin:0!important; font-size:9.5px!important; line-height:1.35!important; }
    #view-settings .version-history-btn-copy b { font-size:11px!important; }
    #view-settings .version-history-btn-copy small { margin-top:2px!important; font-size:8.5px!important; line-height:1.2!important; }
    #view-settings .version-history-chevron { font-size:18px!important; }
    .version-history-dialog .stock-dialog-card { gap:8px!important; padding:12px!important; }
    .version-history-dialog .dialog-head h2 { margin-top:3px!important; font-size:17px!important; }
    .version-history-intro { font-size:9px!important; line-height:1.3!important; }
    .version-history-list { gap:6px!important; }
    .version-history-card { padding:8px 9px!important; border-radius:12px!important; }
    .version-history-version { gap:5px!important; font-size:11.5px!important; }
    .version-history-date { font-size:8.5px!important; }
    .version-history-badge { padding:2px 5px!important; font-size:7px!important; }
    .version-history-card ul { margin:6px 0 0!important; padding-left:15px!important; font-size:9.2px!important; line-height:1.35!important; }
    .version-history-card li + li { margin-top:3px!important; }

    @media(max-width:390px) {
      #view-stock .stock-summary { grid-template-columns:56px minmax(0,1fr) 69px!important; padding:5px!important; gap:4px!important; }
      #view-stock .stock-summary b { font-size:11px!important; }
      .stock-journal-btn { min-height:36px!important; padding:3px 4px!important; font-size:8px!important; }
    }
  `;
  document.head.appendChild(style);
}

function stripColorCount(text = "") {
  return String(text)
    .replace(/^\s*\d+\s+цвет(?:ов|а)?\s*[·•\-]?\s*/i, "")
    .replace(/^\s*[·•\-]\s*/, "")
    .trim();
}

function normalizeProductLabels() {
  document.querySelectorAll("#view-stock .stock-name small").forEach((node) => {
    const next = stripColorCount(node.textContent);
    if (next !== node.textContent.trim()) node.textContent = next;
  });
  document.querySelectorAll("#view-sale .sale-model-title > small:not(.sale-tier-hint)").forEach((node) => {
    const next = stripColorCount(node.textContent);
    if (next !== node.textContent.trim()) node.textContent = next;
  });
}

function removeOperationsSaleButton() {
  document.querySelectorAll('#view-sales .sticky-head [data-nav="sale"]').forEach((button) => button.remove());
}

function ensureMovementDialog() {
  const movementList = document.getElementById("movement-list");
  if (!movementList) return;

  let dialog = document.getElementById("movement-dialog");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "movement-dialog";
    dialog.className = "stock-dialog movement-dialog";
    dialog.innerHTML = `
      <div class="stock-dialog-card">
        <div class="dialog-head">
          <div><div class="eyebrow">Склад</div><h2>Журнал движения</h2></div>
          <button id="movement-dialog-close" class="dialog-close" type="button" aria-label="Закрыть">×</button>
        </div>
        <p class="movement-dialog-intro">Последние 100 операций по остаткам</p>
        <div id="movement-dialog-body"></div>
      </div>
    `;
    document.body.appendChild(dialog);
    dialog.querySelector("#movement-dialog-close")?.addEventListener("click", () => dialog.close());
  }

  let body = dialog.querySelector("#movement-dialog-body");
  if (!body) {
    body = document.createElement("div");
    body.id = "movement-dialog-body";
    dialog.querySelector(".stock-dialog-card")?.appendChild(body);
  }
  if (movementList.parentElement !== body) body.appendChild(movementList);

  const stockView = document.getElementById("view-stock");
  stockView?.querySelectorAll(":scope > .section-head").forEach((head) => {
    if (head.textContent.includes("Журнал движения")) head.remove();
  });

  const summary = stockView?.querySelector(".stock-summary");
  if (summary && !document.getElementById("open-stock-movements")) {
    const button = document.createElement("button");
    button.id = "open-stock-movements";
    button.className = "stock-journal-btn";
    button.type = "button";
    button.textContent = "Журнал";
    button.addEventListener("click", () => dialog.showModal());
    summary.appendChild(button);
  }
}

const RELEASE_HISTORY = [
  {
    version: "1.0.2",
    date: "06.09.2026",
    changes: [
      "Исправлено применение обновлений Android: при смене версии очищается устаревший WebView-кэш и перезагружается встроенный интерфейс из нового APK.",
      "В «Операциях» убрана дублирующая кнопка добавления продажи.",
      "Склад уплотнён: разновидности идут друг под другом, цвет сохраняется кружком, счётчик цветов убран.",
      "Журнал движения остатков перенесён в отдельную кнопку в верхнем блоке и сделан компактным.",
      "Исправлена блокирующая продажу ошибка DM60: при рассинхронизации подтверждения используется основная логика продажи вместо ложного сообщения о нулевом количестве."
    ]
  },
  {
    version: "1.0.1",
    date: "06.09.2026",
    changes: [
      "Подготовлены изменения компактного склада и переноса журнала движения.",
      "Добавлена защита от рассинхронизации выбранного количества при продаже.",
      "Эта сборка выявила проблему кэширования WebView после обновления APK; окончательно исправлено в 1.0.2."
    ]
  }
];

function escapeVersionHtml(value = "") {
  return String(value).replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function ensureLatestVersionHistory() {
  const root = document.getElementById("version-history-list");
  if (!root) return;

  root.querySelectorAll(".version-history-card").forEach((card) => card.classList.remove("latest"));
  for (const item of [...RELEASE_HISTORY].reverse()) {
    if (root.querySelector(`[data-release-version="${item.version}"]`)) continue;
    const card = document.createElement("article");
    card.className = "version-history-card";
    card.dataset.releaseVersion = item.version;
    card.innerHTML = `
      <div class="version-history-meta">
        <div class="version-history-version">v${escapeVersionHtml(item.version)}</div>
        <span class="version-history-date">${escapeVersionHtml(item.date)}</span>
      </div>
      <ul>${item.changes.map((change) => `<li>${escapeVersionHtml(change)}</li>`).join("")}</ul>
    `;
    root.prepend(card);
  }

  const latest = root.querySelector('[data-release-version="1.0.2"]');
  if (latest) {
    latest.classList.add("latest");
    const version = latest.querySelector(".version-history-version");
    if (version && !version.querySelector(".version-history-badge")) {
      version.insertAdjacentHTML("beforeend", '<span class="version-history-badge">Последняя</span>');
    }
  }
}

function normalizeReleaseUi() {
  document.querySelectorAll("#view-stock [data-open-model]").forEach((button) => {
    if (button.textContent.trim() !== "Цена и остатки") button.textContent = "Цена и остатки";
  });
  const modelEyebrow = document.querySelector("#model-dialog .dialog-head .eyebrow");
  if (modelEyebrow && modelEyebrow.textContent.trim() !== "Цена и остатки") modelEyebrow.textContent = "Цена и остатки";

  const historyTitle = document.querySelector("#version-history-button .version-history-btn-copy b");
  if (historyTitle && historyTitle.textContent.trim() !== "История изменений") historyTitle.textContent = "История изменений";
  const historyHint = document.querySelector("#version-history-button .version-history-btn-copy small");
  if (historyHint && historyHint.textContent.trim() !== "Что менялось в приложении") historyHint.textContent = "Что менялось в приложении";
  const dialogTitle = document.querySelector("#version-history-dialog .dialog-head h2");
  if (dialogTitle && dialogTitle.textContent.trim() !== "История изменений") dialogTitle.textContent = "История изменений";

  normalizeProductLabels();
  removeOperationsSaleButton();
  ensureMovementDialog();
  ensureLatestVersionHistory();
}

function startReleaseUiFixes() {
  injectReleaseUiFixes();
  normalizeReleaseUi();
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      normalizeReleaseUi();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startReleaseUiFixes, { once: true });
} else {
  startReleaseUiFixes();
}
