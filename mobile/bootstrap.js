import "./app-update.js";
import "./analytics.js";
import "./sales-history.js";
import "./warehouse-enhancements.js";
import "./version-history.js";
import "./ui-fixes-070.js";
import "./inventory-state.js";
import "./push-notifications.js";
import "./firestore-error-help.js";
import "./release-20260906.js";

function isNativeApp() {
  try {
    return window.Capacitor?.getPlatform?.() === "android"
      || window.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

function registerPwaWorker() {
  if (isNativeApp() || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((error) => {
      console.warn("Service Worker registration failed", error);
    });
  }, { once: true });
}

registerPwaWorker();
