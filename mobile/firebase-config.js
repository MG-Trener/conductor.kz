// Firebase Web App configuration for the internal CONDUCTOR warehouse app.
// The public website does not use Firebase for customer data collection.

function isConductorWarehouseContext() {
  if (location.pathname.startsWith("/mobile/")) return true;
  try {
    return window.Capacitor?.getPlatform?.() === "android"
      || window.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

if (isConductorWarehouseContext()) {
  window.CONDUCTOR_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDnH_Lp6JudyHw4bPbPptwnhRe6On23jCA",
    authDomain: "conductor-requests.firebaseapp.com",
    projectId: "conductor-requests",
    storageBucket: "conductor-requests.firebasestorage.app",
    messagingSenderId: "249591037242",
    appId: "1:249591037242:web:e534b60202dca9245ee403"
  };
} else {
  window.CONDUCTOR_FIREBASE_CONFIG = null;
  try { localStorage.removeItem("conductor.firebaseConfig"); } catch {}
}
