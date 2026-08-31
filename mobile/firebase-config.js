// Firebase Web App configuration shared by the internal CONDUCTOR mobile app
// and the public order form. Firebase Web Config is not a server secret.
// Never place service-account JSON, private keys or admin credentials here.
window.CONDUCTOR_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDnH_Lp6JudyHw4bPbPptwnhRe6On23jCA",
  authDomain: "conductor-requests.firebaseapp.com",
  projectId: "conductor-requests",
  storageBucket: "conductor-requests.firebasestorage.app",
  messagingSenderId: "249591037242",
  appId: "1:249591037242:web:e534b60202dca9245ee403"
};

// Keep internal modules isolated to the mobile workspace.
if (location.pathname.startsWith("/mobile/")) {
  for (const src of ["./leads.js", "./lead-to-sale.js", "./customers.js"]) {
    const script = document.createElement("script");
    script.type = "module";
    script.src = src;
    document.head.append(script);
  }
}
