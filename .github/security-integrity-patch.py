from pathlib import Path
import re


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected 1 exact match, found {count}")
    return text.replace(old, new, 1)


app_path = Path("mobile/app.js")
app = app_path.read_text()
app = replace_once(app, '''      tx.update(cashRef, {
        balance: after,
        updatedAt: serverTimestamp(),
        updatedBy: state.user.uid,
        updatedByName: employee
      });''', '''      tx.update(cashRef, {
        balance: after,
        lastOperationType: "withdrawal",
        lastOperationId: withdrawalRef.id,
        updatedAt: serverTimestamp(),
        updatedBy: state.user.uid,
        updatedByName: employee
      });''', "withdrawal cash linkage")

model_pattern = re.compile(r'''        const before = snap\.exists\(\) \? Number\(snap\.data\(\)\.stock \|\| 0\) : 0;\n        const after = desiredItem\.stock;\n\n        if \(!snap\.exists\(\)\) \{.*?\n        if \(before !== after\) \{.*?\n        \}\n      \}\n\n      tx\.set\(catalogRef,''', re.S)
model_replacement = '''        const before = snap.exists() ? Number(snap.data().stock || 0) : 0;
        const after = desiredItem.stock;
        const movementRef = before !== after ? doc(collection(state.db, "stockMovements")) : null;

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
            ...(movementRef ? { lastMovementId: movementRef.id } : {}),
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
          if (movementRef) update.lastMovementId = movementRef.id;
          if (data.legacyUnassigned) update.active = after > 0;
          else if (data.active === false) update.active = true;
          if (data.modelOnly === true) update.modelOnly = false;
          tx.update(ref, update);
        }

        if (movementRef) {
          const data = snap.exists() ? snap.data() : template;
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
            createdByName: employee
          });
        }
      }

      tx.set(catalogRef,'''
app, count = model_pattern.subn(model_replacement, app, count=1)
if count != 1:
    raise SystemExit(f"model inventory linkage: expected 1 match, found {count}")

app = replace_once(app,
    '      tx.update(productRef, { stock: after, updatedAt: serverTimestamp(), updatedBy: state.user.uid, updatedByName: employee });',
    '''      tx.update(productRef, {
        stock: after,
        lastMovementId: movementRef.id,
        updatedAt: serverTimestamp(),
        updatedBy: state.user.uid,
        updatedByName: employee
      });''',
    "receipt/writeoff linkage")
app_path.write_text(app)

catalog_path = Path("mobile/catalog-service.js")
catalog = catalog_path.read_text()
migration_pattern = re.compile(r'  async function migrateLegacyModel\(model\) \{.*?\n  \}\n\n  async function ensureProducts\(\)', re.S)
migration_replacement = '''  async function migrateLegacyModel(model) {
    const legacyRef = doc(state.db, "products", model.id);
    const unassignedRef = doc(state.db, "products", `${model.id}_UNASSIGNED`);
    const employee = currentEmployeeName();
    const audit = {
      updatedAt: serverTimestamp(), updatedBy: state.user.uid, updatedByName: employee
    };

    await runTransaction(state.db, async (tx) => {
      const legacySnap = await tx.get(legacyRef);
      const unassignedSnap = await tx.get(unassignedRef);
      if (!legacySnap.exists() && !unassignedSnap.exists()) return;

      const legacy = legacySnap.exists() ? legacySnap.data() : null;
      const unassigned = unassignedSnap.exists() ? unassignedSnap.data() : null;
      const legacyStock = Number(legacy?.stock || 0);
      const currentStock = Number(unassigned?.stock || 0);
      const nextStock = currentStock + legacyStock;
      const movementRef = legacyStock > 0 ? doc(collection(state.db, "stockMovements")) : null;
      const creationAudit = unassignedSnap.exists() ? {} : {
        createdAt: serverTimestamp(), createdBy: state.user.uid, createdByName: employee
      };
      tx.set(unassignedRef, {
        modelId: model.id,
        name: `${model.id} · Нераспределено`,
        stock: nextStock,
        lowStock: 0,
        sort: model.sort,
        legacyUnassigned: true,
        active: nextStock > 0,
        ...(movementRef ? { lastMovementId: movementRef.id } : {}),
        ...creationAudit,
        ...audit
      }, { merge: true });

      if (movementRef) {
        tx.set(movementRef, {
          type: "adjustment",
          inventoryId: `${model.id}_UNASSIGNED`,
          productId: model.id,
          productName: `${model.id} · Нераспределено`,
          colorId: "",
          colorName: "",
          qtyDelta: legacyStock,
          before: currentStock,
          after: nextStock,
          unitCost: 0,
          totalCost: 0,
          reason: "Миграция старого общего остатка",
          createdAt: serverTimestamp(),
          createdAtClient: new Date().toISOString(),
          createdBy: state.user.uid,
          createdByName: employee
        });
      }

      if (legacySnap.exists()) {
        tx.set(legacyRef, {
          active: false, stock: 0, modelOnly: true, variantMigrationV2: true, ...audit
        }, { merge: true });
      }
    });
  }

  async function ensureProducts()'''
catalog, count = migration_pattern.subn(migration_replacement, catalog, count=1)
if count != 1:
    raise SystemExit(f"legacy migration linkage: expected 1 match, found {count}")
catalog_path.write_text(catalog)

test_path = Path("tests/firestore.rules.test.mjs")
tests = test_path.read_text()
tests = tests.replace('name: `DM60G · ${colorName}`,\n      sort,', 'name: `DM60G · ${colorName}`,\n      stock: 0,\n      sort,')
tests = tests.replace('name: `DM60R1G · ${colorName}`,\n      sort,', 'name: `DM60R1G · ${colorName}`,\n      stock: 0,\n      sort,')
tests = replace_once(tests, '''      stock: 6,
      stockInitialized: true,''', '''      stock: 6,
      lastMovementId: "movement-1",
      stockInitialized: true,''', "inventory test movement id")

zero_pattern = re.compile(r'test\("staff can initialize a zero balance without creating a zero-delta movement", async \(\) => \{.*?\n\}\);', re.S)
zero_replacement = '''test("inventory metadata can be initialized without creating a zero-delta movement", async () => {
  await assertSucceeds(updateDoc(doc(staffDb(), "products", "DM30_BLUE"), {
    stock: 4,
    stockInitialized: true,
    inventoryInitialized: true,
    lastInventoryAt: serverTimestamp(),
    lastInventoryBy: staffUid,
    lastInventoryByName: "Сотрудник",
    updatedAt: serverTimestamp(),
    updatedBy: staffUid,
    updatedByName: "Сотрудник"
  }));
});'''
tests, count = zero_pattern.subn(zero_replacement, tests, count=1)
if count != 1:
    raise SystemExit("zero-delta test replacement failed")

tests = replace_once(tests, '''      stock: 7,
      updatedAt: serverTimestamp(),''', '''      stock: 7,
      lastMovementId: "receipt-1",
      updatedAt: serverTimestamp(),''', "receipt test movement id")

sale_pattern = re.compile(r'test\("sale and cancellation paths remain allowed for the authenticated employee", async \(\) => \{.*?\n\}\);\n\ntest\("catalogue identity', re.S)
sale_replacement = '''test("sale and cancellation paths remain allowed only as linked atomic operations", async () => {
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
});

test("catalogue identity'''
tests, count = sale_pattern.subn(sale_replacement, tests, count=1)
if count != 1:
    raise SystemExit("sale/cancellation test replacement failed")

movement_pattern = re.compile(r'test\("movement journal rejects writes that do not match the resulting product stock", async \(\) => \{.*?\n\}\);', re.S)
movement_replacement = '''test("movement journal rejects forged audit identity", async () => {
  await assertFails(setDoc(doc(staffDb(), "stockMovements", "fake-movement"), movement({
    createdBy: secondStaffUid
  })));
});'''
tests, count = movement_pattern.subn(movement_replacement, tests, count=1)
if count != 1:
    raise SystemExit("movement test replacement failed")

tests = replace_once(tests, '''    updatedBy: staffUid,
    updatedByName: "Сотрудник"
  }));

  await assertSucceeds(runTransaction(db, async (transaction) => {
    await transaction.get(cashRef);
    transaction.update(cashRef, {
      balance: 3000,
      updatedAt: serverTimestamp(),''', '''    updatedBy: staffUid,
    updatedByName: "Сотрудник",
    lastOperationType: "init",
    lastOperationId: "initial"
  }));

  await assertSucceeds(runTransaction(db, async (transaction) => {
    await transaction.get(cashRef);
    transaction.update(cashRef, {
      balance: 3000,
      lastOperationType: "withdrawal",
      lastOperationId: "withdrawal-1",
      updatedAt: serverTimestamp(),''', "withdrawal test cash linkage")

insert_anchor = 'test("movement journal is immutable and unrelated collections stay closed", async () => {'
integrity_test = '''test("direct stock and cash rewrites are rejected even for warehouse staff", async () => {
  const db = staffDb();
  await assertFails(updateDoc(doc(db, "products", "DM30_BLUE"), {
    stock: 2,
    updatedAt: serverTimestamp(),
    updatedBy: staffUid,
    updatedByName: "Сотрудник"
  }));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "finance", "cash"), {
      balance: 5000,
      initializedAt: new Date("2026-09-01T00:00:00Z"),
      updatedAt: new Date("2026-09-01T00:00:00Z"),
      updatedBy: staffUid,
      updatedByName: "Сотрудник",
      lastOperationType: "init",
      lastOperationId: "initial"
    });
  });
  await assertFails(updateDoc(doc(db, "finance", "cash"), {
    balance: 1,
    lastOperationType: "withdrawal",
    lastOperationId: "forged-withdrawal",
    updatedAt: serverTimestamp(),
    updatedBy: staffUid,
    updatedByName: "Сотрудник"
  }));
});

'''
if insert_anchor not in tests:
    raise SystemExit("integrity test anchor not found")
tests = tests.replace(insert_anchor, integrity_test + insert_anchor, 1)
test_path.write_text(tests)

app_version = Path("mobile/app-version.json")
text = app_version.read_text()
text = text.replace('"version": "1.1.3"', '"version": "1.1.4"', 1)
text = text.replace('"versionCode": 10103', '"versionCode": 10104', 1)
text = re.sub(r'"notes": ".*?",\n', '"notes": "1.1.4: усилена целостность склада и кассы. Любое изменение остатка теперь связано с неизменяемой записью движения, а изменение кассы — с продажей, отменой или выводом средств. Прямые переписывания остатков и баланса блокируются Firestore Rules.",\n', text, count=1)
app_version.write_text(text)

package = Path("android-app/package.json")
text = package.read_text().replace('"version": "1.1.3"', '"version": "1.1.4"', 1)
package.write_text(text)

lock = Path("android-app/package-lock.json")
text = lock.read_text()
text = text.replace('"version": "1.1.3"', '"version": "1.1.4"', 2)
lock.write_text(text)

history = Path("mobile/version-history.js")
text = history.read_text()
marker = "const VERSIONS = [\n"
entry = '''const VERSIONS = [
  {
    version: "1.1.4",
    date: "07.09.2026",
    changes: [
      "Усилена целостность склада: изменение остатка принимается только вместе с новой неизменяемой записью движения.",
      "Усилена целостность кассы: баланс меняется только атомарно с продажей, отменой продажи или выводом средств.",
      "Исправлено расхождение схемы stockMovements между приложением, тестами и production Firestore Rules."
    ]
  },
'''
if not text.startswith(marker):
    raise SystemExit("version history marker not found")
text = entry + text[len(marker):]
text = text.replace("Актуальная версия: 1.1.3", "Актуальная версия: 1.1.4")
text = text.replace('data-current-version="1.1.3"', 'data-current-version="1.1.4"')
history.write_text(text)
