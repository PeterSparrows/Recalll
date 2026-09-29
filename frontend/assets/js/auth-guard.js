/**
 * Auth guard for protected pages. Include this AFTER api.js on every
 * page that requires a logged-in user (dashboard, courses, upload,
 * quiz, results). It verifies the session via GET /auth/me (which
 * also transparently refreshes an expired access token thanks to
 * Api's built-in 401-retry), and redirects to login on failure.
 */
const Auth = (() => {
  let currentUser = null;

  async function requireAuth() {
    if (!Api.getAccessToken()) {
      redirectToLogin();
      return null;
    }
    try {
      const res = await Api.me();
      currentUser = res.data.user;
      hydrateUserChrome(currentUser);
      return currentUser;
    } catch (err) {
      redirectToLogin();
      return null;
    }
  }

  function redirectToLogin() {
    Api.clearSession();
    const next = encodeURIComponent(location.pathname + location.search);
    window.location.href = `login.html?next=${next}`;
  }

  function hydrateUserChrome(user) {
    document.querySelectorAll('[data-user-name]').forEach((el) => (el.textContent = user.full_name));
    document.querySelectorAll('[data-user-initial]').forEach((el) => {
      el.textContent = (user.full_name || '?').trim().charAt(0).toUpperCase();
    });
    document.querySelectorAll('[data-user-email]').forEach((el) => (el.textContent = user.email));

    if (user.theme_preference) {
      // Respect the server-stored preference only if the user hasn't
      // already made a local choice on this device.
      if (!localStorage.getItem('theme')) Theme.apply(user.theme_preference);
    }
  }

  function wireLogout() {
    document.querySelectorAll('[data-action="logout"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          await Api.logout();
        } catch (e) {
          // even if the server call fails, clear local session
        }
        Api.clearSession();
        window.location.href = 'login.html';
      });
    });
  }

  function getUser() {
    return currentUser;
  }

  document.addEventListener('DOMContentLoaded', wireLogout);

  return { requireAuth, getUser, redirectToLogin };
})();
