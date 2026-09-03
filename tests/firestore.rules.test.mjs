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
const staffEmail = "mihagavr@gmail.com";
const secondStaffEmail = "a.kalashin@gmail.com";
let testEnv;

const product = {
  id: "DM30_BLUE",
  modelId: "DM30",
  colorId: "blue",
  colorName: "Синий",
  colorHex: "#258cff",
  name: "DM30 · Синий",
  stock: 4,
  lowStock: 2,
  sort: 11,
  active: true,
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

function secondStaffDb() {
  return testEnv.authenticatedContext("employee-2", { email: secondStaffEmail }).firestore();
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

function publicRequest(overrides = {}) {
  return {
    customerName: "Иван",
    phone: "+7 700 123 45 67",
    productId: "DM30",
    productName: "Цветной дым DM30",
    productPrice: "2 700 ₸",
    status: "new",
    managerComment: "",
    source: "conductor.kz",
    sourcePage: "/cvetnoy-dym/",
    consent: true,
    formVersion: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: null,
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

test("only the two approved email accounts can read warehouse products", async () => {
  const snapshot = await assertSucceeds(getDoc(doc(staffDb(), "products", "DM30_BLUE")));
  assert.equal(snapshot.data().stock, 4);
  await assertSucceeds(getDoc(doc(secondStaffDb(), "products", "DM30_BLUE")));
  await assertFails(getDoc(doc(testEnv.authenticatedContext("outsider", { email: "other@example.com" }).firestore(), "products", "DM30_BLUE")));
});

test("unauthenticated and non-email identities cannot access warehouse data", async () => {
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "products", "DM30_BLUE")));
  await assertFails(getDoc(doc(testEnv.authenticatedContext("anonymous-user").firestore(), "products", "DM30_BLUE")));
});

test("public visitors can read the single catalog price but only approved staff can publish it", async () => {
  const publicRef = doc(staffDb(), "catalog", "DM30");
  await assertSucceeds(setDoc(publicRef, {
    modelId: "DM30",
    name: "Цветной дым DM30",
    price: 2700,
    updatedAt: serverTimestamp(),
    updatedBy: staffUid,
    updatedByName: "Сотрудник"
  }));

  const publicDb = testEnv.unauthenticatedContext().firestore();
  const snapshot = await assertSucceeds(getDoc(doc(publicDb, "catalog", "DM30")));
  assert.equal(snapshot.data().price, 2700);
  await assertFails(getDoc(doc(publicDb, "publicProducts", "DM30")));
  await assertFails(setDoc(doc(publicDb, "catalog", "DM60"), {
    modelId: "DM60",
    name: "Цветной дым DM60",
    price: 3100
  }));
  await assertFails(setDoc(doc(staffDb(), "catalog", "DM90"), {
    modelId: "DM90",
    name: "Цветной дым DM90",
    price: 3600,
    stock: 99,
    updatedAt: serverTimestamp(),
    updatedBy: staffUid,
    updatedByName: "Сотрудник"
  }));
});

test("historical requests are read-only for staff and closed to public visitors", async () => {
  const publicDb = testEnv.unauthenticatedContext().firestore();
  const requestRef = doc(publicDb, "requests", "request-1");
  await assertFails(setDoc(requestRef, publicRequest()));

  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "requests", "request-1"), {
      ...publicRequest(),
      createdAt: new Date("2026-09-01T09:00:00Z"),
      updatedAt: new Date("2026-09-01T09:00:00Z")
    });
  });

  const snapshot = await assertSucceeds(getDoc(doc(staffDb(), "requests", "request-1")));
  assert.equal(snapshot.data().status, "new");
  assert.equal(snapshot.data().customerName, "Иван");
  await assertFails(getDoc(requestRef));
});

test("staff cannot edit or create obsolete requests", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "requests", "request-2"), {
      ...publicRequest(),
      createdAt: new Date("2026-09-01T09:00:00Z"),
      updatedAt: new Date("2026-09-01T09:00:00Z")
    });
  });

  const requestRef = doc(staffDb(), "requests", "request-2");
  await assertFails(updateDoc(requestRef, {
    status: "processed",
    managerComment: "Клиенту позвонили",
    updatedAt: serverTimestamp(),
    updatedBy: staffUid
  }));
  await assertFails(updateDoc(requestRef, {
    phone: "+7 777 000 00 00",
    updatedAt: serverTimestamp(),
    updatedBy: staffUid
  }));
  await assertFails(updateDoc(requestRef, {
    status: "deleted",
    updatedAt: serverTimestamp(),
    updatedBy: staffUid
  }));
  await assertFails(setDoc(doc(staffDb(), "requests", "request-3"), publicRequest()));
});

test("staff can register only its own Android push token and cannot read token documents", async () => {
  const db = staffDb();
  const tokenRef = doc(db, "pushDevices", "device-1");
  await assertSucceeds(setDoc(tokenRef, {
    uid: staffUid,
    email: staffEmail,
    token: "a-valid-firebase-device-token",
    platform: "android",
    updatedAt: serverTimestamp()
  }));
  await assertFails(getDoc(tokenRef));
  await assertFails(setDoc(doc(db, "pushDevices", "forged-device"), {
    uid: "employee-2",
    email: secondStaffEmail,
    token: "another-valid-firebase-device-token",
    platform: "android",
    updatedAt: serverTimestamp()
  }));
  await assertFails(setDoc(doc(db, "pushDevices", "web-device"), {
    uid: staffUid,
    email: staffEmail,
    token: "a-valid-firebase-device-token",
    platform: "web",
    updatedAt: serverTimestamp()
  }));
});

test("staff can atomically save the catalog price, actual stock and its movement", async () => {
  const db = staffDb();
  await assertSucceeds(runTransaction(db, async (transaction) => {
    const productRef = doc(db, "products", "DM30_BLUE");
    const movementRef = doc(db, "stockMovements", "movement-1");
    transaction.update(productRef, {
      stock: 6,
      stockInitialized: true,
      inventoryInitialized: true,
      lastInventoryAt: serverTimestamp(),
      lastInventoryBy: staffUid,
      lastInventoryByName: "Сотрудник",
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
    transaction.set(movementRef, movement());
    transaction.set(doc(db, "catalog", "DM30"), {
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
    stock: 0,
    lowStock: 10,
    sort: 41,
    active: true,
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

test("receipt transaction updates stock without tracking purchase cost", async () => {
  const db = staffDb();
  await assertSucceeds(runTransaction(db, async (transaction) => {
    transaction.update(doc(db, "products", "DM30_BLUE"), {
      stock: 7,
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByName: "Сотрудник"
    });
    transaction.set(doc(db, "stockMovements", "receipt-1"), movement({
      type: "receipt",
      qtyDelta: 3,
      after: 7,
      unitCost: 0,
      totalCost: 0,
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
  await assertFails(updateDoc(ref, {
    price: 9999,
    updatedAt: serverTimestamp(),
    updatedBy: staffUid,
    updatedByName: "Сотрудник"
  }));
});

test("movement journal rejects writes that do not match the resulting product stock", async () => {
  await assertFails(setDoc(doc(staffDb(), "stockMovements", "fake-movement"), movement()));
});

test("staff can create the cash balance and atomically record a valid withdrawal", async () => {
  const db = staffDb();
  const cashRef = doc(db, "finance", "cash");
  await assertSucceeds(setDoc(cashRef, {
    balance: 5000,
    initializedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: staffUid,
    updatedByEmail: staffEmail,
    updatedByName: "Сотрудник"
  }));

  await assertSucceeds(runTransaction(db, async (transaction) => {
    await transaction.get(cashRef);
    transaction.update(cashRef, {
      balance: 3000,
      updatedAt: serverTimestamp(),
      updatedBy: staffUid,
      updatedByEmail: staffEmail,
      updatedByName: "Сотрудник"
    });
    transaction.set(doc(db, "cashWithdrawals", "withdrawal-1"), {
      amount: 2000,
      before: 5000,
      after: 3000,
      comment: "Передано в кассу офиса",
      createdAt: serverTimestamp(),
      createdAtClient: "2026-09-01T10:00:00.000Z",
      createdBy: staffUid,
      createdByEmail: staffEmail,
      createdByName: "Сотрудник"
    });
  }));
  assert.equal((await getDoc(cashRef)).data().balance, 3000);
});

test("cash withdrawals cannot exceed or diverge from the resulting cash balance", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "finance", "cash"), {
      balance: 1000,
      initializedAt: new Date("2026-09-01T00:00:00Z"),
      updatedAt: new Date("2026-09-01T00:00:00Z"),
      updatedBy: staffUid,
      updatedByEmail: staffEmail,
      updatedByName: "Сотрудник"
    });
  });
  const db = staffDb();
  await assertFails(setDoc(doc(db, "cashWithdrawals", "invalid-withdrawal"), {
    amount: 1200,
    before: 1000,
    after: -200,
    comment: "Слишком большая сумма",
    createdAt: serverTimestamp(),
    createdAtClient: "2026-09-01T10:00:00.000Z",
    createdBy: staffUid,
    createdByEmail: staffEmail,
    createdByName: "Сотрудник"
  }));
  await assertFails(getDoc(doc(testEnv.unauthenticatedContext().firestore(), "finance", "cash")));
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
