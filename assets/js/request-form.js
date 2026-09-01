// Legacy filename retained so existing static pages do not need a cache-breaking rewrite.
// Customer requests are no longer stored: order buttons now open WhatsApp directly.

const SALES_WHATSAPP = "77018709384";

const products = {
  DM30: "цветной дым DM30",
  DM60: "цветной дым DM60",
  DM90: "цветной дым DM90",
  HOLI: "краски Холи",
};

function whatsappOrderUrl(productId) {
  const productName = products[productId] || "товар CONDUCTOR.KZ";
  const text = `Здравствуйте! Хочу заказать ${productName}. Подскажите наличие и условия доставки.`;
  return `https://wa.me/${SALES_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

// Replace the former request-form actions with a direct conversation with the seller.
document.querySelectorAll("[data-request-product-id]").forEach((button) => {
  const productId = button.dataset.requestProductId;
  button.href = whatsappOrderUrl(productId);
  button.target = "_blank";
  button.rel = "noopener";
  button.removeAttribute("data-request-product-id");
});

// Remove obsolete request wording left in static FAQ copy.
document.querySelectorAll("details").forEach((details) => {
  const summary = details.querySelector("summary")?.textContent?.trim();
  if (summary === "Как оформить заказ?") {
    const text = details.querySelector("p");
    if (text) text.textContent = "Нажмите кнопку «Заказать» у нужного товара — откроется WhatsApp с готовым сообщением продавцу.";
  }
});
