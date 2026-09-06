import { getApps } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const KZT = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 });
const STAFF_NAMES = new Map([
  ["mihagavr@gmail.com", "Михаил"],
  ["a.kalashin@gmail.com", "Алексей"]
]);
const SMOKE_MODELS = new Set(["DM30", "DM60", "DM90"]);
const HOLI_MODEL = "HOLI";
const RESUME_KEY = "conductor.app.started";

let db = null;
let products = [];
let catalog = [];
const selectedQty = new Map();
let pendingSale = null;
let saleObserver = null;

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function employeeName(email = "") {
  return STAFF_NAMES.get(String(email).trim().toLowerCase()) || "Сотрудник";
}

function currentUser() {
  const app = getApps()[0];
  return app ? getAuth(app).currentUser : null;
}

function modelPrice(modelId) {
  const row = catalog.find((item) => item.id === modelId);
  return Number(row?.price || 0);
}

function holiPrice(quantity) {
  if (quantity > 2000) return 650;
  if (quantity >= 500) return 850;
  return modelPrice(HOLI_MODEL);
}

function injectStyles() {
  if (document.getElementById("warehouse-enhancements-v1-styles")) return;
  const style = document.createElement("style");
  style.id = "warehouse-enhancements-v1-styles";
  style.textContent = `
    .enh-hidden{display:none!important}
    .content{padding-top:6px!important}
    .view>.section-head:first-child{margin-top:4px!important}
    #view-dashboard .metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important;margin:4px 0 10px!important}
    #view-dashboard .metric{min-height:100px;padding:13px!important}
    #view-dashboard .metric b{font-size:22px!important}
    .cash-summary-card{display:flex;flex-direction:column;justify-content:space-between;gap:10px}
    .cash-summary-card .cash-summary-copy span,.cash-summary-card .cash-summary-copy b{display:block}
    .cash-summary-card .cash-summary-copy span{color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.08em}
    .cash-summary-card .cash-summary-copy b{margin-top:6px;font-size:22px;color:var(--green)}
    .cash-movement-btn{width:100%;min-height:34px;border:1px solid rgba(56,166,255,.3);border-radius:10px;background:rgba(56,166,255,.08);color:#a9d8ff;font-size:10px;font-weight:900;cursor:pointer}
    #view-stock .stock-list{grid-template-columns:1fr!important}
    #view-stock .stock-color-summary{display:grid!important;grid-template-columns:1fr!important;gap:6px!important;margin:11px 0!important}
    #view-stock .stock-color-summary span{display:flex!important;width:100%!important;justify-content:flex-start!important;gap:7px!important;padding:8px 9px!important;border-radius:10px!important;font-size:11px!important}
    #view-stock .stock-color-summary span b{margin-left:auto!important;font-size:13px!important}
    #view-stock .stock-model-card{padding:13px!important}
    #view-stock .stock-name b{font-size:15px}
    #view-stock .stock-summary{margin-bottom:9px}
    .cash-type-switch{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .cash-type-option{position:relative}
    .cash-type-option input{position:absolute;opacity:0;pointer-events:none}
    .cash-type-option span{display:flex;align-items:center;justify-content:center;min-height:44px;border:1px solid var(--line);border-radius:12px;background:#090e16;color:#cbd3df;font-size:12px;font-weight:900;cursor:pointer}
    .cash-type-option input:checked+span{border-color:rgba(56,166,255,.62);background:rgba(56,166,255,.12);color:#fff}
    .cash-type-option.sawmill input:checked+span{border-color:rgba(255,89,111,.55);background:rgba(255,89,111,.09);color:#ffabb7}
    .cash-dialog-note{margin:-3px 0 0;color:var(--muted);font-size:10px;line-height:1.4}
    .sale-confirm-dialog{width:min(calc(100% - 20px),580px);max-height:90dvh}
    .sale-confirm-structure{display:grid;gap:7px}
    .sale-confirm-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:9px 10px;border:1px solid var(--line);border-radius:12px;background:#090e16}
    .sale-confirm-item b,.sale-confirm-item small{display:block}
    .sale-confirm-item b{font-size:12px}
    .sale-confirm-item small{margin-top:3px;color:var(--muted);font-size:10px}
    .sale-confirm-item strong{white-space:nowrap;font-size:13px}
    .sale-pricing-box{display:grid;gap:9px;padding:11px;border:1px solid var(--line);border-radius:14px;background:#090e16}
    .sale-pricing-row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:11px}
    .sale-pricing-row span{color:var(--muted)}
    .sale-pricing-row b{font-size:14px}
    .sale-discount-toggle{display:flex!important;grid-template-columns:none!important;align-items:center;gap:9px!important;padding:8px 0;color:#fff!important}
    .sale-discount-toggle input{width:20px!important;height:20px!important;accent-color:#ff7f43}
    .sale-adjust-input{font-size:18px!important;font-weight:900!important;text-align:right}
    .sale-fixed-note{color:#ffca6b;font-size:10px;line-height:1.4}
    .sale-final-total{display:flex;align-items:center;justify-content:space-between;padding:12px 2px 2px}
    .sale-final-total span{color:var(--muted);font-size:12px}
    .sale-final-total b{font-size:28px}
    .operation-money-positive{color:var(--green)!important}
    .operation-money-negative{color:#ff9baa!important}
    @media(max-width:430px){
      .content{padding-top:3px!important}
      .section-head{margin-top:10px}
      .sticky-head{padding-top:5px!important}
      #view-dashboard .metric{min-height:96px;padding:11px!important}
      #view-dashboard .metric b{font-size:20px!important}
      .cash-movement-btn{font-size:9px}
    }
  `;
  document.head.appendChild(style);
}

function compactDashboard() {
  const salesMetric = document.getElementById("metric-sales")?.closest(".metric");
  salesMetric?.classList.add("enh-hidden");

  const overview = document.getElementById("inventory-overview");
  overview?.classList.add("enh-hidden");
  overview?.previousElementSibling?.classList.add("enh-hidden");

  const quick = document.querySelector("#view-dashboard .quick-grid");
  quick?.classList.add("enh-hidden");
  quick?.previousElementSibling?.classList.add("enh-hidden");

  const recent = document.getElementById("dashboard-sales");
  recent?.classList.add("enh-hidden");
  recent?.previousElementSibling?.classList.add("enh-hidden");

  const oldCash = document.getElementById("open-cash-dialog");
  if (oldCash && !document.getElementById("cash-summary-card")) {
    const balanceText = document.getElementById("metric-cash")?.textContent || "0 ₸";
    const card = document.createElement("article");
    card.id = "cash-summary-card";
    card.className = "metric cash-summary-card";
    card.innerHTML = `
      <div class="cash-summary-copy">
        <span>Доступно в кассе</span>
        <b id="metric-cash">${escapeHtml(balanceText)}</b>
      </div>
      <button id="open-cash-movement" class="cash-movement-btn" type="button">Движение денег</button>
    `;
    oldCash.replaceWith(card);
    card.querySelector("#open-cash-movement")?.addEventListener("click", openCashMovementDialog);
  }
}

function prepareCashDialog() {
  const dialog = document.getElementById("cash-dialog");
  if (!dialog || document.getElementById("cash-movement-form")) return;
  dialog.innerHTML = `
    <form id="cash-movement-form" method="dialog" class="stock-dialog-card">
      <div class="dialog-head">
        <div><div class="eyebrow">Касса</div><h2>Движение денег</h2></div>
        <button id="cash-movement-dialog-close" class="dialog-close" type="button" aria-label="Закрыть">×</button>
      </div>
      <div class="cash-available"><span>Доступно</span><b id="cash-dialog-balance">0 ₸</b></div>
      <div class="cash-type-switch" role="radiogroup" aria-label="Тип движения денег">
        <label class="cash-type-option">
          <input type="radio" name="cash-movement-type" value="deposit" checked>
          <span>Пополнение</span>
        </label>
        <label class="cash-type-option sawmill">
          <input type="radio" name="cash-movement-type" value="sawmill">
          <span>Пилорама</span>
        </label>
      </div>
      <label>Сумма<input id="cash-movement-amount" type="number" min="1" step="1" inputmode="numeric" required placeholder="0"></label>
      <label>Комментарий<textarea id="cash-movement-comment" rows="3" maxlength="300" placeholder="Необязательно"></textarea></label>
      <p class="cash-dialog-note">Пополнение увеличивает кассу. «Пилорама» уменьшает баланс на указанную сумму.</p>
      <button id="cash-movement-submit" class="btn primary full" type="submit">Сохранить движение</button>
      <p id="cash-movement-error" class="error"></p>
      <div id="cash-withdrawal-history" class="enh-hidden"></div>
    </form>
  `;
  dialog.querySelector("#cash-movement-dialog-close")?.addEventListener("click", () => dialog.close());
  dialog.querySelector("#cash-movement-form")?.addEventListener("submit", saveCashMovement);
}

function openCashMovementDialog() {
  prepareCashDialog();
  const dialog = document.getElementById("cash-dialog");
  if (!dialog) return;
  const form = document.getElementById("cash-movement-form");
  form?.reset();
  const errorNode = document.getElementById("cash-movement-error");
  if (errorNode) errorNode.textContent = "";
  const balance = document.getElementById("metric-cash")?.textContent || "0 ₸";
  const balanceNode = document.getElementById("cash-dialog-balance");
  if (balanceNode) balanceNode.textContent = balance;
  dialog.showModal();
  setTimeout(() => document.getElementById("cash-movement-amount")?.focus(), 80);
}

async function saveCashMovement(event) {
  event.preventDefault();
  const user = currentUser();
  const errorNode = document.getElementById("cash-movement-error");
  const submit = document.getElementById("cash-movement-submit");
  if (errorNode) errorNode.textContent = "";
  if (!user || !db) {
    if (errorNode) errorNode.textContent = "Нет активной авторизации.";
    return;
  }

  const type = document.querySelector('input[name="cash-movement-type"]:checked')?.value || "deposit";
  const amount = Math.trunc(Number(document.getElementById("cash-movement-amount")?.value || 0));
  const comment = document.getElementById("cash-movement-comment")?.value.trim() || "";
  if (!Number.isInteger(amount) || amount <= 0) {
    if (errorNode) errorNode.textContent = "Укажите сумму больше нуля.";
    return;
  }

  if (submit) submit.disabled = true;
  try {
    const cashRef = doc(db, "finance", "cash");
    const operationRef = doc(collection(db, "orders"));
    const employee = employeeName(user.email || "");
    const delta = type === "deposit" ? amount : -amount;

    await runTransaction(db, async (tx) => {
      const cashSnap = await tx.get(cashRef);
      if (!cashSnap.exists()) throw new Error("Баланс кассы ещё не создан.");
      const before = Number(cashSnap.data().balance || 0);
      const after = before + delta;
      if (after < 0) throw new Error(`В кассе доступно только ${KZT.format(before)}.`);

      tx.update(cashRef, {
        balance: after,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByEmail: user.email || "",
        updatedByName: employee
      });

      tx.set(operationRef, {
        operationType: type === "deposit" ? "cash_deposit" : "cash_sawmill",
        amount,
        cashDelta: delta,
        before,
        after,
        items: [],
        total: delta,
        note: comment,
        status: "done",
        source: "stock-app",
        createdAt: serverTimestamp(),
        createdAtClient: new Date().toISOString(),
        createdBy: user.uid,
        createdByEmail: user.email || "",
        createdByName: employee
      });
    });

    document.getElementById("cash-dialog")?.close();
    showToast(`${type === "deposit" ? "Пополнение" : "Пилорама"} ${KZT.format(amount)} · ${employee}`);
  } catch (error) {
    if (errorNode) errorNode.textContent = error.message || "Не удалось изменить баланс.";
  } finally {
    if (submit) submit.disabled = false;
  }
}

function showToast(message) {
  const node = document.getElementById("toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => node.classList.remove("show"), 2400);
}

function syncVisibleSelection() {
  document.querySelectorAll("[data-qty]").forEach((input) => {
    const id = input.dataset.qty;
    const qty = Math.max(0, Math.trunc(Number(input.value) || 0));
    if (!id) return;
    if (qty > 0) selectedQty.set(id, qty);
    else selectedQty.delete(id);
  });
}

function observeSaleSelection() {
  const root = document.getElementById("sale-products");
  if (!root || saleObserver) return;
  syncVisibleSelection();
  saleObserver = new MutationObserver(() => syncVisibleSelection());
  saleObserver.observe(root, { childList: true, subtree: true });

  document.addEventListener("input", (event) => {
    if (event.target?.matches?.("[data-qty]")) syncVisibleSelection();
  });

  document.addEventListener("click", (event) => {
    if (event.target?.closest?.("[data-qty-plus],[data-qty-minus],[data-sale-model]")) {
      setTimeout(syncVisibleSelection, 0);
    }
  });
}

function selectedItems() {
  syncVisibleSelection();
  const holiQty = [...selectedQty.entries()].reduce((sum, [id, qty]) => {
    const product = products.find((item) => item.id === id);
    return product?.modelId === HOLI_MODEL ? sum + qty : sum;
  }, 0);

  return [...selectedQty.entries()].map(([id, qty]) => {
    const product = products.find((item) => item.id === id);
    if (!product || qty <= 0) return null;
    const modelId = product.modelId || id.split("_")[0];
    const price = modelId === HOLI_MODEL ? holiPrice(holiQty) : modelPrice(modelId);
    return {
      inventoryId: id,
      productId: modelId,
      name: product.name || `${modelId} · ${product.colorName || "Товар"}`,
      colorId: product.colorId || "",
      colorName: product.colorName || "",
      qty,
      price,
      lineTotal: qty * price
    };
  }).filter(Boolean);
}

function ensureSaleDialog() {
  let dialog = document.getElementById("sale-confirm-dialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "sale-confirm-dialog";
  dialog.className = "stock-dialog sale-confirm-dialog";
  dialog.innerHTML = `
    <form id="sale-confirm-form" method="dialog" class="stock-dialog-card">
      <div class="dialog-head">
        <div><div class="eyebrow">Проверка продажи</div><h2>Подтвердить сумму</h2></div>
        <button id="sale-confirm-close" class="dialog-close" type="button" aria-label="Закрыть">×</button>
      </div>
      <div id="sale-confirm-structure" class="sale-confirm-structure"></div>
      <div id="sale-pricing-box" class="sale-pricing-box"></div>
      <div class="sale-final-total"><span>В кассу поступит</span><b id="sale-confirm-final">0 ₸</b></div>
      <button id="sale-confirm-submit" class="btn primary full" type="submit">Подтвердить продажу</button>
      <p id="sale-confirm-error" class="error"></p>
    </form>
  `;
  document.body.appendChild(dialog);
  dialog.querySelector("#sale-confirm-close")?.addEventListener("click", () => dialog.close());
  dialog.querySelector("#sale-confirm-form")?.addEventListener("submit", confirmSale);
  return dialog;
}

function renderSalePricing() {
  if (!pendingSale) return;
  const box = document.getElementById("sale-pricing-box");
  if (!box) return;

  const { baseNonHoli, holiTotal, smokeSubtotal } = pendingSale;
  box.innerHTML = `
    ${baseNonHoli > 0 ? `
      <div class="sale-pricing-row"><span>Товары кроме Холи</span><b>${KZT.format(baseNonHoli)}</b></div>
      ${smokeSubtotal > 0 ? `
        <label class="sale-discount-toggle">
          <input id="sale-smoke-discount" type="checkbox">
          <span>Скидка −10% на дымы</span>
        </label>
      ` : ""}
      <label>Сумма товаров кроме Холи
        <input id="sale-adjust-nonholi" class="sale-adjust-input" type="number" min="0" step="1" inputmode="numeric" value="${Math.round(baseNonHoli)}">
      </label>
    ` : ""}
    ${holiTotal > 0 ? `
      <div class="sale-pricing-row"><span>Краски Холи</span><b>${KZT.format(holiTotal)}</b></div>
      <div class="sale-fixed-note">Цена Холи фиксируется действующей логикой количества и вручную не корректируется.</div>
    ` : ""}
  `;

  const discount = document.getElementById("sale-smoke-discount");
  const amountInput = document.getElementById("sale-adjust-nonholi");
  discount?.addEventListener("change", () => {
    if (!amountInput || !pendingSale) return;
    amountInput.value = String(discount.checked
      ? Math.round(pendingSale.baseNonHoli - pendingSale.smokeSubtotal * 0.10)
      : Math.round(pendingSale.baseNonHoli));
    updateFinalTotal();
  });
  amountInput?.addEventListener("input", updateFinalTotal);
  updateFinalTotal();
}

function updateFinalTotal() {
  if (!pendingSale) return;
  const nonHoli = pendingSale.baseNonHoli > 0
    ? Math.max(0, Math.trunc(Number(document.getElementById("sale-adjust-nonholi")?.value || 0)))
    : 0;
  const total = nonHoli + pendingSale.holiTotal;
  const node = document.getElementById("sale-confirm-final");
  if (node) node.textContent = KZT.format(total);
}

function openSaleConfirmation() {
  const items = selectedItems();
  const errorNode = document.getElementById("sale-error");
  if (errorNode) errorNode.textContent = "";
  if (!items.length) {
    if (errorNode) errorNode.textContent = "Укажите количество хотя бы одного товара.";
    return;
  }
  if (items.some((item) => !Number.isFinite(item.price) || item.price <= 0)) {
    if (errorNode) errorNode.textContent = "Цены товаров ещё загружаются. Повторите сохранение через секунду.";
    return;
  }

  const note = document.getElementById("sale-notes")?.value.trim() || "";
  const holiTotal = items.filter((item) => item.productId === HOLI_MODEL).reduce((sum, item) => sum + item.lineTotal, 0);
  const baseNonHoli = items.filter((item) => item.productId !== HOLI_MODEL).reduce((sum, item) => sum + item.lineTotal, 0);
  const smokeSubtotal = items.filter((item) => SMOKE_MODELS.has(item.productId)).reduce((sum, item) => sum + item.lineTotal, 0);

  pendingSale = { items, note, holiTotal, baseNonHoli, smokeSubtotal };
  const dialog = ensureSaleDialog();
  const structure = document.getElementById("sale-confirm-structure");
  if (structure) {
    structure.innerHTML = items.map((item) => `
      <div class="sale-confirm-item">
        <div>
          <b>${escapeHtml(item.productId)}${item.colorName ? ` · ${escapeHtml(item.colorName)}` : ""}</b>
          <small>${item.qty} × ${KZT.format(item.price)}</small>
        </div>
        <strong>${KZT.format(item.lineTotal)}</strong>
      </div>
    `).join("");
  }
  const confirmError = document.getElementById("sale-confirm-error");
  if (confirmError) confirmError.textContent = "";
  renderSalePricing();
  dialog.showModal();
}

async function requestSalePush(orderId) {
  const endpoint = String(window.CONDUCTOR_PUSH_ENDPOINT || "").trim();
  const user = currentUser();
  if (!endpoint || !user) return { configured: false, delivered: false };
  const idToken = await user.getIdToken();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ orderId })
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { configured: true, delivered: true };
  } catch (error) {
    console.error("Sale push request failed", error);
    return { configured: true, delivered: false };
  }
}

async function confirmSale(event) {
  event.preventDefault();
  if (!pendingSale || !db) return;
  const user = currentUser();
  const errorNode = document.getElementById("sale-confirm-error");
  const submit = document.getElementById("sale-confirm-submit");
  if (errorNode) errorNode.textContent = "";
  if (!user) {
    if (errorNode) errorNode.textContent = "Нет активной авторизации.";
    return;
  }

  const chargedNonHoli = pendingSale.baseNonHoli > 0
    ? Math.max(0, Math.trunc(Number(document.getElementById("sale-adjust-nonholi")?.value || 0)))
    : 0;
  const total = chargedNonHoli + pendingSale.holiTotal;
  if (!Number.isInteger(total) || total <= 0) {
    if (errorNode) errorNode.textContent = "Итоговая сумма должна быть больше нуля.";
    return;
  }

  if (submit) submit.disabled = true;
  const employee = employeeName(user.email || "");
  const discountChecked = document.getElementById("sale-smoke-discount")?.checked === true;
  const items = pendingSale.items.map((item) => ({ ...item }));
  const selectedIds = items.map((item) => item.inventoryId);

  try {
    const productRefs = items.map((item) => doc(db, "products", item.inventoryId));
    const movementRefs = items.map(() => doc(collection(db, "stockMovements")));
    const saleRef = doc(collection(db, "orders"));
    const cashRef = doc(db, "finance", "cash");

    await runTransaction(db, async (tx) => {
      const productSnaps = [];
      for (const ref of productRefs) productSnaps.push(await tx.get(ref));
      const cashSnap = await tx.get(cashRef);
      if (!cashSnap.exists()) throw new Error("Баланс кассы ещё не создан.");

      productSnaps.forEach((snap, index) => {
        if (!snap.exists()) throw new Error(`${items[index].name}: товар не найден`);
        const stock = Number(snap.data().stock || 0);
        if (stock < items[index].qty) throw new Error(`${items[index].name}: на складе только ${stock}`);
      });

      productSnaps.forEach((snap, index) => {
        const data = snap.data();
        const before = Number(data.stock || 0);
        const after = before - items[index].qty;
        tx.update(productRefs[index], {
          stock: after,
          updatedAt: serverTimestamp(),
          updatedBy: user.uid,
          updatedByName: employee
        });
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
          reason: pendingSale.note,
          createdAt: serverTimestamp(),
          createdAtClient: new Date().toISOString(),
          createdBy: user.uid,
          createdByEmail: user.email || "",
          createdByName: employee
        });
      });

      tx.set(saleRef, {
        items,
        total,
        baseTotal: pendingSale.baseNonHoli + pendingSale.holiTotal,
        note: pendingSale.note,
        pricing: {
          nonHoliBaseTotal: pendingSale.baseNonHoli,
          nonHoliChargedTotal: chargedNonHoli,
          holiFixedTotal: pendingSale.holiTotal,
          smokeBaseTotal: pendingSale.smokeSubtotal,
          smokeDiscount10: discountChecked,
          finalTotal: total
        },
        status: "done",
        source: "stock-app",
        createdAt: serverTimestamp(),
        createdAtClient: new Date().toISOString(),
        createdBy: user.uid,
        createdByEmail: user.email || "",
        createdByName: employee
      });

      tx.update(cashRef, {
        balance: Number(cashSnap.data().balance || 0) + total,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByEmail: user.email || "",
        updatedByName: employee
      });
    });

    const pushResult = await requestSalePush(saleRef.id);
    document.getElementById("sale-confirm-dialog")?.close();
    await clearApplicationSelection(selectedIds);
    const noteInput = document.getElementById("sale-notes");
    if (noteInput) noteInput.value = "";
    pendingSale = null;
    showToast(pushResult.configured && !pushResult.delivered
      ? "Продажа записана · push временно не отправлен"
      : `Продажа записана · ${employee}`);
    document.querySelector('[data-nav="sales"]')?.click();
  } catch (error) {
    if (errorNode) errorNode.textContent = error.message || "Не удалось сохранить продажу.";
  } finally {
    if (submit) submit.disabled = false;
  }
}

async function clearApplicationSelection(ids) {
  const byModel = new Map();
  for (const id of ids) {
    const product = products.find((item) => item.id === id);
    if (!product) continue;
    const modelId = product.modelId || id.split("_")[0];
    if (!byModel.has(modelId)) byModel.set(modelId, []);
    byModel.get(modelId).push(id);
  }

  for (const [modelId, productIds] of byModel) {
    const visible = productIds.some((id) => document.querySelector(`[data-qty="${CSS.escape(id)}"]`));
    if (!visible) {
      document.querySelector(`[data-sale-model="${CSS.escape(modelId)}"]`)?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    for (const id of productIds) {
      const input = document.querySelector(`[data-qty="${CSS.escape(id)}"]`);
      if (!input) continue;
      input.value = "0";
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  selectedQty.clear();
  document.querySelector('[data-sale-model][aria-expanded="true"]')?.click();
}

function interceptSaleSubmit() {
  document.addEventListener("submit", (event) => {
    if (event.target?.id !== "sale-form") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openSaleConfirmation();
  }, true);
}

function suppressResumeSplash() {
  const boot = document.getElementById("boot");
  if (!boot) return;

  if (boot.classList.contains("hide")) sessionStorage.setItem(RESUME_KEY, "1");
  const observer = new MutationObserver(() => {
    if (boot.classList.contains("hide")) sessionStorage.setItem(RESUME_KEY, "1");
  });
  observer.observe(boot, { attributes: true, attributeFilter: ["class"] });

  const hideOnResume = () => {
    if (sessionStorage.getItem(RESUME_KEY) === "1") boot.classList.add("hide");
  };
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) setTimeout(hideOnResume, 0);
  });
  window.addEventListener("pageshow", () => setTimeout(hideOnResume, 0));
}

async function waitForDatabase() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (window.CONDUCTOR_FIRESTORE && getApps().length) return window.CONDUCTOR_FIRESTORE;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("База данных ещё не готова.");
}

async function start() {
  injectStyles();
  suppressResumeSplash();
  db = await waitForDatabase();

  onSnapshot(collection(db, "products"), (snap) => {
    products = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    syncVisibleSelection();
  });
  onSnapshot(collection(db, "catalog"), (snap) => {
    catalog = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
  });

  compactDashboard();
  prepareCashDialog();
  observeSaleSelection();
  interceptSaleSubmit();

  const dashboard = document.getElementById("view-dashboard");
  if (dashboard) {
    new MutationObserver(() => compactDashboard()).observe(dashboard, { childList: true, subtree: true });
  }
}

start().catch((error) => console.error("Warehouse enhancements failed", error));
