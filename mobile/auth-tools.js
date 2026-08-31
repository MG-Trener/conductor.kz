import { getApps } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";

function waitForFirebase(timeoutMs = 6000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const app = getApps()[0];
      if (app) return resolve(app);
      if (Date.now() - started > timeoutMs) return reject(new Error("Firebase не инициализирован"));
      setTimeout(tick, 80);
    };
    tick();
  });
}

function ensureResetUi() {
  const form = document.querySelector("#login-form");
  if (!form || document.querySelector("#reset-password")) return;

  const button = document.createElement("button");
  button.id = "reset-password";
  button.type = "button";
  button.className = "btn full";
  button.textContent = "Восстановить пароль";
  form.append(button);

  const project = document.createElement("p");
  project.className = "muted";
  project.style.cssText = "font-size:10px;text-align:center;margin:6px 0 0";
  project.textContent = "Firebase: conductor-requests";
  form.append(project);

  button.addEventListener("click", async () => {
    const email = document.querySelector("#email")?.value.trim();
    const errorNode = document.querySelector("#login-error");
    if (!email) {
      if (errorNode) errorNode.textContent = "Сначала укажите email учётной записи.";
      return;
    }

    button.disabled = true;
    if (errorNode) errorNode.textContent = "";
    try {
      const app = await waitForFirebase();
      const auth = getAuth(app);
      await sendPasswordResetEmail(auth, email);
      if (errorNode) {
        errorNode.style.color = "#7bea91";
        errorNode.textContent = "Письмо для смены пароля отправлено. Проверьте почту, затем войдите с новым паролем.";
      }
    } catch (error) {
      if (errorNode) {
        errorNode.style.color = "";
        errorNode.textContent = error.code === "auth/user-not-found"
          ? "Пользователь с таким email не найден."
          : `Не удалось отправить письмо: ${error.message}`;
      }
    } finally {
      button.disabled = false;
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", ensureResetUi, { once: true });
} else {
  ensureResetUi();
}
