import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { collection, getFirestore, onSnapshot } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const config = {
  apiKey: "AIzaSyDnH_Lp6JudyHw4bPbPptwnhRe6On23jCA",
  authDomain: "conductor-requests.firebaseapp.com",
  projectId: "conductor-requests",
  storageBucket: "conductor-requests.firebasestorage.app",
  messagingSenderId: "249591037242",
  appId: "1:249591037242:web:e534b60202dca9245ee403"
};

const MODELS = new Set(["DM30", "DM60", "DM90", "HOLI"]);
const KZT = new Intl.NumberFormat("ru-KZ", {
  style: "currency",
  currency: "KZT",
  maximumFractionDigits: 0
});

function updateStructuredData(prices) {
  for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data = JSON.parse(node.textContent);
      const graph = Array.isArray(data?.["@graph"]) ? data["@graph"] : [];
      const list = graph.find((item) => item?.["@type"] === "ItemList");
      const products = [
        ...graph.filter((item) => item?.["@type"] === "Product"),
        ...(list?.itemListElement || []).map((entry) => entry?.item).filter(Boolean)
      ];
      for (const product of products) {
        const modelId = product?.sku;
        const price = prices.get(modelId);
        if (!price || !product?.offers) continue;
        if (product.offers["@type"] === "AggregateOffer") product.offers.highPrice = String(price);
        else product.offers.price = String(price);
      }
      const faq = graph.find((item) => item?.["@type"] === "FAQPage");
      for (const entry of faq?.mainEntity || []) {
        if (entry?.name === "Сколько стоит цветной дым?"
          && ["DM30", "DM60", "DM90"].every((modelId) => prices.has(modelId))) {
          entry.acceptedAnswer.text = `DM30 стоит ${KZT.format(prices.get("DM30"))}, DM60 — ${KZT.format(prices.get("DM60"))}, DM90 — ${KZT.format(prices.get("DM90"))}.`;
        }
        if (entry?.name === "Сколько стоят краски Холи?" && prices.has("HOLI")) {
          entry.acceptedAnswer.text = `Розничная цена — ${KZT.format(prices.get("HOLI"))} за пакет. Для оптовых заказов действуют отдельные цены.`;
        }
      }
      node.textContent = JSON.stringify(data);
    } catch {
      // Keep the server-rendered fallback when a JSON-LD block is unrelated.
    }
  }
}

function updateSeoMetadata(prices) {
  const dm30 = prices.get("DM30");
  const dm60 = prices.get("DM60");
  const dm90 = prices.get("DM90");
  const holi = prices.get("HOLI");
  if (![dm30, dm60, dm90, holi].every(Boolean)) return;

  let description = "";
  let social = "";
  if (location.pathname.startsWith("/cvetnoy-dym")) {
    description = `Цветной дым в Казахстане: DM30 — ${KZT.format(dm30)}, DM60 — ${KZT.format(dm60)}, DM90 — ${KZT.format(dm90)}. Для фотосессий, праздников и мероприятий.`;
    social = `DM30, DM60 и DM90 — от ${KZT.format(Math.min(dm30, dm60, dm90))}. Заказ в Казахстане.`;
  } else if (location.pathname.startsWith("/kraski-holi")) {
    description = `Краски Холи в Казахстане: 8 цветов, розница ${KZT.format(holi)} и специальные оптовые цены. Заказ по Казахстану.`;
    social = `Краски Холи: 8 цветов, розничная цена ${KZT.format(holi)} и оптовые предложения.`;
  } else {
    description = `Купить цветной дым и краски Холи в Казахстане. DM30 — ${KZT.format(dm30)}, DM60 — ${KZT.format(dm60)}, DM90 — ${KZT.format(dm90)}, Холи — ${KZT.format(holi)}.`;
    social = `DM30, DM60, DM90 и краски Холи. Актуальные цены и заказ в Казахстане.`;
  }

  const metaDescription = document.querySelector('meta[name="description"]');
  const ogDescription = document.querySelector('meta[property="og:description"]');
  if (metaDescription) metaDescription.content = description;
  if (ogDescription) ogDescription.content = social;
}

function markPricesReady() {
  for (const node of document.querySelectorAll("[data-public-price]")) {
    node.dataset.publicPriceReady = "true";
  }
}

function loadPublicPrices() {
  if (window.__conductorCatalogPricesStarted) return;
  window.__conductorCatalogPricesStarted = true;
  const app = initializeApp(config, "conductor-public-prices");
  onSnapshot(collection(getFirestore(app), "catalog"), (snapshot) => {
    const prices = new Map();
    for (const item of snapshot.docs) {
      const modelId = item.id;
      const price = Math.trunc(Number(item.data().price));
      if (!MODELS.has(modelId) || !Number.isFinite(price) || price <= 0) continue;
      prices.set(modelId, price);
      for (const node of document.querySelectorAll(`[data-public-price="${modelId}"]`)) {
        node.textContent = KZT.format(price);
      }
    }
    updateStructuredData(prices);
    updateSeoMetadata(prices);
    markPricesReady();
  }, markPricesReady);
}

loadPublicPrices();
