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
      node.textContent = JSON.stringify(data);
    } catch {
      // Keep the server-rendered fallback when a JSON-LD block is unrelated.
    }
  }
}

function markPricesReady() {
  for (const node of document.querySelectorAll("[data-public-price]")) {
    node.dataset.publicPriceReady = "true";
  }
}

function loadPublicPrices() {
  const app = initializeApp(config, "conductor-public-prices");
  onSnapshot(collection(getFirestore(app), "publicProducts"), (snapshot) => {
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
    markPricesReady();
  }, markPricesReady);
}

loadPublicPrices();
