// Firebase Web App configuration shared by the internal CONDUCTOR mobile app
// and the public order form. Firebase Web Config is not a server secret.
// Never place service-account JSON, private keys or admin credentials here.
window.CONDUCTOR_FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// Keep website-lead UI isolated to the internal mobile workspace.
if (location.pathname.startsWith("/mobile/")) {
  const script = document.createElement("script");
  script.type = "module";
  script.src = "./leads.js";
  document.head.append(script);
}
