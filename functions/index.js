import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { onDocumentCreated } from "firebase-functions/firestore";
import { logger } from "firebase-functions";

initializeApp();

const KZT = new Intl.NumberFormat("ru-KZ", {
  style: "currency",
  currency: "KZT",
  maximumFractionDigits: 0
});

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered"
]);

export const notifySaleCreated = onDocumentCreated({
  document: "orders/{orderId}",
  region: "europe-west1"
}, async (event) => {
  const sale = event.data?.data();
  if (!sale || sale.status !== "done" || sale.source !== "stock-app") return;

  const db = getFirestore();
  const [cashSnap, devicesSnap] = await Promise.all([
    db.doc("finance/cash").get(),
    db.collection("pushDevices").get()
  ]);

  const total = Math.trunc(Number(sale.total || 0));
  const cashBalance = cashSnap.exists ? Math.trunc(Number(cashSnap.data()?.balance || 0)) : 0;
  const sellerUid = String(sale.createdBy || "");

  const targets = devicesSnap.docs
    .map((device) => ({ ref: device.ref, ...device.data() }))
    .filter((device) => device.platform === "android"
      && typeof device.token === "string"
      && device.token.length > 20
      && device.uid !== sellerUid);

  if (!targets.length) {
    logger.info("Sale push skipped: no other registered Android devices", {
      orderId: event.params.orderId,
      sellerUid
    });
    return;
  }

  const body = `Сумма продажи: ${KZT.format(total)} · Баланс кассы: ${KZT.format(cashBalance)}`;
  const response = await getMessaging().sendEachForMulticast({
    tokens: targets.map((target) => target.token),
    notification: {
      title: "Новая продажа",
      body
    },
    data: {
      type: "sale",
      orderId: String(event.params.orderId),
      total: String(total),
      cashBalance: String(cashBalance)
    },
    android: {
      priority: "high",
      notification: {
        channelId: "sales",
        sound: "default",
        tag: `sale-${event.params.orderId}`
      }
    }
  });

  const staleDeletes = [];
  response.responses.forEach((item, index) => {
    if (item.success) return;
    const code = item.error?.code || "";
    logger.warn("Sale push delivery failed", {
      orderId: event.params.orderId,
      code,
      uid: targets[index]?.uid || ""
    });
    if (INVALID_TOKEN_CODES.has(code) && targets[index]?.ref) staleDeletes.push(targets[index].ref.delete());
  });
  await Promise.all(staleDeletes);

  logger.info("Sale push processed", {
    orderId: event.params.orderId,
    successCount: response.successCount,
    failureCount: response.failureCount
  });
});
