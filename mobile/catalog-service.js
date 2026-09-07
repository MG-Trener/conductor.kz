import {
  collection, doc, getDocs, runTransaction, serverTimestamp, setDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { LEGACY_CATALOG_SEED, LEGACY_VARIANT_DEFAULTS } from "./catalog-core.js";

export function createCatalogService({ state, currentEmployeeName }) {
  async function migrateLegacyModel(model) {
    const legacyRef = doc(state.db, "products", model.id);
    const unassignedRef = doc(state.db, "products", `${model.id}_UNASSIGNED`);
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
        name: `${model.id} · Нераспределено`,
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
