import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore, collection, query, orderBy, limit, onSnapshot, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const LOCAL_CONFIG_KEY = "conductor.firebaseConfig";
const PRODUCT_LABELS = { DM30: "Цветной дым DM30", DM60: "Цветной дым DM60", DM90: "Цветной дым DM90", HOLI: "Краски Холи" };
let leads = [];
let unsubscribe = null;

function config() {
  const embedded = window.CONDUCTOR_FIREBASE_CONFIG;
  if (embedded?.apiKey && embedded?.projectId && embedded?.appId) return embedded;
  try { return JSON.parse(localStorage.getItem(LOCAL_CONFIG_KEY) || "null"); } catch { return null; }
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function dateOf(lead) {
  if (lead.createdAt?.toDate) return lead.createdAt.toDate();
  return new Date(0);
}

function statusLabel(status) {
  return ({ new: "Новая", contacted: "В работе", closed: "Закрыта" })[status] || status;
}

function ensureUi() {
  if (!document.querySelector("#website-leads-dashboard")) {
    const target = document.querySelector("#dashboard-orders")?.previousElementSibling;
    if (target) {
      const box = document.createElement("div");
      box.innerHTML = `<div class="section-head"><h2>Заявки с сайта <span id="website-leads-badge" style="display:inline-grid;place-items:center;min-width:21px;height:21px;padding:0 6px;border-radius:999px;background:rgba(255,61,117,.14);color:#ff7c9f;font-size:10px;vertical-align:2px">0</span></h2><button class="link-btn" id="website-leads-open-orders">Все</button></div><div id="website-leads-dashboard" class="list"></div>`;
      target.before(box);
      box.querySelector("#website-leads-open-orders")?.addEventListener("click", () => document.querySelector('[data-nav="orders"]')?.click());
    }
  }
  if (!document.querySelector("#website-leads-orders")) {
    const list = document.querySelector("#orders-list");
    if (list) {
      const box = document.createElement("div");
      box.innerHTML = `<div class="section-head" style="margin-top:10px"><h2>Заявки с сайта</h2><span id="website-leads-orders-count" class="muted"></span></div><div id="website-leads-orders" class="list" style="margin-bottom:18px"></div>`;
      list.before(box);
    }
  }
}

function leadCard(lead) {
  const product = PRODUCT_LABELS[lead.productId] || lead.productId;
  const date = dateOf(lead);
  const actions = lead.status === "new"
    ? `<button data-lead-action="contacted" data-lead-id="${lead.id}">В работу</button>`
    : lead.status === "contacted"
      ? `<button data-lead-action="closed" data-lead-id="${lead.id}">Закрыть</button>`
      : "";
  return `<article class="order-card" style="border-color:rgba(255,61,117,.22);background:linear-gradient(145deg,rgba(255,61,117,.08),transparent 46%),var(--panel)">
    <div class="order-top">
      <div><div class="order-customer">${escapeHtml(lead.customer)}</div><div class="order-phone">${escapeHtml(product)}</div></div>
      <span class="status ${lead.status === "new" ? "new" : lead.status === "contacted" ? "confirmed" : "done"}">${statusLabel(lead.status)}</span>
    </div>
    <div class="order-items">☎ ${escapeHtml(lead.phone)}</div>
    <div class="order-bottom"><span class="order-meta">Заявка с conductor.kz</span><span class="order-meta">${date.getTime() ? date.toLocaleString("ru-KZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "только что"}</span></div>
    <div class="order-actions"><a href="tel:${escapeHtml(lead.phone.replace(/[^+\d]/g, ""))}" style="border:1px solid var(--line);background:#0a0f18;color:#fff;border-radius:10px;padding:7px 9px;font-size:10px;font-weight:800;text-decoration:none">Позвонить</a>${actions}</div>
  </article>`;
}

function render(db) {
  ensureUi();
  const open = leads.filter((lead) => lead.status !== "closed");
  const fresh = leads.filter((lead) => lead.status === "new");
  const dashboard = document.querySelector("#website-leads-dashboard");
  const orders = document.querySelector("#website-leads-orders");
  const badge = document.querySelector("#website-leads-badge");
  const count = document.querySelector("#website-leads-orders-count");
  if (badge) badge.textContent = String(fresh.length);
  if (count) count.textContent = `${open.length} активных`;
  if (dashboard) dashboard.innerHTML = open.length ? open.slice(0, 3).map(leadCard).join("") : `<div class="empty">Новых заявок с сайта пока нет.</div>`;
  if (orders) orders.innerHTML = leads.length ? leads.map(leadCard).join("") : `<div class="empty">Заявок с сайта пока нет.</div>`;

  document.querySelectorAll("[data-lead-action]").forEach((button) => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await updateDoc(doc(db, "leads", button.dataset.leadId), {
          status: button.dataset.leadAction,
          statusUpdatedAt: serverTimestamp()
        });
      } finally {
        button.disabled = false;
      }
    });
  });

  const metricNew = document.querySelector("#metric-new");
  if (metricNew) {
    const orderNew = Number(metricNew.dataset.orderCount ?? metricNew.textContent ?? 0);
    if (!metricNew.dataset.orderCount) metricNew.dataset.orderCount = String(orderNew);
    metricNew.textContent = String(orderNew + fresh.length);
  }
}

function start() {
  const cfg = config();
  if (!cfg?.apiKey || !cfg?.projectId || !cfg?.appId) return;
  const app = getApps()[0] || initializeApp(cfg);
  const auth = getAuth(app);
  const db = getFirestore(app);
  onAuthStateChanged(auth, (user) => {
    unsubscribe?.();
    unsubscribe = null;
    if (!user) return;
    unsubscribe = onSnapshot(query(collection(db, "leads"), orderBy("createdAt", "desc"), limit(100)), (snap) => {
      leads = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
      render(db);
    });
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
