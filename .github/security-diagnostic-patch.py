from pathlib import Path
import re

path = Path("tests/firestore.rules.test.mjs")
text = path.read_text()
pattern = re.compile(r'test\("sale and cancellation paths remain allowed only as linked atomic operations", async \(\) => \{.*?\n\}\);\n\ntest\("catalogue identity', re.S)
replacement = '''test("diagnostic sale stock and movement link", async () => {
  const db = staffDb();
  await assertSucceeds(runTransaction(db, async (transaction) => {
    transaction.update(doc(db, "products", "DM30_BLUE"), {
      stock: 3,
      lastMovementId: "sale-diag-1",
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
    transaction.set(doc(db, "stockMovements", "sale-diag-1"), movement({
      type: "sale",
      qtyDelta: -1,
      after: 3,
      totalCost: 0,
      salePrice: 2500,
      orderId: "order-diag-1",
      reason: ""
    }));
  }));
});

test("diagnostic order creation", async () => {
  const db = staffDb();
  await assertSucceeds(setDoc(doc(db, "orders", "order-diag-2"), {
    items: [{ inventoryId: "DM30_BLUE", productId: "DM30", qty: 1, price: 2500 }],
    total: 2500,
    note: "",
    status: "done",
    source: "stock-app",
    createdAt: serverTimestamp(),
    createdAtClient: "2026-08-31T10:00:00.000Z",
    createdBy: staffUid,
    createdByName: "Сотрудник"
  }));
});

test("diagnostic cash and order atomic link", async () => {
  const db = staffDb();
  const cashRef = doc(db, "finance", "cash");
  const orderRef = doc(db, "orders", "order-diag-3");
  await assertSucceeds(setDoc(cashRef, {
    balance: 5000,
    initializedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: staffUid,
    updatedByName: "Сотрудник",
    lastOperationType: "init",
    lastOperationId: "initial"
  }));
  await assertSucceeds(runTransaction(db, async (transaction) => {
    transaction.set(orderRef, {
      items: [{ inventoryId: "DM30_BLUE", productId: "DM30", qty: 1, price: 2500 }],
      total: 2500,
      note: "",
      status: "done",
      source: "stock-app",
      createdAt: serverTimestamp(),
      createdAtClient: "2026-08-31T10:00:00.000Z",
      createdBy: staffUid,
      createdByName: "Сотрудник"
    });
    transaction.update(cashRef, {
      balance: 7500,
      lastOperationType: "sale",
      lastOperationId: "order-diag-3",
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
  }));
});

test("diagnostic full sale atomic link", async () => {
  const db = staffDb();
  const cashRef = doc(db, "finance", "cash");
  const orderRef = doc(db, "orders", "order-diag-4");
  await assertSucceeds(setDoc(cashRef, {
    balance: 5000,
    initializedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: staffUid,
    updatedByName: "Сотрудник",
    lastOperationType: "init",
    lastOperationId: "initial"
  }));
  await assertSucceeds(runTransaction(db, async (transaction) => {
    transaction.update(doc(db, "products", "DM30_BLUE"), {
      stock: 3,
      lastMovementId: "sale-diag-4",
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
    transaction.set(doc(db, "stockMovements", "sale-diag-4"), movement({
      type: "sale",
      qtyDelta: -1,
      after: 3,
      totalCost: 0,
      salePrice: 2500,
      orderId: "order-diag-4",
      reason: ""
    }));
    transaction.set(orderRef, {
      items: [{ inventoryId: "DM30_BLUE", productId: "DM30", qty: 1, price: 2500 }],
      total: 2500,
      note: "",
      status: "done",
      source: "stock-app",
      createdAt: serverTimestamp(),
      createdAtClient: "2026-08-31T10:00:00.000Z",
      createdBy: staffUid,
      createdByName: "Сотрудник"
    });
    transaction.update(cashRef, {
      balance: 7500,
      lastOperationType: "sale",
      lastOperationId: "order-diag-4",
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
  }));
});

test("catalogue identity'''
text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f"diagnostic sale replacement expected 1 match, found {count}")
path.write_text(text)
