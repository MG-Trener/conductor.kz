import { collection, doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

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
