import { collection, onSnapshot, orderBy, query } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const KZT = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 });
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const START_YEAR = 2026;
const START_MONTH_2026 = 8;

let analyticsSales = [];
let selectedYear = Math.max(START_YEAR, new Date().getFullYear());
let selectedMonth = new Date().getMonth();
let unsubscribeOrders = null;
let analyticsStarted = false;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function dateOf(item) {
  if (item.createdAt?.toDate) return item.createdAt.toDate();
  if (item.createdAtClient) return new Date(item.createdAtClient);
  return new Date(0);
}

function employeeName(sale) {
  if (sale.createdByName) return sale.createdByName;
  const email = String(sale.createdByEmail || "").trim().toLowerCase();
  if (email === "mihagavr@gmail.com") return "Михаил";
  if (email === "a.kalashin@gmail.com") return "Алексей";
  return "Сотрудник";
}

function formatJournalDate(date) {
  if (!date || Number.isNaN(date.getTime()) || !date.getTime()) return "—";
  return date.toLocaleString("ru-KZ", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function saleItemsText(sale) {
  return (sale.items || []).map((item) => {
    const product = item.colorName ? `${item.productId || "Товар"} · ${item.colorName}` : (item.name || item.productId || "Товар");
    return `${product} × ${Number(item.qty || 0)}`;
  }).join(" · ");
}

function isRealSale(sale) {
  return sale.status !== "cancelled" && !sale.operationType;
}

function isMonthEnabled(year, monthIndex) {
  if (year > START_YEAR) return true;
  return year === START_YEAR && monthIndex >= START_MONTH_2026;
}

function firstEnabledMonth(year) {
  return year === START_YEAR ? START_MONTH_2026 : 0;
}

function normalizeSelectedMonth() {
  if (isMonthEnabled(selectedYear, selectedMonth)) return;
  selectedMonth = firstEnabledMonth(selectedYear);
}

function chooseMonthForYear(year) {
  const now = new Date();
  if (year === now.getFullYear() && isMonthEnabled(year, now.getMonth())) return now.getMonth();

  const monthsWithSales = analyticsSales
    .filter((sale) => {
      const date = dateOf(sale);
      return isRealSale(sale) && date.getFullYear() === year && isMonthEnabled(year, date.getMonth());
    })
    .map((sale) => dateOf(sale).getMonth());

  return monthsWithSales.length ? Math.max(...monthsWithSales) : firstEnabledMonth(year);
}

function injectStyles() {
  if (document.querySelector("#analytics-styles")) return;
  const style = document.createElement("style");
  style.id = "analytics-styles";
  style.textContent = `
    .bottom-nav{grid-template-columns:repeat(6,1fr)}
    .analytics-nav span{font-size:19px}
    .analytics-year-card{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:4px 0 12px;padding:14px;border:1px solid var(--line);border-radius:18px;background:linear-gradient(145deg,rgba(56,166,255,.12),transparent 58%),var(--panel)}
    .analytics-year-copy span,.analytics-year-copy b{display:block}.analytics-year-copy span{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.analytics-year-copy b{margin-top:5px;font-size:25px}
    .analytics-year-select{min-width:104px;border:1px solid var(--line);border-radius:13px;background:#090e16;color:#fff;padding:10px 11px;font-weight:900;outline:none}
    .analytics-month-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
    .analytics-month{min-width:0;min-height:92px;padding:11px 9px;border:1px solid var(--line);border-radius:15px;background:var(--panel);color:#fff;text-align:left;cursor:pointer;transition:.16s ease}
    .analytics-month-name,.analytics-month b,.analytics-month small{display:block}.analytics-month-name{font-size:11px;font-weight:900;color:#dce4ee}.analytics-month b{margin-top:8px;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.analytics-month small{margin-top:5px;color:var(--muted);font-size:9px}
    .analytics-month.is-current{border-color:rgba(255,195,77,.62);background:linear-gradient(145deg,rgba(255,195,77,.11),transparent 60%),var(--panel)}
    .analytics-month.is-current .analytics-month-name{color:#ffd57f}
    .analytics-month.is-selected{border-color:rgba(56,166,255,.75);box-shadow:0 0 0 2px rgba(56,166,255,.12);background:linear-gradient(145deg,rgba(56,166,255,.16),transparent 60%),var(--panel)}
    .analytics-month.is-disabled{cursor:not-allowed;opacity:.34;filter:saturate(.35);background:#090c12;border-style:dashed}
    .analytics-month.is-disabled .analytics-month-name,.analytics-month.is-disabled b,.analytics-month.is-disabled small{color:#6f7887}
    .analytics-journal-head{align-items:flex-end}.analytics-journal-meta{color:var(--muted);font-size:10px;text-align:right}
    .analytics-sale-card{border:1px solid var(--line);border-radius:18px;padding:14px;background:var(--panel)}
    .analytics-sale-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.analytics-sale-title b,.analytics-sale-title small{display:block}.analytics-sale-title b{font-size:13px}.analytics-sale-title small{margin-top:3px;color:var(--muted);font-size:10px}.analytics-sale-total{font-size:17px;font-weight:1000;white-space:nowrap}.analytics-sale-items{margin-top:9px;color:#d7dde6;font-size:11px;line-height:1.45}.analytics-sale-note{margin-top:5px;color:var(--muted)}.analytics-loading{padding:32px 14px;text-align:center;border:1px dashed var(--line);border-radius:18px;color:var(--muted);font-size:12px}
    @media(max-width:430px){.bottom-nav{padding-left:4px;padding-right:4px}.nav-btn small{font-size:9px}.analytics-month-grid{gap:7px}.analytics-month{min-height:88px;padding:10px 8px}.analytics-month b{font-size:14px}.analytics-year-copy b{font-size:23px}}
  `;
  document.head.append(style);
}

function injectUi() {
  if (document.querySelector("#view-analytics")) return;
  injectStyles();

  const view = document.createElement("section");
  view.id = "view-analytics";
  view.className = "view";
  view.innerHTML = `
    <div class="section-head"><h1>Аналитика</h1></div>
    <div class="analytics-year-card">
      <div class="analytics-year-copy"><span>Продажи за год</span><b id="analytics-year-total">0 ₸</b></div>
      <select id="analytics-year" class="analytics-year-select" aria-label="Выберите год"></select>
    </div>
    <div id="analytics-month-grid" class="analytics-month-grid" aria-label="Продажи по месяцам"></div>
    <div class="section-head analytics-journal-head"><h2 id="analytics-journal-title">Операции</h2><span id="analytics-journal-meta" class="analytics-journal-meta"></span></div>
    <div id="analytics-sales-list" class="list"><div class="analytics-loading">Откройте аналитику, чтобы загрузить историю продаж.</div></div>
  `;

  const settingsView = document.querySelector("#view-settings");
  const content = document.querySelector(".content");
  if (settingsView?.parentElement) settingsView.parentElement.insertBefore(view, settingsView);
  else content?.append(view);

  const nav = document.querySelector(".bottom-nav");
  const stockButton = nav?.querySelector('[data-nav="stock"]');
  const button = document.createElement("button");
  button.className = "nav-btn analytics-nav";
  button.dataset.nav = "analytics";
  button.type = "button";
  button.innerHTML = "<span>▥</span><small>Аналитика</small>";
  if (stockButton) nav.insertBefore(button, stockButton);
  else nav?.append(button);

  button.addEventListener("click", openAnalytics);
  view.querySelector("#analytics-year")?.addEventListener("change", (event) => {
    const year = Number(event.target.value);
    if (!Number.isFinite(year) || year < START_YEAR || year > new Date().getFullYear()) return;
    selectedYear = year;
    selectedMonth = chooseMonthForYear(selectedYear);
    renderAnalytics();
  });
  view.querySelector("#analytics-month-grid")?.addEventListener("click", (event) => {
    const monthButton = event.target.closest("[data-analytics-month]");
    if (!monthButton || monthButton.disabled) return;
    const monthIndex = Number(monthButton.dataset.analyticsMonth);
    if (!isMonthEnabled(selectedYear, monthIndex)) return;
    selectedMonth = monthIndex;
    renderAnalytics();
    document.querySelector("#analytics-journal-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function availableYears() {
  const currentYear = Math.max(START_YEAR, new Date().getFullYear());
  const years = [];
  for (let year = currentYear; year >= START_YEAR; year -= 1) years.push(year);
  return years;
}

function renderYearSelect() {
  const select = document.querySelector("#analytics-year");
  if (!select) return;
  const years = availableYears();
  if (!years.includes(selectedYear)) selectedYear = years[0];
  normalizeSelectedMonth();
  select.innerHTML = years.map((year) => `<option value="${year}"${year === selectedYear ? " selected" : ""}>${year}</option>`).join("");
}

function renderJournal(monthSales) {
  const root = document.querySelector("#analytics-sales-list");
  const title = document.querySelector("#analytics-journal-title");
  const meta = document.querySelector("#analytics-journal-meta");
  if (!root || !title || !meta) return;

  if (!isMonthEnabled(selectedYear, selectedMonth)) {
    title.textContent = "Операции";
    meta.textContent = "";
    root.innerHTML = `<div class="empty">За этот период данные не ведутся.</div>`;
    return;
  }

  title.textContent = `${MONTHS[selectedMonth]} ${selectedYear}`;
  meta.textContent = `${monthSales.length} продаж`;

  root.innerHTML = monthSales.length ? monthSales.map((sale) => {
    const items = saleItemsText(sale);
    const note = sale.note || sale.notes || "";
    return `<article class="analytics-sale-card">
      <div class="analytics-sale-top">
        <div class="analytics-sale-title"><b>Продажа</b><small>${escapeHtml(employeeName(sale))} · ${formatJournalDate(dateOf(sale))}</small></div>
        <div class="analytics-sale-total">${KZT.format(Number(sale.total || 0))}</div>
      </div>
      <div class="analytics-sale-items">${escapeHtml(items || "Без позиций")}${note ? `<div class="analytics-sale-note">${escapeHtml(note)}</div>` : ""}</div>
    </article>`;
  }).join("") : `<div class="empty">В этом месяце продаж нет.</div>`;
}

function renderAnalytics() {
  if (!document.querySelector("#view-analytics")) return;
  renderYearSelect();
  const now = new Date();
  normalizeSelectedMonth();

  const activeYearSales = analyticsSales.filter((sale) => {
    const date = dateOf(sale);
    return isRealSale(sale)
      && date.getFullYear() === selectedYear
      && isMonthEnabled(selectedYear, date.getMonth());
  });
  const yearTotal = activeYearSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const totalNode = document.querySelector("#analytics-year-total");
  if (totalNode) totalNode.textContent = KZT.format(yearTotal);

  const monthGrid = document.querySelector("#analytics-month-grid");
  if (monthGrid) {
    monthGrid.innerHTML = MONTHS.map((monthName, monthIndex) => {
      const enabled = isMonthEnabled(selectedYear, monthIndex);
      const monthSales = enabled ? activeYearSales.filter((sale) => dateOf(sale).getMonth() === monthIndex) : [];
      const sum = monthSales.reduce((value, sale) => value + Number(sale.total || 0), 0);
      const current = enabled && selectedYear === now.getFullYear() && monthIndex === now.getMonth();
      const selected = enabled && monthIndex === selectedMonth;
      return `<button type="button" class="analytics-month${current ? " is-current" : ""}${selected ? " is-selected" : ""}${enabled ? "" : " is-disabled"}"${enabled ? ` data-analytics-month="${monthIndex}"` : " disabled"} aria-disabled="${enabled ? "false" : "true"}">
        <span class="analytics-month-name">${monthName}</span><b>${enabled ? KZT.format(sum) : "—"}</b><small>${enabled ? `${monthSales.length} продаж` : "Нет данных"}</small>
      </button>`;
    }).join("");
  }

  const journalSales = analyticsSales.filter((sale) => {
    const date = dateOf(sale);
    return isRealSale(sale)
      && isMonthEnabled(selectedYear, selectedMonth)
      && date.getFullYear() === selectedYear
      && date.getMonth() === selectedMonth;
  });
  renderJournal(journalSales);
}

async function waitForDatabase() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (window.CONDUCTOR_FIRESTORE) return window.CONDUCTOR_FIRESTORE;
    await new Promise((resolve) => window.setTimeout(resolve, 150));
  }
  throw new Error("База данных ещё не готова. Повторите открытие аналитики.");
}

async function startAnalytics() {
  if (analyticsStarted) return;
  analyticsStarted = true;
  const root = document.querySelector("#analytics-sales-list");
  if (root) root.innerHTML = `<div class="analytics-loading">Загружаю историю продаж…</div>`;
  try {
    const db = await waitForDatabase();
    unsubscribeOrders = onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc")), (snapshot) => {
      analyticsSales = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
      renderAnalytics();
    }, (error) => {
      analyticsStarted = false;
      if (root) root.innerHTML = `<div class="empty">Не удалось загрузить аналитику: ${escapeHtml(error.message)}</div>`;
    });
  } catch (error) {
    analyticsStarted = false;
    if (root) root.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function openAnalytics() {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelectorAll(".nav-btn").forEach((button) => button.classList.toggle("active", button.dataset.nav === "analytics"));
  document.querySelector("#view-analytics")?.classList.add("active");
  const subtitle = document.querySelector("#page-subtitle");
  if (subtitle) subtitle.textContent = "Продажи по годам";
  window.scrollTo({ top: 0, behavior: "smooth" });
  startAnalytics();
}

function cleanupAnalytics() {
  unsubscribeOrders?.();
  unsubscribeOrders = null;
  analyticsStarted = false;
  analyticsSales = [];
}

injectUi();
document.querySelector("#logout")?.addEventListener("click", cleanupAnalytics);
