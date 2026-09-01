import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(here, "package.json"), "utf8"));
const capacitorConfig = JSON.parse(fs.readFileSync(path.join(here, "capacitor.config.json"), "utf8"));
const androidDir = path.join(here, "android");
const packageName = capacitorConfig.appId;

if (!fs.existsSync(androidDir)) throw new Error("Android project has not been generated yet");

// Keep the fallback appVersion query parameter in the generated native config aligned
// with the APK version. New builds also read versionName through @capacitor/app, but this
// prevents false update prompts if that plugin is temporarily unavailable.
const generatedConfigPath = path.join(androidDir, "app", "src", "main", "assets", "capacitor.config.json");
if (fs.existsSync(generatedConfigPath)) {
  const generatedConfig = JSON.parse(fs.readFileSync(generatedConfigPath, "utf8"));
  if (generatedConfig.server?.url) {
    const serverUrl = new URL(generatedConfig.server.url);
    serverUrl.searchParams.set("native", "1");
    serverUrl.searchParams.set("appVersion", packageJson.version);
    generatedConfig.server.url = serverUrl.toString();
    fs.writeFileSync(generatedConfigPath, `${JSON.stringify(generatedConfig, null, 2)}\n`);
  }
}

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

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final String APK_MIME = "application/vnd.android.package-archive";
    private long activeDownloadId = -1L;
    private BroadcastReceiver downloadReceiver;

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("Не указан URL обновления");
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
            if (apkFile.exists()) apkFile.delete();

            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setTitle("CONDUCTOR Склад");
            request.setDescription("Скачивание обновления");
            request.setMimeType(APK_MIME);
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setAllowedOverMetered(true);
            request.setAllowedOverRoaming(true);
            request.setDestinationInExternalFilesDir(
                getContext(),
                Environment.DIRECTORY_DOWNLOADS,
                apkFile.getName()
            );

            registerDownloadReceiver(manager);
            activeDownloadId = manager.enqueue(request);

            JSObject result = new JSObject();
            result.put("downloadId", activeDownloadId);
            call.resolve(result);
        } catch (Exception error) {
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
                activeDownloadId = -1L;

                installDownloadedApk(manager, completedId);
            }
        };

        IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            getContext().registerReceiver(downloadReceiver, filter, Context.RECEIVER_EXPORTED);
        } else {
            getContext().registerReceiver(downloadReceiver, filter);
        }
    }

    private void installDownloadedApk(DownloadManager manager, long downloadId) {
        DownloadManager.Query query = new DownloadManager.Query().setFilterById(downloadId);
        try (Cursor cursor = manager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) return;
            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (statusIndex < 0 || cursor.getInt(statusIndex) != DownloadManager.STATUS_SUCCESSFUL) return;
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
  mainActivity = mainActivity.replace(
    "protected void onCreate(Bundle savedInstanceState) {\n        super.onCreate(savedInstanceState);",
    "protected void onCreate(Bundle savedInstanceState) {\n        registerPlugin(AppUpdaterPlugin.class);\n        super.onCreate(savedInstanceState);",
  );
  if (!mainActivity.includes("registerPlugin(AppUpdaterPlugin.class)")) {
    throw new Error("Не удалось зарегистрировать AppUpdaterPlugin в MainActivity");
  }
  fs.writeFileSync(mainActivityPath, mainActivity);
}

console.log(`Native updater configured for ${packageName} v${packageJson.version}`);
