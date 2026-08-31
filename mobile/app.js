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
  getDocs,
  setDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  runTransaction
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const KZT = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 });
const STAFF_NAMES = new Map([
  ["mihagavr@gmail.com", "Михаил"],
  ["a.kalashin@gmail.com", "Алексей"]
]);

const MODELS = [
  {
    id: "DM30", name: "Цветной дым DM30", price: 2500, lowStock: 2, sort: 10,
    variants: [
      ["BLUE", "Синий", "#258cff"],
      ["YELLOW", "Жёлтый", "#ffd42a"],
      ["RED", "Красный", "#ff4545"],
      ["PURPLE", "Фиолетовый", "#9b59ff"],
      ["TURQUOISE", "Бирюзовый", "#27d3c3"]
    ]
  },
  {
    id: "DM60", name: "Цветной дым DM60", price: 3000, lowStock: 2, sort: 20,
    variants: [
      ["WHITE", "Белый", "#f4f5f7"],
      ["BLACK", "Чёрный", "#15171d"],
      ["YELLOW", "Жёлтый", "#ffd42a"],
      ["BLUE", "Синий", "#258cff"],
      ["PINK", "Розовый", "#ff6bab"],
      ["GREEN", "Зелёный", "#42c66b"],
      ["PURPLE", "Фиолетовый", "#9b59ff"],
      ["RED", "Красный", "#ff4545"]
    ]
  },
  {
    id: "DM90", name: "Цветной дым DM90", price: 3500, lowStock: 2, sort: 30,
    variants: [
      ["ORANGE", "Оранжевый", "#ff8b2d"],
      ["PURPLE", "Фиолетовый", "#9b59ff"],
      ["TURQUOISE", "Бирюзовый", "#27d3c3"],
      ["YELLOW", "Жёлтый", "#ffd42a"],
      ["PISTACHIO", "Фисташковый", "#9ecb68"],
      ["RED", "Красный", "#ff4545"]
    ]
  },
  {
    id: "HOLI", name: "Краски Холи", price: 1000, lowStock: 10, sort: 40,
    variants: [
      ["SCARLET", "Алый", "#ff3030"],
      ["RASPBERRY", "Малиновый", "#d92b70"],
      ["YELLOW", "Жёлтый", "#ffd42a"],
      ["BLUE", "Синий", "#258cff"],
      ["LIME", "Салатовый", "#8bdc45"],
      ["PURPLE", "Фиолетовый", "#9b59ff"],
      ["ORANGE", "Оранжевый", "#ff8b2d"],
      ["TURQUOISE", "Бирюзовый", "#27d3c3"]
    ]
  }
];

const defaults = MODELS.flatMap((model) => model.variants.map(([key, colorName, colorHex], index) => ({
  id: `${model.id}_${key}`,
  modelId: model.id,
  colorId: key.toLowerCase(),
  colorName,
  colorHex,
  name: `${model.id} · ${colorName}`,
  price: model.price,
  stock: 0,
  lowStock: model.lowStock,
  sort: model.sort + index + 1
})));

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
  catalog: [],
  products: [],
  sales: [],
  movements: [],
  operation: null,
  modelDialogId: null,
  unsubs: []
};

function config() { return window.CONDUCTOR_FIREBASE_CONFIG || null; }

function employeeNameFromEmail(email = "") {
  const normalized = String(email).trim().toLowerCase();
  return STAFF_NAMES.get(normalized) || "Сотрудник";
}

function isAllowedStaffEmail(email = "") { return STAFF_NAMES.has(String(email).trim().toLowerCase()); }

function currentEmployeeName() {
  return employeeNameFromEmail(state.user?.email || "");
}

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

function hideBoot() {
  const boot = $("#boot");
  if (!boot) return;
  boot.classList.add("hide");
  setTimeout(() => boot.remove(), 280);
}

function modelById(modelId) { return MODELS.find((model) => model.id === modelId); }
function variantDefaults(modelId) { return defaults.filter((item) => item.modelId === modelId); }
function modelVariants(modelId) { return state.products.filter((item) => item.modelId === modelId && !item.legacyUnassigned && item.active !== false).sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0)); }
function modelSalePrice(modelId) {
  const catalogModel = state.catalog.find((item) => item.id === modelId);
  return Number(catalogModel?.price || modelById(modelId)?.price || 0);
}
function unassignedForModel(modelId) { return state.products.find((item) => item.modelId === modelId && item.legacyUnassigned && Number(item.stock || 0) > 0); }
function visibleInventory() { return state.products.filter((item) => item.active !== false && !item.modelOnly); }
function totalUnits() { return visibleInventory().reduce((sum, item) => sum + Number(item.stock || 0), 0); }
function stockValue() { return visibleInventory().reduce((sum, item) => sum + Number(item.stock || 0) * modelSalePrice(item.modelId || item.id), 0); }
function colorDot(product) { return product.colorHex ? `<span class="color-dot" style="background:${escapeHtml(product.colorHex)}"></span>` : ""; }

async function migrateLegacyModel(model) {
  const legacyRef = doc(state.db, "products", model.id);
  const unassignedRef = doc(state.db, "products", `${model.id}_UNASSIGNED`);
  const employee = currentEmployeeName();
  const audit = {
    updatedAt: serverTimestamp(),
    updatedBy: state.user.uid,
    updatedByName: employee
  };

  await runTransaction(state.db, async (tx) => {
    const legacySnap = await tx.get(legacyRef);
    const unassignedSnap = await tx.get(unassignedRef);
    if (!legacySnap.exists() && !unassignedSnap.exists()) return;

    const legacy = legacySnap.exists() ? legacySnap.data() : null;
    const unassigned = unassignedSnap.exists() ? unassignedSnap.data() : null;
    const legacyStock = Number(legacy?.stock || 0);
    const currentStock = Number(unassigned?.stock || 0);
    const nextStock = currentStock + legacyStock;
    const creationAudit = unassignedSnap.exists() ? {} : {
      createdAt: serverTimestamp(),
      createdBy: state.user.uid,
      createdByName: employee
    };
    if (legacySnap.exists() || unassignedSnap.exists()) {
      tx.set(unassignedRef, {
        modelId: model.id,
        name: `${model.id} · Нераспределено`,
        stock: nextStock,
        lowStock: 0,
        sort: model.sort,
        legacyUnassigned: true,
        active: nextStock > 0,
        ...creationAudit,
        ...audit
      }, { merge: true });
    }

    if (legacySnap.exists()) {
      tx.set(legacyRef, {
        active: false,
        stock: 0,
        modelOnly: true,
        variantMigrationV2: true,
        ...audit
      }, { merge: true });
    }
  });
}

async function ensureProducts() {
  const [productSnap, catalogSnap] = await Promise.all([
    getDocs(collection(state.db, "products")),
    getDocs(collection(state.db, "catalog"))
  ]);
  const existingProducts = productSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
  const existing = new Set(existingProducts.map((item) => item.id));
  const existingCatalog = new Set(catalogSnap.docs.map((item) => item.id));
  const employee = currentEmployeeName();
  await Promise.all(defaults.filter((item) => !existing.has(item.id)).map((item) => setDoc(doc(state.db, "products", item.id), {
    id: item.id,
    modelId: item.modelId,
    colorId: item.colorId,
    colorName: item.colorName,
    colorHex: item.colorHex,
    name: item.name,
    stock: item.stock,
    lowStock: item.lowStock,
    sort: item.sort,
    active: true,
    createdAt: serverTimestamp(),
    createdBy: state.user.uid,
    createdByName: employee,
    updatedAt: serverTimestamp(),
    updatedBy: state.user.uid,
    updatedByName: employee
  })));
  await Promise.all(MODELS.filter((model) => !existingCatalog.has(model.id)).map((model) => {
    const legacyPrice = existingProducts.find((item) => item.modelId === model.id && Number(item.price) > 0)?.price;
    return setDoc(doc(state.db, "catalog", model.id), {
      modelId: model.id,
      name: model.name,
      price: Math.trunc(Number(legacyPrice || model.price)),
      updatedAt: serverTimestamp(),
      updatedBy: state.user.uid,
      updatedByName: employee
    });
  }));
  for (const model of MODELS) await migrateLegacyModel(model);
}

function stopRealtime() {
  state.unsubs.forEach((fn) => fn?.());
  state.unsubs = [];
}

function startRealtime() {
  stopRealtime();
  state.unsubs.push(onSnapshot(collection(state.db, "catalog"), (snap) => {
    state.catalog = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderProducts();
    renderStock();
    renderDashboard();
    if ($("#model-dialog")?.open && state.modelDialogId) renderModelDialog(state.modelDialogId);
  }, (error) => toast(`Каталог: ${error.message}`)));
  state.unsubs.push(onSnapshot(query(collection(state.db, "products"), orderBy("sort")), (snap) => {
    state.products = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderProducts();
    renderStock();
    renderDashboard();
    if ($("#model-dialog")?.open && state.modelDialogId) renderModelDialog(state.modelDialogId);
  }, (error) => toast(`Склад: ${error.message}`)));

  state.unsubs.push(onSnapshot(query(collection(state.db, "orders"), orderBy("createdAt", "desc"), limit(100)), (snap) => {
    state.sales = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderSales();
    renderDashboard();
  }, (error) => toast(`Продажи: ${error.message}`)));

  state.unsubs.push(onSnapshot(query(collection(state.db, "stockMovements"), orderBy("createdAt", "desc"), limit(100)), (snap) => {
    state.movements = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderMovements();
    renderDashboard();
  }, (error) => toast(`Журнал: ${error.message}`)));
}

function modelTotal(modelId) {
  const variants = modelVariants(modelId);
  const unassigned = unassignedForModel(modelId);
  return variants.reduce((sum, item) => sum + Number(item.stock || 0), 0) + Number(unassigned?.stock || 0);
}

function renderInventoryOverview() {
  const root = $("#inventory-overview");
  if (!root) return;
  root.innerHTML = MODELS.map((model) => {
    const variants = modelVariants(model.id);
    const unassigned = unassignedForModel(model.id);
    const total = modelTotal(model.id);
    return `<article class="inventory-overview-card">
      <div class="overview-model-head"><div><b>${escapeHtml(model.id)}</b><small>${escapeHtml(model.name)}</small></div><strong>${total}</strong></div>
      <div class="overview-colors">
        ${variants.map((item) => `<div class="overview-color"><span>${colorDot(item)}${escapeHtml(item.colorName)}</span><b class="${Number(item.stock || 0) <= Number(item.lowStock || 0) ? "low" : ""}">${Number(item.stock || 0)}</b></div>`).join("")}
        ${unassigned ? `<div class="overview-color warning"><span>⚠ Нераспределено</span><b>${Number(unassigned.stock || 0)}</b></div>` : ""}
      </div>
    </article>`;
  }).join("");
}

function renderDashboard() {
  const units = totalUnits();
  const value = stockValue();
  const todaySales = state.sales.filter((sale) => sale.status !== "cancelled" && isToday(dateOf(sale)));
  const todayRevenue = todaySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const low = state.products.filter((item) => item.active !== false && !item.legacyUnassigned && !item.modelOnly && Number(item.stock || 0) <= Number(item.lowStock || 0));
  const movementsToday = state.movements.filter((movement) => isToday(dateOf(movement)));

  $("#stock-units-hero").textContent = `${units} ед.`;
  $("#stock-value-hero").textContent = `${KZT.format(value)} по текущим ценам`;
  $("#metric-stock-value").textContent = KZT.format(value);
  $("#metric-sales").textContent = KZT.format(todayRevenue);
  $("#metric-low").textContent = String(low.length);
  $("#metric-movements").textContent = String(movementsToday.length);
  renderInventoryOverview();

  const recent = state.sales.slice(0, 4);
  $("#dashboard-sales").innerHTML = recent.length ? recent.map(saleCard).join("") : `<div class="empty">Продаж пока нет.</div>`;
  bindSaleActions($("#dashboard-sales"));
}

function saleItemLabel(item) {
  if (item.colorName) return `${escapeHtml(item.productId || "Товар")} · ${escapeHtml(item.colorName)}`;
  return escapeHtml(item.name || item.productId || "Товар");
}

function saleEmployee(sale) {
  return sale.createdByName || employeeNameFromEmail(sale.createdByEmail || "");
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
  let html = "";
  for (const model of MODELS) {
    const variants = modelVariants(model.id);
    if (!variants.length) continue;
    html += `<div class="variant-group-label"><b>${escapeHtml(model.id)}</b><span>${variants.reduce((sum, item) => sum + Number(item.stock || 0), 0)} ед. · выберите цвет</span></div>`;
    html += variants.map((product) => `<div class="sale-product">
      <div class="sale-product-name"><b>${colorDot(product)}${escapeHtml(product.colorName)}</b><small>${KZT.format(modelSalePrice(model.id))} · остаток ${Number(product.stock || 0)}</small></div>
      <div class="qty-control">
        <button type="button" data-qty-minus="${product.id}">−</button>
        <input type="number" min="0" max="${Number(product.stock || 0)}" value="0" inputmode="numeric" data-qty="${product.id}">
        <button type="button" data-qty-plus="${product.id}">+</button>
      </div>
    </div>`).join("");
  }
  $("#sale-products").innerHTML = html || `<div class="empty">Товары загружаются…</div>`;
  $$('[data-qty-minus]').forEach((button) => button.addEventListener("click", () => changeSaleQty(button.dataset.qtyMinus, -1)));
  $$('[data-qty-plus]').forEach((button) => button.addEventListener("click", () => changeSaleQty(button.dataset.qtyPlus, 1)));
  $$('[data-qty]').forEach((input) => input.addEventListener("input", updateSaleTotal));
  updateSaleTotal();
}

function changeSaleQty(inventoryId, delta) {
  const input = document.querySelector(`[data-qty="${CSS.escape(inventoryId)}"]`);
  const product = state.products.find((item) => item.id === inventoryId);
  if (!input || !product) return;
  input.value = String(Math.max(0, Math.min(Number(product.stock || 0), Number(input.value || 0) + delta)));
  updateSaleTotal();
}

function selectedItems() {
  return state.products.map((product) => {
    const input = document.querySelector(`[data-qty="${CSS.escape(product.id)}"]`);
    const qty = Number(input?.value || 0);
    if (qty <= 0) return null;
    const price = modelSalePrice(product.modelId || product.id);
    return {
      inventoryId: product.id,
      productId: product.modelId || product.id,
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
  $("#sale-total").textContent = KZT.format(selectedItems().reduce((sum, item) => sum + item.lineTotal, 0));
}

async function createSale(event) {
  event.preventDefault();
  const errorNode = $("#sale-error");
  errorNode.textContent = "";
  const items = selectedItems();
  if (!items.length) { errorNode.textContent = "Укажите количество хотя бы одного товара."; return; }

  const note = $("#sale-notes").value.trim();
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const submit = event.submitter;
  const employee = currentEmployeeName();
  submit.disabled = true;

  try {
    const productRefs = items.map((item) => doc(state.db, "products", item.inventoryId));
    const movementRefs = items.map(() => doc(collection(state.db, "stockMovements")));
    const saleRef = doc(collection(state.db, "orders"));

    await runTransaction(state.db, async (tx) => {
      const snaps = [];
      for (const ref of productRefs) snaps.push(await tx.get(ref));
      snaps.forEach((snap, index) => {
        if (!snap.exists()) throw new Error(`${items[index].name}: товар не найден`);
        const stock = Number(snap.data().stock || 0);
        if (stock < items[index].qty) throw new Error(`${items[index].name}: на складе только ${stock}`);
      });

      snaps.forEach((snap, index) => {
        const data = snap.data();
        const before = Number(data.stock || 0);
        const after = before - items[index].qty;
        tx.update(productRefs[index], { stock: after, updatedAt: serverTimestamp(), updatedBy: state.user.uid, updatedByName: employee });
        tx.set(movementRefs[index], {
          type: "sale",
          inventoryId: items[index].inventoryId,
          productId: items[index].productId,
          productName: items[index].name,
          colorId: items[index].colorId,
          colorName: items[index].colorName,
          qtyDelta: -items[index].qty,
          before,
          after,
          unitCost: 0,
          totalCost: 0,
          salePrice: items[index].price,
          orderId: saleRef.id,
          reason: note,
          createdAt: serverTimestamp(),
          createdAtClient: new Date().toISOString(),
          createdBy: state.user.uid,
          createdByEmail: state.user.email || "",
          createdByName: employee
        });
      });

      tx.set(saleRef, {
        items,
        total,
        note,
        status: "done",
        source: "stock-app",
        createdAt: serverTimestamp(),
        createdAtClient: new Date().toISOString(),
        createdBy: state.user.uid,
        createdByEmail: state.user.email || "",
        createdByName: employee
      });
    });

    event.target.reset();
    $$('[data-qty]').forEach((input) => input.value = "0");
    updateSaleTotal();
    toast(`Продажа записана · ${employee}`);
    navigate("sales");
  } catch (error) { errorNode.textContent = error.message; }
  finally { submit.disabled = false; }
}

function inventoryIdForSaleItem(item) {
  if (item.inventoryId) return item.inventoryId;
  if (MODELS.some((model) => model.id === item.productId)) return `${item.productId}_UNASSIGNED`;
  return item.productId;
}

async function cancelSale(saleId) {
  const employee = currentEmployeeName();
  const saleRef = doc(state.db, "orders", saleId);
  await runTransaction(state.db, async (tx) => {
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists()) throw new Error("Продажа не найдена");
    const sale = saleSnap.data();
    if (sale.status === "cancelled") throw new Error("Продажа уже отменена");
    const items = sale.items || [];
    if (!items.length) throw new Error("В продаже нет товарных позиций");

    const inventoryIds = items.map(inventoryIdForSaleItem);
    const productRefs = inventoryIds.map((id) => doc(state.db, "products", id));
    const productSnaps = [];
    for (const ref of productRefs) productSnaps.push(await tx.get(ref));
    const movementRefs = items.map(() => doc(collection(state.db, "stockMovements")));

    productSnaps.forEach((snap, index) => { if (!snap.exists()) throw new Error(`${items[index].name || items[index].productId}: товар не найден`); });
    productSnaps.forEach((snap, index) => {
      const data = snap.data();
      const before = Number(data.stock || 0);
      const qty = Number(items[index].qty || 0);
      const after = before + qty;
      const update = { stock: after, updatedAt: serverTimestamp(), updatedBy: state.user.uid, updatedByName: employee };
      if (data.legacyUnassigned) update.active = true;
      tx.update(productRefs[index], update);
      tx.set(movementRefs[index], {
        type: "sale_return",
        inventoryId: inventoryIds[index],
        productId: data.modelId || items[index].productId,
        productName: data.name || items[index].name || items[index].productId,
        colorId: data.colorId || items[index].colorId || "",
        colorName: data.colorName || items[index].colorName || "",
        qtyDelta: qty,
        before,
        after,
        unitCost: 0,
        totalCost: 0,
        orderId: saleId,
        reason: "Отмена продажи",
        createdAt: serverTimestamp(),
        createdAtClient: new Date().toISOString(),
        createdBy: state.user.uid,
        createdByEmail: state.user.email || "",
        createdByName: employee
      });
    });

    tx.update(saleRef, {
      status: "cancelled",
      cancelledAt: serverTimestamp(),
      cancelledBy: state.user.uid,
      cancelledByEmail: state.user.email || "",
      cancelledByName: employee
    });
  });
}

function compactColorSummary(modelId) {
  const variants = modelVariants(modelId);
  const unassigned = unassignedForModel(modelId);
  return `<div class="stock-color-summary">${variants.map((item) => `<span>${colorDot(item)}${escapeHtml(item.colorName)} <b>${Number(item.stock || 0)}</b></span>`).join("")}${unassigned ? `<span class="warning">⚠ Нераспр. <b>${Number(unassigned.stock || 0)}</b></span>` : ""}</div>`;
}

function renderStock() {
  const units = totalUnits();
  const value = stockValue();
  $("#stock-total").textContent = `${units} ед.`;
  $("#stock-sku-count").textContent = String(MODELS.length);
  $("#stock-units").textContent = String(units);
  $("#stock-value").textContent = KZT.format(value);

  $("#stock-list").innerHTML = MODELS.map((model) => `<article class="stock-card stock-model-card">
    <div class="stock-main">
      <div class="stock-name"><b>${escapeHtml(model.name)}</b><small>${model.variants.length} цветов · цена ${KZT.format(modelSalePrice(model.id))}</small></div>
      <div class="stock-count">${modelTotal(model.id)}</div>
    </div>
    ${compactColorSummary(model.id)}
    <button class="btn full model-balance-btn" data-open-model="${model.id}">Цвета и актуальные остатки</button>
  </article>`).join("");

  $$('[data-open-model]').forEach((button) => button.addEventListener("click", () => openModelDialog(button.dataset.openModel)));
}

function movementEmployee(movement) {
  return movement.createdByName || employeeNameFromEmail(movement.createdByEmail || "");
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

function renderModelDialog(modelId) {
  const model = modelById(modelId);
  if (!model) return;
  const variants = modelVariants(modelId);
  const unassigned = unassignedForModel(modelId);
  $("#model-dialog-title").textContent = model.name;
  $("#model-dialog-total").textContent = `Всего по модели: ${modelTotal(modelId)} ед. · внесите фактические остатки по цветам`;
  $("#model-variant-list").innerHTML = variants.map((item) => `<div class="model-variant-row">
    <div class="model-variant-info"><span>${colorDot(item)}</span><div><b>${escapeHtml(item.colorName)}</b><small>Сейчас: ${Number(item.stock || 0)}</small></div></div>
    <input type="number" min="0" step="1" inputmode="numeric" value="${Number(item.stock || 0)}" data-model-balance="${item.id}" aria-label="${escapeHtml(item.colorName)}">
    <div class="model-variant-actions"><button type="button" data-variant-op="receipt" data-product-id="${item.id}">＋</button><button type="button" data-variant-op="writeoff" data-product-id="${item.id}">−</button></div>
  </div>`).join("") + (unassigned ? `<div class="model-variant-row unassigned-row">
    <div class="model-variant-info"><span>⚠</span><div><b>Нераспределено</b><small>Старый общий остаток</small></div></div>
    <input type="number" min="0" step="1" inputmode="numeric" value="${Number(unassigned.stock || 0)}" data-model-balance="${unassigned.id}" aria-label="Нераспределено">
    <div></div>
  </div>` : "");

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
  if (!modelId) return;
  const model = modelById(modelId);
  const inputs = $$('[data-model-balance]');
  const desired = inputs.map((input) => ({ id: input.dataset.modelBalance, stock: Math.trunc(Number(input.value)) })).filter((item) => Number.isFinite(item.stock) && item.stock >= 0);
  const changed = desired.filter((item) => {
    const current = state.products.find((product) => product.id === item.id);
    return current && Number(current.stock || 0) !== item.stock;
  });
  const errorNode = $("#model-balance-error");
  errorNode.textContent = "";
  if (!changed.length) { errorNode.textContent = "Остатки не изменились."; return; }

  const employee = currentEmployeeName();
  const reason = $("#model-balance-reason").value.trim() || `Инвентаризация ${modelId}`;
  const submit = event.submitter;
  submit.disabled = true;

  try {
    const productRefs = changed.map((item) => doc(state.db, "products", item.id));
    const movementRefs = changed.map(() => doc(collection(state.db, "stockMovements")));
    await runTransaction(state.db, async (tx) => {
      const snaps = [];
      for (const ref of productRefs) snaps.push(await tx.get(ref));
      snaps.forEach((snap, index) => { if (!snap.exists()) throw new Error(`${changed[index].id}: позиция не найдена`); });
      snaps.forEach((snap, index) => {
        const data = snap.data();
        const before = Number(data.stock || 0);
        const after = changed[index].stock;
        const delta = after - before;
        const update = { stock: after, updatedAt: serverTimestamp(), updatedBy: state.user.uid, updatedByName: employee };
        if (data.legacyUnassigned) update.active = after > 0;
        tx.update(productRefs[index], update);
        tx.set(movementRefs[index], {
          type: "adjustment",
          inventoryId: changed[index].id,
          productId: data.modelId || modelId,
          productName: data.name || `${modelId} · ${data.colorName || "Нераспределено"}`,
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
          createdByEmail: state.user.email || "",
          createdByName: employee
        });
      });
    });
    $("#model-dialog").close();
    toast(`${model.id}: остатки обновил ${employee}`);
  } catch (error) { errorNode.textContent = error.message; }
  finally { submit.disabled = false; }
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
        createdByEmail: state.user.email || "",
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
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function resetPassword(email) {
  if (!email) throw new Error("Сначала укажите email.");
  await sendPasswordResetEmail(state.auth, email);
  toast("Письмо для смены пароля отправлено");
}

function wireUi() {
  $$('[data-nav]').forEach((button) => button.addEventListener("click", () => navigate(button.dataset.nav)));
  $("#sale-form").addEventListener("submit", createSale);
  $("#model-balance-form").addEventListener("submit", saveModelBalances);
  $("#model-dialog-close").addEventListener("click", () => $("#model-dialog").close());
  $("#stock-operation-form").addEventListener("submit", applyStockOperation);
  $("#stock-dialog-close").addEventListener("click", () => $("#stock-dialog").close());

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
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
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

    onAuthStateChanged(state.auth, (user) => {
      state.user = user;
      if (!user) {
        stopRealtime();
        showOnly("#login");
        return;
      }
      if (!isAllowedStaffEmail(user.email || "")) {
        stopRealtime();
        showOnly("#login");
        $("#login-error").textContent = "У этой учётной записи нет доступа к складу.";
        signOut(state.auth);
        return;
      }
      const employee = currentEmployeeName();
      showOnly("#app");
      $("#current-user-name").textContent = employee;
      $("#current-user-email").textContent = user.email || "";
      $("#settings-name").textContent = employee;
      $("#settings-email").textContent = user.email || user.uid;
      $("#settings-project").textContent = cfg.projectId;
      startRealtime();
      navigate("dashboard");
      ensureProducts().catch((error) => toast(`Товары: ${error.message}`));
    });
  } catch (error) {
    showOnly("#login");
    $("#login-error").textContent = `Firebase: ${error.message}`;
  } finally { hideBoot(); }
}

boot();
