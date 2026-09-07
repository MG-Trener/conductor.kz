import { createLoginThrottle, formatRemaining } from "./auth-throttle.js";

const throttle = createLoginThrottle();
let pendingEmail = "";
let pendingFailureRecorded = false;

function lockMessage(status) {
  return `Слишком много неверных попыток. Повторите вход через ${formatRemaining(status.remainingMs)}.`;
}

function installLoginThrottle() {
  const form = document.getElementById("login-form");
  const emailInput = document.getElementById("email");
  const errorNode = document.getElementById("login-error");
  const currentEmail = document.getElementById("current-user-email");
  if (!form || !emailInput || !errorNode) return;

  form.addEventListener("submit", (event) => {
    const email = String(emailInput.value || "").trim().toLowerCase();
    const status = throttle.status(email);
    if (status.locked) {
      event.preventDefault();
      event.stopImmediatePropagation();
      errorNode.textContent = lockMessage(status);
      return;
    }
    pendingEmail = email;
    pendingFailureRecorded = false;
  }, true);

  new MutationObserver(() => {
    const text = String(errorNode.textContent || "");
    if (!pendingEmail || pendingFailureRecorded || !text) return;

    if (text.includes("Неверный email или пароль") || text.includes("auth/invalid-credential")) {
      pendingFailureRecorded = true;
      const status = throttle.recordFailure(pendingEmail);
      pendingEmail = "";
      if (status.locked) errorNode.textContent = lockMessage(status);
      return;
    }

    if (text.includes("auth/too-many-requests") || text.includes("TOO_MANY_ATTEMPTS_TRY_LATER")) {
      pendingFailureRecorded = true;
      const status = throttle.forceDayLock(pendingEmail);
      pendingEmail = "";
      errorNode.textContent = lockMessage(status);
      return;
    }

    pendingEmail = "";
  }).observe(errorNode, { childList: true, characterData: true, subtree: true });

  if (currentEmail) {
    new MutationObserver(() => {
      const signedInEmail = String(currentEmail.textContent || "").trim().toLowerCase();
      if (!signedInEmail) return;
      throttle.clear(pendingEmail || signedInEmail);
      pendingEmail = "";
      pendingFailureRecorded = false;
    }).observe(currentEmail, { childList: true, characterData: true, subtree: true });
  }
}

function finishStuckBoot() {
  const boot = document.getElementById("boot");
  if (!boot || boot.classList.contains("hide")) return;

  const login = document.getElementById("login");
  const app = document.getElementById("app");

  // The watchdog must never grant access. It may only reveal a screen that the
  // Firebase auth flow has already selected, otherwise it falls back to login.
  if (app && !app.classList.contains("hidden")) {
    boot.classList.add("hide");
    return;
  }

  if (login && !login.classList.contains("hidden")) {
    boot.classList.add("hide");
    return;
  }

  if (login) {
    app?.classList.add("hidden");
    login.classList.remove("hidden");
    const error = document.getElementById("login-error");
    if (error && !error.textContent) error.textContent = "Не удалось завершить запуск. Проверьте интернет и войдите снова.";
    boot.classList.add("hide");
  }
}

installLoginThrottle();
window.setTimeout(finishStuckBoot, 9000);
