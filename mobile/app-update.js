const UPDATE_RELEASE_API_URL = "https://api.github.com/repos/MG-Trener/conductor.kz/releases/tags/warehouse-latest";
const APK_DOWNLOAD_URL = "https://github.com/MG-Trener/conductor.kz/releases/download/warehouse-latest/CONDUCTOR-Sklad.apk";
const APK_ASSET_NAME = "CONDUCTOR-Sklad.apk";
const LEGACY_ANDROID_VERSION = "0.1.0";

function parseVersion(value = "0") {
  return String(value)
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0)
    .slice(0, 4);
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  const length = Math.max(left.length, right.length, 3);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] || 0) - (right[index] || 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

function isAndroidApp() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("native") === "1") return true;
  try {
    return window.Capacitor?.getPlatform?.() === "android" || window.Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

async function currentAppVersion() {
  try {
    const app = window.Capacitor?.Plugins?.App;
    if (app?.getInfo) {
      const info = await app.getInfo();
      if (info?.version) return String(info.version);
    }
  } catch {}

  const params = new URLSearchParams(window.location.search);
  return params.get("appVersion") || LEGACY_ANDROID_VERSION;
}

function addStyles() {
  if (document.getElementById("app-update-styles")) return;
  const style = document.createElement("style");
  style.id = "app-update-styles";
  style.textContent = `
    .app-update-card { margin: 14px 0; overflow: hidden; }
    .app-update-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .app-update-head h3 { margin:0; }
    .app-update-version { font-size:12px; opacity:.68; white-space:nowrap; }
    .app-update-status { margin:8px 0 0; line-height:1.45; }
    .app-update-card.available { border-color:rgba(255,190,70,.65); box-shadow:0 0 0 1px rgba(255,190,70,.08) inset; }
    .app-update-card.available .app-update-status { color:#ffd27a; }
    .app-update-latest { margin-top:10px; padding:10px 11px; border:1px solid var(--line); border-radius:12px; background:#090e16; }
    .app-update-latest b { display:block; margin-bottom:4px; font-size:10px; letter-spacing:.04em; text-transform:uppercase; color:#9aa6b5; }
    .app-update-latest p { margin:0; color:#dce4ee; font-size:10.5px; line-height:1.45; white-space:pre-line; }
    .app-update-actions { display:flex; gap:8px; margin-top:12px; }
    .app-update-actions .btn { margin:0; }
    .app-update-badge { position:absolute; width:9px; height:9px; border-radius:50%; background:#ffb52e; top:7px; right:calc(50% - 19px); box-shadow:0 0 0 3px #0b0f18; }
    .nav-btn[data-nav="settings"] { position:relative; }
    .apk-direct-download { margin-top:14px; text-decoration:none; display:flex; align-items:center; justify-content:center; }
  `;
  document.head.appendChild(style);
}

function openDownload(url) {
  if (!url) return;
  try {
    const browser = window.Capacitor?.Plugins?.Browser;
    if (browser?.open) {
      browser.open({ url });
      return;
    }
  } catch {}
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) window.location.href = url;
}

function ensureDirectDownloadButton() {
  const settings = document.querySelector("#view-settings");
  if (!settings || document.querySelector("#apk-direct-download")) return;

  const link = document.createElement("a");
  link.id = "apk-direct-download";
  link.className = "btn primary full apk-direct-download";
  link.href = APK_DOWNLOAD_URL;
  link.target = "_blank";
  link.rel = "noopener";
  link.download = APK_ASSET_NAME;
  link.textContent = "↓ Скачать APK для Android";
  link.setAttribute("aria-label", "Скачать актуальный APK приложения CONDUCTOR Склад");

  const siteButton = settings.querySelector(".site-settings-btn");
  if (siteButton) siteButton.insertAdjacentElement("afterend", link);
  else settings.prepend(link);
}

function ensureUi() {
  const settings = document.querySelector("#view-settings");
  if (!settings) return null;

  let card = document.querySelector("#app-update-card");
  if (!card) {
    card = document.createElement("div");
    card.id = "app-update-card";
    card.className = "panel app-update-card";
    card.innerHTML = `
      <div class="app-update-head">
        <h3>Версия приложения</h3>
        <span id="app-current-version" class="app-update-version">—</span>
      </div>
      <p id="app-update-status" class="app-update-status muted">Проверяем обновления…</p>
      <div class="app-update-latest">
        <b>Последние изменения</b>
        <p id="app-update-latest-notes">Загружаем описание последней версии…</p>
      </div>
      <div class="app-update-actions">
        <button id="app-update-download" class="btn primary full hidden" type="button">Обновить</button>
        <button id="app-update-check" class="btn full" type="button">Проверить ещё раз</button>
      </div>
    `;
    const settingsPanel = settings.querySelector(".settings-panel");
    settingsPanel?.insertAdjacentElement("afterend", card);
  }

  document.querySelector("#app-update-banner")?.remove();
  return { card };
}

async function getPublishedRelease() {
  const response = await fetch(`${UPDATE_RELEASE_API_URL}?t=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json" }
  });
  if (!response.ok) throw new Error(`Release HTTP ${response.status}`);

  const release = await response.json();
  const match = String(release?.name || "").match(/\bv?(\d+(?:\.\d+){1,3})\b/i);
  if (!match) throw new Error("Не удалось определить опубликованную версию APK");

  const asset = Array.isArray(release?.assets)
    ? release.assets.find((item) => item?.name === APK_ASSET_NAME)
    : null;
  if (!asset?.browser_download_url) throw new Error("APK не найден в опубликованном релизе");
  if (asset.browser_download_url !== APK_DOWNLOAD_URL) throw new Error("Опубликован неожиданный URL APK");

  const digest = String(asset.digest || "").replace(/^sha256:/i, "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) throw new Error("GitHub не предоставил SHA-256 опубликованного APK");

  const notes = String(release?.body || "").trim();
  if (!notes) throw new Error("У опубликованной версии отсутствует описание последних изменений");

  return {
    version: match[1],
    downloadUrl: APK_DOWNLOAD_URL,
    sha256: digest,
    notes
  };
}

let lastRelease = null;
let downloadInProgress = false;

function clearUpdateBadge() {
  document.querySelector("#app-update-badge")?.remove();
}

async function checkForUpdate({ quiet = false } = {}) {
  if (!isAndroidApp()) return;
  addStyles();
  const ui = ensureUi();
  if (!ui) return;

  const currentVersion = await currentAppVersion();
  const versionNode = document.querySelector("#app-current-version");
  const statusNode = document.querySelector("#app-update-status");
  const notesNode = document.querySelector("#app-update-latest-notes");
  const downloadButton = document.querySelector("#app-update-download");
  const navSettings = document.querySelector('.nav-btn[data-nav="settings"]');

  if (versionNode) versionNode.textContent = `v${currentVersion}`;
  if (!quiet && statusNode && !downloadInProgress) {
    statusNode.textContent = "Проверяем обновления…";
    statusNode.classList.add("muted");
  }

  try {
    const published = await getPublishedRelease();
    lastRelease = published;
    const available = compareVersions(published.version, currentVersion) > 0;

    ui.card.classList.toggle("available", available);
    statusNode?.classList.toggle("muted", !available);
    downloadButton?.classList.toggle("hidden", !available);
    if (notesNode) notesNode.textContent = published.notes;

    clearUpdateBadge();
    if (available && navSettings) {
      const badge = document.createElement("span");
      badge.id = "app-update-badge";
      badge.className = "app-update-badge";
      badge.setAttribute("aria-label", "Доступно обновление");
      navSettings.appendChild(badge);
    }

    if (!downloadInProgress && statusNode) {
      statusNode.textContent = available
        ? `Доступна новая версия v${published.version}`
        : `Установлена актуальная версия v${currentVersion}`;
    }
  } catch (error) {
    lastRelease = null;
    ui.card.classList.remove("available");
    downloadButton?.classList.add("hidden");
    clearUpdateBadge();
    if (notesNode && !quiet) notesNode.textContent = "Описание последней версии сейчас недоступно.";
    if (statusNode && !quiet && !downloadInProgress) {
      statusNode.textContent = "Не удалось безопасно проверить обновления. Проверьте интернет и повторите.";
      statusNode.classList.add("muted");
    }
    console.error("Update check failed", error);
  }
}

async function downloadUpdate() {
  if (!lastRelease?.downloadUrl || !lastRelease?.sha256 || downloadInProgress) return;

  const statusNode = document.querySelector("#app-update-status");
  const button = document.querySelector("#app-update-download");
  const originalText = button?.textContent || "Обновить";
  downloadInProgress = true;
  if (button) {
    button.disabled = true;
    button.textContent = "Скачивание…";
  }
  if (statusNode) {
    statusNode.textContent = "Скачиваем и проверяем обновление. После проверки Android откроет установку.";
    statusNode.classList.remove("muted");
  }

  try {
    const nativeUpdater = window.Capacitor?.Plugins?.AppUpdater;
    if (nativeUpdater?.downloadAndInstall) {
      await nativeUpdater.downloadAndInstall({
        url: lastRelease.downloadUrl,
        sha256: lastRelease.sha256
      });
      return;
    }

    downloadInProgress = false;
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
    if (statusNode) {
      statusNode.textContent = "Эта старая версия скачает APK обычным способом. Начиная с версии 1.0.0 обновления дополнительно проверяются перед установкой.";
    }
    openDownload(lastRelease.downloadUrl);
  } catch (error) {
    downloadInProgress = false;
    if (button) {
      button.disabled = false;
      button.textContent = originalText;
    }
    if (statusNode) {
      statusNode.textContent = "Не удалось начать безопасное обновление. Повторите попытку.";
      statusNode.classList.add("muted");
    }
    console.error("Update download failed", error);
  }
}

function start() {
  addStyles();
  const nativeAndroid = isAndroidApp();

  if (!nativeAndroid) {
    ensureDirectDownloadButton();
    return;
  }

  document.querySelector("#apk-direct-download")?.remove();
  ensureUi();

  document.querySelector("#app-update-check")?.addEventListener("click", () => checkForUpdate());
  document.querySelector("#app-update-download")?.addEventListener("click", downloadUpdate);

  checkForUpdate();
  window.setInterval(() => checkForUpdate({ quiet: true }), 6 * 60 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) checkForUpdate({ quiet: true });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
