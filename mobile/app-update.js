const UPDATE_MANIFEST_URL = "./app-version.json";
const UPDATE_RELEASE_API_URL = "https://api.github.com/repos/MG-Trener/conductor.kz/releases/tags/warehouse-latest";
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

function currentAppVersion() {
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
    .app-update-actions { display:flex; gap:8px; margin-top:12px; }
    .app-update-actions .btn { margin:0; }
    .app-update-badge { position:absolute; width:9px; height:9px; border-radius:50%; background:#ffb52e; top:7px; right:calc(50% - 19px); box-shadow:0 0 0 3px #0b0f18; }
    .nav-btn[data-nav="settings"] { position:relative; }
    .app-update-banner { display:none; margin:0 0 14px; padding:12px 14px; border:1px solid rgba(255,190,70,.42); border-radius:16px; background:rgba(255,181,46,.09); gap:10px; align-items:center; justify-content:space-between; }
    .app-update-banner.show { display:flex; }
    .app-update-banner b { display:block; color:#ffd27a; }
    .app-update-banner small { display:block; margin-top:2px; opacity:.72; }
    .app-update-banner .btn { width:auto; min-width:112px; margin:0; }
    @media (max-width:560px) { .app-update-banner { align-items:flex-start; flex-direction:column; } .app-update-banner .btn { width:100%; } }
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

function ensureUi() {
  const settings = document.querySelector("#view-settings");
  const content = document.querySelector("main.content");
  if (!settings || !content) return null;

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
      <div class="app-update-actions">
        <button id="app-update-download" class="btn primary full hidden" type="button">Скачать обновление</button>
        <button id="app-update-check" class="btn full" type="button">Проверить ещё раз</button>
      </div>
    `;
    const settingsPanel = settings.querySelector(".settings-panel");
    settingsPanel?.insertAdjacentElement("afterend", card);
  }

  let banner = document.querySelector("#app-update-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "app-update-banner";
    banner.className = "app-update-banner";
    banner.innerHTML = `
      <div><b id="app-update-banner-title">Доступно обновление</b><small id="app-update-banner-text"></small></div>
      <button id="app-update-banner-download" class="btn primary" type="button">Скачать</button>
    `;
    content.prepend(banner);
  }

  return { card, banner };
}

async function getPublishedVersion() {
  const response = await fetch(`${UPDATE_RELEASE_API_URL}?t=${Date.now()}`, {
    cache: "no-store",
    headers: { Accept: "application/vnd.github+json" },
  });
  if (!response.ok) throw new Error(`Release HTTP ${response.status}`);
  const release = await response.json();
  const match = String(release?.name || "").match(/\bv?(\d+(?:\.\d+){1,3})\b/i);
  if (!match) throw new Error("Не удалось определить опубликованную версию APK");
  return match[1];
}

let lastManifest = null;

async function checkForUpdate({ quiet = false } = {}) {
  if (!isAndroidApp()) return;
  addStyles();
  const ui = ensureUi();
  if (!ui) return;

  const currentVersion = currentAppVersion();
  const versionNode = document.querySelector("#app-current-version");
  const statusNode = document.querySelector("#app-update-status");
  const downloadButton = document.querySelector("#app-update-download");
  const navSettings = document.querySelector('.nav-btn[data-nav="settings"]');
  if (versionNode) versionNode.textContent = `v${currentVersion}`;
  if (!quiet && statusNode) {
    statusNode.textContent = "Проверяем обновления…";
    statusNode.classList.add("muted");
  }

  try {
    const [manifestResponse, publishedVersion] = await Promise.all([
      fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, { cache: "no-store" }),
      getPublishedVersion(),
    ]);
    if (!manifestResponse.ok) throw new Error(`HTTP ${manifestResponse.status}`);
    const manifest = await manifestResponse.json();
    if (!manifest?.version || !manifest?.downloadUrl) throw new Error("Некорректный файл версии");

    // Never offer an APK while its permanent Android signing key has not been applied.
    // This prevents Android's "conflicts with another package" error from recurring.
    if (manifest.releaseReady === false) {
      lastManifest = null;
      ui.card.classList.remove("available");
      ui.banner.classList.remove("show");
      downloadButton?.classList.add("hidden");
      document.querySelector("#app-update-badge")?.remove();
      if (statusNode) {
        statusNode.textContent = `Установлена актуальная версия v${currentVersion}`;
        statusNode.classList.add("muted");
      }
      return;
    }

    // The release title is the source of truth for the APK that is actually published.
    // This prevents a failed Android build from advertising a newer manifest while the
    // permanent download URL still points to an older APK.
    lastManifest = { ...manifest, version: publishedVersion };

    const available = compareVersions(publishedVersion, currentVersion) > 0;
    ui.card.classList.toggle("available", available);
    statusNode?.classList.toggle("muted", !available);
    downloadButton?.classList.toggle("hidden", !available);

    document.querySelector("#app-update-badge")?.remove();
    if (available && navSettings) {
      const badge = document.createElement("span");
      badge.id = "app-update-badge";
      badge.className = "app-update-badge";
      badge.setAttribute("aria-label", "Доступно обновление");
      navSettings.appendChild(badge);
    }

    ui.banner.classList.toggle("show", available);
    if (available) {
      if (statusNode) statusNode.textContent = `Доступна новая версия v${publishedVersion}`;
      const title = document.querySelector("#app-update-banner-title");
      const text = document.querySelector("#app-update-banner-text");
      if (title) title.textContent = `Доступна новая версия v${publishedVersion}`;
      if (text) text.textContent = "Можно скачать и установить обновление.";
    } else if (statusNode) {
      statusNode.textContent = `Установлена актуальная версия v${currentVersion}`;
    }
  } catch (error) {
    lastManifest = null;
    ui.card.classList.remove("available");
    ui.banner.classList.remove("show");
    downloadButton?.classList.add("hidden");
    document.querySelector("#app-update-badge")?.remove();
    if (statusNode && !quiet) {
      statusNode.textContent = "Не удалось проверить обновления. Проверьте интернет и повторите.";
      statusNode.classList.add("muted");
    }
  }
}

function start() {
  if (!isAndroidApp()) return;
  addStyles();
  ensureUi();

  document.querySelector("#app-update-check")?.addEventListener("click", () => checkForUpdate());
  document.querySelector("#app-update-download")?.addEventListener("click", () => openDownload(lastManifest?.downloadUrl));
  document.querySelector("#app-update-banner-download")?.addEventListener("click", () => openDownload(lastManifest?.downloadUrl));

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
