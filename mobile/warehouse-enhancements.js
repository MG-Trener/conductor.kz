import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const originalAddEventListener = document.addEventListener;
let capturedSaleSubmit = null;
let resolveCapturedSaleSubmit;
const capturedSaleSubmitPromise = new Promise((resolve) => { resolveCapturedSaleSubmit = resolve; });
let listenerPatchActive = true;

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
      // Listener склада из legacy-модуля подписывается раньше. Небольшая
      // задержка гарантирует, что его локальный массив products уже заполнен.
      setTimeout(finish, 60);
    }, () => {
      clearTimeout(timer);
      finish();
    });
  });
}

function syncSaleInputsBeforeSubmit(event) {
  if (event.target?.id !== "sale-form") return;
  document.querySelectorAll("#sale-form [data-qty]").forEach((input) => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

(async function loadWarehouseEnhancementsSafely() {
  try {
    await import("./warehouse-enhancements-legacy.js?v=1");
    const listener = capturedSaleSubmit || await Promise.race([
      capturedSaleSubmitPromise,
      delay(5000, null)
    ]);

    restoreDocumentListener();
    if (!listener) return;

    // Этот обработчик регистрируется раньше подтверждения продажи и перед
    // каждым submit принудительно синхронизирует визуальные количества.
    originalAddEventListener.call(document, "submit", syncSaleInputsBeforeSubmit, true);

    const db = await waitForDatabase();
    await waitForProductsSnapshot(db);

    // Подключаем исходное расширенное подтверждение только после первой
    // загрузки products. Это устраняет гонку, при которой сумма уже видна,
    // а расширенный модуль ещё считает список выбранных товаров пустым.
    originalAddEventListener.call(document, "submit", listener, true);
  } catch (error) {
    console.error("Warehouse enhancements failed to load", error);
  } finally {
    restoreDocumentListener();
  }
})();
