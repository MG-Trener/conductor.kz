import { collection, doc, getDoc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

const originalAddEventListener = document.addEventListener;
let capturedSaleSubmit = null;
let resolveCapturedSaleSubmit;
const capturedSaleSubmitPromise = new Promise((resolve) => { resolveCapturedSaleSubmit = resolve; });
let listenerPatchActive = true;
let bypassEnhancedSubmit = false;

const DM60G_PRICE_FIX_KEY = "conductor.catalog.dm60g-3500.v1014";
const DM60G_PRICE_FIX_CUTOFF = Date.parse("2026-09-07T06:00:00Z");
const STAFF_NAMES = new Map([
  ["mihagavr@gmail.com", "Михаил"],
  ["a.kalashin@gmail.com", "Алексей"]
]);

function isCapture(options) {
  return options === true || Boolean(options && typeof options === "object" && options.capture);
}

function looksLikeEnhancedSaleSubmit(type, listener, options) {
  return type === "submit"
    && isCapture(options)
    && typeof listener === "function"
    && String(listener).includes("openSaleConfirmation");
}

document.addEventListener = function patchedAddEventListener(type, listener, options) {
  if (listenerPatchActive && looksLikeEnhancedSaleSubmit(type, listener, options)) {
    capturedSaleSubmit = listener;
    resolveCapturedSaleSubmit?.(listener);
    return;
  }
  return originalAddEventListener.call(this, type, listener, options);
};

function restoreDocumentListener() {
  if (!listenerPatchActive) return;
  listenerPatchActive = false;
  document.addEventListener = originalAddEventListener;
}

function delay(ms, value = null) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

async function waitForDatabase(timeoutMs = 15000) {
  const started = Date.now();
  while (!window.CONDUCTOR_FIRESTORE) {
    if (Date.now() - started >= timeoutMs) return null;
    await delay(40);
  }
  return window.CONDUCTOR_FIRESTORE;
}

function waitForAuthenticatedUser(timeoutMs = 15000) {
  const auth = getAuth();
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = null;
    const finish = (user = null) => {
      if (settled) return;
      settled = true;
      try { unsubscribe?.(); } catch {}
      resolve(user);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      clearTimeout(timer);
      finish(user);
    }, () => {
      clearTimeout(timer);
      finish(null);
    });
  });
}

function employeeNameFromEmail(email = "") {
  return STAFF_NAMES.get(String(email).trim().toLowerCase()) || "Сотрудник";
}

function markDm60gPriceFixDone() {
  try { localStorage.setItem(DM60G_PRICE_FIX_KEY, "1"); } catch {}
}

function isDm60gPriceFixDone() {
  try { return localStorage.getItem(DM60G_PRICE_FIX_KEY) === "1"; } catch { return false; }
}

async function repairDm60gCatalogPrice(db) {
  if (!db || isDm60gPriceFixDone()) return;
  const user = await waitForAuthenticatedUser();
  if (!user) return;
  const catalogRef = doc(db, "catalog", "DM60G");

  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const snap = await getDoc(catalogRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const currentPrice = Number(data.price || 0);
      const updatedAtMs = data.updatedAt?.toMillis?.() ?? 0;

      if (currentPrice !== 3000) {
        markDm60gPriceFixDone();
        return;
      }
      if (updatedAtMs && updatedAtMs > DM60G_PRICE_FIX_CUTOFF) {
        markDm60gPriceFixDone();
        return;
      }

      await setDoc(catalogRef, {
        modelId: "DM60G",
        name: String(data.name || "Гендерный дым DM60G").slice(0, 120),
        price: 3500,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        updatedByName: employeeNameFromEmail(user.email || "")
      });

      await delay(250);
      const verified = await getDoc(catalogRef);
      if (verified.exists() && Number(verified.data().price || 0) === 3500) {
        markDm60gPriceFixDone();
        return;
      }
    }
    console.error("DM60G price repair did not persist after verification attempts");
  } catch (error) {
    console.error("DM60G price repair failed", error);
  }
}

function waitForProductsSnapshot(db, timeoutMs = 5000) {
  if (!db) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let unsubscribe = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      try { unsubscribe?.(); } catch {}
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    unsubscribe = onSnapshot(collection(db, "products"), () => {
      clearTimeout(timer);
      setTimeout(finish, 80);
    }, () => {
      clearTimeout(timer);
      finish();
    });
  });
}

function syncSaleInputsBeforeSubmit(form = document.getElementById("sale-form")) {
  form?.querySelectorAll("[data-qty]").forEach((input) => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function hasVisibleSelectedQuantity(form) {
  return [...(form?.querySelectorAll("[data-qty]") || [])]
    .some((input) => Math.trunc(Number(input.value) || 0) > 0);
}

function isFalseZeroQuantityError() {
  return document.getElementById("sale-error")?.textContent?.includes("Укажите количество хотя бы одного товара");
}

function submitWithCoreHandler(form, submitter) {
  const errorNode = document.getElementById("sale-error");
  if (errorNode) errorNode.textContent = "";
  bypassEnhancedSubmit = true;
  try {
    if (typeof form.requestSubmit === "function") {
      if (submitter && submitter.form === form) form.requestSubmit(submitter);
      else form.requestSubmit();
    } else {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
  } finally {
    bypassEnhancedSubmit = false;
  }
}

function resilientSaleSubmit(event) {
  if (event.target?.id !== "sale-form" || bypassEnhancedSubmit) return;
  const form = event.target;
  syncSaleInputsBeforeSubmit(form);

  if (!capturedSaleSubmit) return;
  capturedSaleSubmit.call(document, event);

  if (hasVisibleSelectedQuantity(form) && isFalseZeroQuantityError()) {
    submitWithCoreHandler(form, event.submitter || null);
  }
}

(async function repairCatalogPriceOnStartup() {
  const db = await waitForDatabase();
  await repairDm60gCatalogPrice(db);
})();

(async function loadWarehouseEnhancementsSafely() {
  try {
    await import("./warehouse-enhancements-legacy.js?v=4");
    const listener = capturedSaleSubmit || await Promise.race([
      capturedSaleSubmitPromise,
      delay(5000, null)
    ]);

    restoreDocumentListener();
    if (!listener) return;

    const db = await waitForDatabase();
    await waitForProductsSnapshot(db);
    originalAddEventListener.call(document, "submit", resilientSaleSubmit, true);
  } catch (error) {
    console.error("Warehouse enhancements failed to load", error);
  } finally {
    restoreDocumentListener();
  }
})();
