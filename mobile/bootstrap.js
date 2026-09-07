import "./app-update.js";
import "./analytics.js";
import "./sales-history.js";
import "./warehouse-ui.js";
import "./push-notifications.js";
import "./firestore-error-help.js";
import "./ui-sounds.js";

function isNativeApp() {
  try {
    return window.Capacitor?.getPlatform?.() === "android" || window.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

if (!isNativeApp() && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .then((registration) => registration.update())
      .catch((error) => console.warn("Service Worker registration failed", error));
  }, { once: true });
}
