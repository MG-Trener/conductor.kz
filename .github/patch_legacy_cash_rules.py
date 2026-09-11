from pathlib import Path

rules_path = Path("firestore.rules")
rules = rules_path.read_text()

old = """      allow update: if isStaff()
        && docId == 'cash'
        && validCashState(request.resource.data)
        && request.resource.data.keys().hasOnly([
          'balance', 'initializedAt', 'updatedAt', 'updatedBy', 'updatedByName',
          'lastOperationType', 'lastOperationId'
        ])
"""
new = """      allow update: if isStaff()
        && docId == 'cash'
        && validCashState(request.resource.data)
        && request.resource.data.keys().hasOnly([
          'balance', 'initializedAt', 'updatedAt', 'updatedBy', 'updatedByName',
          'lastOperationType', 'lastOperationId', 'resetAt', 'resetReason'
        ])
"""
if old in rules:
    rules = rules.replace(old, new, 1)
elif new not in rules:
    raise SystemExit("finance/cash update rule marker not found")
rules_path.write_text(rules)

tests_path = Path("tests/firestore.rules.test.mjs")
tests = tests_path.read_text()
marker = 'test("legacy cash reset metadata can be preserved while saving linked manual sawmill"'
if marker not in tests:
    tests += r'''

test("legacy cash reset metadata can be preserved while saving linked manual sawmill", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "finance", "cash"), {
      balance: 5000,
      initializedAt: new Date("2026-08-31T00:00:00Z"),
      resetAt: new Date("2026-09-01T00:00:00Z"),
      resetReason: "legacy reset",
      updatedAt: new Date("2026-09-01T00:00:00Z"),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
  });

  const db = staffDb();
  const cashRef = doc(db, "finance", "cash");
  const operationRef = doc(db, "orders", "cash-op-legacy-1");
  await assertSucceeds(runTransaction(db, async (transaction) => {
    const cashSnap = await transaction.get(cashRef);
    const before = Number(cashSnap.data().balance || 0);
    const amount = 1000;
    const after = before - amount;
    transaction.update(cashRef, {
      balance: after,
      lastOperationType: "cash_sawmill",
      lastOperationId: "cash-op-legacy-1",
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
    transaction.set(operationRef, {
      operationType: "cash_sawmill",
      amount,
      cashDelta: -amount,
      before,
      after,
      items: [],
      total: -amount,
      note: "Проверка старой кассы",
      status: "done",
      source: "stock-app",
      createdAt: serverTimestamp(),
      createdAtClient: "2026-09-11T12:00:00.000Z",
      createdBy: staffUid,
      createdByName: "Сотрудник"
    });
  }));

  const snapshot = await getDoc(cashRef);
  assert.equal(snapshot.data().balance, 4000);
  assert.equal(snapshot.data().resetReason, "legacy reset");
  assert.equal(snapshot.data().lastOperationType, "cash_sawmill");
  assert.equal(snapshot.data().lastOperationId, "cash-op-legacy-1");
});
'''

tests_path.write_text(tests)
