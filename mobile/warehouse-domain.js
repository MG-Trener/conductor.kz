import {
  collection, doc, getDoc, getDocs, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

export function createWarehouseDomain({ state, currentEmployeeName }) {
  async function requestSalePush(orderId) {
    const endpoint = String(window.CONDUCTOR_PUSH_ENDPOINT || "").trim();
    if (!endpoint || !state.user) return { configured: false, delivered: false };
    const idToken = await state.user.getIdToken();
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ orderId })
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { configured: true, delivered: true };
      } catch (error) { lastError = error; }
    }
    console.error("Sale push request failed", lastError);
    return { configured: true, delivered: false };
  }

  async function ensureCashBalance() {
    const cashRef = doc(state.db, "finance", "cash");
    const current = await getDoc(cashRef);
    if (current.exists()) return Number(current.data().balance || 0);

    const [ordersSnap, withdrawalsSnap] = await Promise.all([
      getDocs(collection(state.db, "orders")), getDocs(collection(state.db, "cashWithdrawals"))
    ]);
    const revenue = ordersSnap.docs.reduce((sum, item) => item.data().status === "cancelled" ? sum : sum + Number(item.data().total || 0), 0);
    const withdrawn = withdrawalsSnap.docs.reduce((sum, item) => sum + Number(item.data().amount || 0), 0);
    const initialBalance = revenue - withdrawn;
    const employee = currentEmployeeName();

    await runTransaction(state.db, async (tx) => {
      const snap = await tx.get(cashRef);
      if (snap.exists()) return;
      tx.set(cashRef, {
        balance: initialBalance,
        initializedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: state.user.uid,
        updatedByName: employee
      });
    });
    return initialBalance;
  }

  async function commitSale({ items, note = "", total, baseTotal = total, pricing = null }) {
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
          stock: after, updatedAt: serverTimestamp(), updatedBy: state.user.uid, updatedByName: employee
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
        createdByName: employee
      });
      tx.update(cashRef, {
        balance: Number(cashSnap.data().balance || 0) + total,
        updatedAt: serverTimestamp(),
        updatedBy: state.user.uid,
        updatedByName: employee
      });
    });

    const pushResult = await requestSalePush(saleRef.id);
    return { saleId: saleRef.id, employee, pushResult };
  }

  function inventoryIdForSaleItem(item) {
    if (item.inventoryId) return item.inventoryId;
    const productId = String(item.productId || "");
    if (!productId) return productId;
    return productId.includes("_") ? productId : `${productId}_UNASSIGNED`;
  }

  async function cancelSale(saleId) {
    const employee = currentEmployeeName();
    const saleRef = doc(state.db, "orders", saleId);
    await ensureCashBalance();
    const cashRef = doc(state.db, "finance", "cash");
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
      const cashSnap = await tx.get(cashRef);
      if (!cashSnap.exists()) throw new Error("Баланс кассы ещё не создан. Повторите отмену.");
      const movementRefs = items.map(() => doc(collection(state.db, "stockMovements")));

      productSnaps.forEach((snap, index) => {
        if (!snap.exists()) throw new Error(`${items[index].name || items[index].productId}: товар не найден`);
      });
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
          createdByName: employee
        });
      });

      tx.update(saleRef, {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
        cancelledBy: state.user.uid,
        cancelledByName: employee
      });
      tx.update(cashRef, {
        balance: Number(cashSnap.data().balance || 0) - Number(sale.total || 0),
        updatedAt: serverTimestamp(),
        updatedBy: state.user.uid,
        updatedByName: employee
      });
    });
  }

  return Object.freeze({ ensureCashBalance, commitSale, cancelSale });
}
