/**
 * Renders the sidebar + topbar chrome shared by every authenticated
 * page. Call Shell.render({ page: 'dashboard', title: '...', sub: '...' })
 * once the DOM is ready. `page` controls which nav link is highlighted;
 * for dashboard.html's internal sections (history/weak/revision/...),
 * pass the section as the page id too — Shell knows they all live on
 * dashboard.html and will build the right href with a #hash.
 */
const Shell = (() => {
  const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: 'grid' },
    { id: 'courses', label: 'Courses', href: 'courses.html', icon: 'book' },
    { id: 'upload', label: 'Upload Materials', href: 'upload.html', icon: 'upload' },
    { id: 'history', label: 'Quiz History', href: 'dashboard.html#history', icon: 'clock' },
    { id: 'wrong', label: 'Wrong Questions', href: 'dashboard.html#wrong', icon: 'x-circle' },
    { id: 'weak', label: 'Weak Topics', href: 'dashboard.html#weak', icon: 'alert' },
    { id: 'revision', label: 'Revision Schedule', href: 'dashboard.html#revision', icon: 'calendar' },
    { id: 'streak', label: 'Study Streak', href: 'dashboard.html#streak', icon: 'flame' },
    { id: 'settings', label: 'Settings', href: 'dashboard.html#settings', icon: 'settings' },
  ];

  const ICONS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5V4.5Z"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
    upload: '<path d="M12 16V4M12 4l-5 5M12 4l5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
    'x-circle': '<circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/>',
    alert: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17h.01"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
    flame: '<path d="M12 2c1 3-3 4-3 8a3 3 0 0 0 6 0c1 2 2 3 2 5a5 5 0 0 1-10 0c0-4 2-5 3-9 .5 1 1 1.5 2 1Z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"/>',
  };

  function iconSvg(name) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
  }

  function render({ page, title, sub }) {
    const sidebarRoot = document.getElementById('sidebar-root');
    const topbarRoot = document.getElementById('topbar-root');
    if (sidebarRoot) sidebarRoot.outerHTML = sidebarHtml(page);
    if (topbarRoot) topbarRoot.outerHTML = topbarHtml(title, sub);
    UI.initMobileNav();
  }

  function sidebarHtml(activePage) {
    const links = NAV_ITEMS.map(
      (item) => `
      <a class="nav-link ${item.id === activePage ? 'is-active' : ''}" href="${item.href}">
        ${iconSvg(item.icon)}<span>${item.label}</span>
      </a>`
    ).join('');

    return `
      <nav class="sidebar" id="sidebar-root">
        <div class="sidebar__brand">
          <span class="logo-mark">R</span>
          <span>Recall</span>
        </div>
        ${links}
        <div class="sidebar__footer">
          <button class="nav-link" style="width:100%; background:none; border:none;" data-action="logout">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>
            <span>Logout</span>
          </button>
        </div>
      </nav>`;
  }

  function topbarHtml(title, sub) {
    return `
      <header class="topbar" id="topbar-root">
        <div class="flex gap-12">
          <button class="icon-btn hamburger" aria-label="Open menu">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
          </button>
          <div>
            <div class="topbar__title">${title || ''}</div>
            ${sub ? `<div class="topbar__title-sub">${sub}</div>` : ''}
          </div>
        </div>
        <div class="topbar__actions">
          <button class="icon-btn" data-theme-toggle aria-label="Toggle dark/light theme" aria-pressed="false">
            <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          </button>
          <button class="icon-btn" id="notif-bell" aria-label="Notifications">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>
            <span class="notif-dot" id="notif-dot" style="display:none;"></span>
          </button>
          <div class="avatar" data-user-initial>?</div>
        </div>
      </header>`;
  }

  return { render };
})();
