import fs from "node:fs";
import path from "node:path";
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
if (!Number.isInteger(versionCode) || versionCode < 1) {
  throw new Error("versionCode должен быть положительным целым числом");
}

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

const brandingDir = path.join(here, "branding");
function reviveAsset(prefix) {
  const parts = fs.readdirSync(brandingDir)
    .filter((name) => name.startsWith(`${prefix}.part`) && name.endsWith(".b64"))
    .sort();
  if (!parts.length) throw new Error(`Не найдены части ресурса ${prefix}`);

  // Base64 fragments can be created by different clients/editors. Strip BOMs,
  // whitespace and any accidental non-base64 characters before joining them.
  const encoded = parts
    .map((name) => fs.readFileSync(path.join(brandingDir, name), "utf8")
      .replace(/\uFEFF/g, "")
      .replace(/\s+/g, ""))
    .join("")
    .replace(/[^A-Za-z0-9+/=]/g, "");

  const result = Buffer.from(encoded, "base64");
  if (result.length < 1000 || result[0] !== 0xff || result[1] !== 0xd8 || result.at(-2) !== 0xff || result.at(-1) !== 0xd9) {
    throw new Error(`Повреждён JPEG-ресурс ${prefix}`);
  }
  return result;
}

function reviveAssetWithFallback(primaryPrefix, fallbackPrefix) {
  try {
    return reviveAsset(primaryPrefix);
  } catch (error) {
    console.warn(`${error.message}. Используется резервный ресурс ${fallbackPrefix}.`);
    return reviveAsset(fallbackPrefix);
  }
}

const iconJpeg = reviveAsset("icon");
const splashJpeg = reviveAssetWithFallback("splashv4", "splashq");
const resDir = path.join(androidDir, "app", "src", "main", "res");

// Replace all density-specific launcher images with the front-facing locomotive artwork.
for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
  const dir = path.join(resDir, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const base of ["ic_launcher", "ic_launcher_round", "ic_launcher_foreground"]) {
    for (const ext of ["png", "webp", "jpg", "jpeg"]) {
      fs.rmSync(path.join(dir, `${base}.${ext}`), { force: true });
    }
    fs.writeFileSync(path.join(dir, `${base}.jpg`), iconJpeg);
  }
}

// Full-screen vertical startup artwork with the "CONDUCTOR Склад" title baked into the image.
const splashDir = path.join(resDir, "drawable-nodpi");
fs.mkdirSync(splashDir, { recursive: true });
for (const ext of ["png", "webp", "jpg", "jpeg"]) {
  fs.rmSync(path.join(splashDir, `warehouse_splash.${ext}`), { force: true });
}
fs.writeFileSync(path.join(splashDir, "warehouse_splash.jpg"), splashJpeg);

const iconBackgroundPath = path.join(resDir, "values", "ic_launcher_background.xml");
if (fs.existsSync(iconBackgroundPath)) {
  let iconBackground = fs.readFileSync(iconBackgroundPath, "utf8");
  iconBackground = iconBackground.replace(
    /<color name="ic_launcher_background">[^<]+<\/color>/,
    '<color name="ic_launcher_background">#070A12</color>',
  );
  fs.writeFileSync(iconBackgroundPath, iconBackground);
}

// Android 12 shows its short system splash first. The custom cinematic splash below
// then stays above the warehouse WebView for six full seconds.
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
const mainActivityPath = path.join(
  androidDir,
  "app",
  "src",
  "main",
  "java",
  ...packageName.split("."),
  "MainActivity.java",
);
if (!fs.existsSync(mainActivityPath)) throw new Error(`Не найден ${mainActivityPath}`);

const mainActivity = `package ${packageName};

import android.animation.ObjectAnimator;
import android.animation.PropertyValuesHolder;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final long SPLASH_HOLD_MS = 6000L;
    private static final long SPLASH_FADE_MS = 650L;

    private ImageView warehouseSplash;
    private int previousSystemUiVisibility;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showWarehouseSplash();
    }

    private void showWarehouseSplash() {
        previousSystemUiVisibility = getWindow().getDecorView().getSystemUiVisibility();
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );

        warehouseSplash = new ImageView(this);
        warehouseSplash.setImageResource(R.drawable.warehouse_splash);
        warehouseSplash.setScaleType(ImageView.ScaleType.CENTER_CROP);
        warehouseSplash.setBackgroundColor(Color.rgb(7, 10, 18));
        warehouseSplash.setAlpha(1f);
        warehouseSplash.setClickable(true);
        warehouseSplash.setFocusable(true);

        addContentView(
            warehouseSplash,
            new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        );
        warehouseSplash.bringToFront();

        // Slow camera push makes the locomotive feel as though it is entering the warehouse.
        PropertyValuesHolder scaleX = PropertyValuesHolder.ofFloat("scaleX", 1.00f, 1.085f);
        PropertyValuesHolder scaleY = PropertyValuesHolder.ofFloat("scaleY", 1.00f, 1.085f);
        ObjectAnimator driveIn = ObjectAnimator.ofPropertyValuesHolder(warehouseSplash, scaleX, scaleY);
        driveIn.setDuration(5600L);
        driveIn.start();

        new Handler(Looper.getMainLooper()).postDelayed(() -> {
            if (warehouseSplash == null) return;
            warehouseSplash.animate()
                .alpha(0f)
                .setDuration(SPLASH_FADE_MS)
                .withEndAction(() -> {
                    if (warehouseSplash != null && warehouseSplash.getParent() instanceof ViewGroup) {
                        ((ViewGroup) warehouseSplash.getParent()).removeView(warehouseSplash);
                    }
                    warehouseSplash = null;
                    getWindow().getDecorView().setSystemUiVisibility(previousSystemUiVisibility);
                })
                .start();
        }, SPLASH_HOLD_MS);
    }
}
`;

fs.writeFileSync(mainActivityPath, mainActivity);
console.log(`Android configured: ${packageJson.version} (${versionCode}), 6-second locomotive splash enabled, signing=${process.env.WAREHOUSE_SIGNING_ENABLED === "true"}`);
