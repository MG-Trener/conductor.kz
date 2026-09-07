export const LEGACY_CATALOG_SEED = Object.freeze([
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
    id: `${model.id}_${key}`,
    modelId: model.id,
    colorId: key.toLowerCase(),
    colorName,
    colorHex,
    name: `${model.id} · ${colorName}`,
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
