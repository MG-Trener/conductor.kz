import assert from "node:assert/strict";
import test from "node:test";
import worker, { decodeFirestoreFields, decodeFirestoreValue, formatKzt } from "../src/index.js";

test("Firestore REST values are converted to normal JavaScript data", () => {
  assert.deepEqual(decodeFirestoreFields({
    uid: { stringValue: "employee-1" },
    balance: { integerValue: "12500" },
    active: { booleanValue: true },
    items: { arrayValue: { values: [{ stringValue: "DM30" }, { integerValue: "2" }] } }
  }), {
    uid: "employee-1",
    balance: 12500,
    active: true,
    items: ["DM30", 2]
  });
  assert.deepEqual(decodeFirestoreValue({ mapValue: { fields: { status: { stringValue: "done" } } } }), { status: "done" });
});

test("notification amounts use whole tenge", () => {
  assert.equal(formatKzt(12345.9).replaceAll(/\s/gu, " "), "12 345 ₸");
});

test("health endpoint reports whether the encrypted service account is configured", async () => {
  const response = await worker.fetch(new Request("https://worker.example/health"), {});
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, serviceAccountConfigured: false });
});
