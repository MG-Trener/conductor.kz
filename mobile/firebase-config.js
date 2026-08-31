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

  // app.js initializes Firestore with the application's cache settings.
  // The inventory helper must start later, otherwise it can call getFirestore()
  // first and lock Firestore to default settings. That makes the subsequent
  // initializeFirestore() call in app.js fail and prevents authorization.
  window.addEventListener("load", () => {
    window.setTimeout(() => {
      if (document.querySelector('script[data-conductor-inventory-state]')) return;
      const inventoryState = document.createElement("script");
      inventoryState.type = "module";
      inventoryState.src = "./inventory-state.js?v=18";
      inventoryState.dataset.conductorInventoryState = "1";
      document.head.append(inventoryState);
    }, 1000);
  }, { once: true });
} else {
  window.CONDUCTOR_FIREBASE_CONFIG = null;
  try { localStorage.removeItem("conductor.firebaseConfig"); } catch {}
}
