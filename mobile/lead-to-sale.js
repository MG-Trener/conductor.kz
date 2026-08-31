import { getApps } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore, collection, doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

let activeLead = null;
window.CONDUCTOR_ACTIVE_LEAD_ID = null;

function toast(message) {
  const node = document.querySelector("#toast");
  if (!node) return;
  node.textContent = message;
  node.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove("show"), 2200);
}

function clearLeadState(clearForm = false) {
  activeLead = null;
  window.CONDUCTOR_ACTIVE_LEAD_ID = null;
  if (!clearForm) return;
  const form = document.querySelector("#sale-form");
  form?.reset();
  document.querySelectorAll("[data-qty]").forEach((input) => input.value = "0");
  document.querySelector("[data-qty]")?.dispatchEvent(new Event("input", { bubbles: true }));
  const error = document.querySelector("#sale-error");
  if (error) error.textContent = "";
}

function selectLead(lead) {
  activeLead = lead;
  window.CONDUCTOR_ACTIVE_LEAD_ID = lead.id || null;
  document.querySelector('[data-nav="sale"]')?.click();

  const customer = document.querySelector("#sale-customer");
  const phone = document.querySelector("#sale-phone");
  const notes = document.querySelector("#sale-notes");
  if (customer) customer.value = lead.customer || "";
  if (phone) phone.value = lead.phone || "";
  if (notes) notes.value = `Заявка с сайта${lead.id ? ` #${lead.id}` : ""}`;

  document.querySelectorAll("[data-qty]").forEach((input) => input.value = "0");
  const qty = document.querySelector(`[data-qty="${CSS.escape(lead.productId)}"]`);
  if (qty) {
    const max = Number(qty.max || 0);
    qty.value = max > 0 ? "1" : "0";
    qty.dispatchEvent(new Event("input", { bubbles: true }));
  }

  const errorNode = document.querySelector("#sale-error");
  if (errorNode && qty && Number(qty.max || 0) <= 0) {
    errorNode.textContent = `${lead.productId}: товара нет на складе. Сначала внесите остаток.`;
  }
  toast("Заявка перенесена в оформление заказа");
}

function selectedItems() {
  return [...document.querySelectorAll("[data-qty]")].map((input) => {
    const qty = Number(input.value || 0);
    if (qty <= 0) return null;
    const row = input.closest(".sale-product");
    const title = row?.querySelector(".sale-product-name b")?.textContent?.trim() || input.dataset.qty;
    const meta = row?.querySelector(".sale-product-name small")?.textContent || "";
    const priceText = meta.split("·")[0] || "0";
    const price = Number(priceText.replace(/[^0-9]/g, "")) || 0;
    return { productId: input.dataset.qty, name: title, qty, price, lineTotal: qty * price };
  }).filter(Boolean);
}

async function submitLeadOrder(event) {
  if (!activeLead) return;
  event.preventDefault();
  event.stopImmediatePropagation();

  const form = event.currentTarget;
  const submit = event.submitter || form.querySelector('button[type="submit"]');
  const errorNode = document.querySelector("#sale-error");
  if (errorNode) errorNode.textContent = "";
  const items = selectedItems();
  if (!items.length) {
    if (errorNode) errorNode.textContent = "Добавьте хотя бы один товар.";
    return;
  }

  const customer = document.querySelector("#sale-customer")?.value.trim() || "";
  const phone = document.querySelector("#sale-phone")?.value.trim() || "";
  const city = document.querySelector("#sale-city")?.value.trim() || "";
  const notes = document.querySelector("#sale-notes")?.value.trim() || "";
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const app = getApps()[0];
  const auth = app ? getAuth(app) : null;
  const user = auth?.currentUser;
  if (!app || !user) {
    if (errorNode) errorNode.textContent = "Нет активной авторизации Firebase.";
    return;
  }

  submit.disabled = true;
  try {
    const db = getFirestore(app);
    const productRefs = items.map((item) => doc(db, "products", item.productId));
    const leadRef = doc(db, "leads", activeLead.id);
    const orderRef = doc(collection(db, "orders"));
    const movementRefs = items.map(() => doc(collection(db, "stockMovements")));

    await runTransaction(db, async (tx) => {
      const productSnaps = [];
      for (const ref of productRefs) productSnaps.push(await tx.get(ref));
      productSnaps.forEach((snap, index) => {
        if (!snap.exists()) throw new Error(`${items[index].productId}: товар не найден`);
        const stock = Number(snap.data().stock || 0);
        if (stock < items[index].qty) throw new Error(`${items[index].productId}: на складе только ${stock}`);
      });

      productSnaps.forEach((snap, index) => {
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
          reason: `Продажа по заявке с сайта · заказ #${orderRef.id.slice(0, 8)}`,
          orderId: orderRef.id,
          leadId: activeLead.id,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          createdByEmail: user.email || ""
        });
      });

      tx.set(orderRef, {
        customer, phone, city, notes, items, total,
        status: "new",
        source: "website-lead",
        leadId: activeLead.id,
        inventoryLogged: true,
        createdAt: serverTimestamp(),
        createdAtClient: new Date().toISOString(),
        createdBy: user.uid,
        createdByEmail: user.email || ""
      });
      tx.update(leadRef, {
        status: "converted",
        orderId: orderRef.id,
        convertedAt: serverTimestamp(),
        statusUpdatedAt: serverTimestamp(),
        convertedBy: user.uid
      });
    });

    clearLeadState(true);
    toast("Заявка оформлена в заказ, товар списан");
    document.querySelector('[data-nav="orders"]')?.click();
  } catch (error) {
    if (errorNode) errorNode.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
}

window.addEventListener("conductor:convert-lead", (event) => {
  if (event.detail?.id && event.detail?.productId) selectLead(event.detail);
});

// A real user click on "Продажа" means a fresh manual sale. Programmatic click
// from selectLead() is not trusted, so the active lead stays intact there.
document.addEventListener("click", (event) => {
  const saleNav = event.target.closest('[data-nav="sale"]');
  if (!saleNav || !event.isTrusted || !activeLead) return;
  clearLeadState(true);
}, true);

document.querySelector("#sale-form")?.addEventListener("submit", submitLeadOrder, true);
