(() => {
  "use strict";

  const catalog = window.UI_STYLE_CATALOG;
  if (!catalog) {
    document.getElementById("main").textContent = "风格数据未加载。请检查 data/catalog.js。";
    return;
  }
  const styles = catalog.styles;
  const byId = new Map(styles.map(style => [style.id, style]));
  const $ = (selector, root = document) => root.querySelector(selector);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[char]);
  const load = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Browsers may disable local storage for file URLs. */ } };
  const state = { filter: "all", query: "", favorites: new Set((Array.isArray(load("atlas:favorites", [])) ? load("atlas:favorites", []) : []).filter(id => byId.has(id))), modes: load("atlas:modes", {}), selected: null, toastTimer: 0 };
  if (!state.modes || typeof state.modes !== "object" || Array.isArray(state.modes)) state.modes = {};
  const profiles = window.UI_PREVIEW_PROFILES;
  const previewGroups = window.UI_PREVIEW_GROUPS;
  const previews = window.UIStylePreviews;
  if (!profiles || !previews || styles.some(style => !profiles[style.id])) throw new Error("风格预览配置不完整");
  Object.assign(state, { group: "all", density: load("atlas:density", "standard"), previewTheme: load("atlas:previewTheme", "original"), comparison: new Set(), galleryScroll: 0, quickId: null, quickMode: null, compareMode: "original", searchTimer: 0 });
  if (!["standard", "large"].includes(state.density)) state.density = "standard";
  if (!["original", "light", "dark"].includes(state.previewTheme)) state.previewTheme = "original";
  const main = $("#main");
  const index = $("#style-index");

  function luminance(hex) {
    const value = hex.replace("#", "");
    if (value.length !== 6) return 0;
    const rgb = [0, 2, 4].map(i => parseInt(value.slice(i, i + 2), 16) / 255).map(channel => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  }

  function textColor(hex) { return luminance(hex) > .18 ? "#000000" : "#ffffff"; }

  function contrast(a, b) {
    const x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
  }

  function readableColor(color, backgrounds) {
    if (backgrounds.every(bg => contrast(color, bg) >= 4.5)) return color;
    const target = backgrounds.some(bg => luminance(bg) > .4) ? "#000000" : "#ffffff";
    const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    const from = channels(color), to = channels(target);
    for (let step = 1; step <= 20; step++) {
      const mix = "#" + from.map((value, i) => Math.round(value + (to[i] - value) * step / 20).toString(16).padStart(2, "0")).join("");
      if (backgrounds.every(bg => contrast(mix, bg) >= 4.5)) return mix;
    }
    return target;
  }

  function solidSurface(surface, background) {
    if (surface.length === 7) return surface;
    const alpha = parseInt(surface.slice(7, 9), 16) / 255;
    return "#" + [1, 3, 5].map(index => Math.round(parseInt(surface.slice(index, index + 2), 16) * alpha + parseInt(background.slice(index, index + 2), 16) * (1 - alpha)).toString(16).padStart(2, "0")).join("");
  }

  function styleVars(style) {
    const r = style.recipe;
    const backgrounds = [r.bg, solidSurface(r.surface, r.bg)];
    return `--d-bg:${r.bg};--d-surface:${r.surface};--d-ink:${readableColor(r.ink, backgrounds)};--d-muted:${readableColor(r.muted, backgrounds)};--d-accent:${r.accent};--d-accent-text:${readableColor(r.accent, backgrounds)};--d-on-accent:${textColor(r.accent)};--d-accent2:${r.accent2};--d-error:${readableColor("#b92e33", backgrounds)};--d-line:${r.line};--d-radius:${r.radius}`;
  }

  function modeFor(style) {
    const stored = state.modes[style.id];
    return stored === "light" || stored === "dark" ? stored : style.defaultMode;
  }

  function recipeFor(style, mode = modeFor(style)) {
    return { ...style.recipe, ...style.modes[mode] };
  }

  function thumbnailFor(style) {
    const mode = modeFor(style);
    return `assets/thumbs/${style.id}${mode === style.defaultMode ? "" : `-${mode}`}.svg`;
  }

  function paletteMarkup(recipe) {
    return [recipe.bg, recipe.surface, recipe.accent, recipe.accent2].map(color => `<i style="background:${color}"></i>`).join("");
  }

  function icon(name, filled = false) {
    const paths = {star:'<path d="m12 3 2.78 5.63L21 9.54l-4.5 4.38 1.06 6.2L12 17.2l-5.56 2.92 1.06-6.2L3 9.54l6.22-.91Z"/>',zoom:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5M7.5 10.5h6M10.5 7.5v6"/>',compare:'<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>',check:'<path d="m5 12 4 4L19 6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',up:'<path d="M6 18 18 6M6 6h12v12"/>',left:'<path d="M19 12H5m6 6-6-6 6-6"/>',grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',large:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 15h18"/>'};
    return `<svg class="ui-icon" viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
  }

  function galleryMode(style) { return state.previewTheme === "original" ? style.defaultMode : state.previewTheme; }
  function tagsMarkup(style) { return profiles[style.id].tags.map(tag => `<span>${escapeHtml(tag)}</span>`).join(""); }
  function filterLabel() { return ({all:"全部风格", favorites:"我的收藏", active:"主风格", supplemental:"补充变体", Mobile:"移动端", "BI/Analytics":"数据看板"})[state.filter] || "全部风格"; }
  function getMatches() {
    const terms = state.query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return styles.filter(style => {
      const profile = profiles[style.id];
      const inFilter = state.filter === "all" || (state.filter === "favorites" ? state.favorites.has(style.id) : state.filter === style.status || state.filter === style.type);
      const inGroup = state.group === "all" || profile.group === state.group;
      const searchable = [style.id, style.name, style.keywords, style.bestFor, style.parent, profile.name, profile.note, ...profile.tags, previewGroups[profile.group]].join(" ").toLowerCase();
      return inFilter && inGroup && terms.every(term => searchable.includes(term));
    });
  }

  function renderIndex() {
    const matching = getMatches();
    $("#index-count").textContent = matching.length;
    $("#favorite-count").textContent = state.favorites.size;
    index.innerHTML = matching.length ? matching.map(style => `<a class="index-item ${state.selected === style.id ? "selected" : ""}" href="#/style/${style.id}" aria-current="${state.selected === style.id ? "page" : "false"}"><span class="index-chip" style="background:${recipeFor(style).accent}"></span><span class="index-name">${escapeHtml(profiles[style.id].name)}<small>${escapeHtml(style.name)}</small></span></a>`).join("") : '<p class="sidebar-empty">没有匹配的风格</p>';
    document.querySelectorAll(".filter").forEach(button => { const active = button.dataset.filter === state.filter; button.classList.toggle("active", active); button.setAttribute("aria-pressed", String(active)); });
    document.querySelectorAll("[data-group]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.group === state.group)));
    $("#gallery-results-live").textContent = `${filterLabel()}${state.group !== "all" ? " · " + previewGroups[state.group] : ""}，共 ${matching.length} 种风格`;
  }

  function renderDeprecated() {
    $("#deprecated-items").innerHTML = catalog.deprecated.map(item => {
      const replacement = item.domain === "style" ? byId.get(item.replacement) : null;
      return `<div class="deprecated-item"><span>${escapeHtml(item.name)}</span>${replacement ? `<a href="#/style/${replacement.id}">查看 ${escapeHtml(replacement.name)} →</a>` : `<small>替代入口：${escapeHtml(item.replacementName)}<br>landing / ${escapeHtml(item.replacement)}</small>`}</div>`;
    }).join("");
  }

  function card(style) {
    const p = profiles[style.id], favorite = state.favorites.has(style.id), compared = state.comparison.has(style.id);
    return `<article class="gallery-card ${compared ? "is-compared" : ""}" data-card="${style.id}"><a href="#/style/${style.id}" class="card-link card-preview-link" aria-label="查看 ${escapeHtml(p.name)} 完整演示">${previews.render(style, galleryMode(style))}</a><div class="card-body"><div class="card-title-row"><h3><a href="#/style/${style.id}">${escapeHtml(p.name)}</a></h3><button class="card-favorite ${favorite ? "is-favorite" : ""}" type="button" data-favorite="${style.id}" aria-label="${favorite ? "取消收藏" : "收藏"} ${escapeHtml(p.name)}" aria-pressed="${favorite}" title="${favorite ? "取消收藏" : "收藏"}">${icon("star",favorite)}</button></div><p class="card-english" title="${escapeHtml(style.name)}">${escapeHtml(style.name)}</p><div class="card-features">${tagsMarkup(style)}</div></div><div class="card-actions"><button class="compare-toggle" type="button" data-compare="${style.id}" aria-label="${compared ? "移出" : "加入"}对比：${escapeHtml(p.name)}" aria-pressed="${compared}">${icon(compared ? "check" : "compare")}<span>对比</span></button><button class="quick-button" type="button" data-quick="${style.id}" aria-label="放大预览 ${escapeHtml(p.name)}" title="放大预览">${icon("zoom")}</button><a href="#/style/${style.id}" class="card-open">查看演示 ${icon("up")}</a></div></article>`;
  }

  function renderGallery() {
    state.selected = null;
    document.title = "UI 风格图鉴 · UI/UX Pro Max";
    renderIndex();
    const matching = getMatches(), narrowed = state.query || state.filter !== "all" || state.group !== "all";
    main.innerHTML = `<div class="gallery-view"><section class="gallery-intro"><div><p class="eyebrow">THE INTERFACE ATLAS <span> / </span> 079</p><h1>找到你的下一种<span>视觉语言。</span></h1><p>从材质、排版和组件认识风格，而不只是换一种颜色。</p></div><div class="intro-note"><span><b>79</b> 种风格</span><i></i><span>先看特征<br>再探索完整演示</span></div></section><section class="gallery-section" aria-label="风格样本库"><div class="gallery-controls"><div class="gallery-results"><h2>${state.query ? "搜索结果" : state.group !== "all" ? previewGroups[state.group] : filterLabel()}</h2><span class="result-count">${matching.length}</span>${narrowed ? '<button class="reset-filters" type="button" data-clear-search>重置筛选</button>' : ''}</div><div class="gallery-options"><span class="preview-colors-label">预览配色</span><div class="segmented preview-theme" role="group" aria-label="卡片预览配色">${[["original","原始"],["light","浅色"],["dark","深色"]].map(([value,label])=>`<button type="button" data-preview-theme="${value}" aria-pressed="${state.previewTheme === value}">${label}</button>`).join("")}</div><div class="segmented density-switch" role="group" aria-label="卡片尺寸"><button type="button" data-density="standard" aria-pressed="${state.density === "standard"}" aria-label="标准卡片" title="标准卡片">${icon("grid")}</button><button type="button" data-density="large" aria-pressed="${state.density === "large"}" aria-label="大图模式" title="大图模式">${icon("large")}</button></div></div></div><div class="gallery-context"><span>${state.query ? `关键词：${escapeHtml(state.query)}${state.filter !== "all" ? " · " + filterLabel() : ""}` : state.group !== "all" && state.filter !== "all" ? filterLabel() + " · " + previewGroups[state.group] : "每张卡片，都是一种独立的界面表达"}</span><span class="gallery-tip">放大看细节 · 最多对比 3 种风格</span></div>${matching.length ? `<div class="gallery-grid" data-density="${state.density}">${matching.map(card).join("")}</div>` : `<div class="empty-state"><div class="empty-icon">${icon(state.filter === "favorites" ? "star" : "zoom")}</div><h3>${state.filter === "favorites" && !state.favorites.size ? "把喜欢的风格收藏在这里" : "没有找到匹配的风格"}</h3><p>${state.filter === "favorites" && !state.favorites.size ? "点击卡片上的星标，下次就能快速找到。" : "试试“玻璃”“软阴影”“手绘”，或减少筛选条件。"}</p><button type="button" class="outline-button" data-clear-search>浏览全部风格</button></div>`}</section><footer class="site-footer"><span>UI/UX Pro Max · 50 种主风格 / 29 种补充变体</span><span>视觉样本与数据均为演示 · 不替代可访问性验证</span></footer></div>`;
    window.AtlasAds?.setContentAvailable(matching.length > 0);
    previews.mount();
    renderCompareDock();
  }

  function renderCompareDock() {
    const dock = $("#compare-dock"), picked = [...state.comparison];
    dock.hidden = !picked.length;
    dock.innerHTML = picked.length ? `<div class="compare-dock-label">${icon("compare")}<strong>风格对比</strong><small>${picked.length} / 3</small></div><div class="compare-picked">${picked.map(id=>`<button type="button" data-remove-compare="${id}" aria-label="移出对比：${escapeHtml(profiles[id].name)}"><span>${escapeHtml(profiles[id].name)}</span>${icon("close")}</button>`).join("")}</div><button type="button" class="clear-compare" data-clear-compare>清空</button><button class="atlas-primary" type="button" data-open-compare ${picked.length < 2 ? "disabled" : ""}>${picked.length < 2 ? "再选一种风格" : "开始对比 " + icon("arrow")}</button>` : "";
    document.body.classList.toggle("has-comparison", !!picked.length);
    document.querySelectorAll("[data-compare]").forEach(button=> { const on=state.comparison.has(button.dataset.compare); button.setAttribute("aria-pressed",String(on)); button.setAttribute("aria-label",`${on ? "移出" : "加入"}对比：${profiles[button.dataset.compare].name}`); button.innerHTML=icon(on?"check":"compare")+'<span>对比</span>'; });
    document.querySelectorAll("[data-card]").forEach(card=>card.classList.toggle("is-compared",state.comparison.has(card.dataset.card)));
  }

  function toggleCompare(id) {
    if (!byId.has(id)) return;
    if (state.comparison.has(id)) state.comparison.delete(id);
    else if (state.comparison.size < 3) state.comparison.add(id);
    else { toast("最多同时对比 3 种风格，请先移除一种"); return; }
    renderCompareDock();
  }

  function paletteDetails(style, mode) {
    const r=recipeFor(style,mode);
    return [r.bg,r.surface,r.accent,r.accent2].map(color=>`<span><i style="background:${color}"></i><code>${color.toUpperCase()}</code></span>`).join("");
  }

  function openQuick(id, preserveMode = false) {
    const style=byId.get(id); if (!style) return;
    const dialog=$("#atlas-dialog"), p=profiles[id];
    state.quickId=id;
    if (!preserveMode) state.quickMode=galleryMode(style);
    const mode=state.quickMode;
    const focusedAction=document.activeElement?.dataset.quickStep;
    dialog.classList.remove("is-comparison");
    dialog.innerHTML=`<header class="atlas-dialog-header"><div><p class="eyebrow">STYLE CLOSE-UP</p><h2 id="atlas-dialog-title">${escapeHtml(p.name)}</h2></div><button class="atlas-icon-button" type="button" data-dialog-close aria-label="关闭预览" autofocus>${icon("close")}</button></header><div class="quick-layout"><div class="quick-visual">${previews.render(style,mode)}<div class="quick-visual-footer"><span>完整构图 · 实时材质</span><div class="segmented" role="group" aria-label="放大预览配色"><button type="button" data-modal-mode="light" aria-pressed="${mode === "light"}">浅色</button><button type="button" data-modal-mode="dark" aria-pressed="${mode === "dark"}">深色</button></div></div></div><div class="quick-info"><p class="quick-english">${escapeHtml(style.name)}</p><div class="card-features">${tagsMarkup(style)}</div><h3>识别特征</h3><p class="quick-note">${escapeHtml(p.note)}</p><h3>参考色板</h3><div class="quick-palette">${paletteDetails(style,mode)}</div><p class="quick-code">${escapeHtml(style.id)}</p><a class="atlas-primary" data-open-detail="${id}" href="#/style/${id}">打开完整组件演示 ${icon("up")}</a><button class="atlas-secondary" type="button" data-inline-copy="${id}" data-copy-mode="${mode}">复制风格提示词</button></div></div><footer class="atlas-dialog-footer"><span>← / → 切换风格 · Esc 关闭</span><div><button class="atlas-icon-button" type="button" data-quick-step="-1" aria-label="上一种风格">${icon("left")}</button><button class="atlas-icon-button" type="button" data-quick-step="1" aria-label="下一种风格">${icon("arrow")}</button></div></footer>`;
    if (!dialog.open) dialog.showModal();
    document.body.classList.add("modal-open");
    previews.mount();
    if (focusedAction) dialog.querySelector(`[data-quick-step="${focusedAction}"]`)?.focus({preventScroll:true});
  }

  function quickStep(delta) {
    const matching=getMatches(), list=matching.some(s=>s.id===state.quickId)?matching:styles;
    const position=list.findIndex(s=>s.id===state.quickId);
    openQuick(list[(position+delta+list.length)%list.length].id);
  }

  function openComparison() {
    const picked=[...state.comparison]; if (picked.length<2) return;
    const dialog=$("#atlas-dialog"); state.quickId=null;
    dialog.classList.add("is-comparison");
    dialog.innerHTML=`<header class="atlas-dialog-header"><div><p class="eyebrow">SIDE BY SIDE</p><h2 id="atlas-dialog-title">把不同放在一起看。</h2></div><div class="comparison-header-actions"><div class="segmented" role="group" aria-label="对比配色">${[["original","原始"],["light","浅色"],["dark","深色"]].map(([value,label])=>`<button type="button" data-compare-mode="${value}" aria-pressed="${state.compareMode===value}">${label}</button>`).join("")}</div><button class="atlas-icon-button" type="button" data-dialog-close aria-label="关闭对比" autofocus>${icon("close")}</button></div></header><div class="comparison-grid" style="--compare-columns:${picked.length}">${picked.map(id=> { const style=byId.get(id),p=profiles[id],mode=state.compareMode==='original'?style.defaultMode:state.compareMode; return `<article class="comparison-item">${previews.render(style,mode)}<div class="comparison-info"><h3>${escapeHtml(p.name)}</h3><p class="quick-english">${escapeHtml(style.name)}</p><div class="card-features">${tagsMarkup(style)}</div><p class="quick-note">${escapeHtml(p.note)}</p><div class="quick-palette">${paletteDetails(style,mode)}</div><a class="atlas-secondary" href="#/style/${id}" data-compare-detail="${mode}">查看完整演示 ${icon("up")}</a></div></article>`; }).join("")}</div><footer class="atlas-dialog-footer"><span>比较布局、材质、字体与层级，而不只比较颜色。</span><button class="atlas-secondary" type="button" data-dialog-close>继续挑选</button></footer>`;
    if (!dialog.open) dialog.showModal();
    document.body.classList.add("modal-open"); previews.mount();
  }

  async function copyInlinePrompt(id,mode) {
    const style=byId.get(id); if (!style) return;
    const text=shortPrompt(style,mode);
    try {
      if (!navigator.clipboard?.writeText) throw new Error("No clipboard API");
      await navigator.clipboard.writeText(text); toast("风格提示词已复制");
    } catch {
      const dialog=$("#atlas-dialog"), field=document.createElement("textarea");
      field.value=text; field.setAttribute("aria-label","手动复制风格提示词"); field.className="manual-prompt";
      dialog.querySelector(".manual-prompt")?.remove(); dialog.appendChild(field); field.focus(); field.select();
      if (document.execCommand("copy")) { field.remove(); toast("风格提示词已复制"); }
      else toast("文字已选中，请按 Ctrl+C 复制");
    }
  }

  function resetGalleryPosition() { state.galleryScroll=0; window.scrollTo({top:0,behavior:"instant"}); }
  function applyFilter() { resetGalleryPosition(); closeMenu(); if (state.selected) location.hash="#/"; else renderGallery(); }

  function featureArt(style) {
    const feature = style.recipe.feature;
    const repeat = (n, fn) => Array.from({length:n}, (_,i) => fn(i)).join("");
    const art = {
      grid: `<div class="feat-grid">${repeat(16, i => `<i class="g${i % 5}"></i>`)}</div>`,
      orb: `<div class="feat-orb"><i></i><i></i><i></i></div>`,
      blob: `<div class="feat-blob"><i></i><i></i></div>`,
      product: `<div class="feat-product"><div class="feat-cube"><i></i><i></i><i></i></div><span>360° VIEW</span></div>`,
      blocks: `<div class="feat-blocks"><i></i><i></i><i></i><i></i><i></i></div>`,
      terminal: `<div class="feat-terminal"><div>studio@creative:~$</div><p>› 正在构建你的下一个想法_</p><span>▲ SYSTEM READY</span></div>`,
      sun: `<div class="feat-sun"><i></i><b></b></div>`,
      type: `<div class="feat-type">Aa<span>THE ART OF<br>MORE.</span></div>`,
      chart: `<div class="feat-chart"><span>本月增长</span><strong>+28.6%</strong><svg viewBox="0 0 240 100" aria-hidden="true"><path d="M0 82 35 72 65 79 95 49 125 57 160 29 190 39 240 6"/></svg></div>`,
      forecast: `<div class="feat-chart"><span>趋势预测</span><strong>↑ 84.2%</strong><svg viewBox="0 0 240 100" aria-hidden="true"><path d="M0 82 35 72 65 79 95 49 125 57 160 29"/><path class="forecast-line" d="M160 29 190 39 240 6"/></svg></div>`,
      compare: `<div class="feat-bars">${repeat(6, i => `<i style="height:${45 + ((i * 37) % 90)}px"></i>`)}</div>`,
      heatmap: `<div class="feat-heatmap">${repeat(35, i => `<i style="opacity:${.25 + ((i * 7) % 8) / 10}"></i>`)}</div>`,
      funnel: `<div class="feat-funnel"><i></i><i></i><i></i><i></i></div>`,
      radar: `<div class="feat-radar"><i></i><b></b></div>`,
      voice: `<div class="feat-voice">${repeat(13, i => `<i style="height:${18 + ((i * 23) % 62)}px"></i>`)}</div>`,
      wave: `<div class="feat-voice">${repeat(13, i => `<i style="height:${18 + ((i * 23) % 62)}px"></i>`)}</div>`,
      pulse: `<div class="feat-pulse"><i></i><b></b></div>`,
      landscape: `<div class="feat-landscape"><i></i><b></b><em></em></div>`,
      pixel: `<div class="feat-pixel">${repeat(64, i => `<i class="p${i % 4}"></i>`)}</div>`,
      sketch: `<div class="feat-sketch"><span>✳</span><strong>MAKE<br>IT REAL</strong><i></i></div>`,
      cursor: `<div class="feat-cursor"><i></i><span>EXPLORE</span></div>`,
      book: `<div class="feat-book"><i></i><b></b><span>01 / NOTES</span></div>`,
    }[feature];
    if (!art) throw new Error(`Missing feature art: ${feature}`);
    return `<div class="feature-shell"><div class="feature-kicker"><span>◉</span> STUDIO OS / LIVE PREVIEW</div><div class="feature-art feature-${feature}" aria-label="${escapeHtml(style.name)} 特色视觉演示">${art}</div><div class="feature-foot"><span>创意工作台</span><span>2026 ↗</span></div></div>`;
  }

  function demo(style) {
    const r = style.recipe;
    const name = escapeHtml(style.name);
    const cell = (label, value, note) => `<div class="metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`;
    return `<div class="demo skin-${r.skin}" data-style="${style.id}" data-mode="${style.currentMode}" style="${styleVars(style)}">
      <div class="demo-atmosphere" aria-hidden="true"></div>
      <header class="demo-nav"><div class="demo-logo"><span class="demo-logo-mark">✳</span><strong>STUDIO <em>OS</em></strong></div><nav aria-label="演示页面导航"><button type="button" data-demo-scroll="demo-overview">概览</button><button type="button" data-demo-scroll="demo-components">组件</button><button type="button" data-demo-scroll="demo-data">数据</button></nav><button type="button" class="demo-nav-action" data-demo-toast>开始探索 <span>↗</span></button></header>
      <section class="demo-hero" id="demo-overview"><div class="demo-hero-copy"><p class="demo-eyebrow"><span></span> DESIGN FOR WHAT'S NEXT</p><h1>让灵感，<br><em>成为作品。</em></h1><p>把想法、协作和每一次突破，放进同一个创意空间。你的下一步，从这里开始。</p><div class="demo-hero-actions"><button type="button" class="d-button d-primary" data-demo-toast>创建新项目 <span>↗</span></button><button type="button" class="d-button d-secondary" data-demo-modal>了解更多</button></div><div class="demo-hero-proof"><span class="avatar-stack"><i>Y</i><i>M</i><i>A</i></span><span>已有 <b>12,480</b> 位创作者加入</span></div></div>${featureArt(style)}</section>
      <section class="demo-metrics" aria-label="示例指标">${cell("活跃项目", "128", "↗ 较上月 +18%")}${cell("本周协作", "2.4k", "↗ 较上周 +12%")}${cell("完成进度", "84%", "目标完成率")}</section>
      <section class="demo-section" id="demo-components"><div class="demo-section-heading"><div><p class="demo-eyebrow">THE BUILDING BLOCKS</p><h2>组件与交互</h2></div><span>01 / 03</span></div><div class="demo-component-grid"><article class="d-card"><div class="d-card-title"><span class="d-icon">↗</span><div><h3>操作与状态</h3><p>清晰的层级，自然的反馈。</p></div></div><div class="d-button-row"><button type="button" class="d-button d-primary" data-demo-toast>主要操作</button><button type="button" class="d-button d-secondary" data-demo-modal>次要操作</button><button type="button" class="d-button d-quiet" disabled>不可用</button></div><div class="d-badges"><span class="d-badge">✦ 新功能</span><span class="d-badge d-success">✓ 进行中</span><span class="d-badge d-warning">! 待审核</span></div><div class="d-divider"></div><div class="d-tabs" role="tablist" aria-label="内容分类"><button type="button" role="tab" aria-selected="true" data-demo-tab="all">全部</button><button type="button" role="tab" aria-selected="false" data-demo-tab="design">设计</button><button type="button" role="tab" aria-selected="false" data-demo-tab="team">协作</button></div><p class="d-tab-panel" role="tabpanel">查看全部项目，共 12 个进行中的创意。</p></article>
      <article class="d-card"><div class="d-card-title"><span class="d-icon">⌘</span><div><h3>表单与选择</h3><p>填写信息，建立下一个项目。</p></div></div><form class="d-form" novalidate><label for="demo-project-name">项目名称</label><input id="demo-project-name" name="projectName" placeholder="例如：品牌视觉升级" required><span class="d-field-error" hidden>请输入项目名称。</span><label for="demo-project-type">项目类型</label><select id="demo-project-type"><option>品牌设计</option><option>产品界面</option><option>插画创作</option></select><div class="d-selection-row"><label><input type="checkbox" checked> 接收项目更新</label><label><input type="radio" name="access" checked> 团队可见</label></div><label class="d-switch-label"><span>启用自动保存</span><button type="button" class="d-switch" role="switch" aria-checked="true" aria-label="启用自动保存"><i></i></button></label><button type="submit" class="d-button d-primary d-submit">保存项目</button></form></article></div></section>
      <section class="demo-section" id="demo-data"><div class="demo-section-heading"><div><p class="demo-eyebrow">INSIGHTS & MOMENTUM</p><h2>数据与进展</h2></div><span>02 / 03</span></div><div class="demo-data-grid"><article class="d-card d-chart-card"><div class="d-card-title"><span class="d-icon">↗</span><div><h3>项目增长</h3><p>过去 6 个月的创作节奏。</p></div></div><div class="chart-top"><strong>24,680</strong><span>↗ +28.6%</span></div><div class="d-chart" role="img" aria-label="示例折线图，项目增长趋势向上"><div class="chart-grid"></div><svg viewBox="0 0 600 160" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="chart-fill-${style.id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="${r.accent}" stop-opacity=".26"/><stop offset="1" stop-color="${r.accent}" stop-opacity="0"/></linearGradient></defs><path d="M0 130 C58 110 68 126 120 103 S200 121 250 74 S326 89 368 51 S430 67 478 34 S550 48 600 8 V160 H0Z" fill="url(#chart-fill-${style.id})"/><path d="M0 130 C58 110 68 126 120 103 S200 121 250 74 S326 89 368 51 S430 67 478 34 S550 48 600 8" fill="none" stroke="${r.accent}" stroke-width="4" stroke-linecap="round"/></svg></div><div class="chart-labels"><span>1 月</span><span>2 月</span><span>3 月</span><span>4 月</span><span>5 月</span><span>6 月</span></div></article><article class="d-card d-list-card"><div class="d-card-title"><span class="d-icon">▤</span><div><h3>近期项目</h3><p>团队正在推进的工作。</p></div></div><div class="d-table-wrap"><table><thead><tr><th scope="col">项目</th><th scope="col">状态</th><th scope="col">进度</th></tr></thead><tbody><tr><td>品牌视觉系统</td><td><span class="d-badge d-success">进行中</span></td><td>86%</td></tr><tr><td>产品体验升级</td><td><span class="d-badge">设计中</span></td><td>62%</td></tr><tr><td>春季活动视觉</td><td><span class="d-badge d-warning">待审核</span></td><td>94%</td></tr></tbody></table></div><label class="d-progress-label" for="progress-${style.id}"><span>本月目标</span><strong>74%</strong></label><progress id="progress-${style.id}" value="74" max="100">74%</progress><div class="d-pagination" aria-label="项目列表分页"><button type="button" data-page="prev" aria-label="上一页">←</button><button type="button" data-page="1" aria-current="page">1</button><button type="button" data-page="2">2</button><button type="button" data-page="next" aria-label="下一页">→</button></div></article></div></section>
      <section class="demo-section demo-feedback"><div class="demo-section-heading"><div><p class="demo-eyebrow">DETAILS MATTER</p><h2>反馈与细节</h2></div><span>03 / 03</span></div><div class="demo-component-grid"><article class="d-card"><div class="d-card-title"><span class="d-icon">✧</span><div><h3>提示与通知</h3><p>关键信息，在需要时出现。</p></div></div><div class="d-alert"><span>✓</span><div><strong>一切准备就绪</strong><p>你的工作空间已经同步完成。</p></div></div><div class="d-alert d-alert-warning"><span>!</span><div><strong>温馨提示</strong><p>别忘了为项目设置清晰的里程碑。</p></div></div><button type="button" class="d-button d-secondary" data-demo-toast>显示轻提示</button></article><article class="d-card"><div class="d-card-title"><span class="d-icon">?</span><div><h3>更多信息</h3><p>按需展开，保持界面清爽。</p></div></div><details class="d-accordion"><summary>如何与团队共享项目？</summary><p>进入项目设置，选择成员并设置相应权限。这里展示的是示例操作。</p></details><details class="d-accordion"><summary>可以随时更改设计吗？</summary><p>可以。每次更改都会保留清晰的历史记录。</p></details><button type="button" class="d-button d-secondary" data-demo-modal>查看弹窗示例</button></article></div></section>
      <footer class="demo-footer"><span>✳ STUDIO OS</span><span>为灵感而设计 · 示例页面</span><button type="button" data-demo-scroll="demo-overview">返回顶部 ↑</button></footer>
      <dialog class="demo-dialog"><form method="dialog"><button type="submit" class="dialog-close" aria-label="关闭弹窗">×</button><div class="dialog-icon">✳</div><h2>从想法到作品</h2><p>所有工具和灵感，都已经为你的下一个项目准备好了。创建一个项目，开始探索。</p><div class="dialog-actions"><button type="submit" class="d-button d-secondary">稍后再说</button><button type="submit" class="d-button d-primary">开始创作</button></div></form></dialog>
      <div class="demo-toast" role="status" aria-live="polite" hidden>✓ 已完成示例操作</div>
    </div>`;
  }

  function shortPrompt(style, mode = modeFor(style)) {
    const palette = recipeFor(style, mode);
    return `请使用 $ui-ux-pro-max skill，采用准确的风格 ID「${style.id}」（${style.name}）设计我的页面。以${mode === "dark" ? "深色" : "浅色"}模式为主，配色参考：背景 ${palette.bg}、界面 ${palette.surface}、强调 ${palette.accent}；同时提供另一模式切换。原始风格要求：${style.prompt} 请保持文字清晰、交互可用，并根据实际产品内容调整文案。`;
  }

  function fullPrompt(style, mode = modeFor(style)) {
    const palette = recipeFor(style, mode);
    const other = recipeFor(style, mode === "dark" ? "light" : "dark");
    return `请使用 $ui-ux-pro-max skill，为我的产品设计并实现一页「${style.name}」风格的完整 UI。\n\n风格定位：Style ID = ${style.id}；状态 = ${style.status}${style.parent ? `；父风格 = ${style.parent}` : ""}。请使用 skill 的 style 数据查询此 ID，并以其规则为设计依据。\n\n当前选中${mode === "dark" ? "深色" : "浅色"}模式，以它作为主要复刻目标：背景 ${palette.bg}、界面 ${palette.surface}、文字 ${palette.ink}、强调 ${palette.accent}。同时实现匹配的${mode === "dark" ? "浅色" : "深色"}模式，可参考背景 ${other.bg}、界面 ${other.surface}、文字 ${other.ink}、强调 ${other.accent}。两种模式都要保持此风格的识别特征、清晰对比与完整交互。\n\n原始视觉关键词：${style.prompt}\n技术与材质提示：${style.technical}\n适用场景：${style.bestFor}\n\n请展示：导航、Hero、排版与色板、主次按钮、输入框与选择控件、卡片、指标与图表、列表/表格、标签、提示、进度、折叠内容和弹窗。每个控件要有清晰的 hover、focus、active、disabled 或错误状态，且样式在整页保持统一。移动风格优先按手机界面构图；其他风格同时适配桌面和手机。\n\n交付前请实际运行并截图检查两种模式的布局、文字、间距、溢出、对比度和键盘操作；尊重 prefers-reduced-motion。请结合我的实际产品需求填充真实内容，不要照搬演示页的 STUDIO OS 示例文案。`;
  }

  function renderDetail(style) {
    window.AtlasAds?.setContentAvailable(true);
    state.selected = style.id;
    document.title = profiles[style.id].name + " · UI 风格图鉴";
    save("atlas:lastStyle", style.id);
    renderIndex();
    const position = styles.findIndex(item => item.id === style.id);
    const previous = styles[(position - 1 + styles.length) % styles.length];
    const next = styles[(position + 1) % styles.length];
    const mobile = style.type === "Mobile";
    const mode = modeFor(style);
    const recipe = recipeFor(style, mode);
    main.innerHTML = `<div class="detail-view"><div class="detail-top"><a href="#/" class="back-link">← 返回风格总览</a><span class="detail-counter">${String(position + 1).padStart(2,"0")} / 79</span></div><div class="detail-heading"><div><p class="eyebrow">${escapeHtml(mobile ? "MOBILE EXPERIENCE" : style.type === "BI/Analytics" ? "DATA & INSIGHT" : style.status === "supplemental" ? "STYLE VARIANT" : "VISUAL LANGUAGE")}</p><h1>${escapeHtml(profiles[style.id].name)}</h1><p class="detail-style-en">${escapeHtml(style.name)}</p><p class="detail-signature">${escapeHtml(profiles[style.id].note)}</p><p class="detail-description">${escapeHtml(style.bestFor)}</p><div class="detail-tags"><span>${escapeHtml(style.status === "active" ? "主风格" : "补充变体")}</span><span>${escapeHtml(style.type)}</span>${style.parent ? `<a href="#/style/${style.parent}">父风格：${escapeHtml(byId.get(style.parent)?.name || style.parent)} ↗</a>` : ""}</div></div><div class="detail-palette" aria-label="风格主色">${paletteMarkup(recipe)}</div></div><div class="detail-toolbar"><div class="toolbar-left"><span class="live-label"><i></i> 实时组件演示</span><span class="toolbar-separator"></span><span>${mobile ? "手机画布" : "响应式画布"}</span></div><div class="mode-switcher" role="group" aria-label="预览配色"><button type="button" data-mode="light" aria-pressed="${mode === "light"}">☀ 浅色</button><button type="button" data-mode="dark" aria-pressed="${mode === "dark"}">☾ 深色</button></div><div class="toolbar-actions"><button type="button" class="tool-favorite ${state.favorites.has(style.id) ? "is-favorite" : ""}" data-favorite="${style.id}" aria-pressed="${state.favorites.has(style.id)}">${state.favorites.has(style.id) ? "★ 已收藏" : "☆ 收藏"}</button><button type="button" class="tool-copy" data-copy="short">复制风格提示词</button><button type="button" class="tool-copy primary" data-copy="full">复制完整复刻提示词 ↗</button></div></div><div class="preview-stage ${mobile ? "mobile-preview" : ""}">${mobile ? '<div class="phone-frame"><div class="phone-notch" aria-hidden="true"></div><div class="phone-screen">' : '<div class="desktop-frame">'}${demo({ ...style, recipe, currentMode: mode })}${mobile ? "</div></div>" : "</div>"}</div><details class="prompt-details"><summary>查看与手动复制提示词 <span>⌄</span></summary><div class="prompt-grid"><div><div class="prompt-title"><h2>简短风格提示词</h2><button type="button" data-copy="short">复制</button></div><textarea id="prompt-short" readonly aria-label="简短风格提示词">${escapeHtml(shortPrompt(style))}</textarea></div><div><div class="prompt-title"><h2>完整页面复刻提示词</h2><button type="button" data-copy="full">复制</button></div><textarea id="prompt-full" readonly aria-label="完整页面复刻提示词">${escapeHtml(fullPrompt(style))}</textarea></div></div><p class="copy-hint" id="copy-hint">提示词包含本风格的技能 ID 与原始关键词。请把你的产品需求一并交给 AI。</p></details><nav class="style-pagination" aria-label="相邻风格"><a href="#/style/${previous.id}"><span>← 上一种</span><strong>${escapeHtml(previous.name)}</strong></a><a href="#/style/${next.id}"><span>下一种 →</span><strong>${escapeHtml(next.name)}</strong></a></nav><footer class="site-footer">示例内容仅供视觉比较 · 数据快照 ${catalog.sha256.slice(0, 12)}</footer></div>`;
    main.scrollTop = 0;
    window.scrollTo(0, 0);
  }

  function switchMode(mode) {
    const style = byId.get(state.selected);
    if (!style || !style.modes[mode]) return;
    state.modes[style.id] = mode;
    save("atlas:modes", state.modes);
    const recipe = recipeFor(style, mode);
    const root = $(".demo");
    root.style.cssText = styleVars({ ...style, recipe });
    root.dataset.mode = mode;
    $(".detail-palette").innerHTML = paletteMarkup(recipe);
    document.querySelectorAll(".mode-switcher [data-mode]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mode === mode)));
    const chart = $(".d-chart", root);
    chart.querySelectorAll("stop").forEach(stop => stop.setAttribute("stop-color", recipe.accent));
    chart.querySelector("path[stroke]").setAttribute("stroke", recipe.accent);
    $("#prompt-short").value = shortPrompt(style);
    $("#prompt-full").value = fullPrompt(style);
    renderIndex();
  }

  function toast(message) {
    const node = $("#global-toast");
    node.textContent = message;
    node.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { node.hidden = true; }, 3000);
  }

  async function copyPrompt(kind) {
    const style = byId.get(state.selected);
    if (!style) return;
    const value = kind === "short" ? shortPrompt(style) : fullPrompt(style);
    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try { await navigator.clipboard.writeText(value); copied = true; } catch { /* Try the selection-based path below. */ }
      }
      if (!copied) {
        const fallback = document.createElement("textarea");
        fallback.value = value;
        fallback.style.position = "fixed";
        fallback.style.opacity = "0";
        document.body.appendChild(fallback);
        fallback.select();
        copied = document.execCommand("copy");
        fallback.remove();
      }
      if (!copied) throw new Error("Clipboard unavailable");
      toast("提示词已复制到剪贴板");
    } catch {
      const details = $(".prompt-details");
      details.open = true;
      const field = $(kind === "short" ? "#prompt-short" : "#prompt-full");
      field.focus(); field.select();
      const hint = $("#copy-hint");
      hint.textContent = "浏览器未允许自动复制，文字已选中。请按 Ctrl+C 手动复制。";
      toast("文字已选中，请按 Ctrl+C 复制");
    }
  }

  function toggleFavorite(id) {
    if (!byId.has(id)) return;
    if (state.favorites.has(id)) state.favorites.delete(id); else state.favorites.add(id);
    save("atlas:favorites", [...state.favorites]);
    renderIndex();
    const favorite=state.favorites.has(id);
    document.querySelectorAll(`[data-favorite="${id}"]`).forEach(button=> {
      button.setAttribute("aria-pressed",String(favorite)); button.classList.toggle("is-favorite",favorite);
      button.setAttribute("aria-label",`${favorite ? "取消收藏" : "收藏"} ${profiles[id].name}`);
      button.title=favorite?"取消收藏":"收藏";
      button.innerHTML=button.classList.contains("card-favorite")?icon("star",favorite):(favorite?"★ 已收藏":"☆ 收藏");
    });
    if (!state.selected && state.filter==="favorites") {
      const y=window.scrollY; renderGallery(); window.scrollTo({top:y,behavior:"instant"});
    }
  }

  function closeMenu() {
    $("#sidebar").classList.remove("open");
    $("#menu-button").setAttribute("aria-expanded", "false");
    $("#menu-scrim").hidden = true;
    document.body.classList.remove("menu-open");
  }

  function route() {
    const dialog=$("#atlas-dialog"); if (dialog.open) dialog.close();
    let hash=location.hash; try { hash=decodeURIComponent(hash); } catch { /* Invalid deep link falls back to the gallery. */ }
    const match=hash.match(/^#\/style\/([a-z0-9-]+)$/), style=match && byId.get(match[1]);
    if (style) {
      if (!state.selected) state.galleryScroll=window.scrollY;
      renderDetail(style);
    } else {
      renderGallery(); requestAnimationFrame(()=>window.scrollTo({top:state.galleryScroll,behavior:"instant"}));
    }
    closeMenu();
  }

  function showDemoToast(demoRoot) {
    const node = $(".demo-toast", demoRoot);
    node.hidden = false;
    clearTimeout(node._timer);
    node._timer = setTimeout(() => { node.hidden = true; }, 2500);
  }

  document.addEventListener("click", event => {
    if (event.target.closest(".skip-link")) { event.preventDefault(); main.focus(); return; }
    const closest = selector => event.target.closest(selector);
    const dialog=$("#atlas-dialog");
    if (closest("[data-dialog-close]")) { dialog.close(); return; }
    const quick=closest("[data-quick]"); if (quick) { openQuick(quick.dataset.quick); return; }
    const step=closest("[data-quick-step]"); if (step) { quickStep(Number(step.dataset.quickStep)); return; }
    const modalMode=closest("[data-modal-mode]"); if (modalMode) { state.quickMode=modalMode.dataset.modalMode; openQuick(state.quickId,true); dialog.querySelector(`[data-modal-mode="${state.quickMode}"]`)?.focus(); return; }
    const compareMode=closest("[data-compare-mode]"); if (compareMode) { state.compareMode=compareMode.dataset.compareMode; openComparison(); dialog.querySelector(`[data-compare-mode="${state.compareMode}"]`)?.focus(); return; }
    const inlineCopy=closest("[data-inline-copy]"); if (inlineCopy) { copyInlinePrompt(inlineCopy.dataset.inlineCopy,inlineCopy.dataset.copyMode); return; }
    const compare=closest("[data-compare]"); if (compare) { toggleCompare(compare.dataset.compare); return; }
    const remove=closest("[data-remove-compare]"); if (remove) { state.comparison.delete(remove.dataset.removeCompare); renderCompareDock(); return; }
    if (closest("[data-clear-compare]")) { state.comparison.clear(); renderCompareDock(); return; }
    if (closest("[data-open-compare]")) { state.compareMode=state.previewTheme; openComparison(); return; }
    const density=closest("[data-density]"); if (density && density.tagName==='BUTTON') { state.density=density.dataset.density; save("atlas:density",state.density); $(".gallery-grid")?.setAttribute("data-density",state.density); document.querySelectorAll("button[data-density]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.density===state.density))); return; }
    const theme=closest("[data-preview-theme]"); if (theme) { const y=window.scrollY; state.previewTheme=theme.dataset.previewTheme; save("atlas:previewTheme",state.previewTheme); renderGallery(); window.scrollTo({top:y,behavior:"instant"}); $(`[data-preview-theme="${state.previewTheme}"]`)?.focus({preventScroll:true}); return; }
    const group=closest("[data-group]"); if (group) { state.group=state.group===group.dataset.group ? "all" : group.dataset.group; applyFilter(); return; }
    const filter = closest("[data-filter]");
    if (filter) { state.filter = filter.dataset.filter; applyFilter(); return; }
    const link=closest('a[href^="#/style/"]');
    if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
      const id=link.getAttribute('href').slice(8);
      const mode=link.dataset.openDetail ? state.quickMode : link.dataset.compareDetail || (!state.selected && state.previewTheme!=="original" ? state.previewTheme : null);
      if (mode && byId.has(id)) { state.modes[id]=mode; save("atlas:modes",state.modes); }
      if (dialog.open) dialog.close();
    }
    const favorite = event.target.closest("[data-favorite]");
    if (favorite) { toggleFavorite(favorite.dataset.favorite); return; }
    const copy = event.target.closest("[data-copy]");
    if (copy) { copyPrompt(copy.dataset.copy); return; }
    const modeButton = event.target.closest(".mode-switcher [data-mode]");
    if (modeButton) { switchMode(modeButton.dataset.mode); return; }
    if (event.target.closest("[data-clear-search]")) { state.query = ""; state.filter = "all"; state.group = "all"; $("#search").value = ""; applyFilter(); return; }
    const demoRoot = event.target.closest(".demo");
    if (!demoRoot) return;
    const scroll = event.target.closest("[data-demo-scroll]");
    if (scroll) { $(`#${scroll.dataset.demoScroll}`, demoRoot).scrollIntoView({behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"}); return; }
    if (event.target.closest("[data-demo-toast]")) showDemoToast(demoRoot);
    if (event.target.closest("[data-demo-modal]")) $(".demo-dialog", demoRoot).showModal();
    const tab = event.target.closest("[data-demo-tab]");
    if (tab) {
      $(".d-tabs", demoRoot).querySelectorAll("[role=tab]").forEach(item => item.setAttribute("aria-selected", item === tab ? "true" : "false"));
      $(".d-tab-panel", demoRoot).textContent = ({all:"查看全部项目，共 12 个进行中的创意。", design:"设计项目，共 8 个灵感正在成形。",team:"团队项目，共 4 个协作空间。"})[tab.dataset.demoTab];
    }
    const toggle = event.target.closest(".d-switch");
    if (toggle) { toggle.setAttribute("aria-checked", toggle.getAttribute("aria-checked") !== "true"); showDemoToast(demoRoot); }
    const page = event.target.closest("[data-page]");
    if (page) {
      const current = $(".d-pagination [aria-current=page]", demoRoot);
      const number = page.dataset.page === "next" ? Math.min(2, Number(current.dataset.page) + 1) : page.dataset.page === "prev" ? Math.max(1, Number(current.dataset.page) - 1) : Number(page.dataset.page);
      current.removeAttribute("aria-current");
      $(`.d-pagination [data-page="${number}"]`, demoRoot).setAttribute("aria-current", "page");
      showDemoToast(demoRoot);
    }
  });

  document.addEventListener("submit", event => {
    if (!event.target.matches(".d-form")) return;
    event.preventDefault();
    const name = $("#demo-project-name", event.target);
    const error = $(".d-field-error", event.target);
    if (!name.value.trim()) {
      error.hidden = false; name.setAttribute("aria-invalid", "true"); name.focus();
    } else {
      error.hidden = true; name.removeAttribute("aria-invalid"); showDemoToast(event.target.closest(".demo"));
    }
  });

  $("#search").addEventListener("input", event => {
    state.query=event.target.value; clearTimeout(state.searchTimer);
    state.searchTimer=setTimeout(()=>{ resetGalleryPosition(); if (state.selected) location.hash="#/"; else renderGallery(); },100);
  });
  $("#menu-button").addEventListener("click", () => {
    const open = $("#sidebar").classList.toggle("open");
    $("#menu-button").setAttribute("aria-expanded", String(open));
    $("#menu-scrim").hidden = !open; document.body.classList.toggle("menu-open",open);
    if (open) $(".filter.active")?.focus();
  });
  $("#menu-scrim").addEventListener("click", closeMenu);
  const atlasDialog=$("#atlas-dialog");
  atlasDialog.addEventListener("close",()=>{ document.body.classList.remove("modal-open"); state.quickId=null; previews.mount(); });
  atlasDialog.addEventListener("click",event=>{
    if (event.target!==atlasDialog) return;
    const r=atlasDialog.getBoundingClientRect();
    if (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) atlasDialog.close();
  });
  document.addEventListener("keydown", event => {
    const editing=["INPUT","TEXTAREA","SELECT"].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (event.key === "Escape" && $("#sidebar").classList.contains("open")) { closeMenu(); $("#menu-button").focus(); }
    if (atlasDialog.open) {
      if (state.quickId && !editing && (event.key==="ArrowLeft" || event.key==="ArrowRight")) { event.preventDefault(); quickStep(event.key==="ArrowLeft" ? -1 : 1); }
      return;
    }
    if ((event.key === "/" && !editing) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase()==="k")) { event.preventDefault(); $("#search").focus(); $("#search").select(); }
    if (event.key==="Tab" && $("#sidebar").classList.contains("open")) {
      const nodes=[...$("#sidebar").querySelectorAll('a,button,summary')].filter(n=>n.getClientRects().length);
      if (event.shiftKey && document.activeElement===nodes[0]) { event.preventDefault(); nodes.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement===nodes.at(-1)) { event.preventDefault(); nodes[0]?.focus(); }
    }
  });
  window.addEventListener("hashchange", route);
  $("#source-hash").textContent = `本地数据快照 · ${catalog.sha256.slice(0, 8)}`;
  $("#trait-filters").innerHTML=Object.entries(previewGroups).map(([id,label])=>`<button type="button" class="group-filter" data-group="${id}" aria-pressed="false"><i class="group-dot group-${id}"></i><span>${label}</span><small>${styles.filter(s=>profiles[s.id].group===id).length}</small></button>`).join("");
  renderDeprecated();
  route();
})();
