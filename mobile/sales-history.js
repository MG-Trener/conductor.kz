const KZT = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 });
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const START_YEAR = 2026;
let operations = [];
let selectedYear = Math.max(START_YEAR, new Date().getFullYear());
let selectedMonth = new Date().getMonth();

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function dateOf(item) {
  if (item.createdAt?.toDate) return item.createdAt.toDate();
  if (item.createdAtClient) return new Date(item.createdAtClient);
  return new Date(0);
}

function cancelledDateOf(item) {
  if (item.cancelledAt?.toDate) return item.cancelledAt.toDate();
  return null;
}

function formatDate(date) {
  if (!date || Number.isNaN(date.getTime()) || !date.getTime()) return "—";
  return date.toLocaleString("ru-KZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function createdByName(item) {
  return item.createdByName || "Сотрудник";
}

function saleItemLabel(item) {
  if (item.colorName) return `${escapeHtml(item.productId || "Товар")} · ${escapeHtml(item.colorName)}`;
  return escapeHtml(item.name || item.productId || "Товар");
}

function isCashOperation(item) {
  return item.operationType === "cash_deposit" || item.operationType === "cash_sawmill";
}

function injectStyles() {
  if (document.querySelector("#sales-history-styles")) return;
  const style = document.createElement("style");
  style.id = "sales-history-styles";
  style.textContent = `
    .sales-period-filter{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:0 0 10px;padding:12px}
    .sales-period-filter label{display:flex;flex-direction:column;gap:6px;margin:0;color:var(--muted);font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em}
    .sales-period-filter select{width:100%;border:1px solid var(--line);border-radius:12px;background:#090e16;color:#fff;padding:10px 11px;font-weight:900;outline:none}
    #sales-period-summary{margin-bottom:10px}
    .sales-period-caption{margin:1px 0 10px;color:var(--muted);font-size:11px}
    .operation-cancel-info{margin-top:8px;padding-top:8px;border-top:1px solid var(--line);color:#ffb0bb;font-size:10px}
    .operation-cash-card .order-items{margin-bottom:2px}
    .operation-cash-card .order-total.positive{color:var(--green)}
    .operation-cash-card .order-total.negative{color:#ff9baa}
    .operation-cash-tag{display:inline-flex;align-items:center;border-radius:999px;padding:5px 9px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.06em;border:1px solid var(--line)}
    .operation-cash-tag.deposit{color:#8cf4a0;background:rgba(92,219,117,.08)}
    .operation-cash-tag.sawmill{color:#ffabb7;background:rgba(255,89,111,.08)}
    @media(max-width:430px){.sales-period-filter{gap:8px;padding:10px}.sales-period-filter select{padding:9px 8px}}
  `;
  document.head.appendChild(style);
}

function renameOperationsUi() {
  const view = document.querySelector("#view-sales");
  const title = view?.querySelector(".sticky-head h1");
  if (title) title.textContent = "Операции";
  document.querySelectorAll('[data-nav="sales"] small').forEach((node) => { node.textContent = "Операции"; });
  const subtitle = document.getElementById("page-subtitle");
  if (document.querySelector('#view-sales.active') && subtitle) subtitle.textContent = "Продажи и движение денег";
}

function injectUi() {
  const view = document.querySelector("#view-sales");
  const originalSummary = document.querySelector("#sales-summary");
  const originalList = document.querySelector("#sales-list");
  if (!view || !originalSummary || !originalList) return false;

  injectStyles();
  renameOperationsUi();
  originalSummary.style.display = "none";
  originalList.style.display = "none";

  if (!document.querySelector("#sales-period-filter")) {
    const filter = document.createElement("div");
    filter.id = "sales-period-filter";
    filter.className = "panel sales-period-filter";
    filter.innerHTML = `
      <label>Год<select id="sales-filter-year" aria-label="Год операций"></select></label>
      <label>Месяц<select id="sales-filter-month" aria-label="Месяц операций"></select></label>
    `;
    originalSummary.insertAdjacentElement("beforebegin", filter);

    const summary = document.createElement("div");
    summary.id = "sales-period-summary";
    summary.className = "panel mini-summary";
    originalSummary.insertAdjacentElement("afterend", summary);

    const caption = document.createElement("div");
    caption.id = "sales-period-caption";
    caption.className = "sales-period-caption";
    summary.insertAdjacentElement("afterend", caption);

    const list = document.createElement("div");
    list.id = "sales-period-list";
    list.className = "list";
    caption.insertAdjacentElement("afterend", list);

    filter.querySelector("#sales-filter-year")?.addEventListener("change", (event) => {
      selectedYear = Number(event.target.value) || selectedYear;
      render();
    });
    filter.querySelector("#sales-filter-month")?.addEventListener("change", (event) => {
      selectedMonth = Number(event.target.value);
      render();
    });
  }

  document.addEventListener("click", (event) => {
    if (!event.target?.closest?.('[data-nav="sales"]')) return;
    setTimeout(renameOperationsUi, 0);
  });
  return true;
}

function renderFilters() {
  const yearSelect = document.querySelector("#sales-filter-year");
  const monthSelect = document.querySelector("#sales-filter-month");
  if (!yearSelect || !monthSelect) return;

  const currentYear = Math.max(START_YEAR, new Date().getFullYear());
  if (selectedYear < START_YEAR || selectedYear > currentYear) selectedYear = currentYear;
  yearSelect.innerHTML = Array.from({ length: currentYear - START_YEAR + 1 }, (_, index) => currentYear - index)
    .map((year) => `<option value="${year}"${year === selectedYear ? " selected" : ""}>${year}</option>`)
    .join("");
  monthSelect.innerHTML = MONTHS.map((month, index) => `<option value="${index}"${index === selectedMonth ? " selected" : ""}>${month}</option>`).join("");
}

function cashOperationCard(item) {
  const deposit = item.operationType === "cash_deposit";
  const amount = Math.abs(Number(item.cashDelta ?? item.total ?? item.amount ?? 0));
  const comment = item.note || item.comment || "";
  return `<article class="order-card operation-cash-card">
    <div class="order-top">
      <div>
        <div class="order-customer">${deposit ? "Пополнение" : "Пилорама"}</div>
        <div class="order-phone">Внёс: ${escapeHtml(createdByName(item))}</div>
      </div>
      <div class="order-total ${deposit ? "positive" : "negative"}">${deposit ? "+" : "−"}${KZT.format(amount)}</div>
    </div>
    <div class="order-items">${comment ? escapeHtml(comment) : "Без комментария"}</div>
    <div class="order-bottom">
      <span class="operation-cash-tag ${deposit ? "deposit" : "sawmill"}">${deposit ? "Пополнение" : "Пилорама"}</span>
      <span class="order-meta">${formatDate(dateOf(item))}</span>
    </div>
  </article>`;
}

function saleCard(sale) {
  const items = (sale.items || []).map((item) => `${saleItemLabel(item)} × ${Number(item.qty || 0)}`).join(" · ");
  const cancelled = sale.status === "cancelled";
  const note = sale.note || sale.notes || "";
  const cancelName = sale.cancelledByName || "Сотрудник";
  const cancelDate = cancelledDateOf(sale);
  return `<article class="order-card">
    <div class="order-top">
      <div><div class="order-customer">Продажа</div><div class="order-phone">Внёс: ${escapeHtml(createdByName(sale))}</div></div>
      <div class="order-total">${KZT.format(Number(sale.total || 0))}</div>
    </div>
    <div class="order-items">${items || "Без позиций"}${note ? `<br><span class="muted">${escapeHtml(note)}</span>` : ""}</div>
    <div class="order-bottom"><span class="status ${cancelled ? "cancelled" : "done"}">${cancelled ? "Отменена" : "Продажа"}</span><span class="order-meta">${formatDate(dateOf(sale))}</span></div>
    ${cancelled ? `<div class="operation-cancel-info">Отменил: ${escapeHtml(cancelName)}${cancelDate ? ` · ${formatDate(cancelDate)}` : ""}</div>` : `<div class="order-actions"><button type="button" data-history-cancel-sale="${escapeHtml(sale.id)}">Отменить и вернуть товар</button></div>`}
  </article>`;
}

function operationCard(item) {
  return isCashOperation(item) ? cashOperationCard(item) : saleCard(item);
}

function render() {
  if (!injectUi()) return;
  renderFilters();
  renameOperationsUi();

  const periodOperations = operations.filter((item) => {
    const date = dateOf(item);
    return date.getFullYear() === selectedYear && date.getMonth() === selectedMonth;
  });
  const activeSales = periodOperations.filter((item) => !isCashOperation(item) && item.status !== "cancelled");
  const salesTotal = activeSales.reduce((sum, item) => sum + Number(item.total || 0), 0);

  const summary = document.querySelector("#sales-period-summary");
  const caption = document.querySelector("#sales-period-caption");
  const list = document.querySelector("#sales-period-list");
  if (!summary || !caption || !list) return;

  summary.innerHTML = `<div class="summary-line"><span>Операций за период</span><b>${periodOperations.length}</b></div><div class="summary-line"><span>Продаж</span><b>${activeSales.length}</b></div><div class="summary-line"><span>Сумма продаж</span><b>${KZT.format(salesTotal)}</b></div>`;
  caption.textContent = `${MONTHS[selectedMonth]} ${selectedYear}`;
  list.innerHTML = periodOperations.length ? periodOperations.map(operationCard).join("") : `<div class="empty">За выбранный месяц операций нет.</div>`;

  list.querySelectorAll("[data-history-cancel-sale]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Отменить продажу и вернуть весь товар на склад?")) return;
      button.disabled = true;
      try {
        await cancelSale(button.dataset.historyCancelSale);
      } catch (error) {
        alert(error.message);
        button.disabled = false;
      }
    });
  });
}

async function waitForCoreApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (window.CONDUCTOR_APP_API) return window.CONDUCTOR_APP_API;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  throw new Error("Данные приложения ещё не готовы.");
}

async function cancelSale(saleId) {
  const api = await waitForCoreApi();
  await api.cancelSale(saleId);
  api.toast("Продажа отменена, товар возвращён");
}

function syncOperationsFromCore() {
  const api = window.CONDUCTOR_APP_API;
  if (!api) return;
  operations = api.getOrders();
  render();
}

async function boot() {
  injectUi();
  try {
    const api = await waitForCoreApi();
    operations = api.getOrders();
    render();
    window.addEventListener("conductor:orders-changed", syncOperationsFromCore);
  } catch (error) {
    const list = document.querySelector("#sales-period-list");
    if (list) list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

boot().catch(() => {});
