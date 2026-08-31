import { getApps } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore, collection, doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

let processing = false;

function toast(message) {
  const node = document.querySelector("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2400);
}

function selectedItems() {
  return [...document.querySelectorAll("[data-qty]")].map((input) => {
    const qty = Number(input.value || 0);
    if (qty <= 0) return null;
    const row = input.closest(".sale-product");
    const name = row?.querySelector(".sale-product-name b")?.textContent?.trim() || input.dataset.qty;
    const meta = row?.querySelector(".sale-product-name small")?.textContent || "";
    const price = Number((meta.split("·")[0] || "0").replace(/[^0-9]/g, "")) || 0;
    return { productId: input.dataset.qty, name, qty, price, lineTotal: qty * price };
  }).filter(Boolean);
}

async function createManualSale(event) {
  if (event.defaultPrevented || processing) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  processing = true;

  const form = event.currentTarget;
  const submit = event.submitter || form.querySelector('button[type="submit"]');
  const errorNode = document.querySelector("#sale-error");
  if (errorNode) errorNode.textContent = "";
  const items = selectedItems();
  if (!items.length) {
    if (errorNode) errorNode.textContent = "Добавьте хотя бы один товар.";
    processing = false;
    return;
  }

  const app = getApps()[0];
  const auth = app ? getAuth(app) : null;
  const user = auth?.currentUser;
  if (!app || !user) {
    if (errorNode) errorNode.textContent = "Нет активной авторизации Firebase.";
    processing = false;
    return;
  }

  const customer = document.querySelector("#sale-customer")?.value.trim() || "";
  const phone = document.querySelector("#sale-phone")?.value.trim() || "";
  const city = document.querySelector("#sale-city")?.value.trim() || "";
  const notes = document.querySelector("#sale-notes")?.value.trim() || "";
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  submit.disabled = true;

  try {
    const db = getFirestore(app);
    const productRefs = items.map((item) => doc(db, "products", item.productId));
    const orderRef = doc(collection(db, "orders"));
    const movementRefs = items.map(() => doc(collection(db, "stockMovements")));

    await runTransaction(db, async (tx) => {
      const snaps = [];
      for (const ref of productRefs) snaps.push(await tx.get(ref));
      snaps.forEach((snap, index) => {
        if (!snap.exists()) throw new Error(`${items[index].productId}: товар не найден`);
        const stock = Number(snap.data().stock || 0);
        if (stock < items[index].qty) throw new Error(`${items[index].productId}: на складе только ${stock}`);
      });

      snaps.forEach((snap, index) => {
        const data = snap.data();
        const before = Number(data.stock || 0);
        const after = before - items[index].qty;
        const avgCost = Number(data.averagePurchasePrice || 0);
        tx.update(productRefs[index], { stock: after, updatedAt: serverTimestamp(), updatedBy: user.uid });
        tx.set(movementRefs[index], {
          productId: items[index].productId,
          productName: data.name || items[index].name,
          type: "sale",
          qty: items[index].qty,
          delta: -items[index].qty,
          before,
          after,
          purchasePrice: avgCost || null,
          totalCost: avgCost ? avgCost * items[index].qty : null,
          reason: `Продажа · заказ #${orderRef.id.slice(0, 8)}`,
          orderId: orderRef.id,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          createdByEmail: user.email || ""
        });
      });

      tx.set(orderRef, {
        customer, phone, city, notes, items, total,
        status: "new",
        source: "mobile",
        inventoryLogged: true,
        createdAt: serverTimestamp(),
        createdAtClient: new Date().toISOString(),
        createdBy: user.uid,
        createdByEmail: user.email || ""
      });
    });

    form.reset();
    document.querySelectorAll("[data-qty]").forEach((input) => input.value = "0");
    document.querySelector("[data-qty]")?.dispatchEvent(new Event("input", { bubbles: true }));
    toast("Заказ создан, товар списан со склада");
    document.querySelector('[data-nav="orders"]')?.click();
  } catch (error) {
    if (errorNode) errorNode.textContent = error.message;
  } finally {
    submit.disabled = false;
    processing = false;
  }
}

async function cancelOrder(button) {
  const app = getApps()[0];
  const auth = app ? getAuth(app) : null;
  const user = auth?.currentUser;
  if (!app || !user) return toast("Нет активной авторизации Firebase");
  const db = getFirestore(app);
  const orderRef = doc(db, "orders", button.dataset.orderId);
  button.disabled = true;
  try {
    await runTransaction(db, async (tx) => {
      const orderSnap = await tx.get(orderRef);
      if (!orderSnap.exists()) throw new Error("Заказ не найден");
      const order = orderSnap.data();
      if (order.status === "cancelled") return;
      if (order.inventoryRestored) throw new Error("Товар по этому заказу уже возвращён на склад");
      const items = Array.isArray(order.items) ? order.items : [];
      const productRefs = items.map((item) => doc(db, "products", item.productId));
      const productSnaps = [];
      for (const ref of productRefs) productSnaps.push(await tx.get(ref));
      const movementRefs = items.map(() => doc(collection(db, "stockMovements")));

      productSnaps.forEach((snap, index) => {
        if (!snap.exists()) throw new Error(`${items[index].productId}: товар не найден`);
        const data = snap.data();
        const qty = Number(items[index].qty || 0);
        const before = Number(data.stock || 0);
        const after = before + qty;
        tx.update(productRefs[index], { stock: after, updatedAt: serverTimestamp(), updatedBy: user.uid });
        tx.set(movementRefs[index], {
          productId: items[index].productId,
          productName: data.name || items[index].name || items[index].productId,
          type: "adjustment",
          qty,
          delta: qty,
          before,
          after,
          purchasePrice: null,
          totalCost: null,
          reason: `Возврат на склад: отмена заказа #${button.dataset.orderId.slice(0, 8)}`,
          orderId: button.dataset.orderId,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          createdByEmail: user.email || ""
        });
      });

      tx.update(orderRef, {
        status: "cancelled",
        inventoryRestored: true,
        inventoryRestoredAt: serverTimestamp(),
        statusUpdatedAt: serverTimestamp(),
        statusUpdatedBy: user.uid
      });
    });
    toast("Заказ отменён, товар возвращён на склад");
  } catch (error) {
    toast(error.message);
  } finally {
    button.disabled = false;
  }
}

function start() {
  const form = document.querySelector("#sale-form");
  // lead-to-sale.js is loaded earlier and stops this handler when a site lead is active.
  form?.addEventListener("submit", createManualSale, true);

  document.addEventListener("click", (event) => {
    const button = event.target.closest('[data-order-action="cancelled"]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    cancelOrder(button);
  }, true);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true }); else start();
