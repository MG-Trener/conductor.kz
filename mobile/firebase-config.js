// Firebase Web App configuration for the internal CONDUCTOR warehouse app.
// The public website does not use Firebase for customer data collection.

if (location.pathname.startsWith("/mobile/")) {
  window.CONDUCTOR_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDnH_Lp6JudyHw4bPbPptwnhRe6On23jCA",
    authDomain: "conductor-requests.firebaseapp.com",
    projectId: "conductor-requests",
    storageBucket: "conductor-requests.firebasestorage.app",
    messagingSenderId: "249591037242",
    appId: "1:249591037242:web:e534b60202dca9245ee403"
  };

  // UI modules are loaded directly so they do not depend on another module's
  // import chain. This makes the Settings history button and stock UI fixes
  // available even if another optional module fails during startup.
  const loadUiModule = (selector, src, markerAttribute) => {
    if (document.querySelector(selector)) return;
    const script = document.createElement("script");
    script.type = "module";
    script.src = src;
    script.setAttribute(markerAttribute, "1");
    document.head.append(script);
  };

  loadUiModule(
    'script[data-conductor-version-history]',
    "./version-history.js?v=3",
    "data-conductor-version-history"
  );
  loadUiModule(
    'script[data-conductor-ui-fixes]',
    "./ui-fixes-070.js?v=2",
    "data-conductor-ui-fixes"
  );

  // app.js initializes Firestore with the application's cache settings.
  // The inventory helper and native push registration must start later,
  // otherwise they can race the main Firebase initialization.
  window.addEventListener("load", () => {
    window.setTimeout(() => {
      if (!document.querySelector('script[data-conductor-inventory-state]')) {
        const inventoryState = document.createElement("script");
        inventoryState.type = "module";
        inventoryState.src = "./inventory-state.js?v=24";
        inventoryState.dataset.conductorInventoryState = "1";
        document.head.append(inventoryState);
      }

    }, 1000);
  }, { once: true });
} else {
  window.CONDUCTOR_FIREBASE_CONFIG = null;
  try { localStorage.removeItem("conductor.firebaseConfig"); } catch {}
}
