import { getApps } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

let activeUser = null;
let listenersInstalled = false;
let registrationStartedForUid = "";
let nativePushPlugin = null;

function pushPlugin() {
  const capacitor = globalThis.Capacitor;
  if (!capacitor || capacitor.getPlatform?.() !== "android") return null;
  if (nativePushPlugin) return nativePushPlugin;
  if (capacitor.Plugins?.PushNotifications) {
    nativePushPlugin = capacitor.Plugins.PushNotifications;
    return nativePushPlugin;
  }
  if (typeof capacitor.registerPlugin === "function") {
    try {
      nativePushPlugin = capacitor.registerPlugin("PushNotifications");
      return nativePushPlugin;
    } catch (error) {
      console.error("PushNotifications plugin registration failed", error);
    }
  }
  return null;
}

async function waitForFirebase() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (getApps().length && window.CONDUCTOR_FIRESTORE) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  return false;
}

async function tokenDocumentId(token) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function saveDeviceToken(token) {
  const user = activeUser;
  if (!user || !window.CONDUCTOR_FIRESTORE || typeof token !== "string" || token.length < 20) return;
  const deviceId = await tokenDocumentId(token);
  await setDoc(doc(window.CONDUCTOR_FIRESTORE, "pushDevices", deviceId), {
    uid: user.uid,
    email: user.email || "",
    token,
    platform: "android",
    updatedAt: serverTimestamp()
  });
}

async function installListeners(plugin) {
  if (listenersInstalled) return;
  listenersInstalled = true;

  await plugin.addListener("registration", ({ value }) => {
    saveDeviceToken(value).catch((error) => console.error("Push token save failed", error));
  });
  await plugin.addListener("registrationError", (error) => {
    console.error("Push registration failed", error);
  });
  await plugin.addListener("pushNotificationActionPerformed", (event) => {
    if (event?.notification?.data?.type === "sale") {
      document.querySelector('[data-nav="sales"]')?.click();
    }
  });
}

async function registerForPush(user) {
  const plugin = pushPlugin();
  if (!plugin || registrationStartedForUid === user.uid) return;
  registrationStartedForUid = user.uid;

  try {
    await installListeners(plugin);
    await plugin.createChannel({
      id: "sales",
      name: "Продажи",
      description: "Новые продажи и текущий баланс кассы",
      importance: 5,
      sound: "default",
      vibration: true
    });

    let permissions = await plugin.checkPermissions();
    if (permissions.receive === "prompt") permissions = await plugin.requestPermissions();
    if (permissions.receive !== "granted") {
      console.warn("Push notifications permission was not granted");
      return;
    }
    await plugin.register();
  } catch (error) {
    registrationStartedForUid = "";
    console.error("Push setup failed", error);
  }
}

async function bootPushNotifications() {
  if (!pushPlugin()) return;
  if (!await waitForFirebase()) {
    console.error("Push setup skipped: Firebase was not initialized in time");
    return;
  }

  const auth = getAuth();
  onAuthStateChanged(auth, (user) => {
    activeUser = user;
    if (!user) {
      registrationStartedForUid = "";
      return;
    }
    registerForPush(user);
  });
}

bootPushNotifications().catch((error) => console.error("Push boot failed", error));
