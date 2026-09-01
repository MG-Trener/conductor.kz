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

const gradlePropertiesPath = path.join(androidDir, "gradle.properties");
if (fs.existsSync(gradlePropertiesPath)) {
  let gradleProperties = fs.readFileSync(gradlePropertiesPath, "utf8");
  if (!/^android\.overridePathCheck=true$/m.test(gradleProperties)) {
    gradleProperties = `${gradleProperties.trimEnd()}\nandroid.overridePathCheck=true\n`;
    fs.writeFileSync(gradlePropertiesPath, gradleProperties);
  }
}

const brandingDir = path.join(here, "branding");
function isJpeg(buffer) {
  return buffer.length >= 1000
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer.at(-2) === 0xff
    && buffer.at(-1) === 0xd9;
}

function reviveAsset(prefix) {
  const parts = fs.readdirSync(brandingDir)
    .filter((name) => name.startsWith(`${prefix}.part`) && name.endsWith(".b64"))
    .sort();
  if (!parts.length) throw new Error(`Не найдены части ресурса ${prefix}`);

  const encodedParts = parts.map((name) => fs.readFileSync(path.join(brandingDir, name), "utf8")
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, "")
    .replace(/[^A-Za-z0-9+/=]/g, ""));

  const joined = Buffer.from(encodedParts.join(""), "base64");
  if (isJpeg(joined)) return joined;

  const concatenated = Buffer.concat(encodedParts.map((encoded) => Buffer.from(encoded, "base64")));
  if (isJpeg(concatenated)) return concatenated;
  throw new Error(`Повреждён JPEG-ресурс ${prefix}`);
}

const iconJpeg = reviveAsset("icon");
const sharedSplashPath = path.join(here, "..", "mobile", "warehouse-splash-vintage.png");
if (!fs.existsSync(sharedSplashPath)) throw new Error(`Не найден ${sharedSplashPath}`);
const splashPng = fs.readFileSync(sharedSplashPath);
if (splashPng.length < 100_000 || !splashPng.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
  throw new Error("Повреждён общий PNG-ресурс заставки");
}

const resDir = path.join(androidDir, "app", "src", "main", "res");
for (const density of ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"]) {
  const dir = path.join(resDir, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });
  for (const base of ["ic_launcher", "ic_launcher_round", "ic_launcher_foreground"]) {
    for (const ext of ["png", "webp", "jpg", "jpeg"]) fs.rmSync(path.join(dir, `${base}.${ext}`), { force: true });
    fs.writeFileSync(path.join(dir, `${base}.jpg`), iconJpeg);
  }
}

const splashDir = path.join(resDir, "drawable-nodpi");
fs.mkdirSync(splashDir, { recursive: true });
for (const ext of ["png", "webp", "jpg", "jpeg"]) fs.rmSync(path.join(splashDir, `warehouse_splash.${ext}`), { force: true });
fs.writeFileSync(path.join(splashDir, "warehouse_splash.png"), splashPng);

const iconBackgroundPath = path.join(resDir, "values", "ic_launcher_background.xml");
if (fs.existsSync(iconBackgroundPath)) {
  let iconBackground = fs.readFileSync(iconBackgroundPath, "utf8");
  iconBackground = iconBackground.replace(
    /<color name="ic_launcher_background">[^<]+<\/color>/,
    '<color name="ic_launcher_background">#070A12</color>',
  );
  fs.writeFileSync(iconBackgroundPath, iconBackground);
}

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

const templatePath = path.join(here, "MainActivity.template.java");
if (!fs.existsSync(templatePath)) throw new Error(`Не найден ${templatePath}`);
const mainActivity = fs.readFileSync(templatePath, "utf8").replaceAll("__PACKAGE_NAME__", packageName);
fs.writeFileSync(mainActivityPath, mainActivity);

console.log(`Android configured: ${packageJson.version} (${versionCode}), animated 6.2-second locomotive splash enabled, signing=${process.env.WAREHOUSE_SIGNING_ENABLED === "true"}`);
