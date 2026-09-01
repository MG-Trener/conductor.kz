import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(fs.readFileSync(path.join(here, "package.json"), "utf8"));
const capacitorConfig = JSON.parse(fs.readFileSync(path.join(here, "capacitor.config.json"), "utf8"));
const updateManifest = JSON.parse(fs.readFileSync(path.join(here, "..", "mobile", "app-version.json"), "utf8"));

if (packageJson.version !== updateManifest.version) {
  throw new Error(`Версии не совпадают: package.json=${packageJson.version}, app-version.json=${updateManifest.version}`);
}

const androidDir = path.join(here, "android");
const gradlePath = path.join(androidDir, "app", "build.gradle");
if (!fs.existsSync(gradlePath)) throw new Error(`Не найден ${gradlePath}`);

let gradle = fs.readFileSync(gradlePath, "utf8");
const versionCode = Number(updateManifest.versionCode);
if (!Number.isInteger(versionCode) || versionCode < 1) throw new Error("versionCode должен быть положительным целым числом");

gradle = gradle
  .replace(/versionCode\s+\d+/, `versionCode ${versionCode}`)
  .replace(/versionName\s+"[^"]+"/, `versionName "${packageJson.version}"`);

if (process.env.WAREHOUSE_SIGNING_ENABLED === "true") {
  gradle += `

// CONDUCTOR warehouse release signing. Secrets are provided only by GitHub Actions.
if (System.getenv("WAREHOUSE_KEYSTORE_PATH")) {
    android {
        signingConfigs {
            warehouseRelease {
                storeFile file(System.getenv("WAREHOUSE_KEYSTORE_PATH"))
                storePassword System.getenv("WAREHOUSE_KEYSTORE_PASSWORD")
                keyAlias System.getenv("WAREHOUSE_KEY_ALIAS")
                keyPassword System.getenv("WAREHOUSE_KEY_PASSWORD")
            }
        }
        buildTypes {
            release {
                signingConfig signingConfigs.warehouseRelease
            }
        }
    }
}
`;
}

fs.writeFileSync(gradlePath, gradle);

// Install branded Android resources generated from the approved locomotive artwork.
const brandingZip = path.join(here, "branding", "android-branding.zip");
const resDir = path.join(androidDir, "app", "src", "main", "res");
if (!fs.existsSync(brandingZip)) throw new Error(`Не найден архив фирменных ресурсов: ${brandingZip}`);
const unzip = spawnSync("unzip", ["-o", brandingZip, "-d", resDir], { stdio: "inherit" });
if (unzip.status !== 0) throw new Error("Не удалось распаковать Android branding resources");

const iconBackgroundPath = path.join(resDir, "values", "ic_launcher_background.xml");
if (fs.existsSync(iconBackgroundPath)) {
  let iconBackground = fs.readFileSync(iconBackgroundPath, "utf8");
  iconBackground = iconBackground.replace(/<color name="ic_launcher_background">[^<]+<\/color>/, '<color name="ic_launcher_background">#070A12</color>');
  fs.writeFileSync(iconBackgroundPath, iconBackground);
}

// Android 12+ only permits a centered icon in the OS splash. We use the new locomotive icon there,
// then show our own full-screen warehouse artwork inside the Activity for the cinematic splash requested.
const stylesPath = path.join(resDir, "values", "styles.xml");
if (fs.existsSync(stylesPath)) {
  let styles = fs.readFileSync(stylesPath, "utf8");
  styles = styles.replace(
    /<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/,
    `<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">@drawable/warehouse_splash</item>
        <item name="windowSplashScreenBackground">#070A12</item>
        <item name="windowSplashScreenAnimatedIcon">@mipmap/ic_launcher</item>
        <item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>
    </style>`,
  );
  fs.writeFileSync(stylesPath, styles);
}

const packageName = capacitorConfig.appId;
const mainActivityPath = path.join(androidDir, "app", "src", "main", "java", ...packageName.split("."), "MainActivity.java");
if (!fs.existsSync(mainActivityPath)) throw new Error(`Не найден ${mainActivityPath}`);

const mainActivity = `package ${packageName};

import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.widget.ImageView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private ImageView warehouseSplash;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showWarehouseSplash();
    }

    private void showWarehouseSplash() {
        warehouseSplash = new ImageView(this);
        warehouseSplash.setImageResource(R.drawable.warehouse_splash);
        warehouseSplash.setScaleType(ImageView.ScaleType.CENTER_CROP);
        warehouseSplash.setBackgroundColor(Color.rgb(7, 10, 18));
        warehouseSplash.setAlpha(1f);

        addContentView(
            warehouseSplash,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        warehouseSplash.bringToFront();

        PropertyValuesHolder scaleX = PropertyValuesHolder.ofFloat("scaleX", 1.00f, 1.065f);
        PropertyValuesHolder scaleY = PropertyValuesHolder.ofFloat("scaleY", 1.00f, 1.065f);
        ObjectAnimator driveIn = ObjectAnimator.ofPropertyValuesHolder(warehouseSplash, scaleX, scaleY);
        driveIn.setDuration(2600L);
        driveIn.start();

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (warehouseSplash == null) return;
            warehouseSplash.animate()
                .alpha(0f)
                .setDuration(520L)
                .withEndAction(() -> {
                    if (warehouseSplash != null && warehouseSplash.getParent() instanceof ViewGroup) {
                        ((ViewGroup) warehouseSplash.getParent()).removeView(warehouseSplash);
                    }
                    warehouseSplash = null;
                })
                .start();
        }, 2200L);
    }
}
`;

fs.writeFileSync(mainActivityPath, mainActivity);
console.log(`Android configured: ${packageJson.version} (${versionCode}), locomotive branding enabled, signing=${process.env.WAREHOUSE_SIGNING_ENABLED === "true"}`);
