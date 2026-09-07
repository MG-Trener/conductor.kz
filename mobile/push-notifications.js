import { getApps } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { deleteDoc, doc, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const DEVICE_ID_KEY = "conductor.pushDeviceId";
const DEVICE_UID_KEY = "conductor.pushDeviceUid";

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
    token,
    platform: "android",
    updatedAt: serverTimestamp()
  });
  try {
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
    localStorage.setItem(DEVICE_UID_KEY, user.uid);
  } catch {}
}

async function removeSavedDeviceToken(uid) {
  if (!window.CONDUCTOR_FIRESTORE || !uid) return;
  let deviceId = "";
  let savedUid = "";
  try {
    deviceId = localStorage.getItem(DEVICE_ID_KEY) || "";
    savedUid = localStorage.getItem(DEVICE_UID_KEY) || "";
  } catch {}
  if (!deviceId || savedUid !== uid) return;

  try {
    await deleteDoc(doc(window.CONDUCTOR_FIRESTORE, "pushDevices", deviceId));
  } catch (error) {
    console.warn("Push token cleanup failed", error);
    return;
  }

  try {
    localStorage.removeItem(DEVICE_ID_KEY);
    localStorage.removeItem(DEVICE_UID_KEY);
  } catch {}
}

async function installListeners(plugin) {
  if (listenersInstalled) return;
  listenersInstalled = true;

  await plugin.addListener("registration", ({ value }) => {
    saveDeviceToken(value).catch((error) => console.error("Push token save failed", error));
  });
  await plugin.addListener("registrationError", (error) => {
    registrationStartedForUid = "";
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
      registrationStartedForUid = "";
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
    const previousUid = activeUser?.uid || "";
    activeUser = user;
    if (!user) {
      registrationStartedForUid = "";
      if (previousUid) removeSavedDeviceToken(previousUid);
      return;
    }
    registerForPush(user);
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && activeUser && !registrationStartedForUid) {
      registerForPush(activeUser);
    }
  });
}

bootPushNotifications().catch((error) => console.error("Push boot failed", error));
