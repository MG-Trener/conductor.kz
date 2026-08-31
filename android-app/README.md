# CONDUCTOR Склад — Android

Внутреннее Android-приложение для двух авторизованных сотрудников CONDUCTOR.KZ.

## Как работает

Приложение использует Capacitor 8 как нативный Android-контейнер и открывает рабочее PWA склада:

`https://conductor.kz/mobile/`

Поэтому приложение использует тот же Firebase Authentication и тот же Firestore, что и браузерная версия. Отдельную базу данных создавать не нужно.

## Идентификатор

- Application ID: `kz.conductor.warehouse`
- Название: `CONDUCTOR Склад`

## Сборка через GitHub Actions

Workflow `.github/workflows/build-android-apk.yml` создаёт Android-проект, собирает debug APK и публикует его как artifact `CONDUCTOR-Warehouse-APK`.

Debug APK подходит для внутренней установки на телефоны без Google Play.

## Локальная сборка

Требуются Node.js 22+, Java 21 и Android SDK.

```sh
cd android-app
npm install
npx cap add android
cd android
./gradlew assembleDebug
```

APK появится в:

`android-app/android/app/build/outputs/apk/debug/app-debug.apk`

Каталог `android/` генерируется Capacitor и не хранится в репозитории.
