import { getApps } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  query,
  orderBy,
  limit,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const KZT = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 });
const PRODUCT_NAMES = { DM30: "Цветной дым DM30", DM60: "Цветной дым DM60", DM90: "Цветной дым DM90", HOLI: "Краска Холи" };
let products = new Map();
let movements = [];
let db = null;
let user = null;
let unsubProducts = null;
let unsubMovements = null;
let observer = null;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function toast(message) {
  const node = document.querySelector("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2500);
}

function movementLabel(type) {
  return ({ receipt: "Поступление", writeoff: "Списание", adjustment: "Корректировка", quick: "Быстрая корректировка", sale: "Продажа" })[type] || type;
}

function movementSign(delta) {
  return delta > 0 ? `+${delta}` : String(delta);
}

function toDate(value) {
  if (value?.toDate) return value.toDate();
  return null;
}

function ensureStyles() {
  if (document.querySelector("#inventory-styles")) return;
  const style = document.createElement("style");
  style.id = "inventory-styles";
  style.textContent = `
    body.inventory-ready .stock-actions{display:none!important}
    .inventory-summary{display:grid;grid-template-columns:repeat(2,1fr);gap:9px;margin:0 0 12px}
    .inventory-metric{border:1px solid var(--line);border-radius:16px;background:var(--panel);padding:13px}
    .inventory-metric span{display:block;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.07em}
    .inventory-metric b{display:block;margin-top:5px;font-size:20px}
    .inventory-controls{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:12px}
    .inventory-controls button{border:1px solid var(--line);border-radius:11px;background:#090e16;color:#fff;padding:10px 7px;font-size:10px;font-weight:900}
    .inventory-controls .receipt{color:#8cf4a0;border-color:rgba(92,219,117,.26)}
    .inventory-controls .writeoff{color:#ff9baa;border-color:rgba(255,89,111,.28)}
    .inventory-cost{margin-top:6px;color:var(--muted);font-size:10px}
    .inventory-toolbar{display:flex;gap:8px;margin:0 0 12px}
    .inventory-toolbar button{flex:1}
    .inventory-modal-backdrop{position:fixed;inset:0;z-index:130;display:grid;place-items:center;padding:14px;background:rgba(2,5,12,.78);backdrop-filter:blur(12px)}
    .inventory-modal{width:min(100%,460px);max-height:88dvh;overflow:auto;border:1px solid var(--line);border-radius:22px;background:#0d111b;padding:18px;box-shadow:0 28px 80px rgba(0,0,0,.55)}
    .inventory-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
    .inventory-modal h2{margin:0;font-size:22px}.inventory-modal .sub{color:var(--muted);font-size:11px;margin-top:4px}
    .inventory-close{width:36px;height:36px;border:1px solid var(--line);border-radius:11px;background:#090e16;color:#fff;font-size:20px}
    .inventory-form{display:grid;gap:12px}.inventory-form label{display:grid;gap:6px;color:#c8d0db;font-size:11px;font-weight:800}
    .inventory-form input,.inventory-form select,.inventory-form textarea{width:100%;border:1px solid var(--line);background:#080c14;color:#fff;border-radius:13px;padding:12px 13px;outline:none}
    .inventory-before-after{display:grid;grid-template-columns:1fr 1fr;gap:8px}.inventory-before-after div{border:1px solid var(--line);border-radius:13px;padding:11px;background:#080c14}
    .inventory-before-after span{display:block;color:var(--muted);font-size:9px;text-transform:uppercase}.inventory-before-after b{display:block;margin-top:4px;font-size:20px}
    .movement-list{display:grid;gap:8px}.movement-card{border:1px solid var(--line);border-radius:15px;padding:12px;background:#090e16}
    .movement-top,.movement-bottom{display:flex;justify-content:space-between;gap:10px}.movement-title{font-weight:900;font-size:12px}.movement-delta{font-weight:1000;font-size:17px}.movement-delta.plus{color:#8cf4a0}.movement-delta.minus{color:#ff9baa}
    .movement-meta{color:var(--muted);font-size:9px;margin-top:4px}.movement-reason{font-size:10px;color:#d4dbe5;margin-top:8px;line-height:1.4}
    .movement-cost{font-size:9px;color:#b9c3d1;margin-top:5px}
    @media(min-width:700px){.inventory-summary{grid-template-columns:repeat(4,1fr)}}
  `;
  document.head.append(style);
}

function ensureModal() {
  if (document.querySelector("#inventory-modal-root")) return;
  const root = document.createElement("div");
  root.id = "inventory-modal-root";
  root.hidden = true;
  document.body.append(root);
}

function closeModal() {
  const root = document.querySelector("#inventory-modal-root");
  if (root) {
    root.hidden = true;
    root.innerHTML = "";
  }
}

function productFromCard(card) {
  const stockButton = card?.querySelector("[data-stock]");
  return stockButton?.dataset.stock || card?.dataset.inventoryProduct || null;
}

function enhanceStockCards() {
  const list = document.querySelector("#stock-list");
  if (!list) return;
  list.querySelectorAll(".stock-card").forEach((card) => {
    if (card.dataset.inventoryEnhanced === "1") return;
    const productId = productFromCard(card);
    if (!productId) return;
    card.dataset.inventoryEnhanced = "1";
    card.dataset.inventoryProduct = productId;
    const product = products.get(productId) || {};
    const nameBlock = card.querySelector(".stock-name");
    if (nameBlock) {
      const cost = document.createElement("div");
      cost.className = "inventory-cost";
      cost.textContent = `Средняя закупка: ${KZT.format(Number(product.averagePurchasePrice || 0))} · последняя: ${KZT.format(Number(product.lastPurchasePrice || 0))}`;
      nameBlock.append(cost);
    }
    const controls = document.createElement("div");
    controls.className = "inventory-controls";
    controls.innerHTML = `
      <button type="button" class="receipt" data-inventory-op="receipt" data-product-id="${productId}">＋ Поступление</button>
      <button type="button" class="writeoff" data-inventory-op="writeoff" data-product-id="${productId}">− Списание</button>
      <button type="button" data-inventory-op="adjustment" data-product-id="${productId}">Корректировка</button>
      <button type="button" data-inventory-history="${productId}">История</button>`;
    card.append(controls);
  });
  document.body.classList.add("inventory-ready");
  ensureSummary();
}

function ensureSummary() {
  const view = document.querySelector("#view-stock");
  const list = document.querySelector("#stock-list");
  if (!view || !list) return;
  let summary = document.querySelector("#inventory-summary");
  if (!summary) {
    summary = document.createElement("div");
    summary.id = "inventory-summary";
    list.before(summary);
  }
  const rows = [...products.values()].filter((p) => p.active !== false);
  const units = rows.reduce((sum, p) => sum + Number(p.stock || 0), 0);
  const value = rows.reduce((sum, p) => sum + Number(p.stock || 0) * Number(p.averagePurchasePrice || 0), 0);
  const low = rows.filter((p) => Number(p.stock || 0) <= Number(p.lowStock || 0)).length;
  const receiptsToday = movements.filter((m) => m.type === "receipt" && isToday(toDate(m.createdAt))).reduce((sum, m) => sum + Number(m.qty || 0), 0);
  summary.innerHTML = `
    <div class="inventory-summary">
      <div class="inventory-metric"><span>На складе</span><b>${units} ед.</b></div>
      <div class="inventory-metric"><span>Себестоимость</span><b>${KZT.format(value)}</b></div>
      <div class="inventory-metric"><span>Низкий остаток</span><b>${low}</b></div>
      <div class="inventory-metric"><span>Приход сегодня</span><b>+${receiptsToday}</b></div>
    </div>
    <div class="inventory-toolbar"><button class="btn" type="button" id="inventory-open-journal">Журнал движения</button></div>`;
  summary.querySelector("#inventory-open-journal")?.addEventListener("click", () => openHistory(null));
}

function isToday(date) {
  if (!date) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function openOperation(productId, type) {
  const product = products.get(productId);
  if (!product) return toast("Товар не найден");
  ensureModal();
  const root = document.querySelector("#inventory-modal-root");
  const title = movementLabel(type);
  const current = Number(product.stock || 0);
  root.hidden = false;
  root.innerHTML = `<div class="inventory-modal-backdrop">
    <section class="inventory-modal">
      <div class="inventory-modal-head"><div><h2>${title}</h2><div class="sub">${escapeHtml(product.name || PRODUCT_NAMES[productId] || productId)} · сейчас ${current} ед.</div></div><button class="inventory-close" type="button">×</button></div>
      <form class="inventory-form" id="inventory-operation-form">
        <input type="hidden" name="productId" value="${productId}"><input type="hidden" name="type" value="${type}">
        <label>${type === "adjustment" ? "Новый фактический остаток" : "Количество"}<input name="qty" type="number" min="${type === "adjustment" ? 0 : 1}" step="1" required inputmode="numeric" placeholder="0"></label>
        <label data-purchase-row ${type === "receipt" ? "" : "hidden"}>Закупочная цена за 1 шт., ₸<input name="purchasePrice" type="number" min="0" step="1" inputmode="decimal" value="${Number(product.lastPurchasePrice || 0)}"></label>
        <label>Причина / комментарий<textarea name="reason" rows="3" maxlength="240" placeholder="Например: поступление от поставщика, брак, инвентаризация"></textarea></label>
        <div class="inventory-before-after"><div><span>До</span><b>${current}</b></div><div><span>После</span><b id="inventory-preview-after">${current}</b></div></div>
        <button class="btn primary full" type="submit">Сохранить операцию</button><p class="error" id="inventory-operation-error"></p>
      </form>
    </section></div>`;
  root.querySelector(".inventory-close")?.addEventListener("click", closeModal);
  root.querySelector(".inventory-modal-backdrop")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) closeModal(); });
  const form = root.querySelector("#inventory-operation-form");
  const qty = form.elements.qty;
  qty.addEventListener("input", () => {
    const value = Number(qty.value || 0);
    const after = type === "receipt" ? current + value : type === "writeoff" ? current - value : value;
    root.querySelector("#inventory-preview-after").textContent = String(after);
  });
  form.addEventListener("submit", submitOperation);
  setTimeout(() => qty.focus(), 80);
}

async function submitOperation(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const submit = event.submitter;
  const errorNode = form.querySelector("#inventory-operation-error");
  errorNode.textContent = "";
  const productId = form.elements.productId.value;
  const type = form.elements.type.value;
  const qty = Number(form.elements.qty.value || 0);
  const purchasePrice = Number(form.elements.purchasePrice.value || 0);
  const reason = form.elements.reason.value.trim();
  if (!Number.isInteger(qty) || qty < (type === "adjustment" ? 0 : 1)) {
    errorNode.textContent = "Укажите корректное количество.";
    return;
  }
  submit.disabled = true;
  try {
    const productRef = doc(db, "products", productId);
    const movementRef = doc(collection(db, "stockMovements"));
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(productRef);
      if (!snap.exists()) throw new Error("Товар не найден.");
      const data = snap.data();
      const before = Number(data.stock || 0);
      const after = type === "receipt" ? before + qty : type === "writeoff" ? before - qty : qty;
      const delta = after - before;
      if (after < 0) throw new Error(`Нельзя списать ${qty}: на складе только ${before}.`);
      if (delta === 0) throw new Error("Остаток не изменился.");

      const productUpdate = { stock: after, updatedAt: serverTimestamp(), updatedBy: user.uid };
      if (type === "receipt") {
        const oldAvg = Number(data.averagePurchasePrice || 0);
        const oldUnits = before;
        const newAvg = after > 0 ? ((oldAvg * oldUnits) + (purchasePrice * qty)) / after : purchasePrice;
        productUpdate.lastPurchasePrice = purchasePrice;
        productUpdate.averagePurchasePrice = Math.round(newAvg * 100) / 100;
      }
      tx.update(productRef, productUpdate);
      tx.set(movementRef, {
        productId,
        productName: data.name || PRODUCT_NAMES[productId] || productId,
        type,
        qty: type === "adjustment" ? Math.abs(delta) : qty,
        delta,
        before,
        after,
        purchasePrice: type === "receipt" ? purchasePrice : null,
        totalCost: type === "receipt" ? purchasePrice * qty : null,
        reason,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByEmail: user.email || ""
      });
    });
    closeModal();
    toast(`${movementLabel(type)} сохранено`);
  } catch (error) {
    errorNode.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
}

function openHistory(productId) {
  ensureModal();
  const root = document.querySelector("#inventory-modal-root");
  const rows = productId ? movements.filter((m) => m.productId === productId) : movements;
  const product = productId ? products.get(productId) : null;
  root.hidden = false;
  root.innerHTML = `<div class="inventory-modal-backdrop"><section class="inventory-modal">
    <div class="inventory-modal-head"><div><h2>${productId ? "История товара" : "Журнал движения"}</h2><div class="sub">${productId ? escapeHtml(product?.name || productId) : `Последние ${rows.length} операций`}</div></div><button class="inventory-close" type="button">×</button></div>
    <div class="movement-list">${rows.length ? rows.map(movementCard).join("") : `<div class="empty">Операций пока нет.</div>`}</div>
  </section></div>`;
  root.querySelector(".inventory-close")?.addEventListener("click", closeModal);
  root.querySelector(".inventory-modal-backdrop")?.addEventListener("click", (e) => { if (e.target === e.currentTarget) closeModal(); });
}

function movementCard(m) {
  const date = toDate(m.createdAt);
  const delta = Number(m.delta || 0);
  return `<article class="movement-card">
    <div class="movement-top"><div><div class="movement-title">${escapeHtml(m.productName || m.productId)} · ${movementLabel(m.type)}</div><div class="movement-meta">${date ? date.toLocaleString("ru-KZ") : "только что"} · ${escapeHtml(m.createdByEmail || "")}</div></div><div class="movement-delta ${delta >= 0 ? "plus" : "minus"}">${movementSign(delta)}</div></div>
    <div class="movement-bottom"><div class="movement-meta">${Number(m.before || 0)} → ${Number(m.after || 0)}</div></div>
    ${m.reason ? `<div class="movement-reason">${escapeHtml(m.reason)}</div>` : ""}
    ${m.purchasePrice != null ? `<div class="movement-cost">Закупка ${KZT.format(Number(m.purchasePrice || 0))}/шт. · сумма ${KZT.format(Number(m.totalCost || 0))}</div>` : ""}
  </article>`;
}

async function quickAdjustment(button) {
  if (!db || !user) return;
  const productId = button.dataset.stock;
  const delta = Number(button.dataset.delta || 0);
  if (!productId || !delta) return;
  button.disabled = true;
  try {
    const productRef = doc(db, "products", productId);
    const movementRef = doc(collection(db, "stockMovements"));
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(productRef);
      if (!snap.exists()) throw new Error("Товар не найден");
      const data = snap.data();
      const before = Number(data.stock || 0);
      const after = Math.max(0, before + delta);
      const actualDelta = after - before;
      if (!actualDelta) throw new Error("Остаток не изменился");
      tx.update(productRef, { stock: after, updatedAt: serverTimestamp(), updatedBy: user.uid });
      tx.set(movementRef, {
        productId,
        productName: data.name || PRODUCT_NAMES[productId] || productId,
        type: "quick",
        qty: Math.abs(actualDelta),
        delta: actualDelta,
        before,
        after,
        purchasePrice: null,
        totalCost: null,
        reason: "Быстрая корректировка",
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        createdByEmail: user.email || ""
      });
    });
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

function bindGlobalActions() {
  document.addEventListener("click", (event) => {
    const op = event.target.closest("[data-inventory-op]");
    if (op) return openOperation(op.dataset.productId, op.dataset.inventoryOp);
    const history = event.target.closest("[data-inventory-history]");
    if (history) return openHistory(history.dataset.inventoryHistory);
  });

  // Capture legacy +1/+10 controls before app.js so every stock change is journaled.
  document.addEventListener("click", (event) => {
    const legacy = event.target.closest("[data-stock][data-delta]");
    if (!legacy) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    quickAdjustment(legacy);
  }, true);
}

function watchStockDom() {
  observer?.disconnect();
  const target = document.querySelector("#view-stock");
  if (!target) return;
  observer = new MutationObserver(() => queueMicrotask(enhanceStockCards));
  observer.observe(target, { childList: true, subtree: true });
  enhanceStockCards();
}

function startRealtime() {
  unsubProducts?.();
  unsubMovements?.();
  unsubProducts = onSnapshot(query(collection(db, "products"), orderBy("sort")), (snap) => {
    products = new Map(snap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    queueMicrotask(enhanceStockCards);
  });
  unsubMovements = onSnapshot(query(collection(db, "stockMovements"), orderBy("createdAt", "desc"), limit(250)), (snap) => {
    movements = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    ensureSummary();
  }, (error) => {
    if (error.code === "permission-denied") toast("Нужно опубликовать обновлённые Firestore Rules для журнала склада");
  });
}

function start() {
  ensureStyles();
  ensureModal();
  bindGlobalActions();
  watchStockDom();
  const app = getApps()[0];
  if (!app) return;
  const auth = getAuth(app);
  db = getFirestore(app);
  onAuthStateChanged(auth, (currentUser) => {
    user = currentUser;
    if (!user) {
      unsubProducts?.(); unsubMovements?.();
      return;
    }
    startRealtime();
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
