import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
  runTransaction
} from "firebase/firestore";

const projectId = "conductor-rules-test";
const staffUid = "employee-1";
const staffEmail = "staff@conductor.test";
let testEnv;

const product = {
  id: "DM30_BLUE",
  modelId: "DM30",
  colorId: "blue",
  colorName: "Синий",
  colorHex: "#258cff",
  name: "DM30 · Синий",
  price: 2500,
  stock: 4,
  lowStock: 2,
  sort: 11,
  active: true,
  avgCost: 1000,
  lastCost: 1000,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  createdBy: staffUid,
  createdByName: "Сотрудник",
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  updatedBy: staffUid,
  updatedByName: "Сотрудник"
};

function staffDb() {
  return testEnv.authenticatedContext(staffUid, { email: staffEmail }).firestore();
}

function movement(overrides = {}) {
  return {
    type: "adjustment",
    inventoryId: "DM30_BLUE",
    productId: "DM30",
    productName: "DM30 · Синий",
    colorId: "blue",
    colorName: "Синий",
    qtyDelta: 2,
    before: 4,
    after: 6,
    unitCost: 1000,
    totalCost: 2000,
    reason: "Инвентаризация DM30",
    createdAt: serverTimestamp(),
    createdAtClient: "2026-08-31T10:00:00.000Z",
    createdBy: staffUid,
    createdByEmail: staffEmail,
    createdByName: "Сотрудник",
    ...overrides
  };
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") }
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "products", "DM30_BLUE"), product);
  });
});

after(async () => {
  await testEnv?.cleanup();
});

test("email-authenticated staff can read warehouse products", async () => {
  const snapshot = await assertSucceeds(getDoc(doc(staffDb(), "products", "DM30_BLUE")));
  assert.equal(snapshot.data().stock, 4);
});

test("unauthenticated and non-email identities cannot access warehouse data", async () => {
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "products", "DM30_BLUE")));
  await assertFails(getDoc(doc(testEnv.authenticatedContext("anonymous-user").firestore(), "products", "DM30_BLUE")));
});

test("public visitors can read prices but only staff can publish the restricted price shape", async () => {
  const publicRef = doc(staffDb(), "publicProducts", "DM30");
  await assertSucceeds(setDoc(publicRef, {
    modelId: "DM30",
    name: "Цветной дым DM30",
    price: 2700,
    updatedAt: serverTimestamp(),
    updatedBy: staffUid,
    updatedByName: "Сотрудник"
  }));

  const publicDb = testEnv.unauthenticatedContext().firestore();
  const snapshot = await assertSucceeds(getDoc(doc(publicDb, "publicProducts", "DM30")));
  assert.equal(snapshot.data().price, 2700);
  await assertFails(setDoc(doc(publicDb, "publicProducts", "DM60"), {
    modelId: "DM60",
    name: "Цветной дым DM60",
    price: 3100
  }));
  await assertFails(setDoc(doc(staffDb(), "publicProducts", "DM90"), {
    modelId: "DM90",
    name: "Цветной дым DM90",
    price: 3600,
    stock: 99,
    updatedAt: serverTimestamp(),
    updatedBy: staffUid,
    updatedByName: "Сотрудник"
  }));
});

test("staff can atomically save model price, actual stock and its movement", async () => {
  const db = staffDb();
  await assertSucceeds(runTransaction(db, async (transaction) => {
    const productRef = doc(db, "products", "DM30_BLUE");
    const movementRef = doc(db, "stockMovements", "movement-1");
    transaction.update(productRef, {
      price: 2750,
      stock: 6,
      stockInitialized: true,
      inventoryInitialized: true,
      lastInventoryAt: serverTimestamp(),
      lastInventoryBy: staffUid,
      lastInventoryByName: "Сотрудник",
      priceUpdatedAt: serverTimestamp(),
      priceUpdatedBy: staffUid,
      priceUpdatedByName: "Сотрудник",
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
    transaction.set(movementRef, movement());
    transaction.set(doc(db, "publicProducts", "DM30"), {
      modelId: "DM30",
      name: "Цветной дым DM30",
      price: 2750,
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
  }));
});

test("staff can initialize a zero balance without creating a zero-delta movement", async () => {
  await assertSucceeds(updateDoc(doc(staffDb(), "products", "DM30_BLUE"), {
    stock: 0,
    stockInitialized: true,
    inventoryInitialized: true,
    lastInventoryAt: serverTimestamp(),
    lastInventoryBy: staffUid,
    lastInventoryByName: "Сотрудник",
    updatedAt: serverTimestamp(),
    updatedBy: staffUid,
    updatedByName: "Сотрудник"
  }));
});

test("staff can seed a fixed catalogue variant but not an arbitrary product", async () => {
  const db = staffDb();
  await assertSucceeds(setDoc(doc(db, "products", "HOLI_RED"), {
    id: "HOLI_RED",
    modelId: "HOLI",
    colorId: "red",
    colorName: "Красный",
    colorHex: "#ff0000",
    name: "HOLI · Красный",
    price: 1000,
    stock: 0,
    lowStock: 10,
    sort: 41,
    active: true,
    avgCost: 0,
    lastCost: 0,
    createdAt: serverTimestamp(),
    createdBy: staffUid,
    createdByName: "Сотрудник",
    updatedAt: serverTimestamp(),
    updatedBy: staffUid,
    updatedByName: "Сотрудник"
  }));
  await assertFails(setDoc(doc(db, "products", "ARBITRARY"), {
    name: "Чужой товар",
    modelId: "OTHER",
    price: 1,
    stock: 0,
    createdAt: serverTimestamp(),
    createdBy: staffUid,
    createdByName: "Сотрудник",
    updatedAt: serverTimestamp(),
    updatedBy: staffUid,
    updatedByName: "Сотрудник"
  }));
});

test("receipt transaction can update cost and append an immutable movement", async () => {
  const db = staffDb();
  await assertSucceeds(runTransaction(db, async (transaction) => {
    transaction.update(doc(db, "products", "DM30_BLUE"), {
      stock: 7,
      avgCost: 1100,
      lastCost: 1233,
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
    transaction.set(doc(db, "stockMovements", "receipt-1"), movement({
      type: "receipt",
      qtyDelta: 3,
      after: 7,
      unitCost: 1233,
      totalCost: 3699,
      reason: "Поставка"
    }));
  }));
});

test("sale and cancellation paths remain allowed for the authenticated employee", async () => {
  const db = staffDb();
  const orderRef = doc(db, "orders", "order-1");

  await assertSucceeds(runTransaction(db, async (transaction) => {
    transaction.update(doc(db, "products", "DM30_BLUE"), {
      stock: 3,
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
    transaction.set(doc(db, "stockMovements", "sale-1"), movement({
      type: "sale",
      qtyDelta: -1,
      after: 3,
      totalCost: 1000,
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
      createdByEmail: staffEmail,
      createdByName: "Сотрудник"
    });
  }));

  await assertSucceeds(runTransaction(db, async (transaction) => {
    transaction.update(doc(db, "products", "DM30_BLUE"), {
      stock: 4,
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
    transaction.set(doc(db, "stockMovements", "return-1"), movement({
      type: "sale_return",
      qtyDelta: 1,
      before: 3,
      after: 4,
      totalCost: 1000,
      orderId: "order-1",
      reason: "Отмена продажи"
    }));
    transaction.update(orderRef, {
      status: "cancelled",
      cancelledAt: serverTimestamp(),
      cancelledBy: staffUid,
      cancelledByEmail: staffEmail,
      cancelledByName: "Сотрудник"
    });
  }));
});

test("catalogue identity and forged audit identity cannot be changed", async () => {
  const ref = doc(staffDb(), "products", "DM30_BLUE");
  await assertFails(updateDoc(ref, {
    modelId: "HOLI",
    updatedAt: serverTimestamp(),
    updatedBy: staffUid,
    updatedByName: "Сотрудник"
  }));
  await assertFails(updateDoc(ref, {
    stock: 5,
    updatedAt: serverTimestamp(),
    updatedBy: "another-user",
    updatedByName: "Другой"
  }));
});

test("movement journal rejects writes that do not match the resulting product stock", async () => {
  await assertFails(setDoc(doc(staffDb(), "stockMovements", "fake-movement"), movement()));
});

test("movement journal is immutable and unrelated collections stay closed", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "stockMovements", "existing"), {
      ...movement({ createdAt: new Date("2026-01-01T00:00:00Z") })
    });
  });
  await assertFails(updateDoc(doc(staffDb(), "stockMovements", "existing"), { reason: "Переписано" }));
  await assertFails(setDoc(doc(staffDb(), "private", "secret"), { exposed: true }));
});
