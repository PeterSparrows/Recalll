const UI = (() => {
  function ensureToastStack() {
    let stack = document.getElementById('toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.id = 'toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  function toast(message, type = 'info', duration = 4000) {
    const stack = ensureToastStack();
    const el = document.createElement('div');
    el.className = `toast toast--${type} glass`;
    el.textContent = message;
    el.setAttribute('role', 'status');
    stack.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.25s, transform 0.25s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      setTimeout(() => el.remove(), 250);
    }, duration);
  }

  function apiErrorMessage(err) {
    if (err?.details?.length) {
      return err.details.map((d) => d.message).join(' ');
    }
    return err?.message || 'Something went wrong. Please try again.';
  }

  /**
   * Simple confirm modal. Returns a Promise<boolean>.
   * Usage: const ok = await UI.confirm('Delete this course?', 'Materials will be kept, just unlinked.');
   */
  function confirm(title, message, confirmLabel = 'Confirm', danger = true) {
    return new Promise((resolve) => {
      const scrim = document.createElement('div');
      scrim.className = 'modal-scrim is-open';
      scrim.innerHTML = `
        <div class="modal glass-strong" role="dialog" aria-modal="true">
          <h3>${title}</h3>
          <p class="text-muted text-sm">${message}</p>
          <div class="modal-actions">
            <button class="btn btn--ghost" data-action="cancel">Cancel</button>
            <button class="btn ${danger ? 'btn--danger' : 'btn--primary'}" data-action="confirm">${confirmLabel}</button>
          </div>
        </div>
      `;
      document.body.appendChild(scrim);

      function close(result) {
        scrim.remove();
        resolve(result);
      }

      scrim.querySelector('[data-action="cancel"]').addEventListener('click', () => close(false));
      scrim.querySelector('[data-action="confirm"]').addEventListener('click', () => close(true));
      scrim.addEventListener('click', (e) => {
        if (e.target === scrim) close(false);
      });
    });
  }

  function skeletonRows(count, height = '70px') {
    return Array.from({ length: count })
      .map(() => `<div class="skeleton" style="height:${height}; margin-bottom:10px;"></div>`)
      .join('');
  }

  function timeAgo(dateStr) {
    const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str ?? '';
    return div.innerHTML;
  }

  function initMobileNav() {
    const hamburger = document.querySelector('.hamburger');
    const sidebar = document.querySelector('.sidebar');
    if (!hamburger || !sidebar) return;

    let scrim = document.querySelector('.sidebar-scrim');
    if (!scrim) {
      scrim = document.createElement('div');
      scrim.className = 'sidebar-scrim';
      document.body.appendChild(scrim);
    }

    function toggle(open) {
      sidebar.classList.toggle('is-open', open);
      scrim.classList.toggle('is-open', open);
    }

    hamburger.addEventListener('click', () => toggle(!sidebar.classList.contains('is-open')));
    scrim.addEventListener('click', () => toggle(false));
  }

  return { toast, apiErrorMessage, confirm, skeletonRows, timeAgo, escapeHtml, initMobileNav };
})();
