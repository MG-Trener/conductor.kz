import { getApps } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  limit,
  runTransaction,
  serverTimestamp,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const KZT = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 });
const DEFAULT_PRICES = { DM30: 2500, DM60: 3000, DM90: 3500, HOLI: 1000 };

let products = [];
let movements = [];
let db = null;
let formBound = false;
let documentBound = false;
let publicPriceSyncPromise = null;

function employeeNameFromEmail(email = "") {
  const normalized = String(email).trim().toLowerCase();
  if (normalized === "mihagavr@gmail.com") return "Михаил";
  if (normalized) return "Алексей";
  return "Сотрудник";
}

function initializedInventoryIds() {
  const ids = new Set();
  for (const movement of movements) {
    if (movement.inventoryId) ids.add(movement.inventoryId);
  }
  for (const product of products) {
    if (product.stockInitialized === true || product.inventoryInitialized === true || Number(product.stock || 0) > 0) ids.add(product.id);
  }
  return ids;
}

function modelIdFromDialog() {
  const inventoryId = document.querySelector("#model-variant-list [data-model-balance]")?.dataset.modelBalance || "";
  if (inventoryId.includes("_")) return inventoryId.split("_")[0];
  const title = document.getElementById("model-dialog-title")?.textContent || "";
  return Object.keys(DEFAULT_PRICES).find((id) => title.includes(id)) || "";
}

function modelProducts(modelId) {
  return products.filter((item) => item.modelId === modelId && !item.legacyUnassigned && !item.modelOnly && item.active !== false);
}

function currentModelPrice(modelId) {
  const variant = modelProducts(modelId).find((item) => Number(item.price) > 0);
  return Number(variant?.price || DEFAULT_PRICES[modelId] || 0);
}

async function syncMissingPublicPrices() {
  if (publicPriceSyncPromise || !products.length || !db) return publicPriceSyncPromise;
  const app = getApps()[0];
  const user = app ? getAuth(app).currentUser : null;
  if (!user) return;

  publicPriceSyncPromise = (async () => {
    const snapshot = await getDocs(collection(db, "publicProducts"));
    const published = new Map(snapshot.docs.map((item) => [item.id, Number(item.data().price || 0)]));
    const employee = employeeNameFromEmail(user.email || "");
    await Promise.all(Object.keys(DEFAULT_PRICES).map(async (modelId) => {
      const price = currentModelPrice(modelId);
      if (!price || published.get(modelId) === price) return;
      const name = document.querySelector(`#stock-list [data-open-model="${modelId}"]`)?.closest(".stock-card")?.querySelector(".stock-name b")?.textContent?.trim() || modelId;
      await setDoc(doc(db, "publicProducts", modelId), {
        modelId,
        name,
        price,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: employee
      });
    }));
  })();

  try { await publicPriceSyncPromise; }
  catch { /* The next auth/product event retries the sync. */ }
  finally { publicPriceSyncPromise = null; }
}

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function injectStyles() {
  if (document.getElementById("inventory-v17-styles")) return;
  const style = document.createElement("style");
  style.id = "inventory-v17-styles";
  style.textContent = `
    #view-dashboard .hero-card{display:none!important}
    #view-dashboard .metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
    #stock-total{display:none!important}
    #view-stock .stock-summary{grid-template-columns:repeat(2,minmax(0,1fr))!important}
    .inventory-overview-card .overview-model-head>strong{display:none!important}
    .stock-model-card>.stock-main>.stock-count{display:none!important}
    #model-dialog-total{display:none!important}
    .model-sale-price-row{display:grid;gap:7px;color:#c8d0db;font-size:12px;font-weight:800}
    .model-sale-price-row input{width:100%;border:1px solid var(--line);background:#080c14;color:#fff;border-radius:14px;padding:13px 14px;outline:none;font-size:16px;font-weight:800}
    .model-main-price{display:block!important;margin-top:5px!important;color:#ffb34a!important;font-size:11px!important;font-weight:900!important}
    .inventory-not-set{color:var(--muted)!important}
    @media(max-width:430px){#view-dashboard .metric-grid{grid-template-columns:1fr 1fr!important}}
  `;
  document.head.appendChild(style);
}

function hideAggregateBlocks() {
  const low = document.getElementById("metric-low")?.closest(".metric");
  const movementsToday = document.getElementById("metric-movements")?.closest(".metric");
  if (low) low.style.display = "none";
  if (movementsToday) movementsToday.style.display = "none";

  const stockUnits = document.getElementById("stock-units");
  if (stockUnits?.parentElement) stockUnits.parentElement.style.display = "none";

  document.querySelectorAll(".inventory-overview-card .overview-model-head > strong").forEach((node) => node.style.display = "none");
  document.querySelectorAll(".stock-model-card > .stock-main > .stock-count").forEach((node) => node.style.display = "none");
  document.querySelectorAll(".variant-group-label span").forEach((node) => setText(node, "выберите цвет"));
}

function applyOverviewState() {
  const initialized = initializedInventoryIds();

  document.querySelectorAll(".inventory-overview-card").forEach((card) => {
    const modelId = card.querySelector(".overview-model-head b")?.textContent?.trim();
    if (!modelId) return;

    const headInfo = card.querySelector(".overview-model-head > div");
    if (headInfo) {
      let priceNode = headInfo.querySelector(".model-main-price");
      if (!priceNode) {
        priceNode = document.createElement("small");
        priceNode.className = "model-main-price";
        headInfo.appendChild(priceNode);
      }
      setText(priceNode, `Цена продажи: ${KZT.format(currentModelPrice(modelId))}`);
    }

    card.querySelectorAll(".overview-color").forEach((row) => {
      if (row.classList.contains("warning")) return;
      const colorName = row.querySelector("span")?.textContent?.trim();
      const value = row.querySelector("b");
      const product = products.find((item) => item.modelId === modelId && item.colorName === colorName);
      if (!product || !value) return;
      const isInitialized = initialized.has(product.id);
      setText(value, isInitialized ? String(Number(product.stock || 0)) : "—");
      value.classList.remove("low");
      value.classList.toggle("inventory-not-set", !isInitialized);
      value.title = isInitialized ? "Фактический остаток" : "Остаток ещё не внесён";
    });
  });
}

function applyStockCardState() {
  const initialized = initializedInventoryIds();
  document.querySelectorAll("#stock-list .stock-model-card").forEach((card) => {
    const title = card.querySelector(".stock-name b")?.textContent || "";
    const modelId = Object.keys(DEFAULT_PRICES).find((id) => title.includes(id));
    if (!modelId) return;

    const small = card.querySelector(".stock-name small");
    if (small) setText(small, `${modelProducts(modelId).length} цветов · цена ${KZT.format(currentModelPrice(modelId))}`);

    card.querySelectorAll(".stock-color-summary span").forEach((row) => {
      if (row.classList.contains("warning")) return;
      const value = row.querySelector("b");
      const product = products.find((item) => item.modelId === modelId && row.textContent.includes(item.colorName));
      if (!product || !value) return;
      const isInitialized = initialized.has(product.id);
      setText(value, isInitialized ? String(Number(product.stock || 0)) : "—");
      value.classList.toggle("inventory-not-set", !isInitialized);
    });
  });
}

function ensureModelPriceField() {
  const dialog = document.getElementById("model-dialog");
  const list = document.getElementById("model-variant-list");
  if (!dialog?.open || !list) return;

  const modelId = modelIdFromDialog();
  if (!modelId) return;

  let row = document.getElementById("model-sale-price-row");
  if (!row) {
    row = document.createElement("label");
    row.id = "model-sale-price-row";
    row.className = "model-sale-price-row";
    row.innerHTML = `Цена продажи модели, ₸<input id="model-sale-price" type="number" min="1" step="1" inputmode="numeric" required>`;
    list.before(row);
  }

  const priceInput = document.getElementById("model-sale-price");
  if (priceInput && priceInput.dataset.modelId !== modelId) {
    priceInput.dataset.modelId = modelId;
    priceInput.value = String(currentModelPrice(modelId));
  }

  const initialized = initializedInventoryIds();
  document.querySelectorAll("#model-variant-list [data-model-balance]").forEach((input) => {
    const product = products.find((item) => item.id === input.dataset.modelBalance);
    if (!product || product.legacyUnassigned || input.dataset.inventoryPatched) return;
    input.dataset.inventoryPatched = "1";
    if (!initialized.has(product.id)) input.value = "";
    input.addEventListener("input", () => input.dataset.userEdited = "1", { once: true });
    const small = input.closest(".model-variant-row")?.querySelector(".model-variant-info small");
    if (small && !initialized.has(product.id)) setText(small, "Сейчас: не внесено");
  });
}

function friendlyError(error) {
  if (error?.code === "permission-denied" || String(error?.message || "").toLowerCase().includes("permission")) {
    return "Firebase отклонил сохранение: у аккаунта нет доступа или на сервере не опубликованы актуальные Firestore Rules.";
  }
  return error?.message || "Не удалось сохранить изменения.";
}

async function saveModelInventory(event) {
  if (event.target?.id !== "model-balance-form") return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const modelId = modelIdFromDialog();
  const errorNode = document.getElementById("model-balance-error");
  const price = Math.trunc(Number(document.getElementById("model-sale-price")?.value));
  if (errorNode) errorNode.textContent = "";

  if (!modelId) {
    if (errorNode) errorNode.textContent = "Не удалось определить модель.";
    return;
  }
  if (!Number.isFinite(price) || price <= 0) {
    if (errorNode) errorNode.textContent = "Укажите цену продажи модели больше нуля.";
    return;
  }

  const app = getApps()[0];
  const user = app ? getAuth(app).currentUser : null;
  if (!app || !user || !db) {
    if (errorNode) errorNode.textContent = "Нет активной авторизации Firebase.";
    return;
  }

  const entered = [...document.querySelectorAll("#model-variant-list [data-model-balance]")].map((input) => ({
    id: input.dataset.modelBalance,
    raw: input.value.trim(),
    stock: Math.trunc(Number(input.value))
  })).filter((item) => item.raw !== "" && Number.isFinite(item.stock) && item.stock >= 0);

  const invalidStock = [...document.querySelectorAll("#model-variant-list [data-model-balance]")]
    .some((input) => input.value.trim() !== "" && (!Number.isInteger(Number(input.value)) || Number(input.value) < 0));
  if (invalidStock) {
    if (errorNode) errorNode.textContent = "Остаток должен быть целым числом не меньше нуля.";
    return;
  }

  const byId = new Map(products.map((item) => [item.id, item]));
  const variants = modelProducts(modelId);
  const stockChanged = entered.filter((item) => Number(byId.get(item.id)?.stock || 0) !== item.stock);

  const submit = event.submitter || event.target.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  const employee = employeeNameFromEmail(user.email || "");
  const reason = document.getElementById("model-balance-reason")?.value.trim() || `Инвентаризация ${modelId}`;

  try {
    const enteredMap = new Map(entered.map((item) => [item.id, item]));
    const refIds = [...new Set([...variants.map((item) => item.id), ...entered.map((item) => item.id)])];
    const refs = refIds.map((id) => doc(db, "products", id));
    const movementRefs = new Map(stockChanged.map((item) => [item.id, doc(collection(db, "stockMovements"))]));
    const publicProductRef = doc(db, "publicProducts", modelId);

    await runTransaction(db, async (tx) => {
      const snaps = [];
      for (const ref of refs) snaps.push(await tx.get(ref));
      const snapById = new Map(snaps.map((snap) => [snap.id, snap]));

      for (const id of refIds) {
        const snap = snapById.get(id);
        if (!snap?.exists()) throw new Error(`${id}: позиция не найдена`);
        const data = snap.data();
        const desired = enteredMap.get(id);
        const update = {
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          updatedByName: employee
        };

        if (!data.legacyUnassigned && data.modelId === modelId) {
          update.price = price;
          update.priceUpdatedAt = serverTimestamp();
          update.priceUpdatedBy = user.uid;
          update.priceUpdatedByName = employee;
        }

        if (desired) {
          const before = Number(data.stock || 0);
          const after = desired.stock;
          update.stock = after;
          update.stockInitialized = true;
          update.inventoryInitialized = true;
          update.lastInventoryAt = serverTimestamp();
          update.lastInventoryBy = user.uid;
          update.lastInventoryByName = employee;
          if (data.legacyUnassigned) update.active = after > 0;

          if (before !== after) {
            const unitCost = Number(data.avgCost || data.lastCost || 0);
            tx.set(movementRefs.get(id), {
              type: "adjustment",
              inventoryId: id,
              productId: data.modelId || modelId,
              productName: data.name || `${modelId} · ${data.colorName || "Нераспределено"}`,
              colorId: data.colorId || "",
              colorName: data.colorName || "",
              qtyDelta: after - before,
              before,
              after,
              unitCost,
              totalCost: Math.abs(after - before) * unitCost,
              reason,
              createdAt: serverTimestamp(),
              createdAtClient: new Date().toISOString(),
              createdBy: user.uid,
              createdByEmail: user.email || "",
              createdByName: employee
            });
          }
        }

        tx.update(doc(db, "products", id), update);
      }

      tx.set(publicProductRef, {
        modelId,
        name: document.getElementById("model-dialog-title")?.textContent?.trim() || modelId,
        price,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: employee
      });
    });

    document.getElementById("model-dialog")?.close();
    const toast = document.getElementById("toast");
    if (toast) {
      setText(toast, `${modelId}: цена и остатки сохранены · ${employee}`);
      toast.classList.add("show");
      setTimeout(() => toast.classList.remove("show"), 2400);
    }
  } catch (error) {
    if (errorNode) errorNode.textContent = friendlyError(error);
  } finally {
    if (submit) submit.disabled = false;
  }
}

function applyUi() {
  injectStyles();
  hideAggregateBlocks();
  applyOverviewState();
  applyStockCardState();
  ensureModelPriceField();
}

function scheduleApply() {
  setTimeout(applyUi, 0);
  setTimeout(applyUi, 100);
  setTimeout(applyUi, 300);
}

function bindUi() {
  const form = document.getElementById("model-balance-form");
  if (form && !formBound) {
    formBound = true;
    form.addEventListener("submit", saveModelInventory, true);
  }

  if (!documentBound) {
    documentBound = true;
    document.addEventListener("click", (event) => {
      if (event.target.closest("[data-open-model]") || event.target.closest("[data-nav]")) scheduleApply();
    });
  }
}

async function start() {
  let attempts = 0;
  while (!getApps().length && attempts < 100) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    attempts += 1;
  }
  if (!getApps().length) return;

  db = getFirestore(getApps()[0]);
  onAuthStateChanged(getAuth(getApps()[0]), (user) => {
    if (user) syncMissingPublicPrices();
  });
  bindUi();
  scheduleApply();

  onSnapshot(collection(db, "products"), (snap) => {
    products = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    bindUi();
    scheduleApply();
    syncMissingPublicPrices();
  });

  onSnapshot(query(collection(db, "stockMovements"), limit(500)), (snap) => {
    movements = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    scheduleApply();
  });
}

start().catch(() => {});
