import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { LEGACY_CATALOG_SEED, LEGACY_VARIANT_DEFAULTS, runtimeModels } from "./catalog-core.js";
import { createCatalogService } from "./catalog-service.js";
import { createWarehouseDomain } from "./warehouse-domain.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const KZT = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 });
const MODELS = LEGACY_CATALOG_SEED;
const defaults = LEGACY_VARIANT_DEFAULTS;

const movementLabels = {
  receipt: "Поступление",
  writeoff: "Списание",
  adjustment: "Инвентаризация",
  sale: "Продажа",
  sale_return: "Возврат продажи"
};

const state = {
  auth: null,
  db: null,
  user: null,
  staffName: "Сотрудник",
  catalog: [],
  products: [],
  sales: [],
  movements: [],
  cashBalance: null,
  cashWithdrawals: [],
  saleOpenModelId: null,
  saleQuantities: new Map(),
  operation: null,
  modelDialogId: null,
  unsubs: []
};

function config() { return window.CONDUCTOR_FIREBASE_CONFIG || null; }

async function loadStaffClaims(user) {
  const token = await user.getIdTokenResult(true);
  if (token.claims?.warehouseStaff !== true) return null;
  const name = String(token.claims?.warehouseName || "").trim();
  return { name: name || "Сотрудник" };
}

function currentEmployeeName() {
  return state.staffName || "Сотрудник";
}

const catalogService = createCatalogService({ state, currentEmployeeName });
const warehouseDomain = createWarehouseDomain({ state, currentEmployeeName });
const ensureProducts = () => catalogService.ensureProducts();
const ensureCashBalance = () => warehouseDomain.ensureCashBalance();
const commitSale = (payload) => warehouseDomain.commitSale(payload);
const cancelSale = (saleId) => warehouseDomain.cancelSale(saleId);
function models() { return runtimeModels(state.catalog, state.products); }

function toast(message) {
  const node = $("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2400);
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function dateOf(item) {
  if (item.createdAt?.toDate) return item.createdAt.toDate();
  if (item.createdAtClient) return new Date(item.createdAtClient);
  return new Date(0);
}

function isToday(date) {
  if (!date || Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function formatDate(date) {
  if (!date || Number.isNaN(date.getTime()) || !date.getTime()) return "—";
  return date.toLocaleString("ru-KZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function showOnly(selector) {
  ["#login", "#app"].forEach((id) => $(id)?.classList.add("hidden"));
  $(selector)?.classList.remove("hidden");
}

let bootHideTimer = 0;
let bootVisibleAt = performance.now();
let backgroundedAt = 0;

function showBoot(minDisplayMs = 1800) {
  const boot = $("#boot");
  if (!boot) return;
  clearTimeout(bootHideTimer);
  boot.dataset.minDisplayMs = String(minDisplayMs);
  bootVisibleAt = performance.now();
  boot.classList.remove("hide");
}

function hideBoot() {
  const boot = $("#boot");
  if (!boot) return;
  const minDisplayMs = Number(boot.dataset.minDisplayMs || 0);
  const delay = Math.max(0, minDisplayMs - (performance.now() - bootVisibleAt));
  clearTimeout(bootHideTimer);
  bootHideTimer = window.setTimeout(() => boot.classList.add("hide"), delay);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    backgroundedAt = Date.now();
    return;
  }
  if (backgroundedAt && Date.now() - backgroundedAt >= 800) {
    showBoot(1800);
    hideBoot();
  }
  backgroundedAt = 0;
});

window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  showBoot(1800);
  hideBoot();
});

function modelById(modelId) { return models().find((model) => model.id === modelId); }
function variantDefaults(modelId) { return defaults.filter((item) => item.modelId === modelId); }
function modelVariants(modelId) {
  return state.products
    .filter((item) => item.modelId === modelId && !item.legacyUnassigned && item.active !== false && !item.modelOnly)
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0));
}
function modelSalePrice(modelId) {
  const catalogPrice = Number(state.catalog.find((item) => item.id === modelId)?.price || 0);
  if (catalogPrice > 0) return catalogPrice;
  return Number(modelById(modelId)?.price || 0);
}
function selectedModelQuantity(modelId) {
  return modelVariants(modelId).reduce((sum, product) => sum + Number(state.saleQuantities.get(product.id) || 0), 0);
}
function salePriceForQuantity(modelId, quantity) {
  if (modelId !== "HOLI") return modelSalePrice(modelId);
  if (quantity > 2000) return 650;
  if (quantity >= 500) return 850;
  return modelSalePrice(modelId);
}
function unassignedForModel(modelId) { return state.products.find((item) => item.modelId === modelId && item.legacyUnassigned && Number(item.stock || 0) > 0); }
function visibleInventory() { return state.products.filter((item) => item.active !== false && !item.modelOnly); }
function totalUnits() { return visibleInventory().reduce((sum, item) => sum + Number(item.stock || 0), 0); }
function stockValue() { return visibleInventory().reduce((sum, item) => sum + Number(item.stock || 0) * modelSalePrice(item.modelId || item.id), 0); }
function historicalCashBalance() {
  const revenue = state.sales.filter((sale) => sale.status !== "cancelled").reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const withdrawn = state.cashWithdrawals.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  return revenue - withdrawn;
}
function availableCash() { return state.cashBalance == null ? historicalCashBalance() : Number(state.cashBalance || 0); }
function colorDot(product) { return product.colorHex ? `<span class="color-dot" style="background:${escapeHtml(product.colorHex)}"></span>` : ""; }

function stopRealtime() {
  state.unsubs.forEach((fn) => fn?.());
  state.unsubs = [];
}

function startRealtime(onInitialData) {
  stopRealtime();
  const initialCollections = new Set(["catalog", "products", "orders", "movements", "cash", "withdrawals"]);
  let initialDataDelivered = false;
  const markInitialCollection = (name) => {
    initialCollections.delete(name);
    if (!initialCollections.size && !initialDataDelivered) {
      initialDataDelivered = true;
      onInitialData?.();
    }
  };
  state.unsubs.push(onSnapshot(collection(state.db, "catalog"), (snap) => {
    state.catalog = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderProducts();
    renderStock();
    renderDashboard();
    if ($("#model-dialog")?.open && state.modelDialogId) renderModelDialog(state.modelDialogId);
    markInitialCollection("catalog");
  }, (error) => { toast(`Каталог: ${error.message}`); markInitialCollection("catalog"); }));
  state.unsubs.push(onSnapshot(query(collection(state.db, "products"), orderBy("sort")), (snap) => {
    state.products = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderProducts();
    renderStock();
    renderDashboard();
    if ($("#model-dialog")?.open && state.modelDialogId) renderModelDialog(state.modelDialogId);
    markInitialCollection("products");
  }, (error) => { toast(`Склад: ${error.message}`); markInitialCollection("products"); }));

  state.unsubs.push(onSnapshot(query(collection(state.db, "orders"), orderBy("createdAt", "desc")), (snap) => {
    state.sales = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderSales();
    renderDashboard();
    window.dispatchEvent(new CustomEvent("conductor:orders-changed", { detail: { count: state.sales.length } }));
    markInitialCollection("orders");
  }, (error) => { toast(`Продажи: ${error.message}`); markInitialCollection("orders"); }));

  state.unsubs.push(onSnapshot(query(collection(state.db, "stockMovements"), orderBy("createdAt", "desc"), limit(500)), (snap) => {
    state.movements = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderMovements();
    renderDashboard();
    markInitialCollection("movements");
  }, (error) => { toast(`Журнал: ${error.message}`); markInitialCollection("movements"); }));

  state.unsubs.push(onSnapshot(doc(state.db, "finance", "cash"), (snap) => {
    state.cashBalance = snap.exists() ? Number(snap.data().balance || 0) : null;
    renderCash();
    markInitialCollection("cash");
  }, (error) => { toast(`Касса: ${error.message}`); markInitialCollection("cash"); }));

  state.unsubs.push(onSnapshot(query(collection(state.db, "cashWithdrawals"), orderBy("createdAt", "desc"), limit(100)), (snap) => {
    state.cashWithdrawals = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderCash();
    markInitialCollection("withdrawals");
  }, (error) => { toast(`Выводы: ${error.message}`); markInitialCollection("withdrawals"); }));

}

function modelTotal(modelId) {
  const variants = modelVariants(modelId);
  const unassigned = unassignedForModel(modelId);
  return variants.reduce((sum, item) => sum + Number(item.stock || 0), 0) + Number(unassigned?.stock || 0);
}

function renderInventoryOverview() {
  const root = $("#inventory-overview");
  if (!root) return;
  root.innerHTML = models().map((model) => {
    const variants = modelVariants(model.id);
    const unassigned = unassignedForModel(model.id);
    return `<article class="inventory-overview-card">
      <div class="overview-model-head"><div><b>${escapeHtml(model.id)}</b><small>${escapeHtml(model.name)}</small></div></div>
      <div class="overview-colors">
        ${variants.map((item) => `<div class="overview-color"><span>${colorDot(item)}${escapeHtml(item.colorName)}</span><b class="${Number(item.stock || 0) <= Number(item.lowStock || 0) ? "low" : ""}">${Number(item.stock || 0)}</b></div>`).join("")}
        ${unassigned ? `<div class="overview-color warning"><span>⚠ Нераспределено</span><b>${Number(unassigned.stock || 0)}</b></div>` : ""}
      </div>
    </article>`;
  }).join("");
}

function renderDashboard() {
  const value = stockValue();
  const todaySales = state.sales.filter((sale) => sale.status !== "cancelled" && isToday(dateOf(sale)));
  const todayRevenue = todaySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);

  $("#metric-stock-value").textContent = KZT.format(value);
  $("#metric-sales").textContent = KZT.format(todayRevenue);
  renderCash();
  renderInventoryOverview();

  const recent = state.sales.slice(0, 4);
  $("#dashboard-sales").innerHTML = recent.length ? recent.map(saleCard).join("") : `<div class="empty">Продаж пока нет.</div>`;
  bindSaleActions($("#dashboard-sales"));
}

function renderCash() {
  const balance = availableCash();
  if ($("#metric-cash")) $("#metric-cash").textContent = KZT.format(balance);
  if ($("#cash-dialog-balance")) $("#cash-dialog-balance").textContent = KZT.format(balance);
  const history = $("#cash-withdrawal-history");
  if (!history) return;
  history.innerHTML = state.cashWithdrawals.length
    ? state.cashWithdrawals.slice(0, 10).map((item) => `<div class="cash-history-row"><div><b>${escapeHtml(item.createdByName || "Сотрудник")}</b><small>${formatDate(dateOf(item))}${item.comment ? ` · ${escapeHtml(item.comment)}` : ""}</small></div><strong>−${KZT.format(Number(item.amount || 0))}</strong></div>`).join("")
    : `<div class="empty">Выводов пока нет.</div>`;
}

function openCashDialog() {
  $("#cash-withdrawal-form").reset();
  $("#cash-withdrawal-error").textContent = "";
  $("#cash-withdrawal-amount").max = String(Math.max(0, Math.floor(availableCash())));
  renderCash();
  $("#cash-dialog").showModal();
}

async function withdrawCash(event) {
  event.preventDefault();
  const errorNode = $("#cash-withdrawal-error");
  const amount = Math.trunc(Number($("#cash-withdrawal-amount").value || 0));
  const comment = $("#cash-withdrawal-comment").value.trim();
  const submit = event.submitter;
  errorNode.textContent = "";
  if (amount <= 0) { errorNode.textContent = "Укажите сумму вывода больше нуля."; return; }
  submit.disabled = true;

  try {
    await ensureCashBalance();
    const cashRef = doc(state.db, "finance", "cash");
    const withdrawalRef = doc(collection(state.db, "cashWithdrawals"));
    const employee = currentEmployeeName();
    await runTransaction(state.db, async (tx) => {
      const cashSnap = await tx.get(cashRef);
      if (!cashSnap.exists()) throw new Error("Баланс кассы ещё не создан. Обновите страницу.");
      const before = Number(cashSnap.data().balance || 0);
      if (amount > before) throw new Error(`В кассе доступно только ${KZT.format(before)}.`);
      const after = before - amount;
      tx.update(cashRef, {
        balance: after,
        updatedAt: serverTimestamp(),
        updatedBy: state.user.uid,
        updatedByName: employee
      });
      tx.set(withdrawalRef, {
        amount,
        before,
        after,
        comment,
        createdAt: serverTimestamp(),
        createdAtClient: new Date().toISOString(),
        createdBy: state.user.uid,
        createdByName: employee
      });
    });
    $("#cash-dialog").close();
    toast(`Вывод ${KZT.format(amount)} зафиксирован · ${employee}`);
  } catch (error) { errorNode.textContent = error.message; }
  finally { submit.disabled = false; }
}

function saleItemLabel(item) {
  if (item.colorName) return `${escapeHtml(item.productId || "Товар")} · ${escapeHtml(item.colorName)}`;
  return escapeHtml(item.name || item.productId || "Товар");
}

function saleEmployee(sale) {
  return sale.createdByName || "Сотрудник";
}

function saleCard(sale) {
  const items = (sale.items || []).map((item) => `${saleItemLabel(item)} × ${Number(item.qty || 0)}`).join(" · ");
  const cancelled = sale.status === "cancelled";
  const note = sale.note || sale.notes || "";
  return `<article class="order-card">
    <div class="order-top">
      <div><div class="order-customer">Продажа #${escapeHtml(sale.id.slice(0, 8))}</div><div class="order-phone">Внёс: ${escapeHtml(saleEmployee(sale))}</div></div>
      <div class="order-total">${KZT.format(Number(sale.total || 0))}</div>
    </div>
    <div class="order-items">${items || "Без позиций"}${note ? `<br><span class="muted">${escapeHtml(note)}</span>` : ""}</div>
    <div class="order-bottom"><span class="status ${cancelled ? "cancelled" : "done"}">${cancelled ? "Отменена" : "Продажа"}</span><span class="order-meta">${formatDate(dateOf(sale))}</span></div>
    ${cancelled ? "" : `<div class="order-actions"><button data-cancel-sale="${sale.id}">Отменить и вернуть товар</button></div>`}
  </article>`;
}

function renderSales() {
  const valid = state.sales.filter((sale) => sale.status !== "cancelled");
  const total = valid.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const today = valid.filter((sale) => isToday(dateOf(sale)));
  $("#sales-summary").innerHTML = `<div class="summary-line"><span>Всего записей</span><b>${state.sales.length}</b></div><div class="summary-line"><span>Продаж сегодня</span><b>${today.length}</b></div><div class="summary-line"><span>Сумма активных продаж</span><b>${KZT.format(total)}</b></div>`;
  $("#sales-list").innerHTML = state.sales.length ? state.sales.map(saleCard).join("") : `<div class="empty">Продаж пока нет.</div>`;
  bindSaleActions($("#sales-list"));
}

function bindSaleActions(root) {
  root?.querySelectorAll("[data-cancel-sale]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Отменить продажу и вернуть весь товар на склад?")) return;
      button.disabled = true;
      try {
        await cancelSale(button.dataset.cancelSale);
        toast("Продажа отменена, товар возвращён");
      } catch (error) { toast(error.message); }
      finally { button.disabled = false; }
    });
  });
}

function renderProducts() {
  for (const [inventoryId, qty] of state.saleQuantities) {
    const product = state.products.find((item) => item.id === inventoryId && item.active !== false);
    const available = Number(product?.stock || 0);
    if (!product || available <= 0) state.saleQuantities.delete(inventoryId);
    else if (qty > available) state.saleQuantities.set(inventoryId, available);
  }

  let html = `<div class="sale-model-list">`;
  for (const model of models()) {
    const variants = modelVariants(model.id);
    if (!variants.length) continue;
    const isOpen = state.saleOpenModelId === model.id;
    const totalStock = variants.reduce((sum, item) => sum + Number(item.stock || 0), 0);
    const selectedQty = selectedModelQuantity(model.id);
    const selectedUnitPrice = salePriceForQuantity(model.id, selectedQty);
    const selectedTotal = selectedQty * selectedUnitPrice;
    const tierHint = model.id === "HOLI" ? `<small class="sale-tier-hint">500–2000 шт. — 850 ₸ · от 2001 шт. — 650 ₸</small>` : "";
    html += `<section class="sale-model-card${isOpen ? " active" : ""}">
      <button class="sale-model-toggle" type="button" data-sale-model="${model.id}" aria-expanded="${isOpen}" aria-controls="sale-model-${model.id}">
        <span class="sale-model-title"><b>${escapeHtml(model.name)}</b><small>${variants.length} цветов · ${totalStock} ед. на складе</small>${tierHint}</span>
        <span class="sale-model-price"><b data-sale-model-price="${model.id}">${KZT.format(selectedUnitPrice)}</b><small data-sale-model-selected="${model.id}">${selectedQty ? `${selectedQty} ед. · ${KZT.format(selectedUnitPrice)}/шт. · ${KZT.format(selectedTotal)}` : "Выбрать цвет"}</small></span>
        <span class="sale-model-arrow" aria-hidden="true">${isOpen ? "−" : "+"}</span>
      </button>`;
    if (isOpen) html += `<div class="sale-model-variants" id="sale-model-${model.id}">${variants.map((product) => {
      const stock = Number(product.stock || 0);
      const qty = Number(state.saleQuantities.get(product.id) || 0);
      return `<div class="sale-product">
      <div class="sale-product-name"><b>${colorDot(product)}${escapeHtml(product.colorName)}</b><small>${model.id === "HOLI" ? "Цена по общему количеству" : KZT.format(modelSalePrice(model.id))} · остаток ${Number(product.stock || 0)}</small></div>
      <div class="qty-control">
        <button type="button" data-qty-minus="${product.id}"${stock ? "" : " disabled"}>−</button>
        <input type="number" min="0" max="${stock}" value="${qty}" inputmode="numeric" data-qty="${product.id}" aria-label="Количество: ${escapeHtml(product.colorName)}"${stock ? "" : " disabled"}>
        <button type="button" data-qty-plus="${product.id}"${stock ? "" : " disabled"}>+</button>
      </div>
    </div>`;
    }).join("")}</div>`;
    html += `</section>`;
  }
  html += `</div>`;
  $("#sale-products").innerHTML = html === `<div class="sale-model-list"></div>` ? `<div class="empty">Товары загружаются…</div>` : html;
  $$('[data-sale-model]').forEach((button) => button.addEventListener("click", () => {
    state.saleOpenModelId = state.saleOpenModelId === button.dataset.saleModel ? null : button.dataset.saleModel;
    renderProducts();
  }));
  $$('[data-qty-minus]').forEach((button) => button.addEventListener("click", () => changeSaleQty(button.dataset.qtyMinus, -1)));
  $$('[data-qty-plus]').forEach((button) => button.addEventListener("click", () => changeSaleQty(button.dataset.qtyPlus, 1)));
  $$('[data-qty]').forEach((input) => input.addEventListener("input", () => setSaleQty(input.dataset.qty, input.value)));
  updateSaleTotal();
}

function setSaleQty(inventoryId, rawQty) {
  const product = state.products.find((item) => item.id === inventoryId);
  if (!product) return;
  const qty = Math.max(0, Math.min(Number(product.stock || 0), Math.trunc(Number(rawQty) || 0)));
  if (qty) state.saleQuantities.set(inventoryId, qty);
  else state.saleQuantities.delete(inventoryId);
  const input = document.querySelector(`[data-qty="${CSS.escape(inventoryId)}"]`);
  if (input && Number(input.value) !== qty) input.value = String(qty);
  updateSaleTotal();
}

function changeSaleQty(inventoryId, delta) {
  const product = state.products.find((item) => item.id === inventoryId);
  if (!product) return;
  setSaleQty(inventoryId, Number(state.saleQuantities.get(inventoryId) || 0) + delta);
}

function selectedItems() {
  return state.products.map((product) => {
    const qty = Number(state.saleQuantities.get(product.id) || 0);
    if (qty <= 0) return null;
    const modelId = product.modelId || product.id;
    const price = salePriceForQuantity(modelId, selectedModelQuantity(modelId));
    return {
      inventoryId: product.id,
      productId: modelId,
      name: product.name,
      colorId: product.colorId || "",
      colorName: product.colorName || "",
      qty,
      price,
      lineTotal: qty * price
    };
  }).filter(Boolean);
}

function updateSaleTotal() {
  const items = selectedItems();
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const formatted = KZT.format(total);
  $("#sale-total").textContent = formatted;
  if ($("#sale-header-total")) $("#sale-header-total").textContent = formatted;
  for (const model of models()) {
    const modelItems = items.filter((item) => item.productId === model.id);
    const qty = modelItems.reduce((sum, item) => sum + item.qty, 0);
    const subtotal = modelItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const unitPrice = salePriceForQuantity(model.id, qty);
    const priceNode = document.querySelector(`[data-sale-model-price="${model.id}"]`);
    const summary = document.querySelector(`[data-sale-model-selected="${model.id}"]`);
    if (priceNode) priceNode.textContent = KZT.format(unitPrice);
    if (summary) summary.textContent = qty ? `${qty} ед. · ${KZT.format(unitPrice)}/шт. · ${KZT.format(subtotal)}` : "Выбрать цвет";
  }
}

function finalizeSale(result) {
  $("#sale-form")?.reset();
  state.saleQuantities.clear();
  state.saleOpenModelId = null;
  renderProducts();
  toast(result?.pushResult?.configured && !result?.pushResult?.delivered
    ? "Продажа записана · push временно не отправлен"
    : `Продажа записана · ${result?.employee || currentEmployeeName()}`);
  navigate("sales");
}

async function createSale(event) {
  event.preventDefault();
  const errorNode = $("#sale-error");
  if (errorNode) errorNode.textContent = "";
  const items = selectedItems();
  if (!items.length) {
    if (errorNode) errorNode.textContent = "Укажите количество хотя бы одного товара.";
    return;
  }

  const note = $("#sale-notes").value.trim();
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const submit = event.submitter || event.target.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  try {
    const result = await commitSale({ items, note, total });
    finalizeSale(result);
  } catch (error) {
    if (errorNode) errorNode.textContent = friendlyError(error);
  } finally {
    if (submit) submit.disabled = false;
  }
}

function initializedInventoryIds() {
  const ids = new Set(state.movements.map((item) => item.inventoryId).filter(Boolean));
  for (const product of state.products) {
    if (product.stockInitialized === true
      || product.inventoryInitialized === true
      || Number(product.stock || 0) > 0) ids.add(product.id);
  }
  return ids;
}

function compactColorSummary(modelId) {
  const variants = modelVariants(modelId);
  const unassigned = unassignedForModel(modelId);
  const initialized = initializedInventoryIds();
  const rows = variants.map((item) => {
    const ready = initialized.has(item.id) || item.virtual;
    const value = ready ? String(Number(item.stock || 0)) : "—";
    return `<span>${colorDot(item)}${escapeHtml(item.colorName)} <b class="${ready ? "" : "inventory-not-set"}">${value}</b></span>`;
  }).join("");
  return `<div class="stock-color-summary">${rows}${unassigned ? `<span class="warning">⚠ Нераспр. <b>${Number(unassigned.stock || 0)}</b></span>` : ""}</div>`;
}

function renderStock() {
  const value = stockValue();
  $("#stock-sku-count").textContent = String(models().length);
  $("#stock-value").textContent = KZT.format(value);

  $("#stock-list").innerHTML = models().map((model) => `<article class="stock-card stock-model-card">
    <div class="stock-main">
      <div class="stock-name"><b>${escapeHtml(model.name)}</b><small>${modelVariants(model.id).length} цветов · цена ${KZT.format(modelSalePrice(model.id))}</small></div>
    </div>
    ${compactColorSummary(model.id)}
    <button class="btn full model-balance-btn" data-open-model="${model.id}">Цвета и актуальные остатки</button>
  </article>`).join("");

  $$('[data-open-model]').forEach((button) => button.addEventListener("click", () => openModelDialog(button.dataset.openModel)));
}

function movementEmployee(movement) {
  return movement.createdByName || "Сотрудник";
}

function renderMovements() {
  $("#movement-list").innerHTML = state.movements.length ? state.movements.map((movement) => {
    const delta = Number(movement.qtyDelta || 0);
    const sign = delta > 0 ? "+" : "";
    const reason = movement.reason ? `<div class="movement-reason">${escapeHtml(movement.reason)}</div>` : "";
    const title = movement.colorName ? `${escapeHtml(movement.productId || "Товар")} · ${escapeHtml(movement.colorName)}` : escapeHtml(movement.productName || movement.productId);
    return `<article class="movement-card">
      <div class="movement-top"><div><b>${title}</b><small>${movementLabels[movement.type] || escapeHtml(movement.type || "Операция")} · ${escapeHtml(movementEmployee(movement))}</small></div><strong class="${delta < 0 ? "negative" : "positive"}">${sign}${delta}</strong></div>
      <div class="movement-meta"><span>${Number(movement.before || 0)} → ${Number(movement.after || 0)}</span><span>${formatDate(dateOf(movement))}</span></div>
      ${reason}
    </article>`;
  }).join("") : `<div class="empty">Движений склада пока нет.</div>`;
}

function friendlyError(error) {
  if (error?.code === "permission-denied" || String(error?.message || "").toLowerCase().includes("permission")) {
    return "Firebase отклонил сохранение: проверьте доступ аккаунта и публикацию актуальных Firestore Rules.";
  }
  return error?.message || "Не удалось сохранить изменения.";
}

function renderModelDialog(modelId) {
  const model = modelById(modelId);
  if (!model) return;
  const variants = modelVariants(modelId);
  const unassigned = unassignedForModel(modelId);
  const initialized = initializedInventoryIds();
  $("#model-dialog-title").textContent = model.name;
  $("#model-dialog-total").textContent = `Всего по модели: ${modelTotal(modelId)} ед. · внесите фактические остатки по цветам`;

  const priceRow = `<label class="model-sale-price-row">Цена продажи модели, ₸<input id="model-sale-price" type="number" min="1" step="1" inputmode="numeric" required value="${Math.trunc(modelSalePrice(modelId))}"></label>`;
  const variantRows = variants.map((item) => {
    const ready = initialized.has(item.id) || item.virtual;
    const current = ready ? String(Number(item.stock || 0)) : "не внесено";
    const value = ready ? String(Number(item.stock || 0)) : "";
    const actions = item.virtual
      ? `<div class="model-variant-actions model-variant-actions-disabled" title="Сначала сохраните фактический остаток">—</div>`
      : `<div class="model-variant-actions"><button type="button" data-variant-op="receipt" data-product-id="${item.id}">＋</button><button type="button" data-variant-op="writeoff" data-product-id="${item.id}">−</button></div>`;
    return `<div class="model-variant-row">
      <div class="model-variant-info"><span>${colorDot(item)}</span><div><b>${escapeHtml(item.colorName)}</b><small>Сейчас: ${current}</small></div></div>
      <input type="number" min="0" step="1" inputmode="numeric" value="${value}" data-model-balance="${item.id}" aria-label="${escapeHtml(item.colorName)}">
      ${actions}
    </div>`;
  }).join("");
  const unassignedRow = unassigned ? `<div class="model-variant-row unassigned-row">
    <div class="model-variant-info"><span>⚠</span><div><b>Нераспределено</b><small>Старый общий остаток</small></div></div>
    <input type="number" min="0" step="1" inputmode="numeric" value="${Number(unassigned.stock || 0)}" data-model-balance="${unassigned.id}" aria-label="Нераспределено">
    <div></div>
  </div>` : "";
  $("#model-variant-list").innerHTML = priceRow + variantRows + unassignedRow;

  $$('[data-variant-op]').forEach((button) => button.addEventListener("click", () => {
    $("#model-dialog").close();
    openStockDialog(button.dataset.productId, button.dataset.variantOp);
  }));
}

function openModelDialog(modelId) {
  state.modelDialogId = modelId;
  $("#model-balance-reason").value = "";
  $("#model-balance-error").textContent = "";
  renderModelDialog(modelId);
  $("#model-dialog").showModal();
}

async function saveModelBalances(event) {
  event.preventDefault();
  const modelId = state.modelDialogId;
  const model = modelById(modelId);
  if (!model) return;

  const errorNode = $("#model-balance-error");
  const submit = event.submitter || event.target.querySelector('button[type="submit"]');
  if (errorNode) errorNode.textContent = "";

  const price = Math.trunc(Number($("#model-sale-price")?.value));
  if (!Number.isInteger(price) || price <= 0) {
    if (errorNode) errorNode.textContent = "Укажите цену продажи модели больше нуля.";
    return;
  }

  const inputs = $$('[data-model-balance]');
  const invalid = inputs.some((input) => input.value.trim() !== "" && (!Number.isInteger(Number(input.value)) || Number(input.value) < 0));
  if (invalid) {
    if (errorNode) errorNode.textContent = "Остаток должен быть целым числом не меньше нуля.";
    return;
  }

  const desired = inputs.map((input) => ({
    id: input.dataset.modelBalance,
    raw: input.value.trim(),
    stock: Math.trunc(Number(input.value))
  })).filter((item) => item.raw !== "" && Number.isInteger(item.stock) && item.stock >= 0);

  const existingById = new Map(state.products.map((item) => [item.id, item]));
  const templates = new Map(variantDefaults(modelId).map((item) => [item.id, item]));
  const catalogRow = state.catalog.find((item) => item.id === modelId);
  const storedPrice = Number(catalogRow?.price || model.price);
  const priceChanged = storedPrice !== price;
  const productChanged = desired.some((item) => {
    const current = existingById.get(item.id);
    return !current || Number(current.stock || 0) !== item.stock || current.active === false || current.modelOnly === true;
  });

  if (!priceChanged && !productChanged) {
    if (errorNode) errorNode.textContent = "Цена и остатки не изменились.";
    return;
  }

  if (submit) submit.disabled = true;
  const employee = currentEmployeeName();
  const reason = $("#model-balance-reason").value.trim() || `Инвентаризация ${modelId}`;

  try {
    const productRefs = desired.map((item) => doc(state.db, "products", item.id));
    const catalogRef = doc(state.db, "catalog", modelId);
    await runTransaction(state.db, async (tx) => {
      const snaps = [];
      for (const ref of productRefs) snaps.push(await tx.get(ref));

      for (let index = 0; index < desired.length; index += 1) {
        const desiredItem = desired[index];
        const ref = productRefs[index];
        const snap = snaps[index];
        const template = templates.get(desiredItem.id);
        const before = snap.exists() ? Number(snap.data().stock || 0) : 0;
        const after = desiredItem.stock;

        if (!snap.exists()) {
          if (!template) throw new Error(`${desiredItem.id}: позиция не найдена`);
          tx.set(ref, {
            id: template.id,
            modelId: template.modelId,
            colorId: template.colorId,
            colorName: template.colorName,
            colorHex: template.colorHex,
            name: template.name,
            stock: after,
            lowStock: template.lowStock,
            sort: template.sort,
            active: true,
            createdAt: serverTimestamp(),
            createdBy: state.user.uid,
            createdByName: employee,
            updatedAt: serverTimestamp(),
            updatedBy: state.user.uid,
            updatedByName: employee
          });
        } else {
          const data = snap.data();
          const update = {
            stock: after,
            stockInitialized: true,
            inventoryInitialized: true,
            lastInventoryAt: serverTimestamp(),
            lastInventoryBy: state.user.uid,
            lastInventoryByName: employee,
            updatedAt: serverTimestamp(),
            updatedBy: state.user.uid,
            updatedByName: employee
          };
          if (data.legacyUnassigned) update.active = after > 0;
          else if (data.active === false) update.active = true;
          if (data.modelOnly === true) update.modelOnly = false;
          tx.update(ref, update);
        }

        if (before !== after) {
          const data = snap.exists() ? snap.data() : template;
          const movementRef = doc(collection(state.db, "stockMovements"));
          tx.set(movementRef, {
            type: "adjustment",
            inventoryId: desiredItem.id,
            productId: data.modelId || modelId,
            productName: data.name || `${modelId} · ${data.colorName || "Нераспределено"}`,
            colorId: data.colorId || "",
            colorName: data.colorName || "",
            qtyDelta: after - before,
            before,
            after,
            unitCost: 0,
            totalCost: 0,
            reason,
            createdAt: serverTimestamp(),
            createdAtClient: new Date().toISOString(),
            createdBy: state.user.uid,
            createdByName: employee
          });
        }
      }

      tx.set(catalogRef, {
        modelId,
        name: model.name,
        price,
        updatedAt: serverTimestamp(),
        updatedBy: state.user.uid,
        updatedByName: employee
      }, { merge: true });
    });

    $("#model-dialog").close();
    toast(`${model.id}: цена и остатки сохранены · ${employee}`);
  } catch (error) {
    if (errorNode) errorNode.textContent = friendlyError(error);
  } finally {
    if (submit) submit.disabled = false;
  }
}

function openStockDialog(productId, type) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  state.operation = { productId, type };
  const titles = { receipt: "Поступление", writeoff: "Списание" };
  $("#stock-dialog-eyebrow").textContent = titles[type] || "Складская операция";
  $("#stock-dialog-title").textContent = product.name;
  $("#stock-current").textContent = `Сейчас на складе: ${Number(product.stock || 0)} ед.`;
  $("#stock-qty-label").firstChild.textContent = "Количество";
  $("#stock-operation-qty").value = "";
  $("#stock-operation-reason").value = "";
  $("#stock-operation-error").textContent = "";
  $("#stock-operation-submit").textContent = titles[type] || "Сохранить";
  $("#stock-dialog").showModal();
  setTimeout(() => $("#stock-operation-qty").focus(), 80);
}

async function applyStockOperation(event) {
  event.preventDefault();
  const operation = state.operation;
  if (!operation) return;
  const product = state.products.find((item) => item.id === operation.productId);
  if (!product) return;
  const qty = Math.trunc(Number($("#stock-operation-qty").value));
  const reason = $("#stock-operation-reason").value.trim();
  const errorNode = $("#stock-operation-error");
  errorNode.textContent = "";
  if (!Number.isFinite(qty) || qty <= 0) { errorNode.textContent = "Количество должно быть больше нуля."; return; }

  const employee = currentEmployeeName();
  const submit = $("#stock-operation-submit");
  submit.disabled = true;
  try {
    const productRef = doc(state.db, "products", operation.productId);
    const movementRef = doc(collection(state.db, "stockMovements"));
    await runTransaction(state.db, async (tx) => {
      const snap = await tx.get(productRef);
      if (!snap.exists()) throw new Error("Товар не найден");
      const data = snap.data();
      const before = Number(data.stock || 0);
      const delta = operation.type === "receipt" ? qty : -qty;
      if (before + delta < 0) throw new Error(`На складе только ${before} ед.`);
      const after = before + delta;
      tx.update(productRef, { stock: after, updatedAt: serverTimestamp(), updatedBy: state.user.uid, updatedByName: employee });
      tx.set(movementRef, {
        type: operation.type,
        inventoryId: operation.productId,
        productId: data.modelId || operation.productId,
        productName: data.name || product.name,
        colorId: data.colorId || "",
        colorName: data.colorName || "",
        qtyDelta: delta,
        before,
        after,
        unitCost: 0,
        totalCost: 0,
        reason,
        createdAt: serverTimestamp(),
        createdAtClient: new Date().toISOString(),
        createdBy: state.user.uid,
        createdByName: employee
      });
    });
    $("#stock-dialog").close();
    toast(`${operation.type === "receipt" ? "Поступление" : "Списание"} · ${employee}`);
  } catch (error) { errorNode.textContent = error.message; }
  finally { submit.disabled = false; }
}

function navigate(name) {
  $$(".view").forEach((view) => view.classList.remove("active"));
  $$(".nav-btn").forEach((button) => button.classList.toggle("active", button.dataset.nav === name));
  $(`#view-${name}`)?.classList.add("active");
  const subtitles = { dashboard: "Склад сегодня", sales: "История продаж", sale: "Фиксация продажи", stock: "Остатки и движения", settings: "Приложение" };
  $("#page-subtitle").textContent = subtitles[name] || "";
  if (name === "sale") renderProducts();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function resetPassword(email) {
  if (!email) throw new Error("Сначала укажите email.");
  await sendPasswordResetEmail(state.auth, email);
  toast("Письмо для смены пароля отправлено");
}

function wireUi() {
  $$('[data-nav]').forEach((button) => button.addEventListener("click", () => navigate(button.dataset.nav)));
  $("#sale-form").addEventListener("submit", (event) => {
    const confirmer = window.CONDUCTOR_SALE_CONFIRM;
    if (typeof confirmer === "function") {
      event.preventDefault();
      Promise.resolve(confirmer(event)).catch((error) => {
        const node = $("#sale-error");
        if (node) node.textContent = friendlyError(error);
      });
      return;
    }
    createSale(event);
  });
  $("#model-balance-form").addEventListener("submit", saveModelBalances);
  $("#model-dialog-close").addEventListener("click", () => $("#model-dialog").close());
  $("#stock-operation-form").addEventListener("submit", applyStockOperation);
  $("#stock-dialog-close").addEventListener("click", () => $("#stock-dialog").close());
  $("#open-cash-dialog").addEventListener("click", openCashDialog);
  $("#cash-withdrawal-form").addEventListener("submit", withdrawCash);
  $("#cash-dialog-close").addEventListener("click", () => $("#cash-dialog").close());

  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorNode = $("#login-error");
    errorNode.textContent = "";
    const submit = event.submitter;
    submit.disabled = true;
    try { await signInWithEmailAndPassword(state.auth, $("#email").value.trim(), $("#password").value); }
    catch (error) { errorNode.textContent = error.code === "auth/invalid-credential" ? "Неверный email или пароль." : error.message; }
    finally { submit.disabled = false; }
  });

  $("#reset-password-login").addEventListener("click", async () => {
    const errorNode = $("#login-error");
    errorNode.textContent = "";
    try { await resetPassword($("#email").value.trim()); } catch (error) { errorNode.textContent = error.message; }
  });
  $("#reset-password").addEventListener("click", async () => {
    try { await resetPassword(state.user?.email || ""); } catch (error) { toast(error.message); }
  });
  $("#logout").addEventListener("click", () => signOut(state.auth));
}

async function boot() {
  wireUi();
  const cfg = config();
  if (!cfg?.apiKey || !cfg?.authDomain || !cfg?.projectId || !cfg?.appId) {
    showOnly("#login");
    $("#login-error").textContent = "Firebase не настроен.";
    hideBoot();
    return;
  }

  try {
    const app = initializeApp(cfg);
    state.db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
    window.CONDUCTOR_FIRESTORE = state.db;
    state.auth = getAuth(app);
    await setPersistence(state.auth, browserLocalPersistence);

    onAuthStateChanged(state.auth, async (user) => {
      state.user = user;
      if (!user) {
        state.staffName = "Сотрудник";
        stopRealtime();
        showOnly("#login");
        hideBoot();
        return;
      }
      const staffClaims = await loadStaffClaims(user).catch(() => null);
      if (!staffClaims) {
        state.staffName = "Сотрудник";
        stopRealtime();
        showOnly("#login");
        $("#login-error").textContent = "У этой учётной записи нет доступа к складу.";
        hideBoot();
        signOut(state.auth);
        return;
      }
      state.staffName = staffClaims.name;
      const employee = currentEmployeeName();
      $("#current-user-name").textContent = employee;
      $("#current-user-email").textContent = user.email || "";
      $("#settings-name").textContent = employee;
      $("#settings-email").textContent = user.email || user.uid;
      $("#settings-project").textContent = cfg.projectId;
      try {
        await ensureProducts();
      } catch (error) {
        console.error("Product initialization failed", error);
        toast(`Товары: ${error.message}`);
      }
      if (state.user !== user) return;
      startRealtime(() => {
        if (state.user !== user) return;
        showOnly("#app");
        navigate("dashboard");
        hideBoot();
      });
      ensureCashBalance().catch((error) => toast(`Касса: ${error.message}`));
    });
  } catch (error) {
    showOnly("#login");
    $("#login-error").textContent = `Firebase: ${error.message}`;
    hideBoot();
  }
}


window.CONDUCTOR_APP_API = Object.freeze({
  getDb: () => state.db,
  getUser: () => state.user,
  getOrders: () => state.sales.map((item) => ({ ...item })),
  getSelectedItems: () => selectedItems().map((item) => ({ ...item })),
  getModelPrice: (modelId) => modelSalePrice(modelId),
  getCashBalance: () => availableCash(),
  currentEmployeeName,
  commitSale,
  cancelSale,
  finalizeSale,
  navigate,
  toast
});

boot();
