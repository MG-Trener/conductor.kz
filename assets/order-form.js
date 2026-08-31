// Website lead form is intentionally disabled.
// Product buttons keep their original WhatsApp hrefs and are no longer intercepted.
// Historical lead data may remain available to authenticated staff in the mobile app.

const copyUpdates = [
  ["Нажмите кнопку «Заказать» у нужного товара, оставьте имя и телефон — заявка сразу попадёт менеджеру.", "Нажмите кнопку «Заказать» у нужного товара — откроется WhatsApp с готовым сообщением менеджеру."],
  ["Нажмите кнопку «Заказать» у нужной модели, оставьте имя и телефон — менеджер получит заявку сразу.", "Нажмите кнопку «Заказать» у нужной модели — откроется WhatsApp с готовым сообщением менеджеру."],
  ["Нажмите кнопку «Заказать краски Холи», оставьте имя и телефон — заявка сразу попадёт менеджеру.", "Нажмите кнопку «Заказать краски Холи» — откроется WhatsApp с готовым сообщением менеджеру."],
  ["Оставьте имя и телефон в форме, и менеджер свяжется с вами для уточнения цвета, доставки и оплаты.", "Нажмите кнопку заказа, чтобы написать менеджеру в WhatsApp и уточнить цвет, доставку и оплату."],
  ["Оставьте имя и телефон в форме, и менеджер свяжется с вами для уточнения количества, доставки и оплаты.", "Нажмите кнопку заказа, чтобы написать менеджеру в WhatsApp и уточнить количество, доставку и оплату."]
];

for (const node of document.querySelectorAll("p")) {
  const current = node.textContent.trim();
  const replacement = copyUpdates.find(([from]) => current === from)?.[1];
  if (replacement) node.textContent = replacement;
}
