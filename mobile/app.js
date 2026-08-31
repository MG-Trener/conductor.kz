import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
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

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const LOCAL_CONFIG_KEY = "conductor.firebaseConfig";
const KZT = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 });

const defaults = [
  { id: "DM30", name: "Цветной дым DM30", price: 2500, stock: 0, lowStock: 10, sort: 10 },
  { id: "DM60", name: "Цветной дым DM60", price: 3000, stock: 0, lowStock: 10, sort: 20 },
  { id: "DM90", name: "Цветной дым DM90", price: 3500, stock: 0, lowStock: 10, sort: 30 },
  { id: "HOLI", name: "Краска Холи", price: 1000, stock: 0, lowStock: 50, sort: 40 }
];

const state = {
  auth: null,
  db: null,
  user: null,
  firebaseConfig: null,
  products: [],
  orders: [],
  orderFilter: "all",
  unsubProducts: null,
  unsubOrders: null
};

function configuredFirebase() {
  try {
    const local = localStorage.getItem(LOCAL_CONFIG_KEY);
    if (local) return JSON.parse(local);
  } catch {}
  return window.CONDUCTOR_FIREBASE_CONFIG || null;
}

function validFirebaseConfig(config) {
  return Boolean(config?.apiKey && config?.authDomain && config?.projectId && config?.appId);
}

function normalizeFirebaseConfigText(text) {
  let value = text.trim();
  value = value.replace(/^const\s+firebaseConfig\s*=\s*/, "");
  value = value.replace(/^let\s+firebaseConfig\s*=\s*/, "");
  value = value.replace(/^var\s+firebaseConfig\s*=\s*/, "");
  value = value.replace(/;\s*$/, "");
  return JSON.parse(value);
}

function showOnly(id) {
  ["#setup", "#login", "#app"].forEach((selector) => $(selector).classList.add("hidden"));
  $(id).classList.remove("hidden");
}

function hideBoot() {
  const boot = $("#boot");
  boot.classList.add("hide");
  setTimeout(() => boot.remove(), 300);
}

function toast(message) {
  const node = $("#toast");
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2200);
}

function dateValue(order) {
  if (order.createdAt?.toDate) return order.createdAt.toDate();
  if (order.createdAtClient) return new Date(order.createdAtClient);
  return new Date(0);
}

function isToday(date) {
  const now = new Date();
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function statusLabel(status) {
  return ({ new: "Новый", confirmed: "Подтверждён", shipped: "Отправлен", done: "Готово", cancelled: "Отменён" })[status] || status;
}

function formatDate(date) {
  if (!date || Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("ru-KZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

async function initFirebase(config) {
  const app = initializeApp(config);
  state.firebaseConfig = config;
  state.auth = getAuth(app);
  await setPersistence(state.auth, browserLocalPersistence);

  try {
    state.db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
    });
  } catch {
    state.db = initializeFirestore(app, {});
  }

  onAuthStateChanged(state.auth, async (user) => {
    state.user = user;
    if (!user) {
      stopRealtime();
      showOnly("#login");
      return;
    }
    showOnly("#app");
    $("#settings-email").textContent = user.email || user.uid;
    $("#settings-project").textContent = config.projectId;
    await ensureDefaultProducts();
    startRealtime();
    navigate("dashboard");
  });
}

async function ensureDefaultProducts() {
  const snap = await getDocs(collection(state.db, "products"));
  if (!snap.empty) return;
  await Promise.all(defaults.map((product) => setDoc(doc(state.db, "products", product.id), {
    ...product,
    active: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })));
}

function stopRealtime() {
  state.unsubProducts?.();
  state.unsubOrders?.();
  state.unsubProducts = null;
  state.unsubOrders = null;
}

function startRealtime() {
  stopRealtime();
  state.unsubProducts = onSnapshot(query(collection(state.db, "products"), orderBy("sort")), (snap) => {
    state.products = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderProducts();
    renderDashboard();
  }, (error) => toast(`Склад: ${error.message}`));

  state.unsubOrders = onSnapshot(query(collection(state.db, "orders"), orderBy("createdAt", "desc"), limit(100)), (snap) => {
    state.orders = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderOrders();
    renderDashboard();
  }, (error) => toast(`Заказы: ${error.message}`));
}

function renderDashboard() {
  const todayOrders = state.orders.filter((order) => isToday(dateValue(order)));
  const doneToday = todayOrders.filter((order) => order.status === "done");
  const revenue = doneToday.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const active = state.orders.filter((order) => ["new", "confirmed", "shipped"].includes(order.status));
  const low = state.products.filter((product) => Number(product.stock || 0) <= Number(product.lowStock || 0));

  $("#today-revenue").textContent = KZT.format(revenue);
  $("#today-orders").textContent = `${doneToday.length} завершённых заказов`;
  $("#metric-new").textContent = state.orders.filter((order) => order.status === "new").length;
  $("#metric-active").textContent = active.length;
  $("#metric-low").textContent = low.length;
  $("#metric-today").textContent = todayOrders.length;

  const last = state.orders.slice(0, 4);
  $("#dashboard-orders").innerHTML = last.length
    ? last.map(orderCard).join("")
    : `<div class="empty">Заказов пока нет. Создайте первую продажу.</div>`;
  bindOrderActions($("#dashboard-orders"));
}

function orderCard(order) {
  const items = (order.items || []).map((item) => `${escapeHtml(item.productId)} × ${Number(item.qty || 0)}`).join(" · ");
  const actions = order.status === "new"
    ? `<button data-order-action="confirmed" data-order-id="${order.id}">Подтвердить</button>`
    : order.status === "confirmed"
      ? `<button data-order-action="shipped" data-order-id="${order.id}">Отправить</button>`
      : order.status === "shipped"
        ? `<button data-order-action="done" data-order-id="${order.id}">Завершить</button>`
        : "";
  const cancel = !["done", "cancelled"].includes(order.status)
    ? `<button data-order-action="cancelled" data-order-id="${order.id}">Отменить</button>`
    : "";

  return `<article class="order-card">
    <div class="order-top">
      <div><div class="order-customer">${escapeHtml(order.customer)}</div><div class="order-phone">${escapeHtml(order.phone)}${order.city ? ` · ${escapeHtml(order.city)}` : ""}</div></div>
      <div class="order-total">${KZT.format(Number(order.total || 0))}</div>
    </div>
    <div class="order-items">${items || "Без позиций"}</div>
    <div class="order-bottom"><span class="status ${escapeHtml(order.status)}">${statusLabel(order.status)}</span><span class="order-meta">${formatDate(dateValue(order))}</span></div>
    ${(actions || cancel) ? `<div class="order-actions">${actions}${cancel}</div>` : ""}
  </article>`;
}

function renderOrders() {
  const filtered = state.orderFilter === "all" ? state.orders : state.orders.filter((order) => order.status === state.orderFilter);
  $("#orders-list").innerHTML = filtered.length ? filtered.map(orderCard).join("") : `<div class="empty">В этом разделе заказов нет.</div>`;
  bindOrderActions($("#orders-list"));
}

function bindOrderActions(root) {
  root.querySelectorAll("[data-order-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await updateDoc(doc(state.db, "orders", button.dataset.orderId), {
          status: button.dataset.orderAction,
          statusUpdatedAt: serverTimestamp(),
          statusUpdatedBy: state.user.uid
        });
        toast("Статус обновлён");
      } catch (error) {
        toast(error.message);
      } finally {
        button.disabled = false;
      }
    });
  });
}

function renderProducts() {
  const activeProducts = state.products.filter((product) => product.active !== false);
  $("#sale-products").innerHTML = activeProducts.map((product) => `<div class="sale-product">
    <div class="sale-product-name"><b>${escapeHtml(product.name)}</b><small>${KZT.format(Number(product.price || 0))} · остаток ${Number(product.stock || 0)}</small></div>
    <div class="qty-control">
      <button type="button" data-qty-minus="${product.id}">−</button>
      <input type="number" min="0" max="${Number(product.stock || 0)}" value="0" inputmode="numeric" data-qty="${product.id}">
      <button type="button" data-qty-plus="${product.id}">+</button>
    </div>
  </div>`).join("");

  $$('[data-qty-minus]').forEach((button) => button.addEventListener("click", () => changeSaleQty(button.dataset.qtyMinus, -1)));
  $$('[data-qty-plus]').forEach((button) => button.addEventListener("click", () => changeSaleQty(button.dataset.qtyPlus, 1)));
  $$('[data-qty]').forEach((input) => input.addEventListener("input", updateSaleTotal));

  $("#stock-list").innerHTML = activeProducts.map((product) => {
    const stock = Number(product.stock || 0);
    const low = stock <= Number(product.lowStock || 0);
    return `<article class="stock-card">
      <div class="stock-main"><div class="stock-name"><b>${escapeHtml(product.name)}</b><small>${product.id} · ${KZT.format(Number(product.price || 0))}</small></div><div class="stock-count ${low ? "low" : ""}">${stock}</div></div>
      <div class="stock-actions">
        <button data-stock="${product.id}" data-delta="-10">−10</button>
        <button data-stock="${product.id}" data-delta="-1">−1</button>
        <button data-stock="${product.id}" data-delta="1">+1</button>
        <button data-stock="${product.id}" data-delta="10">+10</button>
      </div>
    </article>`;
  }).join("");
  $("#stock-total").textContent = `${activeProducts.reduce((sum, product) => sum + Number(product.stock || 0), 0)} ед.`;

  $$('[data-stock]').forEach((button) => button.addEventListener("click", () => adjustStock(button.dataset.stock, Number(button.dataset.delta), button)));
  updateSaleTotal();
}

function changeSaleQty(productId, delta) {
  const input = document.querySelector(`[data-qty="${CSS.escape(productId)}"]`);
  const product = state.products.find((item) => item.id === productId);
  if (!input || !product) return;
  const next = Math.max(0, Math.min(Number(product.stock || 0), Number(input.value || 0) + delta));
  input.value = String(next);
  updateSaleTotal();
}

function selectedItems() {
  return state.products.map((product) => {
    const input = document.querySelector(`[data-qty="${CSS.escape(product.id)}"]`);
    const qty = Number(input?.value || 0);
    return qty > 0 ? { productId: product.id, name: product.name, qty, price: Number(product.price || 0), lineTotal: qty * Number(product.price || 0) } : null;
  }).filter(Boolean);
}

function updateSaleTotal() {
  const total = selectedItems().reduce((sum, item) => sum + item.lineTotal, 0);
  $("#sale-total").textContent = KZT.format(total);
}

async function adjustStock(productId, delta, button) {
  button.disabled = true;
  try {
    const ref = doc(state.db, "products", productId);
    await runTransaction(state.db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("Товар не найден");
      const current = Number(snap.data().stock || 0);
      tx.update(ref, { stock: Math.max(0, current + delta), updatedAt: serverTimestamp(), updatedBy: state.user.uid });
    });
    toast("Остаток обновлён");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

async function createSale(event) {
  event.preventDefault();
  const errorNode = $("#sale-error");
  errorNode.textContent = "";
  const items = selectedItems();
  if (!items.length) {
    errorNode.textContent = "Добавьте хотя бы один товар.";
    return;
  }

  const customer = $("#sale-customer").value.trim();
  const phone = $("#sale-phone").value.trim();
  const city = $("#sale-city").value.trim();
  const notes = $("#sale-notes").value.trim();
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const submit = event.submitter;
  submit.disabled = true;

  try {
    const productRefs = items.map((item) => doc(state.db, "products", item.productId));
    const orderRef = doc(collection(state.db, "orders"));

    await runTransaction(state.db, async (tx) => {
      const productSnaps = [];
      for (const ref of productRefs) productSnaps.push(await tx.get(ref));

      productSnaps.forEach((snap, index) => {
        if (!snap.exists()) throw new Error(`${items[index].productId}: товар не найден`);
        const stock = Number(snap.data().stock || 0);
        if (stock < items[index].qty) throw new Error(`${items[index].productId}: на складе только ${stock}`);
      });

      productSnaps.forEach((snap, index) => {
        tx.update(productRefs[index], {
          stock: Number(snap.data().stock || 0) - items[index].qty,
          updatedAt: serverTimestamp(),
          updatedBy: state.user.uid
        });
      });

      tx.set(orderRef, {
        customer,
        phone,
        city,
        notes,
        items,
        total,
        status: "new",
        source: "mobile",
        createdAt: serverTimestamp(),
        createdAtClient: new Date().toISOString(),
        createdBy: state.user.uid,
        createdByEmail: state.user.email || ""
      });
    });

    event.target.reset();
    $$('[data-qty]').forEach((input) => input.value = "0");
    updateSaleTotal();
    toast("Заказ создан");
    navigate("orders");
  } catch (error) {
    errorNode.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
}

function navigate(name) {
  $$(".view").forEach((view) => view.classList.remove("active"));
  $$(".nav-btn").forEach((button) => button.classList.toggle("active", button.dataset.nav === name));
  $(`#view-${name}`).classList.add("active");
  const subtitles = { dashboard: "Сегодня", orders: "Продажи и заявки", sale: "Быстрое оформление", stock: "Остатки продукции", settings: "Приложение" };
  $("#page-subtitle").textContent = subtitles[name] || "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function wireUi() {
  $$('[data-nav]').forEach((button) => button.addEventListener("click", () => navigate(button.dataset.nav)));

  $("#save-config").addEventListener("click", () => {
    const errorNode = $("#setup-error");
    errorNode.textContent = "";
    try {
      const config = normalizeFirebaseConfigText($("#firebase-config-input").value);
      if (!validFirebaseConfig(config)) throw new Error("В конфигурации не хватает apiKey, authDomain, projectId или appId.");
      localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(config));
      location.reload();
    } catch (error) {
      errorNode.textContent = `Не удалось прочитать конфигурацию: ${error.message}`;
    }
  });

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

  $("#sale-form").addEventListener("submit", createSale);
  $("#logout").addEventListener("click", () => signOut(state.auth));
  $("#reset-config").addEventListener("click", () => {
    localStorage.removeItem(LOCAL_CONFIG_KEY);
    location.reload();
  });
  $("#sync-button").addEventListener("click", () => toast(navigator.onLine ? "Синхронизация активна" : "Нет соединения с интернетом"));

  $("#order-filters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-status]");
    if (!button) return;
    state.orderFilter = button.dataset.status;
    $$("#order-filters .chip").forEach((chip) => chip.classList.toggle("active", chip === button));
    renderOrders();
  });
}

async function boot() {
  wireUi();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});

  const config = configuredFirebase();
  if (!validFirebaseConfig(config)) {
    showOnly("#setup");
    hideBoot();
    return;
  }

  try {
    await initFirebase(config);
  } catch (error) {
    localStorage.removeItem(LOCAL_CONFIG_KEY);
    showOnly("#setup");
    $("#setup-error").textContent = `Firebase не инициализирован: ${error.message}`;
  } finally {
    hideBoot();
  }
}

boot();
