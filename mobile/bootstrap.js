import "./app-update.js?v=1";
import "./analytics.js?v=1";
import "./sales-history.js?v=1";
import "./warehouse-ui.js?v=1";
import "./push-notifications.js?v=1";
import "./firestore-error-help.js?v=1";
import "./ui-sounds.js?v=1";

function isNativeApp() {
  try {
    return window.Capacitor?.getPlatform?.() === "android" || window.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

if (!isNativeApp() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js?v=1").catch((error) => console.warn("Service Worker registration failed", error));
  }, { once: true });
}
