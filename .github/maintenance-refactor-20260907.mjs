import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const write = (file, content) => fs.writeFileSync(path.join(root, file), content);
const mustReplace = (text, search, replacement, label) => {
  const next = typeof search === "string" ? text.replace(search, replacement) : text.replace(search, replacement);
  if (next === text) throw new Error(`Patch failed: ${label}`);
  return next;
};
const replaceBlock = (text, startMarker, endMarker, replacement, label) => {
  const start = text.indexOf(startMarker);
  const end = text.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0 || end <= start) throw new Error(`Block patch failed: ${label}`);
  return text.slice(0, start) + replacement + text.slice(end);
};

const catalogCore = `export const LEGACY_CATALOG_SEED = Object.freeze([
  {
    id: "DM30", name: "Цветной дым DM30", price: 2500, lowStock: 2, sort: 10,
    variants: [
      ["BLUE", "Синий", "#258cff"], ["YELLOW", "Жёлтый", "#ffd42a"],
      ["RED", "Красный", "#ff4545"], ["PURPLE", "Фиолетовый", "#9b59ff"],
      ["TURQUOISE", "Бирюзовый", "#27d3c3"]
    ]
  },
  {
    id: "DM60", name: "Цветной дым DM60", price: 3000, lowStock: 2, sort: 20,
    variants: [
      ["WHITE", "Белый", "#f4f5f7"], ["BLACK", "Чёрный", "#15171d"],
      ["YELLOW", "Жёлтый", "#ffd42a"], ["BLUE", "Синий", "#258cff"],
      ["PINK", "Розовый", "#ff6bab"], ["GREEN", "Зелёный", "#42c66b"],
      ["PURPLE", "Фиолетовый", "#9b59ff"], ["RED", "Красный", "#ff4545"]
    ]
  },
  {
    id: "DM60G", name: "Гендерный дым DM60G", price: 3500, lowStock: 2, sort: 25,
    variants: [["BLUE", "Синий", "#258cff"], ["PINK", "Розовый", "#ff6bab"]]
  },
  {
    id: "DM60R1G", name: "DM60R1G (интрига)", price: 4000, lowStock: 2, sort: 27,
    variants: [["BLUE", "Синий", "#258cff"], ["PINK", "Розовый", "#ff6bab"]]
  },
  {
    id: "DM90", name: "Цветной дым DM90", price: 3500, lowStock: 2, sort: 30,
    variants: [
      ["ORANGE", "Оранжевый", "#ff8b2d"], ["PURPLE", "Фиолетовый", "#9b59ff"],
      ["TURQUOISE", "Бирюзовый", "#27d3c3"], ["YELLOW", "Жёлтый", "#ffd42a"],
      ["PISTACHIO", "Фисташковый", "#9ecb68"], ["RED", "Красный", "#ff4545"]
    ]
  },
  {
    id: "HOLI", name: "Краски Холи", price: 1000, lowStock: 10, sort: 40,
    variants: [
      ["SCARLET", "Алый", "#ff3030"], ["RASPBERRY", "Малиновый", "#d92b70"],
      ["YELLOW", "Жёлтый", "#ffd42a"], ["BLUE", "Синий", "#258cff"],
      ["LIME", "Салатовый", "#8bdc45"], ["PURPLE", "Фиолетовый", "#9b59ff"],
      ["ORANGE", "Оранжевый", "#ff8b2d"], ["TURQUOISE", "Бирюзовый", "#27d3c3"]
    ]
  }
]);

export const LEGACY_VARIANT_DEFAULTS = Object.freeze(LEGACY_CATALOG_SEED.flatMap((model) =>
  model.variants.map(([key, colorName, colorHex], index) => ({
    id: \`${'${model.id}'}_${'${key}'}\`,
    modelId: model.id,
    colorId: key.toLowerCase(),
    colorName,
    colorHex,
    name: \`${'${model.id}'} · ${'${colorName}'}\`,
    stock: 0,
    lowStock: model.lowStock,
    sort: model.sort + index + 1
  }))
));

function productSortForModel(products, modelId) {
  const sorts = products
    .filter((item) => item.modelId === modelId && item.active !== false && !item.legacyUnassigned)
    .map((item) => Number(item.sort))
    .filter(Number.isFinite);
  return sorts.length ? Math.min(...sorts) : Number.MAX_SAFE_INTEGER;
}

export function runtimeModels(catalog = [], products = []) {
  const rows = catalog.filter((item) => {
    const id = String(item?.id || item?.modelId || "");
    return id && typeof item?.name === "string" && Number(item?.price) > 0;
  });
  if (!rows.length) return LEGACY_CATALOG_SEED;

  return rows.map((item) => {
    const id = String(item.id || item.modelId);
    const legacy = LEGACY_CATALOG_SEED.find((entry) => entry.id === id);
    const derivedSort = productSortForModel(products, id);
    return {
      id,
      name: item.name || legacy?.name || id,
      price: Number(item.price || 0),
      lowStock: legacy?.lowStock || 0,
      sort: Number.isFinite(derivedSort) && derivedSort !== Number.MAX_SAFE_INTEGER
        ? derivedSort
        : Number(legacy?.sort ?? Number.MAX_SAFE_INTEGER)
    };
  }).sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0) || a.id.localeCompare(b.id));
}
`;
write("mobile/catalog-core.js", catalogCore);

const catalogService = `import {
  collection, doc, getDocs, runTransaction, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { LEGACY_CATALOG_SEED, LEGACY_VARIANT_DEFAULTS } from "./catalog-core.js";

export function createCatalogService({ state, currentEmployeeName }) {
  async function migrateLegacyModel(model) {
    const legacyRef = doc(state.db, "products", model.id);
    const unassignedRef = doc(state.db, "products", \`${'${model.id}'}_UNASSIGNED\`);
    const employee = currentEmployeeName();
    const audit = {
      updatedAt: serverTimestamp(), updatedBy: state.user.uid, updatedByName: employee
    };

    await runTransaction(state.db, async (tx) => {
      const legacySnap = await tx.get(legacyRef);
      const unassignedSnap = await tx.get(unassignedRef);
      if (!legacySnap.exists() && !unassignedSnap.exists()) return;

      const legacy = legacySnap.exists() ? legacySnap.data() : null;
      const unassigned = unassignedSnap.exists() ? unassignedSnap.data() : null;
      const legacyStock = Number(legacy?.stock || 0);
      const currentStock = Number(unassigned?.stock || 0);
      const nextStock = currentStock + legacyStock;
      const creationAudit = unassignedSnap.exists() ? {} : {
        createdAt: serverTimestamp(), createdBy: state.user.uid, createdByName: employee
      };
      tx.set(unassignedRef, {
        modelId: model.id,
        name: \`${'${model.id}'} · Нераспределено\`,
        stock: nextStock,
        lowStock: 0,
        sort: model.sort,
        legacyUnassigned: true,
        active: nextStock > 0,
        ...creationAudit,
        ...audit
      }, { merge: true });

      if (legacySnap.exists()) {
        tx.set(legacyRef, {
          active: false, stock: 0, modelOnly: true, variantMigrationV2: true, ...audit
        }, { merge: true });
      }
    });
  }

  async function ensureProducts() {
    const [productSnap, catalogSnap] = await Promise.all([
      getDocs(collection(state.db, "products")),
      getDocs(collection(state.db, "catalog"))
    ]);
    const existingProducts = productSnap.docs.map((item) => ({ id: item.id, ...item.data() }));
    const existingById = new Map(existingProducts.map((item) => [item.id, item]));
    const catalogById = new Map(catalogSnap.docs.map((item) => [item.id, { id: item.id, ...item.data() }]));
    const employee = currentEmployeeName();

    // Legacy seed is bootstrap-only. Runtime catalogue and all sale prices are read from Firestore.
    for (const model of LEGACY_CATALOG_SEED) {
      if (catalogById.has(model.id)) continue;
      const legacyPrice = existingProducts.find((item) => item.modelId === model.id && Number(item.price) > 0)?.price;
      await setDoc(doc(state.db, "catalog", model.id), {
        modelId: model.id,
        name: model.name,
        price: Math.trunc(Number(legacyPrice || model.price)),
        updatedAt: serverTimestamp(),
        updatedBy: state.user.uid,
        updatedByName: employee
      });
    }

    for (const item of LEGACY_VARIANT_DEFAULTS) {
      if (existingById.has(item.id)) continue;
      await setDoc(doc(state.db, "products", item.id), {
        id: item.id,
        modelId: item.modelId,
        colorId: item.colorId,
        colorName: item.colorName,
        colorHex: item.colorHex,
        name: item.name,
        stock: item.stock,
        lowStock: item.lowStock,
        sort: item.sort,
        active: true,
        createdAt: serverTimestamp(),
        createdBy: state.user.uid,
        createdByName: employee,
        updatedAt: serverTimestamp(),
        updatedBy: state.user.uid,
        updatedByName: employee
      });
    }

    for (const model of LEGACY_CATALOG_SEED) await migrateLegacyModel(model);
  }

  return Object.freeze({ ensureProducts });
}
`;
write("mobile/catalog-service.js", catalogService);

const warehouseDomain = `import {
  collection, doc, getDoc, getDocs, runTransaction, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

export function createWarehouseDomain({ state, currentEmployeeName }) {
  async function requestSalePush(orderId) {
    const endpoint = String(window.CONDUCTOR_PUSH_ENDPOINT || "").trim();
    if (!endpoint || !state.user) return { configured: false, delivered: false };
    const idToken = await state.user.getIdToken();
    let lastError = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { Authorization: \`Bearer ${'${idToken}'}\`, "Content-Type": "application/json" },
          body: JSON.stringify({ orderId })
        });
        if (!response.ok) throw new Error(\`HTTP ${'${response.status}'}\`);
        return { configured: true, delivered: true };
      } catch (error) { lastError = error; }
    }
    console.error("Sale push request failed", lastError);
    return { configured: true, delivered: false };
  }

  async function ensureCashBalance() {
    const cashRef = doc(state.db, "finance", "cash");
    const current = await getDoc(cashRef);
    if (current.exists()) return Number(current.data().balance || 0);

    const [ordersSnap, withdrawalsSnap] = await Promise.all([
      getDocs(collection(state.db, "orders")), getDocs(collection(state.db, "cashWithdrawals"))
    ]);
    const revenue = ordersSnap.docs.reduce((sum, item) => item.data().status === "cancelled" ? sum : sum + Number(item.data().total || 0), 0);
    const withdrawn = withdrawalsSnap.docs.reduce((sum, item) => sum + Number(item.data().amount || 0), 0);
    const initialBalance = revenue - withdrawn;
    const employee = currentEmployeeName();

    await runTransaction(state.db, async (tx) => {
      const snap = await tx.get(cashRef);
      if (snap.exists()) return;
      tx.set(cashRef, {
        balance: initialBalance,
        initializedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: state.user.uid,
        updatedByEmail: state.user.email || "",
        updatedByName: employee
      });
    });
    return initialBalance;
  }

  async function commitSale({ items, note = "", total, baseTotal = total, pricing = null }) {
    if (!state.user || !state.db) throw new Error("Нет активной авторизации.");
    if (!Array.isArray(items) || !items.length) throw new Error("Укажите количество хотя бы одного товара.");
    if (!Number.isFinite(total) || total <= 0) throw new Error("Итоговая сумма должна быть больше нуля.");

    await ensureCashBalance();
    const employee = currentEmployeeName();
    const productRefs = items.map((item) => doc(state.db, "products", item.inventoryId));
    const movementRefs = items.map(() => doc(collection(state.db, "stockMovements")));
    const saleRef = doc(collection(state.db, "orders"));
    const cashRef = doc(state.db, "finance", "cash");

    await runTransaction(state.db, async (tx) => {
      const snaps = [];
      for (const ref of productRefs) snaps.push(await tx.get(ref));
      const cashSnap = await tx.get(cashRef);
      if (!cashSnap.exists()) throw new Error("Баланс кассы ещё не создан. Повторите сохранение.");

      snaps.forEach((snap, index) => {
        if (!snap.exists()) throw new Error(\`${'${items[index].name}'}: товар не найден\`);
        const stock = Number(snap.data().stock || 0);
        if (stock < items[index].qty) throw new Error(\`${'${items[index].name}'}: на складе только ${'${stock}'}\`);
      });

      snaps.forEach((snap, index) => {
        const data = snap.data();
        const before = Number(data.stock || 0);
        const after = before - items[index].qty;
        tx.update(productRefs[index], {
          stock: after, updatedAt: serverTimestamp(), updatedBy: state.user.uid, updatedByName: employee
        });
        tx.set(movementRefs[index], {
          type: "sale",
          inventoryId: items[index].inventoryId,
          productId: items[index].productId,
          productName: items[index].name,
          colorId: items[index].colorId,
          colorName: items[index].colorName,
          qtyDelta: -items[index].qty,
          before,
          after,
          unitCost: 0,
          totalCost: 0,
          salePrice: items[index].price,
          orderId: saleRef.id,
          reason: note,
          createdAt: serverTimestamp(),
          createdAtClient: new Date().toISOString(),
          createdBy: state.user.uid,
          createdByEmail: state.user.email || "",
          createdByName: employee
        });
      });

      tx.set(saleRef, {
        items,
        total,
        ...(pricing ? { baseTotal, pricing } : {}),
        note,
        status: "done",
        source: "stock-app",
        createdAt: serverTimestamp(),
        createdAtClient: new Date().toISOString(),
        createdBy: state.user.uid,
        createdByEmail: state.user.email || "",
        createdByName: employee
      });
      tx.update(cashRef, {
        balance: Number(cashSnap.data().balance || 0) + total,
        updatedAt: serverTimestamp(),
        updatedBy: state.user.uid,
        updatedByEmail: state.user.email || "",
        updatedByName: employee
      });
    });

    const pushResult = await requestSalePush(saleRef.id);
    return { saleId: saleRef.id, employee, pushResult };
  }

  function inventoryIdForSaleItem(item) {
    if (item.inventoryId) return item.inventoryId;
    const productId = String(item.productId || "");
    if (!productId) return productId;
    return productId.includes("_") ? productId : \`${'${productId}'}_UNASSIGNED\`;
  }

  async function cancelSale(saleId) {
    const employee = currentEmployeeName();
    const saleRef = doc(state.db, "orders", saleId);
    await ensureCashBalance();
    const cashRef = doc(state.db, "finance", "cash");
    await runTransaction(state.db, async (tx) => {
      const saleSnap = await tx.get(saleRef);
      if (!saleSnap.exists()) throw new Error("Продажа не найдена");
      const sale = saleSnap.data();
      if (sale.status === "cancelled") throw new Error("Продажа уже отменена");
      const items = sale.items || [];
      if (!items.length) throw new Error("В продаже нет товарных позиций");

      const inventoryIds = items.map(inventoryIdForSaleItem);
      const productRefs = inventoryIds.map((id) => doc(state.db, "products", id));
      const productSnaps = [];
      for (const ref of productRefs) productSnaps.push(await tx.get(ref));
      const cashSnap = await tx.get(cashRef);
      if (!cashSnap.exists()) throw new Error("Баланс кассы ещё не создан. Повторите отмену.");
      const movementRefs = items.map(() => doc(collection(state.db, "stockMovements")));

      productSnaps.forEach((snap, index) => {
        if (!snap.exists()) throw new Error(\`${'${items[index].name || items[index].productId}'}: товар не найден\`);
      });
      productSnaps.forEach((snap, index) => {
        const data = snap.data();
        const before = Number(data.stock || 0);
        const qty = Number(items[index].qty || 0);
        const after = before + qty;
        const update = { stock: after, updatedAt: serverTimestamp(), updatedBy: state.user.uid, updatedByName: employee };
        if (data.legacyUnassigned) update.active = true;
        tx.update(productRefs[index], update);
        tx.set(movementRefs[index], {
          type: "sale_return",
          inventoryId: inventoryIds[index],
          productId: data.modelId || items[index].productId,
          productName: data.name || items[index].name || items[index].productId,
          colorId: data.colorId || items[index].colorId || "",
          colorName: data.colorName || items[index].colorName || "",
          qtyDelta: qty,
          before,
          after,
          unitCost: 0,
          totalCost: 0,
          orderId: saleId,
          reason: "Отмена продажи",
          createdAt: serverTimestamp(),
          createdAtClient: new Date().toISOString(),
          createdBy: state.user.uid,
          createdByEmail: state.user.email || "",
          createdByName: employee
        });
      });

      tx.update(saleRef, {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
        cancelledBy: state.user.uid,
        cancelledByEmail: state.user.email || "",
        cancelledByName: employee
      });
      tx.update(cashRef, {
        balance: Number(cashSnap.data().balance || 0) - Number(sale.total || 0),
        updatedAt: serverTimestamp(),
        updatedBy: state.user.uid,
        updatedByEmail: state.user.email || "",
        updatedByName: employee
      });
    });
  }

  return Object.freeze({ ensureCashBalance, commitSale, cancelSale });
}
`;
write("mobile/warehouse-domain.js", warehouseDomain);

let app = read("mobile/app.js");
app = mustReplace(
  app,
  '} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";\n\nconst $',
  '} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";\nimport { LEGACY_CATALOG_SEED, LEGACY_VARIANT_DEFAULTS, runtimeModels } from "./catalog-core.js";\nimport { createCatalogService } from "./catalog-service.js";\nimport { createWarehouseDomain } from "./warehouse-domain.js";\n\nconst $',
  "app imports"
);
app = replaceBlock(app, "const MODELS = [", "const movementLabels", "const MODELS = LEGACY_CATALOG_SEED;\nconst defaults = LEGACY_VARIANT_DEFAULTS;\n\n", "legacy catalogue extraction");
app = replaceBlock(app, "async function requestSalePush", "function toast", "", "push extraction");
app = mustReplace(
  app,
  'function currentEmployeeName() {\n  return employeeNameFromEmail(state.user?.email || "");\n}\n\n',
  'function currentEmployeeName() {\n  return employeeNameFromEmail(state.user?.email || "");\n}\n\nconst catalogService = createCatalogService({ state, currentEmployeeName });\nconst warehouseDomain = createWarehouseDomain({ state, currentEmployeeName });\nconst ensureProducts = () => catalogService.ensureProducts();\nconst ensureCashBalance = () => warehouseDomain.ensureCashBalance();\nconst commitSale = (payload) => warehouseDomain.commitSale(payload);\nconst cancelSale = (saleId) => warehouseDomain.cancelSale(saleId);\nfunction models() { return runtimeModels(state.catalog, state.products); }\n\n',
  "service wiring"
);
app = replaceBlock(app, "function modelById", "function selectedModelQuantity", `function modelById(modelId) { return models().find((model) => model.id === modelId); }
function variantDefaults(modelId) { return defaults.filter((item) => item.modelId === modelId); }
function modelVariants(modelId) {
  return state.products
    .filter((item) => item.modelId === modelId && !item.legacyUnassigned && item.active !== false && !item.modelOnly)
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0));
}
function modelSalePrice(modelId) {
  const catalogPrice = Number(state.catalog.find((item) => item.id === modelId)?.price || 0);
  if (catalogPrice > 0) return catalogPrice;
  return Number(modelById(modelId)?.price || 0);
}
`, "runtime catalogue helpers");
app = replaceBlock(app, "async function ensureCashBalance()", "function stopRealtime", "", "catalog/domain extraction");
app = replaceBlock(app, "async function commitSale", "function finalizeSale", "", "sale commit extraction");
app = replaceBlock(app, "function inventoryIdForSaleItem", "function initializedInventoryIds", "", "sale cancellation extraction");
app = app.replaceAll("for (const model of MODELS)", "for (const model of models())");
app = app.replaceAll("root.innerHTML = MODELS.map", "root.innerHTML = models().map");
app = app.replaceAll("MODELS.some((model)", "models().some((model)");
app = app.replaceAll("String(MODELS.length)", "String(models().length)");
app = app.replaceAll("$(\"#stock-list\").innerHTML = MODELS.map", "$(\"#stock-list\").innerHTML = models().map");
app = app.replaceAll("${model.variants.length} цветов", "${modelVariants(model.id).length} цветов");
app = app.replace(/\n\s*\|\| product\.modelId === "DM60R1G"/g, "");
if (/catalogPrice === 3000|modelId === "DM60R1G"/.test(app.slice(app.indexOf("function modelSalePrice"), app.indexOf("function selectedModelQuantity")))) {
  throw new Error("hardcoded price correction survived");
}
write("mobile/app.js", app);

let publicPrices = read("assets/public-prices.js");
publicPrices = publicPrices.replace('const MODELS = new Set(["DM30", "DM60", "DM60G", "DM60R1G", "DM90", "HOLI"]);\n', "");
publicPrices = mustReplace(
  publicPrices,
  '      if (!MODELS.has(modelId) || !Number.isFinite(storedPrice) || storedPrice <= 0) continue;\n      const price = modelId === "DM60G" && storedPrice === 3000 ? 3500\n        : modelId === "DM60R1G" && storedPrice === 3000 ? 4000\n        : storedPrice;\n      prices.set(modelId, price);\n      for (const node of document.querySelectorAll(`[data-public-price="${modelId}"]`)) {\n        node.textContent = KZT.format(price);\n',
  '      if (!/^[A-Z0-9]{2,24}$/.test(modelId) || !Number.isFinite(storedPrice) || storedPrice <= 0) continue;\n      prices.set(modelId, storedPrice);\n      for (const node of document.querySelectorAll(`[data-public-price="${modelId}"]`)) {\n        node.textContent = KZT.format(storedPrice);\n',
  "public price correction removal"
);
write("assets/public-prices.js", publicPrices);

let rules = read("firestore.rules");
rules = mustReplace(rules, `    function isModel(modelId) {
      return modelId in ['DM30', 'DM60', 'DM60G', 'DM60R1G', 'DM90', 'HOLI'];
    }

    function validProductId(productId) {
      return productId.matches('^(DM30|DM60|DM60G|DM60R1G|DM90|HOLI)_[A-Z0-9]+$');
    }

    function validProductState(data, productId) {
      return data.keys().hasAll(['name', 'stock'])
        && isModel(data.get('modelId', productId))
`, `    function validModelId(modelId) {
      return modelId is string && modelId.matches('^[A-Z0-9]{2,24}$');
    }

    function modelExists(modelId) {
      return validModelId(modelId)
        && exists(/databases/$(database)/documents/catalog/$(modelId));
    }

    function validProductId(productId, modelId) {
      return validModelId(modelId)
        && productId.matches('^' + modelId + '_[A-Z0-9]+$');
    }

    function validProductState(data) {
      return data.keys().hasAll(['modelId', 'name', 'stock'])
        && modelExists(data.modelId)
`, "dynamic model rules");
rules = rules.replaceAll("validProductId(productId)\n        && validProductState(request.resource.data, productId)", "validProductId(productId, request.resource.data.modelId)\n        && validProductState(request.resource.data)");
rules = rules.replaceAll("validProductState(request.resource.data, productId)", "validProductState(request.resource.data)");
rules = rules.replace("&& isModel(modelId)\n", "&& validModelId(modelId)\n");
rules = rules.replace("&& isModel(data.productId)\n", "&& modelExists(data.productId)\n");
if (/function isModel|DM30\|DM60|DM60R1G\|DM90/.test(rules)) throw new Error("static model allow-list survived in Firestore rules");
write("firestore.rules", rules);

let mobileIndex = read("mobile/index.html").replace(/\?v=\d+/g, "");
mobileIndex = mobileIndex
  .replaceAll("warehouse-splash-clean.png", "warehouse-splash-clean.webp")
  .replaceAll("conductor-vintage-title.png", "conductor-vintage-title.webp")
  .replace('href="./warehouse-splash-clean.webp" as="image" type="image/png"', 'href="./warehouse-splash-clean.webp" as="image" type="image/webp"')
  .replace('href="./conductor-vintage-title.webp" as="image" type="image/png"', 'href="./conductor-vintage-title.webp" as="image" type="image/webp"');
write("mobile/index.html", mobileIndex);

let splashCss = read("mobile/splash.css").replaceAll("warehouse-splash-clean.png?v=1", "warehouse-splash-clean.webp").replaceAll("warehouse-splash-clean.png", "warehouse-splash-clean.webp");
write("mobile/splash.css", splashCss);

let bootstrap = read("mobile/bootstrap.js").replace(/\?v=\d+/g, "");
bootstrap = mustReplace(
  bootstrap,
  '    navigator.serviceWorker.register("./sw.js").catch((error) => console.warn("Service Worker registration failed", error));',
  '    navigator.serviceWorker.register("./sw.js")\n      .then((registration) => registration.update())\n      .catch((error) => console.warn("Service Worker registration failed", error));',
  "service worker update"
);
write("mobile/bootstrap.js", bootstrap);

const sw = `const CACHE = "conductor-mobile-shell";
const APP_SHELL = [
  "./", "./index.html", "./styles.css", "./warehouse.css", "./header-mobile.css", "./splash.css", "./release.css",
  "./app.js", "./catalog-core.js", "./catalog-service.js", "./warehouse-domain.js", "./bootstrap.js", "./core-ui.js",
  "./version-history.js", "./version-history-archive.js", "./startup-guard.js", "./firebase-config.js", "./push-config.js",
  "./app-update.js", "./analytics.js", "./sales-history.js", "./warehouse-ui.js", "./push-notifications.js",
  "./firestore-error-help.js", "./ui-sounds.js", "./manifest.webmanifest", "./icon.svg",
  "./warehouse-splash-clean.webp", "./conductor-vintage-title.webp"
];

self.addEventListener("install", (event) => event.waitUntil(
  caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
));

self.addEventListener("activate", (event) => event.waitUntil(
  caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key.startsWith("conductor-mobile-") && key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim())
));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request, { cache: "no-store" }).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put("./index.html", response.clone()));
      return response;
    }).catch(() => caches.match("./index.html").then((cached) => cached || caches.match("./"))));
    return;
  }

  event.respondWith(fetch(request, { cache: "no-store" }).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  }).catch(() => caches.match(request)));
});
`;
write("mobile/sw.js", sw);

let versionHistory = read("mobile/version-history.js");
versionHistory = versionHistory.replace("const VERSIONS = [\n", `const VERSIONS = [
  {
    version: "1.1.1",
    date: "07.09.2026",
    changes: [
      "Каталог Firestore стал рабочим источником моделей и цен: убраны корректирующие исключения DM60G/DM60R1G, новые catalog + products позиции автоматически появляются в складе и продажах.",
      "Большой app.js разделён на catalog-core, catalog-service и warehouse-domain; транзакции продаж/отмен и инициализация каталога вынесены из UI-ядра.",
      "PWA больше не требует ручных ?v= и номера кэша: используется network-first обновление, service worker сам проверяет новую версию, активные splash-ресурсы переведены в WebP.",
      "Android-сборка переведена на зафиксированный package-lock + npm ci; усилены исключения секретов и служебных файлов."
    ]
  },
`);
versionHistory = versionHistory.replaceAll("Актуальная версия: 1.1.0", "Актуальная версия: 1.1.1");
versionHistory = versionHistory.replace("import(\"./version-history-archive.js?v=1\")", "import(\"./version-history-archive.js\")");
write("mobile/version-history.js", versionHistory);

const manifest = JSON.parse(read("mobile/app-version.json"));
manifest.version = "1.1.1";
manifest.versionCode = 10101;
manifest.notes = "1.1.1: каталог Firestore стал единым runtime-источником моделей и цен без специальных корректировок DM60G/DM60R1G. app.js разделён на отдельные catalog/domain модули. PWA избавлен от ручных ?v= и версий кэша, splash-ресурсы переведены в WebP. Android-зависимости зафиксированы package-lock и устанавливаются через npm ci; усилен .gitignore.";
write("mobile/app-version.json", JSON.stringify(manifest, null, 2) + "\n");

const androidPkg = JSON.parse(read("android-app/package.json"));
androidPkg.version = "1.1.1";
write("android-app/package.json", JSON.stringify(androidPkg, null, 2) + "\n");

let buildWorkflow = read(".github/workflows/build-android-apk.yml");
buildWorkflow = buildWorkflow.replace("          node --check mobile/app.js\n", "          node --check mobile/app.js\n          node --check mobile/catalog-core.js\n          node --check mobile/catalog-service.js\n          node --check mobile/warehouse-domain.js\n");
buildWorkflow = buildWorkflow.replace("      - name: Install Capacitor dependencies\n        working-directory: android-app\n        run: npm install", "      - name: Install locked Capacitor dependencies\n        working-directory: android-app\n        run: npm ci");
buildWorkflow = buildWorkflow.replace("      - name: Upload generated Android dependency lock", "      - name: Archive Android dependency lock");
write(".github/workflows/build-android-apk.yml", buildWorkflow);

write(".gitignore", `node_modules/
.firebase/
*.log
.env
.env.*
!.env.example
.dev.vars
*.jks
*.keystore
google-services.json
service-account*.json
firebase-admin*.json
*.apk
*.aab
dist/
.DS_Store
`);

// Firestore tests: catalogue-backed model IDs instead of a code allow-list.
let rulesTests = read("tests/firestore.rules.test.mjs");
rulesTests = mustReplace(
  rulesTests,
  '    await setDoc(doc(context.firestore(), "products", "DM30_BLUE"), product);',
  '    await setDoc(doc(context.firestore(), "catalog", "DM30"), { modelId: "DM30", name: "Цветной дым DM30", price: 2500, updatedAt: new Date("2026-01-01T00:00:00Z"), updatedBy: staffUid, updatedByName: "Сотрудник" });\n    await setDoc(doc(context.firestore(), "products", "DM30_BLUE"), product);',
  "rules test catalog seed"
);
const dynamicModelTest = `

test("staff can add a new catalogue-backed model without changing Firestore rules", async () => {
  const db = staffDb();
  await assertSucceeds(setDoc(doc(db, "catalog", "NEW75"), {
    modelId: "NEW75",
    name: "Новая модель NEW75",
    price: 4200,
    updatedAt: serverTimestamp(),
    updatedBy: staffUid,
    updatedByName: "Сотрудник"
  }));
  await assertSucceeds(setDoc(doc(db, "products", "NEW75_BLUE"), {
    ...product,
    id: "NEW75_BLUE",
    modelId: "NEW75",
    name: "NEW75 · Синий",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  }));
});
`;
rulesTests = rulesTests.replace('\ntest("receipt transaction updates stock without tracking purchase cost"', dynamicModelTest + '\ntest("receipt transaction updates stock without tracking purchase cost"');
write("tests/firestore.rules.test.mjs", rulesTests);

// Rewrite architecture tests around the extracted modules and automatic PWA freshness.
let architecture = read("tests/mobile-architecture.test.mjs");
architecture = architecture.replace(
  '  const [app, bootstrap, ui, analytics, sales] = await Promise.all([\n    read("mobile/app.js"), read("mobile/bootstrap.js"), read("mobile/warehouse-ui.js"), read("mobile/analytics.js"), read("mobile/sales-history.js")\n  ]);\n  assert.match(app, /window\\.CONDUCTOR_APP_API/);\n  assert.match(app, /function modelSalePrice/);\n  assert.match(app, /async function commitSale/);\n  assert.equal((app.match(/tx\\.set\\(saleRef/g) || []).length, 1, "sale write must exist once in the core app");',
  '  const [app, domain, bootstrap, ui, analytics, sales] = await Promise.all([\n    read("mobile/app.js"), read("mobile/warehouse-domain.js"), read("mobile/bootstrap.js"), read("mobile/warehouse-ui.js"), read("mobile/analytics.js"), read("mobile/sales-history.js")\n  ]);\n  assert.match(app, /window\\.CONDUCTOR_APP_API/);\n  assert.match(app, /function modelSalePrice/);\n  assert.match(domain, /async function commitSale/);\n  assert.equal((domain.match(/tx\\.set\\(saleRef/g) || []).length, 1, "sale write must exist once in the domain module");'
);
architecture = replaceBlock(architecture, 'test("DM60R1G variants, model price and inventory save live in the core app"', 'test("sale UI uses the exact items and prices calculated by the core"', `test("legacy catalogue seeds DM60R1G but runtime price has no model-specific correction", async () => {
  const [app, catalogCore, publicPrices] = await Promise.all([
    read("mobile/app.js"), read("mobile/catalog-core.js"), read("assets/public-prices.js")
  ]);
  assert.match(catalogCore, /id: "DM60R1G", name: "DM60R1G \\(интрига\\)", price: 4000/);
  assert.match(catalogCore, /\\["BLUE", "Синий", "#258cff"\\]/);
  assert.match(catalogCore, /\\["PINK", "Розовый", "#ff6bab"\\]/);
  assert.doesNotMatch(app, /catalogPrice === 3000/);
  assert.doesNotMatch(publicPrices, /storedPrice === 3000/);
  assert.match(app, /id="model-sale-price"/);
});

`, "architecture DM60R1G test");
architecture = architecture.replace('for (const name of ["app.js?v=109", "bootstrap.js?v=1", "core-ui.js?v=1", "version-history.js?v=1", "startup-guard.js?v=1", "release.css?v=1"])', 'for (const name of ["app.js", "bootstrap.js", "core-ui.js", "version-history.js", "startup-guard.js", "release.css"])');
architecture = architecture.replace('  for (const file of ["app.js", "bootstrap.js", "core-ui.js", "version-history.js", "version-history-archive.js", "startup-guard.js", "app-update.js", "analytics.js", "sales-history.js", "warehouse-ui.js", "push-notifications.js", "firestore-error-help.js", "ui-sounds.js"]) {', '  for (const file of ["app.js", "catalog-core.js", "catalog-service.js", "warehouse-domain.js", "bootstrap.js", "core-ui.js", "version-history.js", "version-history-archive.js", "startup-guard.js", "app-update.js", "analytics.js", "sales-history.js", "warehouse-ui.js", "push-notifications.js", "firestore-error-help.js", "ui-sounds.js"]) {');
architecture = architecture.replace('  assert.match(workflow, /node --check mobile\\/app\\.js/);', '  assert.match(workflow, /node --check mobile\\/app\\.js/);\n  assert.match(workflow, /node --check mobile\\/warehouse-domain\\.js/);\n  assert.match(workflow, /working-directory: android-app[\\s\\S]*run: npm ci/);');
architecture = replaceBlock(architecture, 'test("PWA cache contains only current application modules"', '});', `test("PWA uses stable URLs and network-first refresh without manual cache versions", async () => {
  const [sw, index, bootstrap] = await Promise.all([read("mobile/sw.js"), read("mobile/index.html"), read("mobile/bootstrap.js")]);
  assert.match(sw, /const CACHE = "conductor-mobile-shell"/);
  for (const asset of ["app.js", "catalog-core.js", "catalog-service.js", "warehouse-domain.js", "bootstrap.js", "core-ui.js", "warehouse-ui.js", "release.css"]) assert.ok(sw.includes(asset));
  assert.doesNotMatch(sw, /\\?v=|conductor-mobile-v\\d+/);
  assert.doesNotMatch(index, /\\?v=\\d+/);
  assert.match(bootstrap, /registration\\.update\\(\\)/);
});`, "architecture PWA test") + "\n";
write("tests/mobile-architecture.test.mjs", architecture);

let splashTests = read("tests/splash-assets.test.mjs");
splashTests = replaceBlock(splashTests, 'test("PWA contains the verified splash artwork and vintage title"', 'test("startup screens remain visible and return after app resume"', `test("PWA contains optimized WebP splash artwork and vintage title", () => {
  for (const name of ["warehouse-splash-clean.webp", "conductor-vintage-title.webp"]) {
    const asset = fs.readFileSync(path.join(root, "mobile", name));
    assert.ok(asset.length > 20_000, \`${'${name}'} is unexpectedly small\`);
    assert.ok(asset.length < 1_000_000, \`${'${name}'} should stay optimized\`);
    assert.equal(asset.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(asset.subarray(8, 12).toString("ascii"), "WEBP");
  }
});

`, "splash asset test");
splashTests = splashTests
  .replace('/warehouse-splash-clean\\.png\\?v=1/', '/warehouse-splash-clean\\.webp/')
  .replace('/conductor-vintage-title\\.png\\?v=1/', '/conductor-vintage-title\\.webp/')
  .replace('/splash\\.css\\?v=3/', '/splash\\.css/');
write("tests/splash-assets.test.mjs", splashTests);

let priceTests = read("tests/public-prices-pages.test.mjs");
priceTests = priceTests
  .replace('const mobileApp = new URL("../mobile/app.js", import.meta.url);', 'const mobileApp = new URL("../mobile/app.js", import.meta.url);\nconst catalogCore = new URL("../mobile/catalog-core.js", import.meta.url);\nconst warehouseDomain = new URL("../mobile/warehouse-domain.js", import.meta.url);')
  .replaceAll('/app\\.js\\?v=109/', '/app\\.js/')
  .replaceAll('/firebase-config\\.js\\?v=\\d+/', '/firebase-config\\.js/')
  .replaceAll('/bootstrap\\.js\\?v=1/', '/bootstrap\\.js/')
  .replaceAll('/warehouse\\.css\\?v=20/', '/warehouse\\.css/')
  .replace('/const CACHE = "conductor-mobile-v\\d+"/', '/const CACHE = "conductor-mobile-shell"/');
priceTests = replaceBlock(priceTests, 'test("DM60G is one shared catalog model with blue and pink warehouse variants"', 'test("DM60R1G uses one catalog price and blue/pink warehouse variants"', `test("DM60G seed has blue/pink variants while Firestore rules accept catalogue-backed models", async () => {
  const [catalog, prices, rules] = await Promise.all([
    readFile(catalogCore, "utf8"), readFile(publicPriceModule, "utf8"), readFile(new URL("../firestore.rules", import.meta.url), "utf8")
  ]);
  assert.match(catalog, /id: "DM60G", name: "Гендерный дым DM60G", price: 3500/);
  assert.match(catalog, /\\["BLUE", "Синий", "#258cff"\\][\\s\\S]*\\["PINK", "Розовый", "#ff6bab"\\]/);
  assert.match(prices, /collection\\(getFirestore\\(app\\), "catalog"\\)/);
  assert.match(rules, /function validModelId/);
  assert.doesNotMatch(rules, /DM60G\\|DM60R1G/);
});

`, "public DM60G test");
priceTests = replaceBlock(priceTests, 'test("DM60R1G uses one catalog price and blue/pink warehouse variants"', 'test("home and Holi detail pages bind the retail Holi price"', `test("DM60R1G seed uses one catalog price and blue/pink warehouse variants", async () => {
  const [catalog, prices, rules, home, smoke, requestScript] = await Promise.all([
    readFile(catalogCore, "utf8"), readFile(publicPriceModule, "utf8"), readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    readFile(pages.home, "utf8"), readFile(pages.smoke, "utf8"), readFile(publicRequestModule, "utf8")
  ]);
  assert.match(catalog, /id: "DM60R1G", name: "DM60R1G \\(интрига\\)", price: 4000/);
  assert.match(catalog, /\\["BLUE", "Синий", "#258cff"\\][\\s\\S]*\\["PINK", "Розовый", "#ff6bab"\\]/);
  assert.doesNotMatch(prices, /storedPrice === 3000/);
  assert.match(rules, /modelExists\\(data\\.modelId\\)/);
  for (const html of [home, smoke]) {
    assert.match(html, /data-public-price="DM60R1G"/);
    assert.match(html, /dm60r1g\\.webp\\?v=1/);
  }
  assert.match(requestScript, /DM60R1G/);
});

`, "public DM60R1G test");
priceTests = replaceBlock(priceTests, 'test("dashboard cash balance is updated by sales, cancellations and withdrawals"', 'test("product order buttons open WhatsApp directly"', `test("dashboard cash balance is updated by sales, cancellations and withdrawals", async () => {
  const [app, domain, html, css] = await Promise.all([
    readFile(mobileApp, "utf8"), readFile(warehouseDomain, "utf8"), readFile(mobileHtml, "utf8"), readFile(warehouseCss, "utf8")
  ]);
  assert.match(html, /id="open-cash-dialog"/);
  assert.match(html, /id="metric-cash"/);
  assert.match(html, /id="cash-withdrawal-form"/);
  assert.match(app, /function availableCash\\(\\)/);
  assert.match(domain, /async function ensureCashBalance\\(\\)/);
  assert.match(domain, /balance: Number\\(cashSnap\\.data\\(\\)\\.balance \\|\\| 0\\) \\+ total/);
  assert.match(domain, /balance: Number\\(cashSnap\\.data\\(\\)\\.balance \\|\\| 0\\) - Number\\(sale\\.total \\|\\| 0\\)/);
  assert.match(app, /if \\(amount > before\\)/);
  assert.match(app, /tx\\.set\\(withdrawalRef/);
  assert.match(css, /\\.cash-metric\\{/);
});

`, "public cash test");
write("tests/public-prices-pages.test.mjs", priceTests);

console.log("Repository refactor patches prepared");
