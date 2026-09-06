import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

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

// Production APK must not carry the full unoptimized dependency/resource graph.
// Capacitor's generated Android project defaults to minifyEnabled=false.
const originalGradle = gradle;
gradle = gradle.replace(
  /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)minifyEnabled\s+false/,
  "$1minifyEnabled true\n            shrinkResources true",
);
if (gradle === originalGradle || !/minifyEnabled\s+true/.test(gradle) || !/shrinkResources\s+true/.test(gradle)) {
  throw new Error("Не удалось включить minifyEnabled/shrinkResources для release-сборки");
}

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

const gradlePropertiesPath = path.join(androidDir, "gradle.properties");
if (fs.existsSync(gradlePropertiesPath)) {
  let gradleProperties = fs.readFileSync(gradlePropertiesPath, "utf8");
  if (!/^android\.overridePathCheck=true$/m.test(gradleProperties)) {
    gradleProperties = `${gradleProperties.trimEnd()}\nandroid.overridePathCheck=true\n`;
    fs.writeFileSync(gradlePropertiesPath, gradleProperties);
  }
}

const brandingDir = path.join(here, "branding");
const iconPath = path.join(brandingDir, "icon.png");
if (!fs.existsSync(iconPath)) throw new Error(`Не найден PNG-ресурс значка: ${iconPath}`);

const iconPng = fs.readFileSync(iconPath);
const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const isPng = iconPng.length > 1024 && pngSignature.every((byte, index) => iconPng[index] === byte);
if (!isPng) throw new Error("branding/icon.png не является корректным PNG-файлом");

const resDir = path.join(androidDir, "app", "src", "main", "res");
const densityConfig = {
  mdpi: { launcher: 48, foreground: 108 },
  hdpi: { launcher: 72, foreground: 162 },
  xhdpi: { launcher: 96, foreground: 216 },
  xxhdpi: { launcher: 144, foreground: 324 },
  xxxhdpi: { launcher: 192, foreground: 432 },
};

// Never copy the multi-megabyte master icon into every density bucket.
// Generate only the pixels Android can actually display, and store them as lossless WebP.
for (const [density, sizes] of Object.entries(densityConfig)) {
  const dir = path.join(resDir, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });

  for (const base of ["ic_launcher", "ic_launcher_round", "ic_launcher_foreground"]) {
    for (const ext of ["png", "webp", "jpg", "jpeg"]) {
      fs.rmSync(path.join(dir, `${base}.${ext}`), { force: true });
    }

    const size = base === "ic_launcher_foreground" ? sizes.foreground : sizes.launcher;
    await sharp(iconPath)
      .resize(size, size, { fit: "cover" })
      .webp({ lossless: true, effort: 6 })
      .toFile(path.join(dir, `${base}.webp`));
  }
}

const iconBackgroundPath = path.join(resDir, "values", "ic_launcher_background.xml");
if (fs.existsSync(iconBackgroundPath)) {
  let iconBackground = fs.readFileSync(iconBackgroundPath, "utf8");
  iconBackground = iconBackground.replace(
    /<color name="ic_launcher_background">[^<]+<\/color>/,
    '<color name="ic_launcher_background">#070A12</color>',
  );
  fs.writeFileSync(iconBackgroundPath, iconBackground);
}

const publicAssetsDir = path.join(androidDir, "app", "src", "main", "assets", "public");

// Remove historical splash experiments that are not referenced by the current app.
for (const unused of ["warehouse-splash-vintage.png", "warehouse-splash.png"]) {
  fs.rmSync(path.join(publicAssetsDir, unused), { force: true });
}

async function convertBundledPngToWebp(fileName, quality) {
  const pngPath = path.join(publicAssetsDir, fileName);
  if (!fs.existsSync(pngPath)) return null;
  const webpName = fileName.replace(/\.png$/i, ".webp");
  const webpPath = path.join(publicAssetsDir, webpName);
  await sharp(pngPath).webp({ quality, effort: 6, smartSubsample: true }).toFile(webpPath);
  fs.rmSync(pngPath);
  return webpName;
}

// These two full-screen/decorative images dominated the APK. WebP keeps the same visual
// appearance on Android while cutting several megabytes from every update download.
const splashWebp = await convertBundledPngToWebp("warehouse-splash-clean.png", 88);
const titleWebp = await convertBundledPngToWebp("conductor-vintage-title.png", 92);

const textAssets = ["index.html", "splash.css", "sw.js"];
for (const asset of textAssets) {
  const assetPath = path.join(publicAssetsDir, asset);
  if (!fs.existsSync(assetPath)) continue;
  let text = fs.readFileSync(assetPath, "utf8");
  if (splashWebp) text = text.replaceAll("warehouse-splash-clean.png", splashWebp);
  if (titleWebp) text = text.replaceAll("conductor-vintage-title.png", titleWebp);
  text = text
    .replace('href="./warehouse-splash-clean.webp?v=1" as="image" type="image/png"', 'href="./warehouse-splash-clean.webp?v=1" as="image" type="image/webp"')
    .replace('href="./conductor-vintage-title.webp?v=1" as="image" type="image/png"', 'href="./conductor-vintage-title.webp?v=1" as="image" type="image/webp"');
  fs.writeFileSync(assetPath, text);
}

// Android still requires a very short system launch screen. Keep it visually blank so
// the only branded/animated splash the user sees is the web splash from mobile/index.html.
const drawableDir = path.join(resDir, "drawable");
fs.mkdirSync(drawableDir, { recursive: true });
fs.writeFileSync(
  path.join(drawableDir, "launch_blank.xml"),
  `<?xml version="1.0" encoding="utf-8"?>\n<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle">\n    <solid android:color="@android:color/transparent" />\n</shape>\n`,
);

const stylesPath = path.join(resDir, "values", "styles.xml");
if (fs.existsSync(stylesPath)) {
  let styles = fs.readFileSync(stylesPath, "utf8");
  styles = styles.replace(
    /<style name="AppTheme\.NoActionBarLaunch"[\s\S]*?<\/style>/,
    `<style name="AppTheme.NoActionBarLaunch" parent="Theme.SplashScreen">
        <item name="android:background">#070A12</item>
        <item name="windowSplashScreenBackground">#070A12</item>
        <item name="windowSplashScreenAnimatedIcon">@drawable/launch_blank</item>
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

const templatePath = path.join(here, "MainActivity.template.java");
if (!fs.existsSync(templatePath)) throw new Error(`Не найден ${templatePath}`);
const mainActivity = fs.readFileSync(templatePath, "utf8").replaceAll("__PACKAGE_NAME__", packageName);
fs.writeFileSync(mainActivityPath, mainActivity);

console.log(`Android configured: ${packageJson.version} (${versionCode}), optimized density icons=WebP, stale splash assets removed, active splash/title=WebP, release shrinking=on, signing=${process.env.WAREHOUSE_SIGNING_ENABLED === "true"}`);
