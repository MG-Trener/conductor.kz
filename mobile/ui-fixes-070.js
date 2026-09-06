function injectReleaseUiFixes() {
  if (document.getElementById("release-070-ui-fixes")) return;
  const style = document.createElement("style");
  style.id = "release-070-ui-fixes";
  style.textContent = `
    /* Stock colour indicators: keep the colour marker a real compact circle.
       warehouse-enhancements intentionally stretches the surrounding row, so the
       inner .color-dot needs a stronger rule to avoid turning into a coloured line. */
    #view-stock .stock-color-summary .color-dot {
      display:inline-block!important;
      flex:0 0 12px!important;
      width:12px!important;
      min-width:12px!important;
      max-width:12px!important;
      height:12px!important;
      min-height:12px!important;
      padding:0!important;
      margin:0 7px 0 0!important;
      border-radius:50%!important;
      border:1px solid rgba(255,255,255,.42)!important;
      box-shadow:0 0 0 2px rgba(255,255,255,.05)!important;
    }
    #view-stock .stock-color-summary > span {
      align-items:center!important;
    }
  `;
  document.head.appendChild(style);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectReleaseUiFixes, { once: true });
} else {
  injectReleaseUiFixes();
}
