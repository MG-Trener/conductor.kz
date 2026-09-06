import "./app-update.js?v=103";
import "./analytics.js?v=103";
import "./sales-history.js?v=103";
import "./warehouse-enhancements.js?v=103";
import "./inventory-state.js?v=103";
import "./push-notifications.js?v=103";
import "./firestore-error-help.js?v=103";

function isNativeApp() {
  try {
    return window.Capacitor?.getPlatform?.() === "android"
      || window.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

if (!isNativeApp() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js?v=103").catch((error) => {
      console.warn("Service Worker registration failed", error);
    });
  }, { once: true });
}
