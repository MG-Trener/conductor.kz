import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const originalAddEventListener = document.addEventListener;
let capturedSaleSubmit = null;
let resolveCapturedSaleSubmit;
const capturedSaleSubmitPromise = new Promise((resolve) => { resolveCapturedSaleSubmit = resolve; });
let listenerPatchActive = true;
let bypassEnhancedSubmit = false;

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

async function waitForDatabase(timeoutMs = 5000) {
  const started = Date.now();
  while (!window.CONDUCTOR_FIRESTORE) {
    if (Date.now() - started >= timeoutMs) return null;
    await delay(40);
  }
  return window.CONDUCTOR_FIRESTORE;
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

(async function loadWarehouseEnhancementsSafely() {
  try {
    await import("./warehouse-enhancements-legacy.js?v=3");
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
