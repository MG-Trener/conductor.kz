function addWarehouseLogin() {
  document.querySelector(".warehouse-hotspot")?.remove();
  const contacts = document.querySelector(".contacts");
  if (!contacts || contacts.querySelector(".warehouse-login")) return;

  const style = document.createElement("style");
  style.textContent = `
    .warehouse-login{min-height:30px;padding:0 13px;border:1px solid rgba(255,255,255,.28);border-radius:999px;background:rgba(3,7,19,.58)}
  `;
  document.head.appendChild(style);

  const link = document.createElement("a");
  link.className = "contact warehouse-login";
  link.href = "/mobile/";
  link.textContent = "Войти";
  const locationItem = contacts.querySelector("div.contact");
  contacts.insertBefore(link, locationItem || null);
}

addWarehouseLogin();
