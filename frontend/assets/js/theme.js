const Theme = (() => {
  const STORAGE_KEY = 'theme';

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.setAttribute('aria-pressed', theme === 'light');
    });
  }

  function init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const preferred = saved || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    apply(preferred);

    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        apply(current === 'dark' ? 'light' : 'dark');
      });
    });
  }

  return { init, apply };
})();

document.addEventListener('DOMContentLoaded', Theme.init);
