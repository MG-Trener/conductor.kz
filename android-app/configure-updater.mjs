import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(here, "package.json"), "utf8"));
const capacitorConfig = JSON.parse(fs.readFileSync(path.join(here, "capacitor.config.json"), "utf8"));
const androidDir = path.join(here, "android");
const packageName = capacitorConfig.appId;

if (!fs.existsSync(androidDir)) throw new Error("Android project has not been generated yet");

const manifestPath = path.join(androidDir, "app", "src", "main", "AndroidManifest.xml");
let manifest = fs.readFileSync(manifestPath, "utf8");
if (!manifest.includes("android.permission.REQUEST_INSTALL_PACKAGES")) {
  manifest = manifest.replace(
    /(<manifest[^>]*>)/,
    `$1\n    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />`,
  );
  fs.writeFileSync(manifestPath, manifest);
}

const javaDir = path.join(androidDir, "app", "src", "main", "java", ...packageName.split("."));
const pluginPath = path.join(javaDir, "AppUpdaterPlugin.java");
const pluginSource = `package ${packageName};

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Locale;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private static final String ALLOWED_HOST = "github.com";
    private static final String ALLOWED_PATH = "/MG-Trener/conductor.kz/releases/download/warehouse-latest/CONDUCTOR-Sklad.apk";

    private long activeDownloadId = -1L;
    private BroadcastReceiver downloadReceiver;
    private File activeApkFile;
    private String activeExpectedSha256 = "";

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String expectedSha256 = call.getString("sha256");
        if (url == null || url.trim().isEmpty()) {
            call.reject("Не указан URL обновления");
            return;
        }
        if (expectedSha256 == null || !expectedSha256.matches("(?i)^[a-f0-9]{64}$")) {
            call.reject("Не указан корректный SHA-256 обновления");
            return;
        }

        Uri updateUri = Uri.parse(url);
        if (!"https".equalsIgnoreCase(updateUri.getScheme())
            || !ALLOWED_HOST.equalsIgnoreCase(updateUri.getHost())
            || !ALLOWED_PATH.equals(updateUri.getPath())) {
            call.reject("Источник обновления не разрешён");
            return;
        }

        try {
            DownloadManager manager = (DownloadManager) getContext().getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager == null) {
                call.reject("Системный загрузчик Android недоступен");
                return;
            }

            File downloadsDir = getContext().getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (downloadsDir == null) {
                call.reject("Каталог загрузок недоступен");
                return;
            }
            File apkFile = new File(downloadsDir, "CONDUCTOR-Sklad-update.apk");
            if (apkFile.exists() && !apkFile.delete()) {
                call.reject("Не удалось очистить предыдущий файл обновления");
                return;
            }

            DownloadManager.Request request = new DownloadManager.Request(updateUri);
            request.setTitle("CONDUCTOR Склад");
            request.setDescription("Скачивание проверенного обновления");
            request.setMimeType(APK_MIME);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);
            request.setDestinationInExternalFilesDir(
                getContext(),
                Environment.DIRECTORY_DOWNLOADS,
                apkFile.getName()
            );

            activeApkFile = apkFile;
            activeExpectedSha256 = expectedSha256.toLowerCase(Locale.ROOT);
            registerDownloadReceiver(manager);
            activeDownloadId = manager.enqueue(request);

            JSObject result = new JSObject();
            result.put("downloadId", activeDownloadId);
            call.resolve(result);
        } catch (Exception error) {
            resetActiveDownload();
            call.reject("Не удалось начать загрузку обновления", error);
        }
    }

    private void registerDownloadReceiver(DownloadManager manager) {
        if (downloadReceiver != null) return;

        downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L);
                if (completedId != activeDownloadId) return;

                try {
                    context.unregisterReceiver(this);
                } catch (Exception ignored) {}
                downloadReceiver = null;

                File apkFile = activeApkFile;
                String expectedSha256 = activeExpectedSha256;
                activeDownloadId = -1L;
                activeApkFile = null;
                activeExpectedSha256 = "";

                installDownloadedApk(manager, completedId, apkFile, expectedSha256);
            }
        };

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(downloadReceiver, filter);
        }
    }

    private void resetActiveDownload() {
        activeDownloadId = -1L;
        activeApkFile = null;
        activeExpectedSha256 = "";
    }

    private boolean verifySha256(File file, String expectedSha256) {
        if (file == null || !file.isFile() || expectedSha256 == null || expectedSha256.isEmpty()) return false;
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (InputStream input = new FileInputStream(file)) {
                byte[] buffer = new byte[64 * 1024];
                int read;
                while ((read = input.read(buffer)) > 0) digest.update(buffer, 0, read);
            }
            StringBuilder actual = new StringBuilder();
            for (byte value : digest.digest()) actual.append(String.format(Locale.ROOT, "%02x", value));
            return expectedSha256.equalsIgnoreCase(actual.toString());
        } catch (Exception ignored) {
            return false;
        }
    }

    private void installDownloadedApk(DownloadManager manager, long downloadId, File apkFile, String expectedSha256) {
        DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
        try (Cursor cursor = manager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) return;
            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (statusIndex < 0 || cursor.getInt(statusIndex) != DownloadManager.STATUS_SUCCESSFUL) return;
        }

        if (!verifySha256(apkFile, expectedSha256)) {
            if (apkFile != null) apkFile.delete();
            return;
        }

        Uri apkUri = manager.getUriForDownloadedFile(downloadId);
        if (apkUri == null) return;

        Intent installIntent = new Intent(Intent.ACTION_VIEW);
        installIntent.setDataAndType(apkUri, APK_MIME);
        installIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getContext().startActivity(installIntent);
    }
}
`;
fs.writeFileSync(pluginPath, pluginSource);

const mainActivityPath = path.join(javaDir, "MainActivity.java");
let mainActivity = fs.readFileSync(mainActivityPath, "utf8");
if (!mainActivity.includes("registerPlugin(AppUpdaterPlugin.class)")) {
  const onCreatePattern = /(protected\s+void\s+onCreate\s*\(\s*Bundle\s+savedInstanceState\s*\)\s*\{\s*)/;
  if (!onCreatePattern.test(mainActivity)) {
    throw new Error("Не найден метод onCreate(Bundle savedInstanceState) в MainActivity");
  }
  mainActivity = mainActivity.replace(
    onCreatePattern,
    `$1        registerPlugin(AppUpdaterPlugin.class);\n`,
  );
  if (!mainActivity.includes("registerPlugin(AppUpdaterPlugin.class)")) {
    throw new Error("Не удалось зарегистрировать AppUpdaterPlugin в MainActivity");
  }
  fs.writeFileSync(mainActivityPath, mainActivity);
}

console.log(`Native updater configured for ${packageName} v${packageJson.version}: trusted GitHub source + SHA-256 verification`);
