import { collection, onSnapshot, orderBy, query } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const KZT = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 });
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];

let analyticsSales = [];
let selectedYear = new Date().getFullYear();
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

function injectStyles() {
  if (document.querySelector("#analytics-styles")) return;
  const style = document.createElement("style");
  style.id = "analytics-styles";
  style.textContent = `
    .bottom-nav{grid-template-columns:repeat(6,1fr)}
    .analytics-nav span{font-size:19px}
    .analytics-year-card{display:flex;align-items:center;justify-content:space-between;gap:14px;margin:10px 0 14px;padding:16px;border:1px solid var(--line);border-radius:20px;background:linear-gradient(145deg,rgba(56,166,255,.12),transparent 58%),var(--panel)}
    .analytics-year-copy span,.analytics-year-copy b{display:block}.analytics-year-copy span{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.analytics-year-copy b{margin-top:5px;font-size:27px}
    .analytics-year-select{min-width:104px;border:1px solid var(--line);border-radius:13px;background:#090e16;color:#fff;padding:11px 12px;font-weight:900;outline:none}
    .analytics-month-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
    .analytics-month{min-width:0;min-height:96px;padding:12px 10px;border:1px solid var(--line);border-radius:16px;background:var(--panel);color:#fff;text-align:left;cursor:pointer;transition:.16s ease}
    .analytics-month:hover{transform:translateY(-1px);border-color:rgba(56,166,255,.3)}
    .analytics-month-name,.analytics-month b,.analytics-month small{display:block}.analytics-month-name{font-size:11px;font-weight:900;color:#dce4ee}.analytics-month b{margin-top:9px;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.analytics-month small{margin-top:5px;color:var(--muted);font-size:9px}
    .analytics-month.is-current{border-color:rgba(255,195,77,.62);box-shadow:inset 0 0 0 1px rgba(255,195,77,.15);background:linear-gradient(145deg,rgba(255,195,77,.11),transparent 60%),var(--panel)}
    .analytics-month.is-current .analytics-month-name{color:#ffd57f}
    .analytics-month.is-selected{border-color:rgba(56,166,255,.75);box-shadow:0 0 0 2px rgba(56,166,255,.12);background:linear-gradient(145deg,rgba(56,166,255,.16),transparent 60%),var(--panel)}
    .analytics-journal-head{align-items:flex-end}.analytics-journal-meta{color:var(--muted);font-size:10px;text-align:right}
    .analytics-sale-card{border:1px solid var(--line);border-radius:18px;padding:14px;background:var(--panel)}
    .analytics-sale-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.analytics-sale-title b,.analytics-sale-title small{display:block}.analytics-sale-title b{font-size:13px}.analytics-sale-title small{margin-top:3px;color:var(--muted);font-size:10px}.analytics-sale-total{font-size:17px;font-weight:1000;white-space:nowrap}.analytics-sale-items{margin-top:9px;color:#d7dde6;font-size:11px;line-height:1.45}.analytics-sale-note{margin-top:5px;color:var(--muted)}.analytics-sale-status{display:inline-flex;margin-top:9px;border:1px solid var(--line);border-radius:999px;padding:5px 8px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:.05em;color:#8cf4a0;background:rgba(92,219,117,.08)}.analytics-sale-status.cancelled{color:#c3c8d0;background:transparent}.analytics-loading{padding:32px 14px;text-align:center;border:1px dashed var(--line);border-radius:18px;color:var(--muted);font-size:12px}
    @media(max-width:430px){.bottom-nav{padding-left:4px;padding-right:4px}.nav-btn small{font-size:9px}.analytics-month-grid{gap:7px}.analytics-month{min-height:90px;padding:11px 8px}.analytics-month b{font-size:14px}.analytics-year-copy b{font-size:24px}}
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
    <div class="section-head analytics-journal-head"><h2 id="analytics-journal-title">Журнал продаж</h2><span id="analytics-journal-meta" class="analytics-journal-meta"></span></div>
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
    if (!Number.isFinite(year)) return;
    selectedYear = year;
    const now = new Date();
    if (selectedYear === now.getFullYear()) selectedMonth = now.getMonth();
    else {
      const monthsWithSales = analyticsSales
        .filter((sale) => sale.status !== "cancelled" && dateOf(sale).getFullYear() === selectedYear)
        .map((sale) => dateOf(sale).getMonth());
      selectedMonth = monthsWithSales.length ? Math.max(...monthsWithSales) : 0;
    }
    renderAnalytics();
  });
  view.querySelector("#analytics-month-grid")?.addEventListener("click", (event) => {
    const monthButton = event.target.closest("[data-analytics-month]");
    if (!monthButton) return;
    selectedMonth = Number(monthButton.dataset.analyticsMonth);
    renderAnalytics();
    document.querySelector("#analytics-journal-title")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function availableYears() {
  const currentYear = new Date().getFullYear();
  const dataYears = analyticsSales.map((sale) => dateOf(sale).getFullYear()).filter((year) => year > 2000 && year <= currentYear);
  const minYear = Math.min(currentYear - 5, ...(dataYears.length ? dataYears : [currentYear]));
  const years = [];
  for (let year = currentYear; year >= minYear; year -= 1) years.push(year);
  return years;
}

function renderYearSelect() {
  const select = document.querySelector("#analytics-year");
  if (!select) return;
  const years = availableYears();
  if (!years.includes(selectedYear)) selectedYear = years[0];
  select.innerHTML = years.map((year) => `<option value="${year}"${year === selectedYear ? " selected" : ""}>${year}</option>`).join("");
}

function renderJournal(monthSales) {
  const root = document.querySelector("#analytics-sales-list");
  const title = document.querySelector("#analytics-journal-title");
  const meta = document.querySelector("#analytics-journal-meta");
  if (!root || !title || !meta) return;

  title.textContent = `${MONTHS[selectedMonth]} ${selectedYear}`;
  const activeCount = monthSales.filter((sale) => sale.status !== "cancelled").length;
  const cancelledCount = monthSales.length - activeCount;
  meta.textContent = `${activeCount} продаж${cancelledCount ? ` · ${cancelledCount} отменено` : ""}`;

  root.innerHTML = monthSales.length ? monthSales.map((sale) => {
    const cancelled = sale.status === "cancelled";
    const items = saleItemsText(sale);
    const note = sale.note || sale.notes || "";
    return `<article class="analytics-sale-card">
      <div class="analytics-sale-top">
        <div class="analytics-sale-title"><b>Продажа #${escapeHtml(String(sale.id || "").slice(0, 8))}</b><small>${escapeHtml(employeeName(sale))} · ${formatJournalDate(dateOf(sale))}</small></div>
        <div class="analytics-sale-total">${KZT.format(Number(sale.total || 0))}</div>
      </div>
      <div class="analytics-sale-items">${escapeHtml(items || "Без позиций")}${note ? `<div class="analytics-sale-note">${escapeHtml(note)}</div>` : ""}</div>
      <span class="analytics-sale-status${cancelled ? " cancelled" : ""}">${cancelled ? "Отменена" : "Продажа"}</span>
    </article>`;
  }).join("") : `<div class="empty">В этом месяце продаж нет.</div>`;
}

function renderAnalytics() {
  if (!document.querySelector("#view-analytics")) return;
  renderYearSelect();
  const now = new Date();
  const activeYearSales = analyticsSales.filter((sale) => sale.status !== "cancelled" && dateOf(sale).getFullYear() === selectedYear);
  const yearTotal = activeYearSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const totalNode = document.querySelector("#analytics-year-total");
  if (totalNode) totalNode.textContent = KZT.format(yearTotal);

  const monthGrid = document.querySelector("#analytics-month-grid");
  if (monthGrid) {
    monthGrid.innerHTML = MONTHS.map((monthName, monthIndex) => {
      const monthSales = activeYearSales.filter((sale) => dateOf(sale).getMonth() === monthIndex);
      const sum = monthSales.reduce((value, sale) => value + Number(sale.total || 0), 0);
      const current = selectedYear === now.getFullYear() && monthIndex === now.getMonth();
      const selected = monthIndex === selectedMonth;
      return `<button type="button" class="analytics-month${current ? " is-current" : ""}${selected ? " is-selected" : ""}" data-analytics-month="${monthIndex}">
        <span class="analytics-month-name">${monthName}</span><b>${KZT.format(sum)}</b><small>${monthSales.length} продаж</small>
      </button>`;
    }).join("");
  }

  const journalSales = analyticsSales.filter((sale) => {
    const date = dateOf(sale);
    return date.getFullYear() === selectedYear && date.getMonth() === selectedMonth;
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
