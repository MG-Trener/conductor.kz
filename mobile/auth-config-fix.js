(() => {
  const config = window.CONDUCTOR_FIREBASE_CONFIG;
  const valid = Boolean(config?.apiKey && config?.authDomain && config?.projectId && config?.appId);
  if (!valid) return;

  // The repository configuration is now canonical. Remove any older config
  // saved during the initial setup flow so app.js cannot connect to a stale
  // Firebase project by preferring localStorage.
  try {
    localStorage.removeItem("conductor.firebaseConfig");
  } catch {}
})();
