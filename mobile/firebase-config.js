// Firebase Web App configuration for the internal CONDUCTOR mobile workspace.
// Firebase Web Config is not a server secret, but the public website no longer
// uses Firebase for customer lead collection.

const isMobileWorkspace = location.pathname.startsWith("/mobile/");

if (isMobileWorkspace) {
  window.CONDUCTOR_FIREBASE_CONFIG = {
    apiKey: "AIzaSyDnH_Lp6JudyHw4bPbPptwnhRe6On23jCA",
    authDomain: "conductor-requests.firebaseapp.com",
    projectId: "conductor-requests",
    storageBucket: "conductor-requests.firebasestorage.app",
    messagingSenderId: "249591037242",
    appId: "1:249591037242:web:e534b60202dca9245ee403"
  };

  for (const src of ["./leads.js", "./lead-to-sale.js", "./customers.js", "./inventory.js", "./order-inventory.js"]) {
    const script = document.createElement("script");
    script.type = "module";
    script.src = src;
    document.head.append(script);
  }
} else {
  // Safety fallback for visitors who may still have an old cached order-form script.
  window.CONDUCTOR_FIREBASE_CONFIG = null;
  try { localStorage.removeItem("conductor.firebaseConfig"); } catch {}
}
