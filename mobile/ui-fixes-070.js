function injectReleaseUiFixes() {
  if (document.getElementById("release-070-ui-fixes")) return;
  const style = document.createElement("style");
  style.id = "release-070-ui-fixes";
  style.textContent = `
    /* Склад: не растягиваем цветовую индикацию на всю ширину карточки.
       Каждый цвет снова обозначается отдельным компактным кружком. */
    #view-stock .stock-color-summary {
      display:flex!important;
      grid-template-columns:none!important;
      flex-wrap:wrap!important;
      align-items:center!important;
      gap:7px 14px!important;
      margin:9px 0 10px!important;
    }
    #view-stock .stock-color-summary > span {
      display:inline-flex!important;
      width:auto!important;
      min-width:0!important;
      max-width:100%!important;
      justify-content:flex-start!important;
      align-items:center!important;
      gap:4px!important;
      padding:2px 0!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      font-size:10px!important;
      line-height:1.2!important;
    }
    #view-stock .stock-color-summary > span b {
      margin-left:1px!important;
      font-size:10.5px!important;
    }
    #view-stock .stock-color-summary .color-dot {
      display:inline-block!important;
      flex:0 0 12px!important;
      width:12px!important;
      min-width:12px!important;
      max-width:12px!important;
      height:12px!important;
      min-height:12px!important;
      max-height:12px!important;
      padding:0!important;
      margin:0 3px 0 0!important;
      border-radius:50%!important;
      border:1px solid rgba(255,255,255,.42)!important;
      box-shadow:0 0 0 2px rgba(255,255,255,.05)!important;
    }
    #view-stock .stock-color-summary > span.warning {
      color:#ffd57f!important;
    }

    /* Настройки: меньше шрифт, отступы и высота элементов. */
    #view-settings .section-head {
      margin:8px 2px 7px!important;
    }
    #view-settings .section-head h1 {
      font-size:20px!important;
    }
    #view-settings .settings-panel {
      padding:8px 12px!important;
      border-radius:15px!important;
    }
    #view-settings .settings-row {
      gap:10px!important;
      padding:7px 0!important;
      font-size:10px!important;
      line-height:1.25!important;
    }
    #view-settings .settings-row b {
      font-size:10px!important;
      font-weight:850!important;
    }
    #view-settings .site-settings-btn,
    #view-settings #reset-password,
    #view-settings .version-history-btn {
      min-height:36px!important;
      margin:7px 0!important;
      padding:8px 10px!important;
      border-radius:11px!important;
      font-size:10px!important;
    }
    #view-settings .panel:not(.settings-panel) {
      padding:10px 12px!important;
      border-radius:15px!important;
      margin:7px 0!important;
    }
    #view-settings .panel:not(.settings-panel) h3 {
      margin:0 0 5px!important;
      font-size:12px!important;
    }
    #view-settings .panel:not(.settings-panel) p {
      margin:0!important;
      font-size:9.5px!important;
      line-height:1.35!important;
    }
    #view-settings .version-history-btn-copy b {
      font-size:11px!important;
    }
    #view-settings .version-history-btn-copy small {
      margin-top:2px!important;
      font-size:8.5px!important;
      line-height:1.2!important;
    }
    #view-settings .version-history-chevron {
      font-size:18px!important;
    }

    /* История изменений тоже должна быть компактной. */
    .version-history-dialog .stock-dialog-card {
      gap:8px!important;
      padding:12px!important;
    }
    .version-history-dialog .dialog-head h2 {
      margin-top:3px!important;
      font-size:17px!important;
    }
    .version-history-intro {
      font-size:9px!important;
      line-height:1.3!important;
    }
    .version-history-list {
      gap:6px!important;
    }
    .version-history-card {
      padding:8px 9px!important;
      border-radius:12px!important;
    }
    .version-history-version {
      gap:5px!important;
      font-size:11.5px!important;
    }
    .version-history-date {
      font-size:8.5px!important;
    }
    .version-history-badge {
      padding:2px 5px!important;
      font-size:7px!important;
    }
    .version-history-card ul {
      margin:6px 0 0!important;
      padding-left:15px!important;
      font-size:9.2px!important;
      line-height:1.35!important;
    }
    .version-history-card li + li {
      margin-top:3px!important;
    }
  `;
  document.head.appendChild(style);
}

function normalizeReleaseUi() {
  document.querySelectorAll("#view-stock [data-open-model]").forEach((button) => {
    if (button.textContent.trim() !== "Цена и остатки") button.textContent = "Цена и остатки";
  });

  const modelEyebrow = document.querySelector("#model-dialog .dialog-head .eyebrow");
  if (modelEyebrow && modelEyebrow.textContent.trim() !== "Цена и остатки") {
    modelEyebrow.textContent = "Цена и остатки";
  }

  const historyTitle = document.querySelector("#version-history-button .version-history-btn-copy b");
  if (historyTitle && historyTitle.textContent.trim() !== "История изменений") {
    historyTitle.textContent = "История изменений";
  }
  const historyHint = document.querySelector("#version-history-button .version-history-btn-copy small");
  if (historyHint && historyHint.textContent.trim() !== "Что менялось в приложении") {
    historyHint.textContent = "Что менялось в приложении";
  }
  const dialogTitle = document.querySelector("#version-history-dialog .dialog-head h2");
  if (dialogTitle && dialogTitle.textContent.trim() !== "История изменений") {
    dialogTitle.textContent = "История изменений";
  }
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
