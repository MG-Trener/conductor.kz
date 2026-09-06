function injectReleaseStyles() {
  if (document.getElementById("release-20260906-styles")) return;
  const style = document.createElement("style");
  style.id = "release-20260906-styles";
  style.textContent = `
    /* Операции: продажа создаётся из отдельного раздела, дублирующая кнопка не нужна. */
    #view-sales .sticky-head > [data-nav="sale"]{display:none!important}

    /* Верх склада — одна компактная строка: модели, стоимость, журнал. */
    #view-stock .stock-summary{
      display:grid!important;
      grid-template-columns:58px minmax(0,1fr) auto!important;
      align-items:stretch!important;
      gap:6px!important;
      padding:7px 8px!important;
      margin:2px 0 8px!important;
      border-radius:14px!important;
    }
    #view-stock .stock-summary>div{
      min-width:0!important;
      padding:2px 4px!important;
      display:flex!important;
      flex-direction:column!important;
      justify-content:center!important;
    }
    #view-stock .stock-summary span{font-size:7.5px!important;line-height:1.15!important;letter-spacing:.05em!important}
    #view-stock .stock-summary b{margin-top:2px!important;font-size:13px!important;line-height:1.1!important}
    .stock-journal-btn{
      min-width:72px!important;
      min-height:42px!important;
      padding:5px 8px!important;
      border:1px solid rgba(56,166,255,.28)!important;
      border-radius:10px!important;
      background:rgba(56,166,255,.07)!important;
      color:#a9d8ff!important;
      font-size:9px!important;
      font-weight:900!important;
      cursor:pointer!important;
    }

    /* Разновидности на складе: строго одна под другой, цвет остаётся кружком. */
    #view-stock .stock-color-summary{
      display:grid!important;
      grid-template-columns:1fr!important;
      align-items:stretch!important;
      gap:1px!important;
      margin:7px 0 8px!important;
    }
    #view-stock .stock-color-summary>span{
      display:flex!important;
      width:100%!important;
      min-width:0!important;
      align-items:center!important;
      justify-content:flex-start!important;
      gap:5px!important;
      padding:3px 2px!important;
      border:0!important;
      border-radius:0!important;
      background:transparent!important;
      font-size:9.5px!important;
      line-height:1.15!important;
    }
    #view-stock .stock-color-summary>span b{
      margin-left:auto!important;
      font-size:10px!important;
      color:#fff!important;
    }
    #view-stock .stock-color-summary .color-dot{
      flex:0 0 10px!important;
      width:10px!important;
      min-width:10px!important;
      max-width:10px!important;
      height:10px!important;
      min-height:10px!important;
      max-height:10px!important;
      margin:0 2px 0 0!important;
      border-radius:50%!important;
    }
    #view-stock .stock-model-card{padding:10px 11px!important}
    #view-stock .stock-name b{font-size:13px!important}
    #view-stock .stock-name small{margin-top:2px!important;font-size:9px!important}
    #view-stock .model-balance-btn{min-height:34px!important;margin-top:3px!important;padding:7px 9px!important;font-size:9px!important;border-radius:10px!important}

    /* Журнал — отдельное компактное окно по плотности как история версий. */
    .movement-dialog{width:min(calc(100% - 18px),560px)!important;max-height:88dvh!important}
    .movement-dialog .stock-dialog-card{gap:7px!important;padding:11px!important}
    .movement-dialog .dialog-head h2{margin-top:2px!important;font-size:16px!important}
    .movement-dialog-intro{margin:-1px 1px 1px;color:var(--muted);font-size:8.5px;line-height:1.25}
    .movement-dialog #movement-list{display:grid!important;gap:5px!important}
    .movement-dialog .movement-card{padding:7px 8px!important;border-radius:11px!important}
    .movement-dialog .movement-top{gap:7px!important}
    .movement-dialog .movement-top b{font-size:10px!important;line-height:1.2!important}
    .movement-dialog .movement-top small{margin-top:2px!important;font-size:8px!important;line-height:1.2!important}
    .movement-dialog .movement-top strong{font-size:14px!important}
    .movement-dialog .movement-meta{margin-top:4px!important;font-size:7.8px!important}
    .movement-dialog .movement-reason{margin-top:4px!important;padding-top:4px!important;font-size:8px!important;line-height:1.25!important}

    @media(max-width:390px){
      #view-stock .stock-summary{grid-template-columns:52px minmax(0,1fr) 68px!important;padding:6px!important;gap:4px!important}
      #view-stock .stock-summary b{font-size:12px!important}
      .stock-journal-btn{min-width:68px!important;padding:4px 5px!important;font-size:8.5px!important}
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
    if (next && next !== node.textContent.trim()) node.textContent = next;
  });

  document.querySelectorAll("#view-sale .sale-model-title > small:not(.sale-tier-hint)").forEach((node) => {
    const next = stripColorCount(node.textContent);
    if (next && next !== node.textContent.trim()) node.textContent = next;
  });

  document.querySelector("#view-sales .sticky-head > [data-nav=\"sale\"]")?.remove();
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

  const body = dialog.querySelector("#movement-dialog-body");
  if (body && movementList.parentElement !== body) body.appendChild(movementList);

  const stockView = document.getElementById("view-stock");
  const oldHead = [...(stockView?.querySelectorAll(":scope > .section-head") || [])]
    .find((head) => head.textContent.includes("Журнал движения"));
  oldHead?.remove();

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

function applyReleaseFixes() {
  injectReleaseStyles();
  normalizeProductLabels();
  ensureMovementDialog();
}

function startReleaseFixes() {
  applyReleaseFixes();
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      applyReleaseFixes();
    });
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startReleaseFixes, { once: true });
} else {
  startReleaseFixes();
}
