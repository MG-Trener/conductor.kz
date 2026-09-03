const ALLOWED_EMAILS = new Set([
  "mihagavr@gmail.com",
  "a.kalashin@gmail.com"
]);

const ALLOWED_ORIGINS = new Set([
  "https://conductor.kz",
  "https://www.conductor.kz"
]);

const INVALID_TOKEN_CODES = new Set([
  "UNREGISTERED",
  "INVALID_ARGUMENT"
]);

let cachedAccessToken = null;

function jsonResponse(request, body, status = 200) {
  const origin = request.headers.get("Origin") || "";
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return new Response(JSON.stringify(body), { status, headers });
}

function base64Url(value) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function privateKeyBytes(pem) {
  const body = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/gu, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function serviceAccountToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken?.expiresAt > now + 60) return cachedAccessToken.value;

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
  if (!serviceAccount.client_email || !serviceAccount.private_key) {
    throw new Error("Firebase service account is missing client_email or private_key");
  }

  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: "https://oauth2.googleapis.com/token",
    scope: "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    privateKeyBytes(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const assertion = `${unsigned}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) throw new Error("Could not obtain Google access token");
  cachedAccessToken = {
    value: result.access_token,
    expiresAt: now + Number(result.expires_in || 3600)
  };
  return cachedAccessToken.value;
}

export function decodeFirestoreValue(value = {}) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return Boolean(value.booleanValue);
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeFirestoreValue);
  if ("mapValue" in value) return decodeFirestoreFields(value.mapValue.fields || {});
  return undefined;
}

export function decodeFirestoreFields(fields = {}) {
  return Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeFirestoreValue(value)]));
}

function firestoreBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents`;
}

async function firestoreRequest(env, accessToken, path, options = {}) {
  return fetch(`${firestoreBase(env)}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
}

async function authenticate(request, env) {
  const authorization = request.headers.get("Authorization") || "";
  const idToken = authorization.match(/^Bearer\s+(.+)$/iu)?.[1];
  if (!idToken) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(env.FIREBASE_WEB_API_KEY)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken })
  });
  if (!response.ok) return null;
  const user = (await response.json()).users?.[0];
  const email = String(user?.email || "").toLowerCase();
  if (!user?.localId || !ALLOWED_EMAILS.has(email)) return null;
  return { uid: user.localId, email };
}

async function readDocument(env, accessToken, path) {
  const response = await firestoreRequest(env, accessToken, path);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Firestore read failed (${response.status})`);
  const document = await response.json();
  return { name: document.name, ...decodeFirestoreFields(document.fields) };
}

async function listDevices(env, accessToken) {
  const response = await firestoreRequest(env, accessToken, "/pushDevices?pageSize=100");
  if (!response.ok) throw new Error(`Push device lookup failed (${response.status})`);
  const result = await response.json();
  return (result.documents || []).map((document) => ({
    name: document.name,
    ...decodeFirestoreFields(document.fields)
  }));
}

async function claimDispatch(env, accessToken, orderId) {
  const response = await firestoreRequest(
    env,
    accessToken,
    `/pushDispatches?documentId=${encodeURIComponent(orderId)}`,
    {
      method: "POST",
      body: JSON.stringify({
        fields: {
          orderId: { stringValue: orderId },
          status: { stringValue: "processing" },
          createdAt: { timestampValue: new Date().toISOString() }
        }
      })
    }
  );
  if (response.status === 409) return false;
  if (!response.ok) throw new Error(`Could not claim push dispatch (${response.status})`);
  return true;
}

async function finishDispatch(env, accessToken, orderId, status, successCount, failureCount) {
  const query = new URLSearchParams();
  for (const field of ["status", "successCount", "failureCount", "completedAt"]) query.append("updateMask.fieldPaths", field);
  const response = await firestoreRequest(
    env,
    accessToken,
    `/pushDispatches/${encodeURIComponent(orderId)}?${query}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        fields: {
          status: { stringValue: status },
          successCount: { integerValue: String(successCount) },
          failureCount: { integerValue: String(failureCount) },
          completedAt: { timestampValue: new Date().toISOString() }
        }
      })
    }
  );
  if (!response.ok) console.warn("Could not update push dispatch status", response.status);
}

export function formatKzt(value) {
  return `${Math.trunc(Number(value || 0)).toLocaleString("ru-KZ")} ₸`;
}

async function sendNotification(env, accessToken, token, orderId, total, cashBalance) {
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/messages:send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: {
        token,
        notification: {
          title: "Новая продажа",
          body: `Сумма продажи: ${formatKzt(total)} · Баланс кассы: ${formatKzt(cashBalance)}`
        },
        data: {
          type: "sale",
          orderId,
          total: String(Math.trunc(Number(total || 0))),
          cashBalance: String(Math.trunc(Number(cashBalance || 0)))
        },
        android: {
          priority: "HIGH",
          notification: {
            channel_id: "sales",
            sound: "default",
            tag: `sale-${orderId}`
          }
        }
      }
    })
  });
  if (response.ok) return { ok: true };
  let code = "";
  try { code = (await response.json()).error?.details?.[0]?.errorCode || ""; } catch {}
  return { ok: false, code, status: response.status };
}

async function removeInvalidDevice(env, accessToken, documentName) {
  const marker = "/documents/";
  const index = documentName.indexOf(marker);
  if (index < 0) return;
  const path = documentName.slice(index + marker.length);
  await firestoreRequest(env, accessToken, `/${path}`, { method: "DELETE" });
}

async function notifySale(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (origin && !ALLOWED_ORIGINS.has(origin)) return jsonResponse(request, { error: "origin_not_allowed" }, 403);

  const user = await authenticate(request, env);
  if (!user) return jsonResponse(request, { error: "unauthorized" }, 401);

  let input;
  try { input = await request.json(); } catch { return jsonResponse(request, { error: "invalid_json" }, 400); }
  const orderId = String(input?.orderId || "");
  if (!/^[A-Za-z0-9_-]{1,128}$/u.test(orderId)) return jsonResponse(request, { error: "invalid_order_id" }, 400);

  const accessToken = await serviceAccountToken(env);
  const order = await readDocument(env, accessToken, `/orders/${encodeURIComponent(orderId)}`);
  if (!order) return jsonResponse(request, { error: "order_not_found" }, 404);
  if (order.source !== "stock-app" || order.status !== "done" || order.createdBy !== user.uid) {
    return jsonResponse(request, { error: "order_not_owned" }, 403);
  }

  if (!await claimDispatch(env, accessToken, orderId)) {
    return jsonResponse(request, { ok: true, status: "already_dispatched" });
  }

  const [cash, devices] = await Promise.all([
    readDocument(env, accessToken, "/finance/cash"),
    listDevices(env, accessToken)
  ]);
  const targets = devices
    .filter((device) => device.platform === "android"
      && typeof device.token === "string"
      && device.token.length >= 20
      && device.uid !== user.uid)
    .slice(0, 20);

  if (!targets.length) {
    await finishDispatch(env, accessToken, orderId, "no_targets", 0, 0);
    return jsonResponse(request, { ok: true, status: "no_targets" });
  }

  const results = await Promise.all(targets.map((device) => sendNotification(
    env,
    accessToken,
    device.token,
    orderId,
    order.total,
    cash?.balance || 0
  )));
  const successCount = results.filter((result) => result.ok).length;
  const failureCount = results.length - successCount;

  await Promise.all(results.map((result, index) => {
    if (result.ok || !INVALID_TOKEN_CODES.has(result.code)) return Promise.resolve();
    return removeInvalidDevice(env, accessToken, targets[index].name);
  }));
  await finishDispatch(env, accessToken, orderId, failureCount ? "partial" : "sent", successCount, failureCount);
  return jsonResponse(request, { ok: true, status: failureCount ? "partial" : "sent", successCount, failureCount });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return jsonResponse(request, { ok: true });
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse(request, {
        ok: true,
        serviceAccountConfigured: Boolean(env.FIREBASE_SERVICE_ACCOUNT_JSON)
      });
    }
    if (request.method !== "POST" || url.pathname !== "/notify-sale") {
      return jsonResponse(request, { error: "not_found" }, 404);
    }
    try {
      return await notifySale(request, env);
    } catch (error) {
      console.error("Sale push failed", error instanceof Error ? error.message : String(error));
      return jsonResponse(request, { error: "push_failed" }, 502);
    }
  }
};
