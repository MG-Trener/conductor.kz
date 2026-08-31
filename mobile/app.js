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
const LEGACY_DM30 = "DM30";
const UNASSIGNED_DM30 = "DM30_UNASSIGNED";

const defaults = [
  { id: "DM30_BLUE", modelId: "DM30", colorId: "blue", colorName: "Синий", colorHex: "#258cff", name: "DM30 · Синий", price: 2500, stock: 0, lowStock: 2, sort: 11 },
  { id: "DM30_YELLOW", modelId: "DM30", colorId: "yellow", colorName: "Жёлтый", colorHex: "#ffd42a", name: "DM30 · Жёлтый", price: 2500, stock: 0, lowStock: 2, sort: 12 },
  { id: "DM30_RED", modelId: "DM30", colorId: "red", colorName: "Красный", colorHex: "#ff4545", name: "DM30 · Красный", price: 2500, stock: 0, lowStock: 2, sort: 13 },
  { id: "DM30_PURPLE", modelId: "DM30", colorId: "purple", colorName: "Фиолетовый", colorHex: "#9b59ff", name: "DM30 · Фиолетовый", price: 2500, stock: 0, lowStock: 2, sort: 14 },
  { id: "DM30_TURQUOISE", modelId: "DM30", colorId: "turquoise", colorName: "Бирюзовый", colorHex: "#27d3c3", name: "DM30 · Бирюзовый", price: 2500, stock: 0, lowStock: 2, sort: 15 },
  { id: "DM60", name: "Цветной дым DM60", price: 3000, stock: 0, lowStock: 10, sort: 20 },
  { id: "DM90", name: "Цветной дым DM90", price: 3500, stock: 0, lowStock: 10, sort: 30 },
  { id: "HOLI", name: "Краска Холи", price: 1000, stock: 0, lowStock: 50, sort: 40 }
];

const movementLabels = {
  receipt: "Поступление",
  writeoff: "Списание",
  adjustment: "Корректировка",
  sale: "Продажа",
  sale_return: "Возврат продажи"
};

const state = {
  auth: null,
  db: null,
  user: null,
  products: [],
  sales: [],
  movements: [],
  operation: null,
  unsubs: []
};

function config() {
  return window.CONDUCTOR_FIREBASE_CONFIG || null;
}

function toast(message) {
  const node = $("#toast");
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

function activeProducts() {
  return state.products.filter((product) => product.active !== false);
}

function totalUnits() {
  return activeProducts().reduce((sum, product) => sum + Number(product.stock || 0), 0);
}

function stockValue() {
  return activeProducts().reduce((sum, product) => sum + Number(product.stock || 0) * Number(product.avgCost || product.lastCost || 0), 0);
}

function colorDot(product) {
  return product.colorHex ? `<span class="color-dot" style="background:${escapeHtml(product.colorHex)}"></span>` : "";
}

function showOnly(selector) {
  ["#login", "#app"].forEach((id) => $(id).classList.add("hidden"));
  $(selector).classList.remove("hidden");
}

function hideBoot() {
  const boot = $("#boot");
  if (!boot) return;
  boot.classList.add("hide");
  setTimeout(() => boot.remove(), 280);
}

async function migrateLegacyDm30() {
  const legacyRef = doc(state.db, "products", LEGACY_DM30);
  const unassignedRef = doc(state.db, "products", UNASSIGNED_DM30);

  await runTransaction(state.db, async (tx) => {
    const legacySnap = await tx.get(legacyRef);
    const unassignedSnap = await tx.get(unassignedRef);
    const legacy = legacySnap.exists() ? legacySnap.data() : null;
    const unassigned = unassignedSnap.exists() ? unassignedSnap.data() : null;
    const legacyStock = Number(legacy?.stock || 0);
    const currentUnassigned = Number(unassigned?.stock || 0);
    const legacyCost = Number(legacy?.avgCost || legacy?.lastCost || 0);
    const unassignedCost = Number(unassigned?.avgCost || unassigned?.lastCost || 0);
    const nextUnassigned = currentUnassigned + legacyStock;
    const nextAvg = nextUnassigned > 0
      ? ((currentUnassigned * unassignedCost) + (legacyStock * legacyCost)) / nextUnassigned
      : (unassignedCost || legacyCost || 0);

    if (!unassignedSnap.exists() || legacyStock > 0) {
      tx.set(unassignedRef, {
        modelId: "DM30",
        name: "DM30 · Нераспределено",
        price: Number(legacy?.price || 2500),
        stock: nextUnassigned,
        lowStock: 0,
        sort: 10,
        avgCost: nextAvg,
        lastCost: Number(legacy?.lastCost || unassigned?.lastCost || 0),
        legacyUnassigned: true,
        active: nextUnassigned > 0,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }

    if (legacySnap.exists()) {
      tx.set(legacyRef, {
        active: false,
        stock: 0,
        modelOnly: true,
        variantMigrationV1: true,
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
  });
}

async function ensureProducts() {
  const refs = defaults.map((product) => doc(state.db, "products", product.id));
  const snaps = await Promise.all(refs.map((ref) => getDoc(ref)));
  await Promise.all(snaps.map((snap, index) => {
    if (snap.exists()) return Promise.resolve();
    return setDoc(refs[index], {
      ...defaults[index],
      active: true,
      avgCost: 0,
      lastCost: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  }));
  await migrateLegacyDm30();
}

function stopRealtime() {
  state.unsubs.forEach((fn) => fn?.());
  state.unsubs = [];
}

function startRealtime() {
  stopRealtime();

  state.unsubs.push(onSnapshot(query(collection(state.db, "products"), orderBy("sort")), (snap) => {
    state.products = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderProducts();
    renderStock();
    renderDashboard();
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

function renderDashboard() {
  const units = totalUnits();
  const value = stockValue();
  const todaySales = state.sales.filter((sale) => sale.status !== "cancelled" && isToday(dateOf(sale)));
  const todayRevenue = todaySales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const low = activeProducts().filter((product) => !product.legacyUnassigned && Number(product.stock || 0) <= Number(product.lowStock || 0));
  const movementsToday = state.movements.filter((movement) => isToday(dateOf(movement)));

  $("#stock-units-hero").textContent = `${units} ед.`;
  $("#stock-value-hero").textContent = `${KZT.format(value)} по себестоимости`;
  $("#metric-stock-value").textContent = KZT.format(value);
  $("#metric-sales").textContent = KZT.format(todayRevenue);
  $("#metric-low").textContent = String(low.length);
  $("#metric-movements").textContent = String(movementsToday.length);

  const recent = state.sales.slice(0, 4);
  $("#dashboard-sales").innerHTML = recent.length ? recent.map(saleCard).join("") : `<div class="empty">Продаж пока нет.</div>`;
  bindSaleActions($("#dashboard-sales"));
}

function saleItemLabel(item) {
  if (item.colorName) return `${escapeHtml(item.productId || "DM30")} · ${escapeHtml(item.colorName)}`;
  return escapeHtml(item.name || item.productId || "Товар");
}

function saleCard(sale) {
  const items = (sale.items || []).map((item) => `${saleItemLabel(item)} × ${Number(item.qty || 0)}`).join(" · ");
  const cancelled = sale.status === "cancelled";
  const note = sale.note || sale.notes || "";
  return `<article class="order-card">
    <div class="order-top">
      <div><div class="order-customer">Продажа #${escapeHtml(sale.id.slice(0, 8))}</div><div class="order-phone">${escapeHtml(sale.createdByEmail || "Сотрудник")}</div></div>
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
  root.querySelectorAll("[data-cancel-sale]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Отменить продажу и вернуть весь товар на склад?")) return;
      button.disabled = true;
      try {
        await cancelSale(button.dataset.cancelSale);
        toast("Продажа отменена, товар возвращён");
      } catch (error) {
        toast(error.message);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function renderProducts() {
  const products = activeProducts();
  let html = "";
  let dm30HeaderShown = false;

  for (const product of products) {
    if (product.modelId === "DM30" && !product.legacyUnassigned && !dm30HeaderShown) {
      html += `<div class="variant-group-label"><b>DM30</b><span>выберите цвет</span></div>`;
      dm30HeaderShown = true;
    }
    if (product.legacyUnassigned) continue;
    html += `<div class="sale-product">
      <div class="sale-product-name"><b>${colorDot(product)}${escapeHtml(product.name)}</b><small>${KZT.format(Number(product.price || 0))} · остаток ${Number(product.stock || 0)}</small></div>
      <div class="qty-control">
        <button type="button" data-qty-minus="${product.id}">−</button>
        <input type="number" min="0" max="${Number(product.stock || 0)}" value="0" inputmode="numeric" data-qty="${product.id}">
        <button type="button" data-qty-plus="${product.id}">+</button>
      </div>
    </div>`;
  }

  $("#sale-products").innerHTML = html;
  $$('[data-qty-minus]').forEach((button) => button.addEventListener("click", () => changeSaleQty(button.dataset.qtyMinus, -1)));
  $$('[data-qty-plus]').forEach((button) => button.addEventListener("click", () => changeSaleQty(button.dataset.qtyPlus, 1)));
  $$('[data-qty]').forEach((input) => input.addEventListener("input", updateSaleTotal));
  updateSaleTotal();
}

function changeSaleQty(inventoryId, delta) {
  const input = document.querySelector(`[data-qty="${CSS.escape(inventoryId)}"]`);
  const product = state.products.find((item) => item.id === inventoryId);
  if (!input || !product) return;
  const next = Math.max(0, Math.min(Number(product.stock || 0), Number(input.value || 0) + delta));
  input.value = String(next);
  updateSaleTotal();
}

function selectedItems() {
  return state.products.map((product) => {
    const input = document.querySelector(`[data-qty="${CSS.escape(product.id)}"]`);
    const qty = Number(input?.value || 0);
    if (qty <= 0) return null;
    const price = Number(product.price || 0);
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
  const total = selectedItems().reduce((sum, item) => sum + item.lineTotal, 0);
  $("#sale-total").textContent = KZT.format(total);
}

async function createSale(event) {
  event.preventDefault();
  const errorNode = $("#sale-error");
  errorNode.textContent = "";
  const items = selectedItems();
  if (!items.length) {
    errorNode.textContent = "Укажите количество хотя бы одного товара.";
    return;
  }

  const note = $("#sale-notes").value.trim();
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const submit = event.submitter;
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
        const unitCost = Number(data.avgCost || data.lastCost || 0);
        tx.update(productRefs[index], { stock: after, updatedAt: serverTimestamp(), updatedBy: state.user.uid });
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
          unitCost,
          totalCost: unitCost * items[index].qty,
          salePrice: items[index].price,
          orderId: saleRef.id,
          reason: note,
          createdAt: serverTimestamp(),
          createdAtClient: new Date().toISOString(),
          createdBy: state.user.uid,
          createdByEmail: state.user.email || ""
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
        createdByEmail: state.user.email || ""
      });
    });

    event.target.reset();
    $$('[data-qty]').forEach((input) => input.value = "0");
    updateSaleTotal();
    toast("Продажа записана");
    navigate("sales");
  } catch (error) {
    errorNode.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
}

function inventoryIdForSaleItem(item) {
  if (item.inventoryId) return item.inventoryId;
  if (item.productId === LEGACY_DM30) return UNASSIGNED_DM30;
  return item.productId;
}

async function cancelSale(saleId) {
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

    productSnaps.forEach((snap, index) => {
      if (!snap.exists()) throw new Error(`${items[index].name || items[index].productId}: товар не найден`);
    });

    productSnaps.forEach((snap, index) => {
      const data = snap.data();
      const before = Number(data.stock || 0);
      const qty = Number(items[index].qty || 0);
      const after = before + qty;
      const unitCost = Number(data.avgCost || data.lastCost || 0);
      const update = { stock: after, updatedAt: serverTimestamp(), updatedBy: state.user.uid };
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
        unitCost,
        totalCost: unitCost * qty,
        orderId: saleId,
        reason: "Отмена продажи",
        createdAt: serverTimestamp(),
        createdAtClient: new Date().toISOString(),
        createdBy: state.user.uid,
        createdByEmail: state.user.email || ""
      });
    });

    tx.update(saleRef, {
      status: "cancelled",
      cancelledAt: serverTimestamp(),
      cancelledBy: state.user.uid,
      cancelledByEmail: state.user.email || ""
    });
  });
}

function stockOperationButtons(product) {
  return `<div class="stock-actions stock-actions-warehouse">
    <button data-stock-op="receipt" data-product-id="${product.id}">＋ Поступление</button>
    <button data-stock-op="writeoff" data-product-id="${product.id}">− Списание</button>
    <button data-stock-op="adjustment" data-product-id="${product.id}">= Задать остаток</button>
  </div>`;
}

function renderStock() {
  const products = activeProducts();
  const units = totalUnits();
  const value = stockValue();
  const modelCount = new Set(products.filter((p) => !p.legacyUnassigned).map((p) => p.modelId || p.id)).size;
  $("#stock-total").textContent = `${units} ед.`;
  $("#stock-sku-count").textContent = String(modelCount);
  $("#stock-units").textContent = String(units);
  $("#stock-value").textContent = KZT.format(value);

  const dm30 = products.filter((product) => product.modelId === "DM30" && !product.legacyUnassigned);
  const unassigned = products.find((product) => product.legacyUnassigned);
  const others = products.filter((product) => product.modelId !== "DM30");
  let html = "";

  if (dm30.length) {
    const dm30Total = dm30.reduce((sum, product) => sum + Number(product.stock || 0), 0);
    html += `<article class="stock-card stock-model-card">
      <div class="stock-main"><div class="stock-name"><b>Цветной дым DM30</b><small>Остатки отдельно по цветам</small></div><div class="stock-count">${dm30Total}</div></div>
      <div class="variant-stock-list">${dm30.map((product) => {
        const stock = Number(product.stock || 0);
        const low = stock <= Number(product.lowStock || 0);
        const avgCost = Number(product.avgCost || product.lastCost || 0);
        return `<div class="variant-stock-row">
          <div class="variant-stock-head"><div class="variant-stock-name">${colorDot(product)}<b>${escapeHtml(product.colorName)}</b><small>${avgCost ? `себест. ${KZT.format(avgCost)}` : "себестоимость не задана"}</small></div><strong class="${low ? "low" : ""}">${stock}</strong></div>
          ${stockOperationButtons(product)}
        </div>`;
      }).join("")}</div>
    </article>`;
  }

  if (unassigned) {
    html += `<article class="stock-card legacy-stock-card">
      <div class="stock-main"><div class="stock-name"><b>DM30 · Нераспределено</b><small>Старый общий остаток. Разнесите его по цветам и затем задайте здесь 0.</small></div><div class="stock-count">${Number(unassigned.stock || 0)}</div></div>
      ${stockOperationButtons(unassigned)}
    </article>`;
  }

  html += others.map((product) => {
    const stock = Number(product.stock || 0);
    const low = stock <= Number(product.lowStock || 0);
    const avgCost = Number(product.avgCost || product.lastCost || 0);
    return `<article class="stock-card">
      <div class="stock-main"><div class="stock-name"><b>${escapeHtml(product.name)}</b><small>${product.id} · продажа ${KZT.format(Number(product.price || 0))}${avgCost ? ` · себест. ${KZT.format(avgCost)}` : ""}</small></div><div class="stock-count ${low ? "low" : ""}">${stock}</div></div>
      ${stockOperationButtons(product)}
    </article>`;
  }).join("");

  $("#stock-list").innerHTML = html;
  $$('[data-stock-op]').forEach((button) => button.addEventListener("click", () => openStockDialog(button.dataset.productId, button.dataset.stockOp)));
}

function renderMovements() {
  $("#movement-list").innerHTML = state.movements.length ? state.movements.map((movement) => {
    const delta = Number(movement.qtyDelta || 0);
    const sign = delta > 0 ? "+" : "";
    const reason = movement.reason ? `<div class="movement-reason">${escapeHtml(movement.reason)}</div>` : "";
    const title = movement.colorName ? `${escapeHtml(movement.productId || "DM30")} · ${escapeHtml(movement.colorName)}` : escapeHtml(movement.productName || movement.productId);
    return `<article class="movement-card">
      <div class="movement-top"><div><b>${title}</b><small>${movementLabels[movement.type] || escapeHtml(movement.type || "Операция")}</small></div><strong class="${delta < 0 ? "negative" : "positive"}">${sign}${delta}</strong></div>
      <div class="movement-meta"><span>${Number(movement.before || 0)} → ${Number(movement.after || 0)}</span><span>${formatDate(dateOf(movement))}</span></div>
      ${reason}
    </article>`;
  }).join("") : `<div class="empty">Движений склада пока нет.</div>`;
}

function openStockDialog(productId, type) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  state.operation = { productId, type };
  const dialog = $("#stock-dialog");
  const titles = { receipt: "Поступление", writeoff: "Списание", adjustment: "Задать фактический остаток" };
  $("#stock-dialog-eyebrow").textContent = titles[type];
  $("#stock-dialog-title").textContent = product.name;
  $("#stock-current").textContent = `Сейчас на складе: ${Number(product.stock || 0)} ед.`;
  $("#stock-qty-label").firstChild.textContent = type === "adjustment" ? "Фактический остаток" : "Количество";
  $("#stock-operation-qty").value = type === "adjustment" ? String(Number(product.stock || 0)) : "";
  $("#stock-operation-cost").value = type === "receipt" && Number(product.lastCost || 0) ? String(Number(product.lastCost || 0)) : "";
  $("#stock-cost-row").classList.toggle("hidden", type !== "receipt");
  $("#stock-operation-reason").value = "";
  $("#stock-operation-error").textContent = "";
  $("#stock-operation-submit").textContent = titles[type];
  dialog.showModal();
  setTimeout(() => $("#stock-operation-qty").focus(), 80);
}

async function applyStockOperation(event) {
  event.preventDefault();
  const errorNode = $("#stock-operation-error");
  errorNode.textContent = "";
  const operation = state.operation;
  if (!operation) return;
  const product = state.products.find((item) => item.id === operation.productId);
  if (!product) return;

  const qtyInput = Number($("#stock-operation-qty").value);
  const costInput = Number($("#stock-operation-cost").value || 0);
  const reason = $("#stock-operation-reason").value.trim();
  if (!Number.isFinite(qtyInput) || qtyInput < 0) {
    errorNode.textContent = "Укажите корректное количество.";
    return;
  }
  if (operation.type !== "adjustment" && qtyInput <= 0) {
    errorNode.textContent = "Количество должно быть больше нуля.";
    return;
  }

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
      let after = before;
      let delta = 0;

      if (operation.type === "receipt") {
        delta = Math.trunc(qtyInput);
        after = before + delta;
      } else if (operation.type === "writeoff") {
        delta = -Math.trunc(qtyInput);
        if (before + delta < 0) throw new Error(`На складе только ${before} ед.`);
        after = before + delta;
      } else {
        after = Math.trunc(qtyInput);
        delta = after - before;
      }

      if (delta === 0) throw new Error("Остаток не изменился");

      const oldAvg = Number(data.avgCost || data.lastCost || 0);
      let avgCost = oldAvg;
      let lastCost = Number(data.lastCost || 0);
      if (operation.type === "receipt" && costInput > 0) {
        avgCost = after > 0 ? ((before * oldAvg) + (delta * costInput)) / after : costInput;
        lastCost = costInput;
      }
      const unitCost = operation.type === "receipt" && costInput > 0 ? costInput : avgCost;
      const update = { stock: after, avgCost, lastCost, updatedAt: serverTimestamp(), updatedBy: state.user.uid };
      if (data.legacyUnassigned && after === 0) update.active = false;

      tx.update(productRef, update);
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
        unitCost,
        totalCost: Math.abs(delta) * unitCost,
        reason,
        createdAt: serverTimestamp(),
        createdAtClient: new Date().toISOString(),
        createdBy: state.user.uid,
        createdByEmail: state.user.email || ""
      });
    });

    $("#stock-dialog").close();
    state.operation = null;
    toast("Остаток обновлён");
  } catch (error) {
    errorNode.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
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
  $("#stock-operation-form").addEventListener("submit", applyStockOperation);
  $("#stock-dialog-close").addEventListener("click", () => $("#stock-dialog").close());

  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const errorNode = $("#login-error");
    errorNode.textContent = "";
    const submit = event.submitter;
    submit.disabled = true;
    try {
      await signInWithEmailAndPassword(state.auth, $("#email").value.trim(), $("#password").value);
    } catch (error) {
      errorNode.textContent = error.code === "auth/invalid-credential" ? "Неверный email или пароль." : error.message;
    } finally {
      submit.disabled = false;
    }
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
  $("#sync-button").addEventListener("click", () => toast(navigator.onLine ? "Синхронизация активна" : "Нет соединения с интернетом"));
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
    state.auth = getAuth(app);
    await setPersistence(state.auth, browserLocalPersistence);
    state.db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });

    onAuthStateChanged(state.auth, (user) => {
      state.user = user;
      if (!user) {
        stopRealtime();
        showOnly("#login");
        return;
      }
      showOnly("#app");
      $("#settings-email").textContent = user.email || user.uid;
      $("#settings-project").textContent = cfg.projectId;
      startRealtime();
      navigate("dashboard");
      ensureProducts().catch((error) => toast(`Товары: ${error.message}`));
    });
  } catch (error) {
    showOnly("#login");
    $("#login-error").textContent = `Firebase: ${error.message}`;
  } finally {
    hideBoot();
  }
}

boot();
