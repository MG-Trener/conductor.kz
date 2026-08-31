import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getFirestore, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const PRODUCT_LABELS = {
  DM30: "Цветной дым DM30",
  DM60: "Цветной дым DM60",
  DM90: "Цветной дым DM90",
  HOLI: "Краски Холи"
};
const LOCAL_CONFIG_KEY = "conductor.firebaseConfig";
const SUBMIT_LOCK_KEY = "conductor.lastLeadAt";
let selectedProductId = null;
let openedAt = 0;
let db = null;

function getConfig() {
  const embedded = window.CONDUCTOR_FIREBASE_CONFIG;
  if (embedded?.apiKey && embedded?.authDomain && embedded?.projectId && embedded?.appId) return embedded;
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_CONFIG_KEY) || "null");
    if (saved?.apiKey && saved?.authDomain && saved?.projectId && saved?.appId) return saved;
  } catch {}
  return null;
}

function getDb() {
  if (db) return db;
  const config = getConfig();
  if (!config) throw new Error("Firebase ещё не подключён к форме сайта.");
  const app = getApps()[0] || initializeApp(config);
  db = getFirestore(app);
  return db;
}

function inferProduct(button) {
  const explicit = button.dataset.product;
  if (explicit && PRODUCT_LABELS[explicit]) return explicit;
  const cardId = button.closest("article")?.id?.toUpperCase();
  if (cardId && PRODUCT_LABELS[cardId]) return cardId;
  if (location.pathname.includes("kraski-holi")) return "HOLI";
  const text = `${button.textContent} ${button.getAttribute("href") || ""}`.toUpperCase();
  return ["DM30", "DM60", "DM90"].find((id) => text.includes(id)) || (text.includes("ХОЛИ") ? "HOLI" : null);
}

function ensureModal() {
  if (document.querySelector("#conductor-order-modal")) return;
  const root = document.createElement("div");
  root.id = "conductor-order-modal";
  root.className = "conductor-order-backdrop";
  root.innerHTML = `
    <div class="conductor-order-modal" role="dialog" aria-modal="true" aria-labelledby="conductor-order-title">
      <div class="conductor-order-head">
        <div>
          <div class="conductor-order-eyebrow">Заявка на товар</div>
          <h2 class="conductor-order-title" id="conductor-order-title">Оставьте контакты</h2>
          <p class="conductor-order-product" id="conductor-order-product"></p>
        </div>
        <button type="button" class="conductor-order-close" aria-label="Закрыть">×</button>
      </div>
      <form class="conductor-order-form" id="conductor-order-form">
        <label>Ваше имя<input name="customer" type="text" minlength="2" maxlength="80" autocomplete="name" required placeholder="Например, Айгуль"></label>
        <label>Телефон<input name="phone" type="tel" minlength="6" maxlength="24" autocomplete="tel" inputmode="tel" required placeholder="+7 7__ ___ __ __"></label>
        <label class="conductor-order-honeypot" aria-hidden="true">Сайт<input name="website" type="text" tabindex="-1" autocomplete="off"></label>
        <button class="conductor-order-submit" type="submit">Отправить заявку</button>
        <p class="conductor-order-error" aria-live="polite"></p>
        <p class="conductor-order-note">Нажимая кнопку, вы передаёте контактные данные CONDUCTOR.KZ для связи по выбранному товару.</p>
      </form>
      <div class="conductor-order-success" hidden>
        <div class="conductor-order-success-mark">✓</div>
        <h3>Заявка отправлена</h3>
        <p>Она уже появилась у менеджера. Мы свяжемся с вами по указанному телефону.</p>
      </div>
    </div>`;
  document.body.append(root);

  root.addEventListener("click", (event) => {
    if (event.target === root || event.target.closest(".conductor-order-close")) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && root.classList.contains("is-open")) closeModal();
  });
  root.querySelector("#conductor-order-form").addEventListener("submit", submitLead);
}

function openModal(productId) {
  selectedProductId = productId;
  openedAt = Date.now();
  ensureModal();
  const root = document.querySelector("#conductor-order-modal");
  root.querySelector("#conductor-order-product").textContent = PRODUCT_LABELS[productId] || productId;
  root.querySelector("#conductor-order-form").hidden = false;
  root.querySelector(".conductor-order-success").hidden = true;
  root.querySelector(".conductor-order-error").textContent = "";
  root.classList.add("is-open");
  document.documentElement.classList.add("conductor-order-lock");
  setTimeout(() => root.querySelector('input[name="customer"]').focus(), 120);
}

function closeModal() {
  const root = document.querySelector("#conductor-order-modal");
  if (!root) return;
  root.classList.remove("is-open");
  document.documentElement.classList.remove("conductor-order-lock");
}

function normalizePhone(value) {
  return value.trim().replace(/\s+/g, " ");
}

async function submitLead(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const errorNode = form.querySelector(".conductor-order-error");
  const submit = form.querySelector(".conductor-order-submit");
  errorNode.textContent = "";

  if (form.website.value) return;
  if (Date.now() - openedAt < 800) return;

  const last = Number(localStorage.getItem(SUBMIT_LOCK_KEY) || 0);
  if (last && Date.now() - last < 20000) {
    errorNode.textContent = "Заявка уже отправлялась недавно. Подождите несколько секунд.";
    return;
  }

  const customer = form.customer.value.trim();
  const phone = normalizePhone(form.phone.value);
  if (customer.length < 2 || phone.length < 6) {
    errorNode.textContent = "Проверьте имя и номер телефона.";
    return;
  }

  submit.disabled = true;
  try {
    const firestore = getDb();
    await addDoc(collection(firestore, "leads"), {
      customer,
      phone,
      productId: selectedProductId,
      source: "website",
      status: "new",
      page: location.pathname,
      createdAt: serverTimestamp()
    });
    localStorage.setItem(SUBMIT_LOCK_KEY, String(Date.now()));
    form.reset();
    form.hidden = true;
    form.parentElement.querySelector(".conductor-order-success").hidden = false;
  } catch (error) {
    console.error("CONDUCTOR lead submit failed", error);
    errorNode.textContent = getConfig()
      ? "Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам."
      : "Онлайн-заявка ещё не подключена к Firebase. Позвоните нам по номеру в шапке сайта.";
  } finally {
    submit.disabled = false;
  }
}

function bindButtons() {
  const buttons = [...document.querySelectorAll("a.order, a.cta")].filter((button) => {
    const product = inferProduct(button);
    return Boolean(product) && /заказать/i.test(button.textContent || "");
  });
  buttons.forEach((button) => {
    button.addEventListener("click", (event) => {
      const productId = inferProduct(button);
      if (!productId) return;
      event.preventDefault();
      openModal(productId);
    });
  });
}

ensureModal();
bindButtons();
