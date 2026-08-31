import { getApps } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import {
  getFirestore,
  collection,
  onSnapshot,
  query,
  limit
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

let products = [];
let movements = [];

function initializedInventoryIds() {
  const ids = new Set();
  for (const movement of movements) {
    if (movement.inventoryId) ids.add(movement.inventoryId);
  }
  for (const product of products) {
    if (product.stockInitialized === true || Number(product.stock || 0) > 0) ids.add(product.id);
  }
  return ids;
}

function refreshLowStockMetric() {
  const metric = document.getElementById("metric-low");
  if (!metric) return;

  const initialized = initializedInventoryIds();
  const low = products.filter((product) =>
    product.active !== false &&
    !product.legacyUnassigned &&
    !product.modelOnly &&
    initialized.has(product.id) &&
    Number(product.stock || 0) <= Number(product.lowStock || 0)
  );

  metric.textContent = String(low.length);
  metric.title = "Учитываются только позиции, по которым уже вносили фактический остаток";

  document.querySelectorAll(".inventory-overview-card").forEach((card) => {
    const modelId = card.querySelector(".overview-model-head b")?.textContent?.trim();
    if (!modelId) return;

    card.querySelectorAll(".overview-color").forEach((row) => {
      if (row.classList.contains("warning")) return;
      const colorName = row.querySelector("span")?.textContent?.trim();
      const value = row.querySelector("b");
      const product = products.find((item) => item.modelId === modelId && item.colorName === colorName);
      if (!product || !value) return;

      const isInitialized = initialized.has(product.id);
      value.textContent = isInitialized ? String(Number(product.stock || 0)) : "—";
      value.classList.toggle("low", isInitialized && Number(product.stock || 0) <= Number(product.lowStock || 0));
      if (!isInitialized) value.title = "Остаток ещё не внесён";
    });
  });
}

async function start() {
  let attempts = 0;
  while (!getApps().length && attempts < 100) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    attempts += 1;
  }
  if (!getApps().length) return;

  const db = getFirestore(getApps()[0]);
  onSnapshot(collection(db, "products"), (snap) => {
    products = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    refreshLowStockMetric();
    setTimeout(refreshLowStockMetric, 50);
  });

  onSnapshot(query(collection(db, "stockMovements"), limit(500)), (snap) => {
    movements = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    refreshLowStockMetric();
    setTimeout(refreshLowStockMetric, 50);
  });

  const observer = new MutationObserver(() => refreshLowStockMetric());
  observer.observe(document.body, { childList: true, subtree: true });
}

start().catch(() => {});
