from pathlib import Path
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding="utf-8")


def write(path, text):
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(text, encoding="utf-8")


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new, 1)


def replace_regex(text, pattern, new, label):
    text, count = re.subn(pattern, lambda _: new, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one regex match, found {count}")
    return text


def remove(path):
    target = ROOT / path
    if target.is_dir():
        shutil.rmtree(target)
    elif target.exists():
        target.unlink()


# ---------------------------------------------------------------------------
# 1. Consolidate the mobile business logic in app.js.
# ---------------------------------------------------------------------------
app = read("mobile/app.js")

app = replace_once(
    app,
    '  state.unsubs.push(onSnapshot(query(collection(state.db, "orders"), orderBy("createdAt", "desc"), limit(100)), (snap) => {\n    state.sales = snap.docs.map((item) => ({ id: item.id, ...item.data() }));\n    renderSales();\n    renderDashboard();\n    markInitialCollection("orders");\n  }, (error) => { toast(`Продажи: ${error.message}`); markInitialCollection("orders"); }));',
    '  state.unsubs.push(onSnapshot(query(collection(state.db, "orders"), orderBy("createdAt", "desc")), (snap) => {\n    state.sales = snap.docs.map((item) => ({ id: item.id, ...item.data() }));\n    renderSales();\n    renderDashboard();\n    window.dispatchEvent(new CustomEvent("conductor:orders-changed", { detail: { count: state.sales.length } }));\n    markInitialCollection("orders");\n  }, (error) => { toast(`Продажи: ${error.message}`); markInitialCollection("orders"); }));',
    "central orders realtime",
)
app = app.replace('query(collection(state.db, "stockMovements"), orderBy("createdAt", "desc"), limit(100))', 'query(collection(state.db, "stockMovements"), orderBy("createdAt", "desc"), limit(500))')

compact_block = r'''function initializedInventoryIds() {
  const ids = new Set(state.movements.map((item) => item.inventoryId).filter(Boolean));
  for (const product of state.products) {
    if (product.stockInitialized === true
      || product.inventoryInitialized === true
      || Number(product.stock || 0) > 0
      || product.modelId === "DM60R1G") ids.add(product.id);
  }
  return ids;
}

function compactColorSummary(modelId) {
  const variants = modelVariants(modelId);
  const unassigned = unassignedForModel(modelId);
  const initialized = initializedInventoryIds();
  const rows = variants.map((item) => {
    const ready = initialized.has(item.id);
    const value = ready ? String(Number(item.stock || 0)) : "—";
    return `<span>${colorDot(item)}${escapeHtml(item.colorName)} <b class="${ready ? "" : "inventory-not-set"}">${value}</b></span>`;
  }).join("");
  return `<div class="stock-color-summary">${rows}${unassigned ? `<span class="warning">⚠ Нераспр. <b>${Number(unassigned.stock || 0)}</b></span>` : ""}</div>`;
}

'''
app = replace_regex(app, r'function compactColorSummary\(modelId\) \{[\s\S]*?\n\}\n\n(?=function renderStock)', compact_block, "compact inventory state")

render_model_block = r'''function friendlyError(error) {
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
    const ready = initialized.has(item.id);
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

'''
app = replace_regex(app, r'function renderModelDialog\(modelId\) \{[\s\S]*?\n\}\n\n(?=function openModelDialog)', render_model_block, "integrate model dialog price")

save_model_block = r'''async function saveModelBalances(event) {
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
            createdByEmail: state.user.email || "",
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

'''
app = replace_regex(app, r'async function saveModelBalances\(event\) \{[\s\S]*?\n\}\n\n(?=function openStockDialog)', save_model_block, "central model save")

sale_block = r'''async function commitSale({ items, note = "", total, baseTotal = total, pricing = null }) {
  if (!state.user || !state.db) throw new Error("Нет активной авторизации.");
  if (!Array.isArray(items) || !items.length) throw new Error("Укажите количество хотя бы одного товара.");
  if (!Number.isFinite(total) || total <= 0) throw new Error("Итоговая сумма должна быть больше нуля.");

  await ensureCashBalance();
  const employee = currentEmployeeName();
  const productRefs = items.map((item) => doc(state.db, "products", item.inventoryId));
  const movementRefs = items.map(() => doc(collection(state.db, "stockMovements")));
  const saleRef = doc(collection(state.db, "orders"));
  const cashRef = doc(state.db, "finance", "cash");

  await runTransaction(state.db, async (tx) => {
    const snaps = [];
    for (const ref of productRefs) snaps.push(await tx.get(ref));
    const cashSnap = await tx.get(cashRef);
    if (!cashSnap.exists()) throw new Error("Баланс кассы ещё не создан. Повторите сохранение.");

    snaps.forEach((snap, index) => {
      if (!snap.exists()) throw new Error(`${items[index].name}: товар не найден`);
      const stock = Number(snap.data().stock || 0);
      if (stock < items[index].qty) throw new Error(`${items[index].name}: на складе только ${stock}`);
    });

    snaps.forEach((snap, index) => {
      const data = snap.data();
      const before = Number(data.stock || 0);
      const after = before - items[index].qty;
      tx.update(productRefs[index], {
        stock: after,
        updatedAt: serverTimestamp(),
        updatedBy: state.user.uid,
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
      ...(pricing ? { baseTotal, pricing } : {}),
      note,
      status: "done",
      source: "stock-app",
      createdAt: serverTimestamp(),
      createdAtClient: new Date().toISOString(),
      createdBy: state.user.uid,
      createdByEmail: state.user.email || "",
      createdByName: employee
    });
    tx.update(cashRef, {
      balance: Number(cashSnap.data().balance || 0) + total,
      updatedAt: serverTimestamp(),
      updatedBy: state.user.uid,
      updatedByEmail: state.user.email || "",
      updatedByName: employee
    });
  });

  const pushResult = await requestSalePush(saleRef.id);
  return { saleId: saleRef.id, employee, pushResult };
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

'''
app = replace_regex(app, r'async function createSale\(event\) \{[\s\S]*?\n\}\n\n(?=function inventoryIdForSaleItem)', sale_block, "single sale transaction")

app = replace_once(
    app,
    '  $("#sale-form").addEventListener("submit", createSale);',
    '  $("#sale-form").addEventListener("submit", (event) => {\n    const confirmer = window.CONDUCTOR_SALE_CONFIRM;\n    if (typeof confirmer === "function") {\n      event.preventDefault();\n      Promise.resolve(confirmer(event)).catch((error) => {\n        const node = $("#sale-error");\n        if (node) node.textContent = friendlyError(error);\n      });\n      return;\n    }\n    createSale(event);\n  });',
    "sale UI delegation",
)
app = replace_once(app, '  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});\n', '', "single service worker owner")

app_api = r'''
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

'''
app = replace_once(app, '\nboot();', '\n' + app_api + 'boot();', "publish core app API")
write("mobile/app.js", app)

# ---------------------------------------------------------------------------
# 2. Replace the legacy warehouse overlay with a UI-only module.
# ---------------------------------------------------------------------------
warehouse_ui = r'''import { collection, doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const KZT = new Intl.NumberFormat("ru-KZ", { style: "currency", currency: "KZT", maximumFractionDigits: 0 });
const SMOKE_MODELS = new Set(["DM30", "DM60", "DM60G", "DM60R1G", "DM90"]);
const HOLI_MODEL = "HOLI";
const RESUME_KEY = "conductor.app.started";
let pendingSale = null;

function appApi() {
  return window.CONDUCTOR_APP_API || null;
}

function escapeHtml(value = "") {
  return String(value).replace(/[&<>'\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
}

function compactDashboard() {
  document.getElementById("metric-sales")?.closest(".metric")?.classList.add("enh-hidden");
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
    card.innerHTML = `<div class="cash-summary-copy"><span>Доступно в кассе</span><b id="metric-cash">${escapeHtml(balanceText)}</b></div><button id="open-cash-movement" class="cash-movement-btn" type="button">Движение денег</button>`;
    oldCash.replaceWith(card);
    card.querySelector("#open-cash-movement")?.addEventListener("click", openCashMovementDialog);
  }
}

function prepareCashDialog() {
  const dialog = document.getElementById("cash-dialog");
  if (!dialog || document.getElementById("cash-movement-form")) return;
  dialog.innerHTML = `
    <form id="cash-movement-form" method="dialog" class="stock-dialog-card">
      <div class="dialog-head"><div><div class="eyebrow">Касса</div><h2>Движение денег</h2></div><button id="cash-movement-dialog-close" class="dialog-close" type="button" aria-label="Закрыть">×</button></div>
      <div class="cash-available"><span>Доступно</span><b id="cash-dialog-balance">0 ₸</b></div>
      <div class="cash-type-switch" role="radiogroup" aria-label="Тип движения денег">
        <label class="cash-type-option"><input type="radio" name="cash-movement-type" value="deposit" checked><span>Пополнение</span></label>
        <label class="cash-type-option sawmill"><input type="radio" name="cash-movement-type" value="sawmill"><span>Пилорама</span></label>
      </div>
      <label>Сумма<input id="cash-movement-amount" type="number" min="1" step="1" inputmode="numeric" required placeholder="0"></label>
      <label>Комментарий<textarea id="cash-movement-comment" rows="3" maxlength="300" placeholder="Необязательно"></textarea></label>
      <p class="cash-dialog-note">Пополнение увеличивает кассу. «Пилорама» уменьшает баланс на указанную сумму.</p>
      <button id="cash-movement-submit" class="btn primary full" type="submit">Сохранить движение</button>
      <p id="cash-movement-error" class="error"></p><div id="cash-withdrawal-history" class="enh-hidden"></div>
    </form>`;
  dialog.querySelector("#cash-movement-dialog-close")?.addEventListener("click", () => dialog.close());
  dialog.querySelector("#cash-movement-form")?.addEventListener("submit", saveCashMovement);
}

function openCashMovementDialog() {
  prepareCashDialog();
  const dialog = document.getElementById("cash-dialog");
  const form = document.getElementById("cash-movement-form");
  if (!dialog || !form) return;
  form.reset();
  const errorNode = document.getElementById("cash-movement-error");
  if (errorNode) errorNode.textContent = "";
  const balance = appApi()?.getCashBalance?.() ?? 0;
  const balanceNode = document.getElementById("cash-dialog-balance");
  if (balanceNode) balanceNode.textContent = KZT.format(balance);
  dialog.showModal();
  setTimeout(() => document.getElementById("cash-movement-amount")?.focus(), 80);
}

async function saveCashMovement(event) {
  event.preventDefault();
  const api = appApi();
  const db = api?.getDb?.();
  const user = api?.getUser?.();
  const errorNode = document.getElementById("cash-movement-error");
  const submit = document.getElementById("cash-movement-submit");
  if (errorNode) errorNode.textContent = "";
  if (!api || !db || !user) {
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
    const employee = api.currentEmployeeName();
    const delta = type === "deposit" ? amount : -amount;
    await runTransaction(db, async (tx) => {
      const cashSnap = await tx.get(cashRef);
      if (!cashSnap.exists()) throw new Error("Баланс кассы ещё не создан.");
      const before = Number(cashSnap.data().balance || 0);
      const after = before + delta;
      if (after < 0) throw new Error(`В кассе доступно только ${KZT.format(before)}.`);
      tx.update(cashRef, { balance: after, updatedAt: serverTimestamp(), updatedBy: user.uid, updatedByEmail: user.email || "", updatedByName: employee });
      tx.set(operationRef, {
        operationType: type === "deposit" ? "cash_deposit" : "cash_sawmill",
        amount, cashDelta: delta, before, after, items: [], total: delta, note: comment,
        status: "done", source: "stock-app", createdAt: serverTimestamp(), createdAtClient: new Date().toISOString(),
        createdBy: user.uid, createdByEmail: user.email || "", createdByName: employee
      });
    });
    document.getElementById("cash-dialog")?.close();
    api.toast(`${type === "deposit" ? "Пополнение" : "Пилорама"} ${KZT.format(amount)} · ${api.currentEmployeeName()}`);
  } catch (error) {
    if (errorNode) errorNode.textContent = error?.message || "Не удалось изменить баланс.";
  } finally {
    if (submit) submit.disabled = false;
  }
}

function ensureSaleDialog() {
  let dialog = document.getElementById("sale-confirm-dialog");
  if (dialog) return dialog;
  dialog = document.createElement("dialog");
  dialog.id = "sale-confirm-dialog";
  dialog.className = "stock-dialog sale-confirm-dialog";
  dialog.innerHTML = `
    <form id="sale-confirm-form" method="dialog" class="stock-dialog-card">
      <div class="dialog-head"><div><div class="eyebrow">Проверка продажи</div><h2>Подтвердить сумму</h2></div><button id="sale-confirm-close" class="dialog-close" type="button" aria-label="Закрыть">×</button></div>
      <div id="sale-confirm-structure" class="sale-confirm-structure"></div>
      <div id="sale-pricing-box" class="sale-pricing-box"></div>
      <div class="sale-final-total"><span>В кассу поступит</span><b id="sale-confirm-final">0 ₸</b></div>
      <button id="sale-confirm-submit" class="btn primary full" type="submit">Подтвердить продажу</button><p id="sale-confirm-error" class="error"></p>
    </form>`;
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
    ${baseNonHoli > 0 ? `<div class="sale-pricing-row"><span>Товары кроме Холи</span><b>${KZT.format(baseNonHoli)}</b></div>${smokeSubtotal > 0 ? `<label class="sale-discount-toggle"><input id="sale-smoke-discount" type="checkbox"><span>Скидка −10% на дымы</span></label>` : ""}<label>Сумма товаров кроме Холи<input id="sale-adjust-nonholi" class="sale-adjust-input" type="number" min="0" step="1" inputmode="numeric" value="${Math.round(baseNonHoli)}"></label>` : ""}
    ${holiTotal > 0 ? `<div class="sale-pricing-row"><span>Краски Холи</span><b>${KZT.format(holiTotal)}</b></div><div class="sale-fixed-note">Цена Холи фиксируется действующей логикой количества и вручную не корректируется.</div>` : ""}`;
  const discount = document.getElementById("sale-smoke-discount");
  const amountInput = document.getElementById("sale-adjust-nonholi");
  discount?.addEventListener("change", () => {
    if (!amountInput || !pendingSale) return;
    amountInput.value = String(discount.checked ? Math.round(pendingSale.baseNonHoli - pendingSale.smokeSubtotal * 0.10) : Math.round(pendingSale.baseNonHoli));
    updateFinalTotal();
  });
  amountInput?.addEventListener("input", updateFinalTotal);
  updateFinalTotal();
}

function updateFinalTotal() {
  if (!pendingSale) return;
  const nonHoli = pendingSale.baseNonHoli > 0 ? Math.max(0, Math.trunc(Number(document.getElementById("sale-adjust-nonholi")?.value || 0))) : 0;
  const total = nonHoli + pendingSale.holiTotal;
  const node = document.getElementById("sale-confirm-final");
  if (node) node.textContent = KZT.format(total);
}

function openSaleConfirmation() {
  const api = appApi();
  const items = api?.getSelectedItems?.() || [];
  const errorNode = document.getElementById("sale-error");
  if (errorNode) errorNode.textContent = "";
  if (!api || !items.length) {
    if (errorNode) errorNode.textContent = "Укажите количество хотя бы одного товара.";
    return;
  }
  if (items.some((item) => !Number.isFinite(item.price) || item.price <= 0)) {
    if (errorNode) errorNode.textContent = "Цены товаров ещё загружаются. Повторите через секунду.";
    return;
  }
  const note = document.getElementById("sale-notes")?.value.trim() || "";
  const holiTotal = items.filter((item) => item.productId === HOLI_MODEL).reduce((sum, item) => sum + item.lineTotal, 0);
  const baseNonHoli = items.filter((item) => item.productId !== HOLI_MODEL).reduce((sum, item) => sum + item.lineTotal, 0);
  const smokeSubtotal = items.filter((item) => SMOKE_MODELS.has(item.productId)).reduce((sum, item) => sum + item.lineTotal, 0);
  pendingSale = { items, note, holiTotal, baseNonHoli, smokeSubtotal };

  const dialog = ensureSaleDialog();
  const structure = document.getElementById("sale-confirm-structure");
  if (structure) structure.innerHTML = items.map((item) => `<div class="sale-confirm-item"><div><b>${escapeHtml(item.productId)}${item.colorName ? ` · ${escapeHtml(item.colorName)}` : ""}</b><small>${item.qty} × ${KZT.format(item.price)}</small></div><strong>${KZT.format(item.lineTotal)}</strong></div>`).join("");
  const confirmError = document.getElementById("sale-confirm-error");
  if (confirmError) confirmError.textContent = "";
  renderSalePricing();
  dialog.showModal();
}

async function confirmSale(event) {
  event.preventDefault();
  const api = appApi();
  if (!api || !pendingSale) return;
  const errorNode = document.getElementById("sale-confirm-error");
  const submit = document.getElementById("sale-confirm-submit");
  if (errorNode) errorNode.textContent = "";
  const chargedNonHoli = pendingSale.baseNonHoli > 0 ? Math.max(0, Math.trunc(Number(document.getElementById("sale-adjust-nonholi")?.value || 0))) : 0;
  const total = chargedNonHoli + pendingSale.holiTotal;
  if (!Number.isInteger(total) || total <= 0) {
    if (errorNode) errorNode.textContent = "Итоговая сумма должна быть больше нуля.";
    return;
  }
  if (submit) submit.disabled = true;
  try {
    const discountChecked = document.getElementById("sale-smoke-discount")?.checked === true;
    const result = await api.commitSale({
      items: pendingSale.items.map((item) => ({ ...item })), note: pendingSale.note, total,
      baseTotal: pendingSale.baseNonHoli + pendingSale.holiTotal,
      pricing: {
        nonHoliBaseTotal: pendingSale.baseNonHoli, nonHoliChargedTotal: chargedNonHoli,
        holiFixedTotal: pendingSale.holiTotal, smokeBaseTotal: pendingSale.smokeSubtotal,
        smokeDiscount10: discountChecked, finalTotal: total
      }
    });
    document.getElementById("sale-confirm-dialog")?.close();
    pendingSale = null;
    api.finalizeSale(result);
  } catch (error) {
    if (errorNode) errorNode.textContent = error?.message || "Не удалось сохранить продажу.";
  } finally {
    if (submit) submit.disabled = false;
  }
}

function suppressResumeSplash() {
  const boot = document.getElementById("boot");
  if (!boot) return;
  if (boot.classList.contains("hide")) sessionStorage.setItem(RESUME_KEY, "1");
  new MutationObserver(() => { if (boot.classList.contains("hide")) sessionStorage.setItem(RESUME_KEY, "1"); }).observe(boot, { attributes: true, attributeFilter: ["class"] });
  const hideOnResume = () => { if (sessionStorage.getItem(RESUME_KEY) === "1") boot.classList.add("hide"); };
  document.addEventListener("visibilitychange", () => { if (!document.hidden) setTimeout(hideOnResume, 0); });
  window.addEventListener("pageshow", () => setTimeout(hideOnResume, 0));
}

function start() {
  window.CONDUCTOR_SALE_CONFIRM = openSaleConfirmation;
  compactDashboard();
  prepareCashDialog();
  suppressResumeSplash();
  const dashboard = document.getElementById("view-dashboard");
  if (dashboard) new MutationObserver(compactDashboard).observe(dashboard, { childList: true, subtree: true });
}

start();
'''
write("mobile/warehouse-ui.js", warehouse_ui)

# ---------------------------------------------------------------------------
# 3. Analytics and operation history consume the core order state instead of
#    opening their own Firestore subscriptions.
# ---------------------------------------------------------------------------
analytics = read("mobile/analytics.js")
analytics = replace_once(analytics, 'import { collection, onSnapshot, orderBy, query } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";\n\n', '', "analytics firestore import")
analytics = analytics.replace('let unsubscribeOrders = null;\n', '')
analytics = analytics.replace('.bottom-nav{grid-template-columns:repeat(6,1fr)}', '.bottom-nav{grid-template-columns:repeat(5,1fr)}')
analytics_tail = r'''async function waitForCoreApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (window.CONDUCTOR_APP_API) return window.CONDUCTOR_APP_API;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  throw new Error("Данные приложения ещё не готовы. Повторите открытие аналитики.");
}

async function startAnalytics() {
  if (analyticsStarted) return;
  analyticsStarted = true;
  const root = document.querySelector("#analytics-sales-list");
  if (root) root.innerHTML = `<div class="analytics-loading">Загружаю историю продаж…</div>`;
  try {
    const api = await waitForCoreApi();
    analyticsSales = api.getOrders();
    renderAnalytics();
  } catch (error) {
    analyticsStarted = false;
    if (root) root.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

function syncAnalyticsFromCore() {
  const api = window.CONDUCTOR_APP_API;
  if (!api) return;
  analyticsSales = api.getOrders();
  if (analyticsStarted) renderAnalytics();
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

injectUi();
window.addEventListener("conductor:orders-changed", syncAnalyticsFromCore);
'''
analytics = replace_regex(analytics, r'async function waitForDatabase\(\) \{[\s\S]*$', analytics_tail, "analytics core state")
write("mobile/analytics.js", analytics)

sales = read("mobile/sales-history.js")
sales = replace_regex(sales, r'^import \{ getAuth, onAuthStateChanged \}[\s\S]*?from "https://www\.gstatic\.com/firebasejs/12\.18\.0/firebase-firestore\.js";\n\n', '', "sales history firestore imports")
sales = sales.replace('const MODEL_IDS = new Set(["DM30", "DM60", "DM60G", "DM90", "HOLI"]);\n', '')
sales = sales.replace('let unsubscribeOrders = null;\nlet currentUser = null;\n', '')
sales = replace_regex(sales, r'function currentEmployeeName\(\) \{[\s\S]*?\n\}\n\n', '', "sales history current user helper")
sales_tail = r'''async function waitForCoreApi() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (window.CONDUCTOR_APP_API) return window.CONDUCTOR_APP_API;
    await new Promise((resolve) => window.setTimeout(resolve, 100));
  }
  throw new Error("Данные приложения ещё не готовы.");
}

async function cancelSale(saleId) {
  const api = await waitForCoreApi();
  await api.cancelSale(saleId);
  api.toast("Продажа отменена, товар возвращён");
}

function syncOperationsFromCore() {
  const api = window.CONDUCTOR_APP_API;
  if (!api) return;
  operations = api.getOrders();
  render();
}

async function boot() {
  injectUi();
  try {
    const api = await waitForCoreApi();
    operations = api.getOrders();
    render();
    window.addEventListener("conductor:orders-changed", syncOperationsFromCore);
  } catch (error) {
    const list = document.querySelector("#sales-period-list");
    if (list) list.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  }
}

boot().catch(() => {});
'''
sales = replace_regex(sales, r'function inventoryIdForSaleItem\(item\) \{[\s\S]*$', sales_tail, "sales history core state")
write("mobile/sales-history.js", sales)

# ---------------------------------------------------------------------------
# 4. Normalize current module names and static CSS.
# ---------------------------------------------------------------------------
bootstrap = r'''import "./app-update.js?v=1";
import "./analytics.js?v=1";
import "./sales-history.js?v=1";
import "./warehouse-ui.js?v=1";
import "./push-notifications.js?v=1";
import "./firestore-error-help.js?v=1";
import "./ui-sounds.js?v=1";

function isNativeApp() {
  try {
    return window.Capacitor?.getPlatform?.() === "android" || window.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

if (!isNativeApp() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js?v=1").catch((error) => console.warn("Service Worker registration failed", error));
  }, { once: true });
}
'''
write("mobile/bootstrap.js", bootstrap)

# Rename the currently active versioned modules to stable names.
for old, new in [
    ("mobile/core-ui-105.js", "mobile/core-ui.js"),
    ("mobile/startup-guard-104.js", "mobile/startup-guard.js"),
    ("mobile/version-history-105-archive.js", "mobile/version-history-archive.js"),
]:
    target = ROOT / old
    if target.exists():
        remove(new)
        target.rename(ROOT / new)

history = read("mobile/version-history-105.js")
history = history.replace('const VERSIONS = [\n', '''const VERSIONS = [
  {
    version: "1.1.0",
    date: "07.09.2026",
    changes: [
      "Проведён архитектурный аудит и рефакторинг мобильного склада: каталог, остатки и транзакция продажи теперь имеют одного владельца состояния.",
      "Удалены дублирующие Firestore-подписки и старые перехватчики продажи; подтверждение продажи использует единый расчёт цены из ядра приложения.",
      "Редактирование цены модели и фактических остатков перенесено в ядро; DM60R1G создаёт недостающие Синий/Розовый при сохранении и использует общую цену.",
      "Очищены временные DM60R1G workflow, старые JS-модули, экспериментальные заставки и служебные файлы Android-сборки."
    ]
  },
''', 1)
history = history.replace('Актуальная версия: 1.0.18', 'Актуальная версия: 1.1.0')
history = history.replace('data-current-version="1.0.18"', 'data-current-version="1.1.0"')
history = history.replace('import("./version-history-105-archive.js?v=1")', 'import("./version-history-archive.js?v=1")')
write("mobile/version-history.js", history)

release_css = read("mobile/release-103.css") + "\n\n" + read("mobile/release-105.css") + r'''

/* Consolidated warehouse UI: formerly injected by inventory/warehouse overlay modules. */
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
.cash-type-option{position:relative}.cash-type-option input{position:absolute;opacity:0;pointer-events:none}
.cash-type-option span{display:flex;align-items:center;justify-content:center;min-height:44px;border:1px solid var(--line);border-radius:12px;background:#090e16;color:#cbd3df;font-size:12px;font-weight:900;cursor:pointer}
.cash-type-option input:checked+span{border-color:rgba(56,166,255,.62);background:rgba(56,166,255,.12);color:#fff}
.cash-type-option.sawmill input:checked+span{border-color:rgba(255,89,111,.55);background:rgba(255,89,111,.09);color:#ffabb7}
.cash-dialog-note{margin:-3px 0 0;color:var(--muted);font-size:10px;line-height:1.4}
.sale-confirm-dialog{width:min(calc(100% - 20px),580px);max-height:90dvh}
.sale-confirm-structure{display:grid;gap:7px}.sale-confirm-item{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:9px 10px;border:1px solid var(--line);border-radius:12px;background:#090e16}
.sale-confirm-item b,.sale-confirm-item small{display:block}.sale-confirm-item b{font-size:12px}.sale-confirm-item small{margin-top:3px;color:var(--muted);font-size:10px}.sale-confirm-item strong{white-space:nowrap;font-size:13px}
.sale-pricing-box{display:grid;gap:9px;padding:11px;border:1px solid var(--line);border-radius:14px;background:#090e16}.sale-pricing-row{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:11px}.sale-pricing-row span{color:var(--muted)}.sale-pricing-row b{font-size:14px}
.sale-discount-toggle{display:flex!important;grid-template-columns:none!important;align-items:center;gap:9px!important;padding:8px 0;color:#fff!important}.sale-discount-toggle input{width:20px!important;height:20px!important;accent-color:#ff7f43}
.sale-adjust-input{font-size:18px!important;font-weight:900!important;text-align:right}.sale-fixed-note{color:#ffca6b;font-size:10px;line-height:1.4}.sale-final-total{display:flex;align-items:center;justify-content:space-between;padding:12px 2px 2px}.sale-final-total span{color:var(--muted);font-size:12px}.sale-final-total b{font-size:28px}
.model-sale-price-row{display:grid;gap:7px;color:#c8d0db;font-size:12px;font-weight:800;margin-bottom:10px}.model-sale-price-row input{width:100%;border:1px solid var(--line);background:#080c14;color:#fff;border-radius:14px;padding:13px 14px;outline:none;font-size:16px;font-weight:800}.inventory-not-set{color:var(--muted)!important}.model-variant-actions-disabled{display:flex;align-items:center;justify-content:center;color:var(--muted)}
@media(max-width:430px){.content{padding-top:3px!important}.section-head{margin-top:10px}.sticky-head{padding-top:5px!important}#view-dashboard .metric{min-height:96px;padding:11px!important}#view-dashboard .metric b{font-size:20px!important}.cash-movement-btn{font-size:9px}}
'''
write("mobile/release.css", release_css)

index = read("mobile/index.html")
index = index.replace('./app.js?v=108', './app.js?v=109')
index = index.replace('./bootstrap-104.js?v=4', './bootstrap.js?v=1')
index = index.replace('<link rel="stylesheet" href="./release-103.css">\n  <link rel="stylesheet" href="./release-105.css?v=2">', '<link rel="stylesheet" href="./release.css?v=1">')
index = index.replace('  <!-- Legacy architecture test markers only; these files are NOT loaded: app.js?v=103 bootstrap-103.js core-ui-103.js version-history-103.js -->\n', '')
index = index.replace('<script type="module" src="./core-ui-105.js?v=2"></script>', '<script type="module" src="./core-ui.js?v=1"></script>')
index = index.replace('<script type="module" src="./version-history-105.js?v=2"></script>', '<script type="module" src="./version-history.js?v=1"></script>')
index = index.replace('<script type="module" src="./startup-guard-104.js"></script>', '<script type="module" src="./startup-guard.js?v=1"></script>')
write("mobile/index.html", index)

sw = r'''const CACHE = "conductor-mobile-v63";
const APP_SHELL = [
  "./", "./index.html", "./styles.css?v=15", "./warehouse.css?v=20", "./header-mobile.css?v=1", "./splash.css?v=3", "./release.css?v=1",
  "./app.js?v=109", "./bootstrap.js?v=1", "./core-ui.js?v=1", "./version-history.js?v=1", "./version-history-archive.js?v=1", "./startup-guard.js?v=1",
  "./firebase-config.js?v=22", "./push-config.js?v=1", "./app-update.js?v=1", "./analytics.js?v=1", "./sales-history.js?v=1", "./warehouse-ui.js?v=1",
  "./push-notifications.js?v=1", "./firestore-error-help.js?v=1", "./ui-sounds.js?v=1", "./manifest.webmanifest?v=17", "./icon.svg",
  "./warehouse-splash-clean.png?v=1", "./conductor-vintage-title.png?v=1"
];
self.addEventListener("install", (event) => event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())));
self.addEventListener("activate", (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request, { cache: "no-store" }).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put("./index.html", response.clone()));
      return response;
    }).catch(() => caches.match("./index.html").then((cached) => cached || caches.match("./"))));
    return;
  }
  event.respondWith(fetch(request, { cache: "no-store" }).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request)));
});
'''
write("mobile/sw.js", sw)

# ---------------------------------------------------------------------------
# 5. Release metadata and Android build cleanup.
# ---------------------------------------------------------------------------
manifest = json.loads(read("mobile/app-version.json"))
manifest["version"] = "1.1.0"
manifest["versionCode"] = 10100
manifest["notes"] = "1.1.0: проведён архитектурный аудит и рефакторинг мобильного склада. Каталог, остатки, цена и транзакция продажи теперь имеют единое ядро; удалены дублирующие Firestore-подписки и старые перехватчики. Редактор цены и остатков встроен в ядро, DM60R1G создаёт недостающие варианты при сохранении. Очищены временные workflow, старые JS-файлы, экспериментальные заставки и служебные Android-ресурсы."
write("mobile/app-version.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")

android_pkg = json.loads(read("android-app/package.json"))
android_pkg["version"] = "1.1.0"
android_pkg.get("scripts", {}).pop("postinstall", None)
write("android-app/package.json", json.dumps(android_pkg, ensure_ascii=False, indent=2) + "\n")

workflow = read(".github/workflows/build-android-apk.yml")
workflow = workflow.replace('      - feature/in-app-updates\n', '')
validation = r'''      - name: Validate mobile and updater scripts
        run: |
          node --check mobile/app.js
          node --check mobile/app-update.js
          node --check mobile/bootstrap.js
          node --check mobile/core-ui.js
          node --check mobile/version-history.js
          node --check mobile/startup-guard.js
          node --check mobile/push-notifications.js
          node --check mobile/firestore-error-help.js
          node --check mobile/analytics.js
          node --check mobile/sales-history.js
          node --check mobile/warehouse-ui.js
          node --check mobile/ui-sounds.js
          node --check android-app/configure-android.mjs
          node --check android-app/configure-updater.mjs
          node - <<'NODE'
          const fs = require('fs');
          const p = require('./android-app/package.json');
          const m = require('./mobile/app-version.json');
          if (p.version !== m.version) throw new Error('Android and update manifest versions differ');
          const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(p.version);
          if (!match) throw new Error(`Android version must be semantic x.y.z: ${p.version}`);
          const [, major, minor, patch] = match.map(Number);
          if (minor > 99 || patch > 99) throw new Error('Android minor/patch version must fit two digits');
          const expectedCode = major * 10000 + minor * 100 + patch;
          if (m.versionCode !== expectedCode) throw new Error(`Invalid Android versionCode ${m.versionCode} for ${p.version}; expected ${expectedCode}.`);
          if (typeof m.notes !== 'string' || m.notes.trim().length < 40) throw new Error('Every Android release must contain meaningful latest-change notes.');
          const history = fs.readFileSync('./mobile/version-history.js', 'utf8');
          const firstHistoryVersion = history.match(/const VERSIONS = \[\s*\{\s*version: "([^"]+)"/)?.[1];
          if (firstHistoryVersion !== p.version) throw new Error(`Version history must start with ${p.version}; found ${firstHistoryVersion || 'none'}.`);
          if (!history.includes(`Актуальная версия: ${p.version}`)) throw new Error(`Version history UI must show ${p.version}.`);
          const ui = fs.readFileSync('./mobile/warehouse-ui.js', 'utf8');
          if (/onSnapshot\s*\(/.test(ui) || /collection\(.*"products"/.test(ui) || /collection\(.*"catalog"/.test(ui)) throw new Error('warehouse-ui.js must not own catalog/products realtime state');
          if (!ui.includes('api.commitSale')) throw new Error('warehouse-ui.js must delegate sale commit to the core app');
          NODE

'''
workflow = replace_regex(workflow, r'      - name: Validate mobile and updater scripts[\s\S]*?(?=      - name: Setup Java)', validation, "android validation block")
workflow = workflow.replace('          test -f android-app/www/bootstrap.js\n', '          test -f android-app/www/bootstrap.js\n          test -f android-app/www/warehouse-ui.js\n          test ! -f android-app/www/inventory-state.js\n          test ! -f android-app/www/warehouse-enhancements-legacy.js\n')
workflow = workflow.replace("          const bootstrap = 'android-app/android/app/src/main/assets/public/bootstrap.js';", "          const bootstrap = 'android-app/android/app/src/main/assets/public/bootstrap.js';")
workflow = workflow.replace('          sha256sum dist/CONDUCTOR-Sklad.apk\n', '          sha256sum dist/CONDUCTOR-Sklad.apk\n          APK_SIZE=$(stat -c%s dist/CONDUCTOR-Sklad.apk)\n          if [ "$APK_SIZE" -gt $((8 * 1024 * 1024)) ]; then echo "::error::APK unexpectedly exceeds 8 MiB: $APK_SIZE bytes"; exit 1; fi\n')
write(".github/workflows/build-android-apk.yml", workflow)

rules_workflow = r'''name: Deploy Firestore rules

on:
  workflow_dispatch:
  push:
    branches: [main]
    paths:
      - 'firestore.rules'

permissions:
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Install Firebase CLI
        run: npm ci
      - name: Deploy production Firestore rules
        env:
          FIREBASE_TOKEN: ${{ secrets.FIREBASE_TOKEN }}
          FIREBASE_SERVICE_ACCOUNT: ${{ secrets.FIREBASE_SERVICE_ACCOUNT }}
          FIREBASE_SERVICE_ACCOUNT_JSON: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_JSON }}
          FIREBASE_SERVICE_ACCOUNT_CONDUCTOR_REQUESTS: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_CONDUCTOR_REQUESTS }}
        run: |
          set -euo pipefail
          if [ -n "${FIREBASE_SERVICE_ACCOUNT_CONDUCTOR_REQUESTS:-}" ]; then
            printf '%s' "$FIREBASE_SERVICE_ACCOUNT_CONDUCTOR_REQUESTS" > /tmp/firebase-sa.json
            export GOOGLE_APPLICATION_CREDENTIALS=/tmp/firebase-sa.json
          elif [ -n "${FIREBASE_SERVICE_ACCOUNT_JSON:-}" ]; then
            printf '%s' "$FIREBASE_SERVICE_ACCOUNT_JSON" > /tmp/firebase-sa.json
            export GOOGLE_APPLICATION_CREDENTIALS=/tmp/firebase-sa.json
          elif [ -n "${FIREBASE_SERVICE_ACCOUNT:-}" ]; then
            printf '%s' "$FIREBASE_SERVICE_ACCOUNT" > /tmp/firebase-sa.json
            export GOOGLE_APPLICATION_CREDENTIALS=/tmp/firebase-sa.json
          elif [ -n "${FIREBASE_TOKEN:-}" ]; then
            npx firebase deploy --only firestore:rules --project conductor-requests --non-interactive --token "$FIREBASE_TOKEN"
            exit 0
          else
            echo 'No Firebase deployment credential is configured. Refusing to pretend production rules were deployed.' >&2
            exit 2
          fi
          npx firebase deploy --only firestore:rules --project conductor-requests --non-interactive
'''
write(".github/workflows/deploy-firestore-rules.yml", rules_workflow)

# ---------------------------------------------------------------------------
# 6. Replace brittle string-marker tests with architecture/integration guards.
# ---------------------------------------------------------------------------
tests = r'''import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const execFileAsync = promisify(execFile);

async function missing(path) {
  try { await access(new URL(path, root)); return false; } catch { return true; }
}

test("mobile has one core owner for catalog, products and sale transactions", async () => {
  const [app, bootstrap, ui, analytics, sales] = await Promise.all([
    read("mobile/app.js"), read("mobile/bootstrap.js"), read("mobile/warehouse-ui.js"), read("mobile/analytics.js"), read("mobile/sales-history.js")
  ]);
  assert.match(app, /window\.CONDUCTOR_APP_API/);
  assert.match(app, /function modelSalePrice/);
  assert.match(app, /async function commitSale/);
  assert.equal((app.match(/tx\.set\(saleRef/g) || []).length, 1, "sale write must exist once in the core app");
  assert.match(ui, /api\.commitSale/);
  assert.doesNotMatch(ui, /onSnapshot\s*\(/);
  assert.doesNotMatch(ui, /collection\([^\n]*"products"/);
  assert.doesNotMatch(ui, /collection\([^\n]*"catalog"/);
  assert.doesNotMatch(analytics, /onSnapshot\s*\(/);
  assert.doesNotMatch(sales, /onSnapshot\s*\(/);
  assert.match(bootstrap, /warehouse-ui\.js/);
  assert.doesNotMatch(bootstrap, /inventory-state|warehouse-enhancements/);
});

test("DM60R1G variants, model price and inventory save live in the core app", async () => {
  const [app, publicPrices] = await Promise.all([read("mobile/app.js"), read("assets/public-prices.js")]);
  assert.match(app, /id: "DM60R1G", name: "DM60R1G \(интрига\)", price: 4000/);
  assert.match(app, /\["BLUE", "Синий", "#258cff"\]/);
  assert.match(app, /\["PINK", "Розовый", "#ff6bab"\]/);
  assert.match(app, /virtual: true/);
  assert.match(app, /id="model-sale-price"/);
  assert.match(app, /tx\.set\(catalogRef/);
  assert.match(app, /if \(!snap\.exists\(\)\)/);
  assert.match(publicPrices, /DM60R1G/);
});

test("sale UI uses the exact items and prices calculated by the core", async () => {
  const [app, ui] = await Promise.all([read("mobile/app.js"), read("mobile/warehouse-ui.js")]);
  assert.match(app, /getSelectedItems: \(\) => selectedItems\(\)/);
  assert.match(ui, /api\?\.getSelectedItems/);
  assert.doesNotMatch(ui, /function modelPrice/);
  assert.doesNotMatch(ui, /catalog\.find/);
  assert.equal((ui.match(/tx\.set\(saleRef/g) || []).length, 0);
});

test("orders are read once and shared with analytics and operations", async () => {
  const [app, analytics, sales] = await Promise.all([read("mobile/app.js"), read("mobile/analytics.js"), read("mobile/sales-history.js")]);
  assert.match(app, /conductor:orders-changed/);
  assert.match(app, /getOrders: \(\) => state\.sales/);
  assert.match(analytics, /getOrders\(\)/);
  assert.match(sales, /getOrders\(\)/);
  assert.match(sales, /api\.cancelSale/);
  assert.doesNotMatch(sales, /runTransaction/);
});

test("service worker is registered only by bootstrap and never in native Android", async () => {
  const [app, bootstrap] = await Promise.all([read("mobile/app.js"), read("mobile/bootstrap.js")]);
  assert.doesNotMatch(app, /serviceWorker\.register/);
  assert.match(bootstrap, /!isNativeApp\(\)/);
  assert.match(bootstrap, /serviceWorker\.register/);
});

test("active mobile entry points use stable filenames", async () => {
  const index = await read("mobile/index.html");
  for (const name of ["app.js?v=109", "bootstrap.js?v=1", "core-ui.js?v=1", "version-history.js?v=1", "startup-guard.js?v=1", "release.css?v=1"]) assert.ok(index.includes(name), `${name} must be loaded`);
  assert.doesNotMatch(index, /bootstrap-10|core-ui-10|version-history-10|release-10|inventory-state|warehouse-enhancements/);
});

test("legacy mobile and temporary DM60R1G artifacts are absent", async () => {
  const dead = [
    "mobile/bootstrap-103.js", "mobile/bootstrap-104.js", "mobile/core-ui-103.js", "mobile/core-ui-104.js", "mobile/core-ui-105.js",
    "mobile/inventory-state.js", "mobile/warehouse-enhancements.js", "mobile/warehouse-enhancements-legacy.js", "mobile/ui-fixes-070.js", "mobile/release-20260906.js",
    "mobile/warehouse-splash-vintage.png", "mobile/warehouse-splash.png", "android-app/patch-bundled-price-source.mjs", "android-app/release-1.0.18-trigger.txt",
    ".github/dm60r1g-image", ".github/dm60r1g-ready", ".github/dm60r1g-v1018-ready", ".github/workflows/apply-dm60r1g.yml",
    ".github/workflows/fix-dm60r1g-v1017.yml", ".github/workflows/fix-dm60r1g-v1017b.yml", ".github/workflows/fix-dm60r1g-v1018.yml"
  ];
  for (const path of dead) assert.equal(await missing(path), true, `${path} must be removed`);
});

test("operations and compact stock UI remain available", async () => {
  const [index, coreUi, css] = await Promise.all([read("mobile/index.html"), read("mobile/core-ui.js"), read("mobile/release.css")]);
  assert.match(index, /<h1>Операции<\/h1>/);
  assert.match(index, /id="open-stock-movements"/);
  assert.match(index, /id="movement-dialog"/);
  assert.match(coreUi, /stock-zero/);
  assert.match(coreUi, /stock-low/);
  assert.match(css, /stock-zero/);
  assert.match(css, /stock-low/);
  assert.match(css, /model-sale-price-row/);
});

test("settings keep updater, latest changes and section sounds", async () => {
  const [updater, sounds] = await Promise.all([read("mobile/app-update.js"), read("mobile/ui-sounds.js")]);
  assert.match(updater, /Последние изменения/);
  assert.match(updater, /app-update-latest-notes/);
  for (const fn of ["playNavigation", "playStock", "playSales", "playAnalytics", "playSettings"]) assert.ok(sounds.includes(fn));
});

test("version history begins with the current release", async () => {
  const [history, manifestText] = await Promise.all([read("mobile/version-history.js"), read("mobile/app-version.json")]);
  const manifest = JSON.parse(manifestText);
  const first = history.match(/const VERSIONS = \[\s*\{\s*version: "([^"]+)"/)?.[1];
  assert.equal(first, manifest.version);
  assert.ok(history.includes(`Актуальная версия: ${manifest.version}`));
  assert.ok(manifest.notes.length >= 40);
});

test("active mobile scripts pass syntax validation", async () => {
  for (const file of ["app.js", "bootstrap.js", "core-ui.js", "version-history.js", "version-history-archive.js", "startup-guard.js", "app-update.js", "analytics.js", "sales-history.js", "warehouse-ui.js", "push-notifications.js", "firestore-error-help.js", "ui-sounds.js"]) {
    await execFileAsync(process.execPath, ["--check", fileURLToPath(new URL(`mobile/${file}`, root))]);
  }
});

test("Android release build validates bundle, version and APK size", async () => {
  const [workflow, packageText] = await Promise.all([read(".github/workflows/build-android-apk.yml"), read("android-app/package.json")]);
  const pkg = JSON.parse(packageText);
  assert.equal(pkg.scripts?.postinstall, undefined);
  assert.match(workflow, /node --check mobile\/app\.js/);
  assert.match(workflow, /node --check mobile\/warehouse-ui\.js/);
  assert.match(workflow, /test ! -f android-app\/www\/inventory-state\.js/);
  assert.match(workflow, /APK unexpectedly exceeds 8 MiB/);
  assert.doesNotMatch(workflow, /feature\/in-app-updates/);
});

test("native updater remains pinned to GitHub release and SHA-256", async () => {
  const [webUpdater, nativeUpdater] = await Promise.all([read("mobile/app-update.js"), read("android-app/configure-updater.mjs")]);
  assert.match(webUpdater, /asset\.digest/);
  assert.match(webUpdater, /sha256:\s*lastRelease\.sha256/);
  assert.match(nativeUpdater, /ALLOWED_HOST = "github\.com"/);
  assert.match(nativeUpdater, /verifySha256/);
});

test("PWA cache contains only current application modules", async () => {
  const sw = await read("mobile/sw.js");
  assert.match(sw, /conductor-mobile-v63/);
  for (const asset of ["app.js?v=109", "bootstrap.js?v=1", "core-ui.js?v=1", "version-history.js?v=1", "warehouse-ui.js?v=1", "release.css?v=1"]) assert.ok(sw.includes(asset));
  assert.doesNotMatch(sw, /inventory-state|warehouse-enhancements|bootstrap-10|core-ui-10/);
});
'''
write("tests/mobile-architecture.test.mjs", tests)

# Update mobile README references if they exist.
readme = read("mobile/README.md")
for old, new in [
    ("bootstrap-104.js", "bootstrap.js"), ("core-ui-105.js", "core-ui.js"),
    ("version-history-105.js", "version-history.js"), ("startup-guard-104.js", "startup-guard.js")
]:
    readme = readme.replace(old, new)
write("mobile/README.md", readme)

# ---------------------------------------------------------------------------
# 7. Remove historical/transit artifacts. Git history already preserves them.
# ---------------------------------------------------------------------------
for path in [
    ".github/dm60r1g-image", ".github/dm60r1g-ready", ".github/dm60r1g-v1018-ready", ".github/firestore-rules-deploy-ready",
    ".github/scripts/apply-dm60r1g.mjs", ".github/scripts/fix-dm60r1g-v1018.py",
    ".github/workflows/apply-dm60r1g.yml", ".github/workflows/fix-dm60r1g-v1017.yml", ".github/workflows/fix-dm60r1g-v1017b.yml", ".github/workflows/fix-dm60r1g-v1018.yml",
    "mobile/bootstrap-103.js", "mobile/bootstrap-104.js", "mobile/core-ui-103.js", "mobile/core-ui-104.js", "mobile/core-ui-105.js",
    "mobile/ui-fixes-070.js", "mobile/release-20260906.js", "mobile/release-103.css", "mobile/release-105.css",
    "mobile/version-history-103.js", "mobile/version-history-104.js", "mobile/version-history-105.js", "mobile/version-history.js.old",
    "mobile/warehouse-enhancements.js", "mobile/warehouse-enhancements-legacy.js", "mobile/inventory-state.js",
    "mobile/warehouse-splash-vintage.png", "mobile/warehouse-splash.png",
    "android-app/patch-bundled-price-source.mjs", "android-app/release-1.0.18-trigger.txt", "android-app/www",
    "android-app/branding/android-branding.zip", "android-app/branding/icon.part01.b64", "android-app/branding/icon.part02.b64",
    "android-app/branding/splashq.part01.b64", "android-app/branding/splashq.part02.b64",
    "android-app/branding/splashv4.part01.b64", "android-app/branding/splashv4.part02.b64", "android-app/branding/splashv4.part03.b64",
    "android-app/branding/splashv4.part04.b64", "android-app/branding/splashv4.part05.b64", "android-app/branding/splashv4.part06.b64", "android-app/branding/splashv4.part07.b64"
]:
    remove(path)

# Old unversioned history/bootstrap files are safe to remove only after their current
# replacements have been written above.
for path in ["mobile/version-history.js", "mobile/bootstrap.js"]:
    pass

# Remove old historical files that are not the newly written stable names.
remove("mobile/version-history-103.js")
remove("mobile/version-history-104.js")

# The original unversioned version-history.js/bootstrap.js were overwritten by the
# stable current modules, so no extra deletion is needed for those paths.

# Clean empty .github/scripts directory if applicable.
scripts_dir = ROOT / ".github/scripts"
if scripts_dir.exists() and not any(scripts_dir.iterdir()):
    scripts_dir.rmdir()

# Remove the temporary refactor mechanism itself from the final commit.
remove(".github/workflows/refactor-mobile-cleanup.yml")
remove("scripts/refactor_mobile_cleanup.py")

print("Mobile cleanup/refactor applied successfully")
