# Android push notifications without Firebase Blaze

Firebase Authentication, Firestore and Firebase Cloud Messaging stay on the Spark plan. A small Cloudflare Worker sends FCM messages instead of a billable Firebase Cloud Function.

## Firebase Android application

The Android application must be registered in Firebase project `conductor-requests` with the exact package name `kz.conductor.warehouse`.

Encode its complete `google-services.json` as Base64 and save it in the GitHub Actions repository secret:

`FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64`

Do not commit `google-services.json` or its Base64 value to the public repository.

## Firebase service account

In Firebase Console open **Project settings → Service accounts → Firebase Admin SDK** and generate a new private key. The downloaded JSON is a server credential and must never be committed or sent to the browser/mobile application.

The Cloudflare Worker stores the complete JSON as its encrypted secret:

`FIREBASE_SERVICE_ACCOUNT_JSON`

## Cloudflare Worker

The worker source is in `push-worker/`. Deploy it on the Workers Free plan:

```bash
cd push-worker
npm install
npx wrangler login
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
npx wrangler deploy
```

Put the resulting `https://...workers.dev/notify-sale` URL into `mobile/push-config.js`, then publish the site and Android APK.

The endpoint accepts only a current Firebase ID token belonging to one of the two approved staff accounts. It verifies that the caller created the sale, reads the cash balance and registered devices with the service account, and sends FCM only to the other employee's Android devices. A Firestore dispatch marker prevents duplicate notifications.

## First run on each phone

Install the new APK and sign in with the normal warehouse account. Grant Android notification permission. The app stores the device's FCM token in `/pushDevices` under the signed-in Firebase user.

Both users must open the new version and sign in at least once before the first cross-user notification can be delivered.
