from pathlib import Path
import re

rules_path = Path("firestore.rules")
rules = rules_path.read_text()
old_guard = "        && cashOperationId(request.resource.data) != cashOperationId(resource.data)\n"
new_guard = "        && (cashOperationId(request.resource.data) != cashOperationId(resource.data)\n          || cashOperationType(request.resource.data) != cashOperationType(resource.data))\n"
if rules.count(old_guard) != 1:
    raise SystemExit(f"expected one cash replay guard, found {rules.count(old_guard)}")
rules_path.write_text(rules.replace(old_guard, new_guard, 1))

test_path = Path("tests/firestore.rules.test.mjs")
tests = test_path.read_text()
pattern = re.compile(r'test\("diagnostic sale stock and movement link", async \(\) => \{.*?\n\}\);\n\ntest\("catalogue identity', re.S)
replacement = '''test("sale and cancellation paths remain allowed only as linked atomic operations", async () => {
  const db = staffDb();
  const orderRef = doc(db, "orders", "order-1");
  const cashRef = doc(db, "finance", "cash");
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
      lastMovementId: "sale-1",
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
    transaction.set(doc(db, "stockMovements", "sale-1"), movement({
      type: "sale",
      qtyDelta: -1,
      after: 3,
      totalCost: 0,
      salePrice: 2500,
      orderId: "order-1",
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
      lastOperationId: "order-1",
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
  }));

  await assertSucceeds(runTransaction(db, async (transaction) => {
    transaction.update(doc(db, "products", "DM30_BLUE"), {
      stock: 4,
      lastMovementId: "return-1",
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
    transaction.set(doc(db, "stockMovements", "return-1"), movement({
      type: "sale_return",
      qtyDelta: 1,
      before: 3,
      after: 4,
      totalCost: 0,
      orderId: "order-1",
      reason: "Отмена продажи"
    }));
    transaction.update(orderRef, {
      status: "cancelled",
      cancelledAt: serverTimestamp(),
      cancelledBy: staffUid,
      cancelledByName: "Сотрудник"
    });
    transaction.update(cashRef, {
      balance: 5000,
      lastOperationType: "cancel_sale",
      lastOperationId: "order-1",
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
  }));

  assert.equal((await getDoc(doc(db, "products", "DM30_BLUE"))).data().stock, 4);
  assert.equal((await getDoc(cashRef)).data().balance, 5000);
  assert.equal((await getDoc(orderRef)).data().status, "cancelled");
});

test("catalogue identity'''
tests, count = pattern.subn(replacement, tests, count=1)
if count != 1:
    raise SystemExit(f"expected diagnostic sale block once, found {count}")
test_path.write_text(tests)
