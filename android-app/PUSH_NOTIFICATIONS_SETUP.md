# Android Push notifications for warehouse sales

The repository code for sale notifications is prepared, but Firebase Cloud Messaging must know the native Android application before an APK can receive a device token.

## Firebase Android app

Use the existing Firebase project `conductor-requests` and register an Android application with the exact package name:

`kz.conductor.warehouse`

Download the generated `google-services.json`. Do not commit that file to the public repository.

Encode the complete file as Base64 and save it in GitHub Actions as this repository secret:

`FIREBASE_ANDROID_GOOGLE_SERVICES_JSON_BASE64`

The Android build workflow validates that the supplied file actually contains `kz.conductor.warehouse` before it builds the APK.

## Backend deployment

From an authenticated Firebase CLI environment for project `conductor-requests`, deploy both the updated rules and the Cloud Function:

```bash
firebase use conductor-requests
firebase deploy --only firestore:rules,functions
```

The function `notifySaleCreated` listens for new `/orders/{orderId}` documents. For a completed `stock-app` sale it sends an FCM notification to registered Android devices belonging to a different user than the employee who created the sale.

Notification text:

- Title: `Новая продажа`
- Body: `Сумма продажи: … ₸ · Баланс кассы: … ₸`

## First run on each phone

Install the new APK and sign in with the normal warehouse account. Android will request notification permission where required. Grant it once. The app then registers its FCM token in `/pushDevices` under the signed-in Firebase user.

Both users must open the new version and sign in at least once before the first cross-user push can be delivered.
