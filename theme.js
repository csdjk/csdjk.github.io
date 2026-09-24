/* Site appearance only. Never writes atlas:previewTheme or per-style modes.
 * Loaded synchronously in <head> to apply the saved theme before first paint. */
(() => {
  'use strict';
  const key = 'atlas:siteTheme';
  const root = document.documentElement;
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const valid = value => value === 'light' || value === 'dark';
  const read = () => {
    try { const value = localStorage.getItem(key); return valid(value) ? value : null; }
    catch { return null; }
  };
  let preference = read();

  function apply() {
    const theme = preference || (system.matches ? 'dark' : 'light');
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    document.querySelector('meta[name="color-scheme"]')?.setAttribute('content', theme);
    document.querySelectorAll('[data-site-theme]').forEach(button => {
      const selected = button.dataset.siteTheme === theme;
      button.setAttribute('aria-pressed', String(selected));
      button.title = `${selected ? '当前' : '切换为'}${button.dataset.siteTheme === 'dark' ? '深色' : '浅色'}网站主题（不改变卡片预览配色）`;
    });
  }

  apply();
  document.addEventListener('DOMContentLoaded', apply, { once: true });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-site-theme]');
    if (!button || !valid(button.dataset.siteTheme)) return;
    preference = button.dataset.siteTheme;
    try { localStorage.setItem(key, preference); } catch { /* The current tab still works in restricted storage contexts. */ }
    apply();
  });
  system.addEventListener('change', () => { if (!preference) apply(); });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) { preference = read(); apply(); }
  });
})();
