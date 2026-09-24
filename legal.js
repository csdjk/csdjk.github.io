/* Status/contact only. These pages never load the advertising SDK. */
(() => {
  "use strict";
  const config = window.ATLAS_ADS_CONFIG || {};
  const email = String(config.contactEmail || "");
  document.querySelectorAll("[data-contact]").forEach(node => {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const link = document.createElement("a");
      link.href = "mailto:" + encodeURIComponent(email).replace(/%40/g, "@");
      link.textContent = email; node.replaceChildren(link);
    }
  });
  const status = document.querySelector("[data-ad-config-status]");
  if (status) status.textContent = config.enabled === true
    ? "已配置广告模块；实际加载取决于当前域名、审核状态、隐私设置、用户选择及广告平台。"
    : "当前版本未启用第三方广告，不会加载 AdSense 脚本。";
})();
