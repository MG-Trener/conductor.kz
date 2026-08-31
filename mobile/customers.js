import { getApps } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore, collection, query, orderBy, limit, onSnapshot } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const KZT = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 });
const PRODUCT_LABELS = { DM30: "Цветной дым DM30", DM60: "Цветной дым DM60", DM90: "Цветной дым DM90", HOLI: "Краски Холи" };
let orders = [];
let leads = [];
let orderUnsub = null;
let leadUnsub = null;
let currentSearch = "";

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function phoneKey(value = "") {
  let digits = String(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  if (digits.length === 10) digits = `7${digits}`;
  return digits || String(value).trim().toLowerCase();
}

function eventDate(item) {
  if (item.createdAt?.toDate) return item.createdAt.toDate();
  if (item.createdAtClient) return new Date(item.createdAtClient);
  return new Date(0);
}

function formatDate(date) {
  if (!date || !date.getTime()) return "—";
  return date.toLocaleString("ru-KZ", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function orderStatus(status) {
  return ({ new: "Новый заказ", confirmed: "Подтверждён", shipped: "Отправлен", done: "Завершён", cancelled: "Отменён" })[status] || status;
}

function leadStatus(status) {
  return ({ new: "Новая заявка", contacted: "В работе", converted: "Оформлена в заказ", closed: "Закрыта" })[status] || status;
}

function aggregateCustomers() {
  const map = new Map();
  const ensure = (phone, name, city = "") => {
    const key = phoneKey(phone);
    if (!key) return null;
    if (!map.has(key)) {
      map.set(key, {
        key,
        phone: phone || key,
        name: name || "Без имени",
        city: city || "",
        leads: [],
        orders: [],
        history: [],
        latestAt: new Date(0)
      });
    }
    const client = map.get(key);
    if (name && (client.name === "Без имени" || eventDate({ createdAtClient: new Date().toISOString() }) >= client.latestAt)) client.name = name;
    if (city) client.city = city;
    if (phone) client.phone = phone;
    return client;
  };

  for (const lead of leads) {
    const client = ensure(lead.phone, lead.customer);
    if (!client) continue;
    const date = eventDate(lead);
    client.leads.push(lead);
    client.history.push({ type: "lead", date, data: lead });
    if (date > client.latestAt) {
      client.latestAt = date;
      if (lead.customer) client.name = lead.customer;
      if (lead.phone) client.phone = lead.phone;
    }
  }

  for (const order of orders) {
    const client = ensure(order.phone, order.customer, order.city);
    if (!client) continue;
    const date = eventDate(order);
    client.orders.push(order);
    client.history.push({ type: "order", date, data: order });
    if (date > client.latestAt) {
      client.latestAt = date;
      if (order.customer) client.name = order.customer;
      if (order.phone) client.phone = order.phone;
      if (order.city) client.city = order.city;
    }
  }

  return [...map.values()].map((client) => {
    client.history.sort((a, b) => b.date - a.date);
    client.completedOrders = client.orders.filter((order) => order.status === "done");
    client.activeOrders = client.orders.filter((order) => ["new", "confirmed", "shipped"].includes(order.status));
    client.totalSpent = client.completedOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    return client;
  }).sort((a, b) => b.latestAt - a.latestAt);
}

function ensureUi() {
  if (!document.querySelector("#view-customers")) {
    const settings = document.querySelector("#view-settings");
    if (!settings) return;
    const section = document.createElement("section");
    section.id = "view-customers";
    section.className = "view";
    section.innerHTML = `
      <div class="section-head sticky-head">
        <div><div class="eyebrow">CRM</div><h1>Клиенты</h1></div>
        <button class="btn small" id="customers-back">← Назад</button>
      </div>
      <div class="panel" style="margin-bottom:12px">
        <label style="display:grid;gap:7px;color:#c8d0db;font-size:12px;font-weight:800">Поиск клиента
          <input id="customers-search" type="search" placeholder="Имя или телефон" style="width:100%;border:1px solid var(--line);background:#080c14;color:#fff;border-radius:14px;padding:13px 14px;outline:none">
        </label>
      </div>
      <div class="metric-grid" id="customers-metrics">
        <article class="metric"><span>Клиентов</span><b id="customers-count">0</b></article>
        <article class="metric"><span>Повторных</span><b id="customers-repeat">0</b></article>
        <article class="metric"><span>Активных заказов</span><b id="customers-active">0</b></article>
        <article class="metric"><span>Выручка</span><b id="customers-revenue" style="font-size:18px">0 ₸</b></article>
      </div>
      <div id="customers-list" class="list"></div>`;
    settings.before(section);

    section.querySelector("#customers-back")?.addEventListener("click", () => showDashboard());
    section.querySelector("#customers-search")?.addEventListener("input", (event) => {
      currentSearch = event.target.value.trim().toLowerCase();
      render();
    });
  }

  if (!document.querySelector("#customers-quick")) {
    const grid = document.querySelector(".quick-grid");
    if (grid) {
      const button = document.createElement("button");
      button.id = "customers-quick";
      button.className = "quick";
      button.style.background = "linear-gradient(145deg,rgba(206,57,220,.13),transparent 55%),var(--panel)";
      button.style.gridColumn = "auto";
      button.innerHTML = `<span>◉</span><b>Клиенты</b><small>История и покупки</small>`;
      button.addEventListener("click", showCustomers);
      grid.append(button);
    }
  }

  if (!document.querySelector("#customers-orders-link")) {
    const head = document.querySelector("#view-orders .section-head");
    if (head) {
      const button = document.createElement("button");
      button.id = "customers-orders-link";
      button.className = "btn small";
      button.textContent = "Клиенты";
      button.addEventListener("click", showCustomers);
      head.append(button);
    }
  }
}

function showCustomers() {
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.querySelector("#view-customers")?.classList.add("active");
  document.querySelectorAll(".nav-btn").forEach((button) => button.classList.remove("active"));
  const subtitle = document.querySelector("#page-subtitle");
  if (subtitle) subtitle.textContent = "Клиентская база";
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function showDashboard() {
  const dashboard = document.querySelector('[data-nav="dashboard"]');
  if (dashboard) dashboard.click();
}

function clientCard(client) {
  const repeat = client.completedOrders.length > 1 ? `<span class="status done">Повторный</span>` : "";
  const lastProduct = client.history.find((item) => item.type === "order")?.data?.items?.[0]?.productId
    || client.history.find((item) => item.type === "lead")?.data?.productId
    || "";
  return `<article class="order-card">
    <div class="order-top">
      <div><div class="order-customer">${escapeHtml(client.name)}</div><div class="order-phone">${escapeHtml(client.phone)}${client.city ? ` · ${escapeHtml(client.city)}` : ""}</div></div>
      <div style="text-align:right"><div class="order-total">${KZT.format(client.totalSpent)}</div><div class="order-meta">покупок: ${client.completedOrders.length}</div></div>
    </div>
    <div class="order-items">Заявок: ${client.leads.length} · заказов: ${client.orders.length}${lastProduct ? ` · интерес: ${escapeHtml(PRODUCT_LABELS[lastProduct] || lastProduct)}` : ""}</div>
    <div class="order-bottom"><span>${repeat}</span><span class="order-meta">Последняя активность: ${formatDate(client.latestAt)}</span></div>
    <div class="order-actions">
      <a href="tel:${escapeHtml(String(client.phone).replace(/[^+\d]/g, ""))}" style="border:1px solid var(--line);background:#0a0f18;color:#fff;border-radius:10px;padding:7px 9px;font-size:10px;font-weight:800;text-decoration:none">Позвонить</a>
      <button data-customer-history="${escapeHtml(client.key)}">История</button>
    </div>
  </article>`;
}

function historyModal(client) {
  document.querySelector("#customer-history-modal")?.remove();
  const root = document.createElement("div");
  root.id = "customer-history-modal";
  root.style.cssText = "position:fixed;inset:0;z-index:120;background:rgba(3,5,12,.82);backdrop-filter:blur(12px);display:grid;align-items:end;padding:10px";
  root.innerHTML = `<div style="max-height:88dvh;overflow:auto;width:min(100%,620px);margin:0 auto;border:1px solid var(--line);border-radius:22px 22px 16px 16px;background:var(--panel);padding:16px">
    <div class="section-head" style="margin-top:0"><div><div class="eyebrow">Карточка клиента</div><h2 style="margin:4px 0 0">${escapeHtml(client.name)}</h2><div class="muted" style="font-size:11px;margin-top:4px">${escapeHtml(client.phone)}${client.city ? ` · ${escapeHtml(client.city)}` : ""}</div></div><button id="customer-history-close" class="icon-btn">×</button></div>
    <div class="metric-grid"><article class="metric"><span>Заявок</span><b>${client.leads.length}</b></article><article class="metric"><span>Заказов</span><b>${client.orders.length}</b></article><article class="metric"><span>Покупок</span><b>${client.completedOrders.length}</b></article><article class="metric"><span>Сумма</span><b style="font-size:17px">${KZT.format(client.totalSpent)}</b></article></div>
    <div class="section-head"><h2>История</h2></div>
    <div class="list">${client.history.map((item) => {
      if (item.type === "lead") {
        const lead = item.data;
        return `<div class="order-card"><div class="order-top"><div><div class="order-customer">Заявка с сайта</div><div class="order-phone">${escapeHtml(PRODUCT_LABELS[lead.productId] || lead.productId)}</div></div><span class="status ${lead.status === "new" ? "new" : lead.status === "contacted" ? "confirmed" : "done"}">${escapeHtml(leadStatus(lead.status))}</span></div><div class="order-meta" style="margin-top:8px">${formatDate(item.date)}</div></div>`;
      }
      const order = item.data;
      const products = (order.items || []).map((product) => `${product.productId} × ${product.qty}`).join(" · ");
      return `<div class="order-card"><div class="order-top"><div><div class="order-customer">Заказ</div><div class="order-phone">${escapeHtml(products || "Без позиций")}</div></div><div class="order-total">${KZT.format(Number(order.total || 0))}</div></div><div class="order-bottom" style="margin-top:8px"><span class="status ${order.status === "done" ? "done" : order.status === "cancelled" ? "cancelled" : "confirmed"}">${escapeHtml(orderStatus(order.status))}</span><span class="order-meta">${formatDate(item.date)}</span></div></div>`;
    }).join("") || `<div class="empty">История пока пуста.</div>`}</div>
  </div>`;
  document.body.append(root);
  root.querySelector("#customer-history-close")?.addEventListener("click", () => root.remove());
  root.addEventListener("click", (event) => { if (event.target === root) root.remove(); });
}

function render() {
  ensureUi();
  const all = aggregateCustomers();
  const filtered = currentSearch
    ? all.filter((client) => `${client.name} ${client.phone} ${client.city}`.toLowerCase().includes(currentSearch))
    : all;

  const count = document.querySelector("#customers-count");
  const repeat = document.querySelector("#customers-repeat");
  const active = document.querySelector("#customers-active");
  const revenue = document.querySelector("#customers-revenue");
  const list = document.querySelector("#customers-list");
  if (count) count.textContent = String(all.length);
  if (repeat) repeat.textContent = String(all.filter((client) => client.completedOrders.length > 1).length);
  if (active) active.textContent = String(all.reduce((sum, client) => sum + client.activeOrders.length, 0));
  if (revenue) revenue.textContent = KZT.format(all.reduce((sum, client) => sum + client.totalSpent, 0));
  if (list) list.innerHTML = filtered.length ? filtered.map(clientCard).join("") : `<div class="empty">Клиентов не найдено.</div>`;

  document.querySelectorAll("[data-customer-history]").forEach((button) => {
    button.addEventListener("click", () => {
      const client = all.find((item) => item.key === button.dataset.customerHistory);
      if (client) historyModal(client);
    });
  });
}

function start() {
  ensureUi();
  const app = getApps()[0];
  if (!app) return setTimeout(start, 100);
  const auth = getAuth(app);
  const db = getFirestore(app);

  onAuthStateChanged(auth, (user) => {
    orderUnsub?.();
    leadUnsub?.();
    orderUnsub = null;
    leadUnsub = null;
    if (!user) return;

    orderUnsub = onSnapshot(query(collection(db, "orders"), orderBy("createdAt", "desc"), limit(300)), (snap) => {
      orders = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      render();
    });
    leadUnsub = onSnapshot(query(collection(db, "leads"), orderBy("createdAt", "desc"), limit(300)), (snap) => {
      leads = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      render();
    });
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
