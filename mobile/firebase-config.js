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

  const inventoryState = document.createElement("script");
  inventoryState.type = "module";
  inventoryState.src = "./inventory-state.js?v=16";
  document.head.append(inventoryState);
} else {
  window.CONDUCTOR_FIREBASE_CONFIG = null;
  try { localStorage.removeItem("conductor.firebaseConfig"); } catch {}
}
