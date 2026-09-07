const ALLOWED_EMAILS = new Set(["mihagavr@gmail.com", "a.kalashin@gmail.com"]);

function finishStuckBoot() {
  const boot = document.getElementById("boot");
  if (!boot || boot.classList.contains("hide")) return;

  const login = document.getElementById("login");
  const app = document.getElementById("app");
  const currentEmail = String(document.getElementById("current-user-email")?.textContent || "").trim().toLowerCase();

  if (ALLOWED_EMAILS.has(currentEmail)) {
    login?.classList.add("hidden");
    app?.classList.remove("hidden");
    document.getElementById("view-dashboard")?.classList.add("active");
    boot.classList.add("hide");
    console.warn("Startup watchdog opened the app after a delayed realtime bootstrap");
    return;
  }

  if (login && !login.classList.contains("hidden")) {
    boot.classList.add("hide");
    return;
  }

  // Never leave the user on an endless splash. If auth/bootstrap still has not
  // resolved, show the login screen where the existing Firebase code can recover.
  if (login) {
    app?.classList.add("hidden");
    login.classList.remove("hidden");
    const error = document.getElementById("login-error");
    if (error && !error.textContent) error.textContent = "Не удалось завершить запуск. Проверьте интернет и войдите снова.";
    boot.classList.add("hide");
  }
}

window.setTimeout(finishStuckBoot, 9000);
