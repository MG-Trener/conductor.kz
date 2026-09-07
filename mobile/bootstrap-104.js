import "./app-update.js?v=104";
import "./analytics.js?v=104";
import "./sales-history.js?v=105";
import "./warehouse-enhancements.js?v=106";
import "./inventory-state.js?v=105";
import "./push-notifications.js?v=104";
import "./firestore-error-help.js?v=104";
import "./ui-sounds.js?v=1";

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
    navigator.serviceWorker.register("./sw.js?v=105").catch((error) => {
      console.warn("Service Worker registration failed", error);
    });
  }, { once: true });
}
