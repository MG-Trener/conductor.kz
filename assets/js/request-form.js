import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app-check.js";
import {
  addDoc,
  collection,
  getFirestore,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDnH_Lp6JudyHw4bPbPptwnhRe6On23jCA",
  authDomain: "conductor-requests.firebaseapp.com",
  projectId: "conductor-requests",
  storageBucket: "conductor-requests.firebasestorage.app",
  messagingSenderId: "249591037242",
  appId: "1:249591037242:web:e534b60202dca9245ee403",
};

const products = {
  DM30: { name: "Цветной дым DM30", fallbackPrice: "2 700 ₸" },
  DM60: { name: "Цветной дым DM60", fallbackPrice: "3 100 ₸" },
  DM90: { name: "Цветной дым DM90", fallbackPrice: "3 500 ₸" },
  HOLI: { name: "Краски Холи", fallbackPrice: "1 000 ₸" },
};

const firebaseApp = initializeApp(firebaseConfig, "public-request-form");
initializeAppCheck(firebaseApp, {
  provider: new ReCaptchaEnterpriseProvider("6LeoSKEtAAAAAG6kl4NAhwS0vzz7B2Tkb6Q23AXM"),
  isTokenAutoRefreshEnabled: true,
});
const db = getFirestore(firebaseApp);

const dialog = document.createElement("dialog");
dialog.id = "request-form";
dialog.className = "request-modal";
dialog.setAttribute("aria-labelledby", "request-modal-title");
dialog.innerHTML = `
  <div class="request-modal__body">
    <button class="request-modal__close" type="button" aria-label="Закрыть">×</button>
    <h2 id="request-modal-title">Оставить заявку</h2>
    <p class="request-modal__subtitle">Мы перезвоним, уточним наличие, цвет и условия доставки.</p>
    <div class="request-modal__product" aria-live="polite">
      <strong data-request-product></strong>
      <span data-request-price></span>
    </div>
    <form data-request-form>
      <input type="hidden" name="productId">
      <label class="request-field">Ваше имя<input name="name" autocomplete="name" minlength="2" maxlength="80" required></label>
      <label class="request-field">Номер телефона<input name="phone" type="tel" autocomplete="tel" inputmode="tel" maxlength="30" placeholder="+7 700 000 00 00" required></label>
      <label class="request-honeypot" aria-hidden="true">Не заполнять<input name="website" tabindex="-1" autocomplete="off"></label>
      <label class="request-consent"><input name="consent" type="checkbox" required><span>Согласен на обработку имени и номера телефона для связи по этой заявке.</span></label>
      <button class="request-submit" type="submit">Отправить заявку</button>
      <p class="request-status" data-request-status role="status"></p>
    </form>
  </div>`;
document.body.append(dialog);

const form = dialog.querySelector("[data-request-form]");
const status = dialog.querySelector("[data-request-status]");
const submitButton = dialog.querySelector(".request-submit");
const productName = dialog.querySelector("[data-request-product]");
const productPrice = dialog.querySelector("[data-request-price]");

function currentPrice(productId) {
  const visiblePrice = document.querySelector(`[data-public-price="${productId}"]`)?.textContent?.trim();
  return visiblePrice || products[productId].fallbackPrice;
}

document.querySelectorAll("[data-request-product-id]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    const productId = button.dataset.requestProductId;
    const product = products[productId];
    if (!product) return;

    form.reset();
    form.elements.productId.value = productId;
    productName.textContent = product.name;
    productPrice.textContent = currentPrice(productId);
    status.textContent = "";
    delete status.dataset.kind;
    dialog.showModal();
    form.elements.name.focus();
  });
});

dialog.querySelector(".request-modal__close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const productId = String(data.get("productId") || "");
  const product = products[productId];
  const name = String(data.get("name") || "").trim().replace(/\s+/g, " ");
  const phone = String(data.get("phone") || "").trim();
  const phoneDigits = phone.replace(/\D/g, "");

  if (data.get("website")) {
    status.textContent = "Заявка отправлена.";
    status.dataset.kind = "success";
    return;
  }
  if (!product || name.length < 2 || phoneDigits.length < 10 || phoneDigits.length > 15) {
    status.textContent = "Проверьте имя и номер телефона.";
    return;
  }

  const lastRequestAt = Number(localStorage.getItem("conductorLastRequestAt") || 0);
  if (Date.now() - lastRequestAt < 60_000) {
    status.textContent = "Заявка уже отправлена. Пожалуйста, подождите минуту.";
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Отправляем…";
  status.textContent = "";
  delete status.dataset.kind;

  try {
    await addDoc(collection(db, "requests"), {
      customerName: name,
      phone,
      productId,
      productName: product.name,
      productPrice: currentPrice(productId),
      status: "new",
      managerComment: "",
      source: "conductor.kz",
      sourcePage: location.pathname.slice(0, 120),
      consent: true,
      formVersion: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedBy: null,
    });
    localStorage.setItem("conductorLastRequestAt", String(Date.now()));
    status.textContent = "Спасибо! Заявка отправлена. Мы скоро свяжемся с вами.";
    status.dataset.kind = "success";
    form.reset();
  } catch (error) {
    console.error("Request submission failed", error);
    status.textContent = "Не удалось отправить заявку. Попробуйте ещё раз чуть позже.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Отправить заявку";
  }
});
