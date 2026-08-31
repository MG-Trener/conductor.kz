# Постоянная подпись Android APK

Для установки новых APK поверх уже установленного приложения Android требует, чтобы все версии были подписаны одним и тем же ключом.

Workflow `.github/workflows/build-android-apk.yml` поддерживает постоянную release-подпись через GitHub Actions Secrets:

- `WAREHOUSE_KEYSTORE_BASE64` — файл JKS/keystore, закодированный в Base64;
- `WAREHOUSE_KEYSTORE_PASSWORD` — пароль хранилища;
- `WAREHOUSE_KEY_ALIAS` — alias ключа;
- `WAREHOUSE_KEY_PASSWORD` — пароль ключа.

Если секреты не заданы, workflow собирает debug APK для тестирования. Такой APK подходит для ручной установки, но разные debug-сборки GitHub Actions могут иметь разные подписи и не гарантируют обновление поверх предыдущего APK.

После настройки секретов все следующие release APK будут подписываться одним ключом и смогут устанавливаться поверх предыдущей release-версии.

Постоянный APK публикуется в GitHub Release с тегом `warehouse-latest` и именем `CONDUCTOR-Sklad.apk`. PWA проверяет `mobile/app-version.json` и показывает пользователю новую версию внутри Android-приложения.
