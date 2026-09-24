/* One persistent manual AdSense unit. Never auto-refresh or retry ad requests.
 * Google's published Privacy & messaging CMP handles regional consent decisions.
 * Local layout previews never contact an advertising endpoint. */
(() => {
  "use strict";
  const region = document.getElementById("site-ad-region");
  const content = document.getElementById("site-ad-content");
  if (!region || !content) return;
  const raw = window.ATLAS_ADS_CONFIG || {};
  const config = Object.freeze({
    enabled: raw.enabled === true,
    publisherId: String(raw.publisherId || ""),
    slotId: String(raw.slotId || ""),
    allowedHosts: Object.freeze(Array.isArray(raw.allowedHosts) ? raw.allowedHosts.map(h => String(h).toLowerCase()) : []),
    siteApproved: raw.siteApproved === true,
    privacyConfigured: raw.privacyConfigured === true,
    contactEmail: String(raw.contactEmail || "")
  });
  const host = location.hostname.toLowerCase();
  const local = location.protocol === "file:" || host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  const preview = local && new URLSearchParams(location.search).get("ad-preview") === "1";
  const loaderBase = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js";
  let state = "disabled", reason = "disabled", requests = 0;
  let observer, resizeObserver, mutationObserver, timeout, started = false;
  let available = true, terminal = false, inRange = false;

  function updateVisibility() {
    region.hidden = !available || terminal || state === "disabled";
  }
  function finish(next, why) {
    state = next; reason = why; terminal = true;
    clearTimeout(timeout);
    observer?.disconnect(); resizeObserver?.disconnect(); mutationObserver?.disconnect();
    updateVisibility();
  }
  function blockers() {
    if (!config.enabled) return "disabled";
    if (local || location.protocol !== "https:") return "non-production-origin";
    if (!config.allowedHosts.includes(host)) return "unapproved-host";
    if (!/^ca-pub-\d{16}$/.test(config.publisherId) || /^ca-pub-(\d)\1{15}$/.test(config.publisherId)) return "invalid-publisher";
    if (!/^\d{10}$/.test(config.slotId) || /^(\d)\1{9}$/.test(config.slotId)) return "invalid-slot";
    if (!config.siteApproved) return "site-review-not-confirmed";
    if (!config.privacyConfigured) return "privacy-not-configured";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contactEmail)) return "contact-not-configured";
    // Conservatively honor Global Privacy Control by not loading advertising.
    if (navigator.globalPrivacyControl === true) return "global-privacy-control";
    return "";
  }
  function initializeUnit() {
    if (terminal || requests > 0) return;
    if (!available || region.hidden || content.clientWidth < 250) {
      state = "ready"; reason = "waiting-for-visible-content"; return;
    }
    const unit = document.createElement("ins");
    unit.className = "adsbygoogle atlas-ad-unit";
    unit.style.display = "block";
    unit.dataset.adClient = config.publisherId;
    unit.dataset.adSlot = config.slotId;
    unit.dataset.adFormat = "horizontal";
    unit.dataset.fullWidthResponsive = "false";
    content.append(unit);
    mutationObserver = new MutationObserver(() => {
      if (terminal) return;
      const status = unit.getAttribute("data-ad-status");
      if (status === "unfilled") finish("unfilled", "no-ad-fill");
      else if (status === "filled") { state = "filled"; reason = ""; }
    });
    mutationObserver.observe(unit, { attributes: true, attributeFilter: ["data-ad-status"] });
    try {
      requests = 1;
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      state = "requested"; reason = "";
      observer?.disconnect(); resizeObserver?.disconnect();
    } catch { finish("error", "ad-unit-initialization-failed"); }
  }
  function loadOnce() {
    if (terminal || requests > 0 || !available || !inRange || document.visibilityState === "hidden" || content.clientWidth < 250) return;
    if (started) { if (state === "ready") initializeUnit(); return; }
    started = true; state = "loading"; reason = "";
    if (document.querySelector('script[src*="pagead2.googlesyndication.com/pagead/js/adsbygoogle.js"]')) {
      finish("error", "unexpected-existing-loader"); return;
    }
    const loader = document.createElement("script");
    loader.id = "atlas-adsense-loader";
    loader.async = true;
    loader.crossOrigin = "anonymous";
    loader.src = loaderBase + "?client=" + encodeURIComponent(config.publisherId);
    loader.addEventListener("load", () => {
      clearTimeout(timeout);
      if (terminal) return;
      state = "ready"; initializeUnit();
    }, { once: true });
    loader.addEventListener("error", () => finish("error", "ad-script-unavailable"), { once: true });
    timeout = setTimeout(() => finish("error", "ad-script-timeout"), 15000);
    document.head.append(loader);
  }
  window.AtlasAds = Object.freeze({
    status: () => Object.freeze({ state, reason, requests, preview, visible: !region.hidden }),
    setContentAvailable(value) {
      available = value === true; updateVisibility();
      if (!preview && available) loadOnce();
    }
  });
  if (preview) {
    state = "preview"; reason = "local-layout-only";
    region.classList.add("is-ad-preview");
    const box = document.createElement("div");
    box.className = "ad-preview-placeholder";
    const title = document.createElement("strong");
    title.textContent = "广告位布局预览";
    const note = document.createElement("span");
    note.textContent = "仅本地预览，不连接广告平台，不产生展示或点击。";
    box.append(title, note); content.append(box); updateVisibility();
    return;
  }
  const blocked = blockers();
  if (blocked) { reason = blocked; updateVisibility(); return; }
  state = "waiting"; reason = "below-the-fold"; updateVisibility();
  // The region is outside #main; SPA rerenders never replace its iframe.
  if ("IntersectionObserver" in window) {
    observer = new IntersectionObserver(entries => {
      inRange = entries.some(entry => entry.isIntersecting); loadOnce();
    }, { rootMargin: "200px 0px" });
    observer.observe(region);
  } else { inRange = true; loadOnce(); }
  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(loadOnce); resizeObserver.observe(content);
  }
  document.addEventListener("visibilitychange", loadOnce);
})();
