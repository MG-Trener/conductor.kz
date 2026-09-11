import { collection, doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const KZT = new Intl.NumberFormat("ru-KZ", {
  style: "currency",
  currency: "KZT",
  maximumFractionDigits: 0
});

function showError(message) {
  const node = document.getElementById("cash-movement-error");
  if (node) node.textContent = message;
}

async function saveCashMovementSecurely(event) {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || form.id !== "cash-movement-form") return;

  // warehouse-ui.js still contains the old handler. Intercept this form in the
  // capture phase so only the linked, rules-compatible transaction is sent.
  event.preventDefault();
  event.stopImmediatePropagation();

  const api = window.CONDUCTOR_APP_API;
  const db = api?.getDb?.();
  const user = api?.getUser?.();
  const submit = document.getElementById("cash-movement-submit");
  showError("");

  if (!api || !db || !user) {
    showError("Нет активной авторизации.");
    return;
  }

  const type = document.querySelector('input[name="cash-movement-type"]:checked')?.value || "deposit";
  const amount = Math.trunc(Number(document.getElementById("cash-movement-amount")?.value || 0));
  const comment = document.getElementById("cash-movement-comment")?.value.trim() || "";

  if (!Number.isInteger(amount) || amount <= 0) {
    showError("Укажите сумму больше нуля.");
    return;
  }

  const operationType = type === "deposit" ? "cash_deposit" : "cash_sawmill";
  const delta = type === "deposit" ? amount : -amount;
  const employee = api.currentEmployeeName?.() || "Сотрудник";

  if (submit) submit.disabled = true;
  try {
    const cashRef = doc(db, "finance", "cash");
    const operationRef = doc(collection(db, "orders"));

    await runTransaction(db, async (tx) => {
      const cashSnap = await tx.get(cashRef);
      if (!cashSnap.exists()) throw new Error("Баланс кассы ещё не создан.");

      const before = Number(cashSnap.data().balance || 0);
      const after = before + delta;
      if (after < 0) throw new Error(`В кассе доступно только ${KZT.format(before)}.`);

      tx.update(cashRef, {
        balance: after,
        lastOperationType: operationType,
        lastOperationId: operationRef.id,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: employee
      });

      tx.set(operationRef, {
        operationType,
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
        createdByName: employee
      });
    });

    document.getElementById("cash-dialog")?.close();
    api.toast?.(`${type === "deposit" ? "Пополнение" : "Пилорама"} ${KZT.format(amount)} · ${employee}`);
  } catch (error) {
    const raw = String(error?.message || "");
    const denied = /permission-denied|missing or insufficient permissions|insufficient permissions/i.test(raw);
    showError(denied
      ? "Firebase отклонил запись. Обновите приложение/страницу и повторите. Если ошибка останется — правила Firestore ещё не успели опубликоваться."
      : (raw || "Не удалось изменить баланс."));
  } finally {
    if (submit) submit.disabled = false;
  }
}

document.addEventListener("submit", saveCashMovementSecurely, true);
