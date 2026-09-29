/**
 * API client.
 *
 * Access tokens are kept in memory + localStorage (short-lived JWT).
 * Refresh tokens live in an httpOnly cookie set by the backend, so we
 * never touch them directly here — we just call /auth/refresh with
 * credentials:'include' and the browser sends the cookie.
 *
 * On any 401 (other than the login/register calls themselves), we
 * try exactly one silent refresh, then retry the original request.
 * If that also fails, we clear the session and redirect to login.
 */
const Api = (() => {
  const BASE = window.APP_CONFIG.API_BASE_URL;
  let accessToken = localStorage.getItem('accessToken') || null;
  let refreshPromise = null;

  function setAccessToken(token) {
    accessToken = token;
    if (token) localStorage.setItem('accessToken', token);
    else localStorage.removeItem('accessToken');
  }

  function getAccessToken() {
    return accessToken;
  }

  function clearSession() {
    setAccessToken(null);
    localStorage.removeItem('user');
  }

  async function refreshAccessToken() {
    // De-duplicate concurrent refresh attempts (e.g. several API
    // calls firing at once right after expiry) into a single request.
    if (refreshPromise) return refreshPromise;

    refreshPromise = fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) throw new Error('refresh_failed');
        const body = await res.json();
        setAccessToken(body.data.accessToken);
        return body.data.accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });

    return refreshPromise;
  }

  /**
   * Core request function.
   * @param {string} path - e.g. '/courses'
   * @param {object} options - { method, body, isForm, skipAuthRetry }
   */
  async function request(path, options = {}) {
    const { method = 'GET', body, isForm = false, skipAuthRetry = false } = options;

    const headers = {};
    if (!isForm) headers['Content-Type'] = 'application/json';
    if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;

    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      credentials: 'include', // send the refresh-token cookie
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });

    // Attempt exactly one silent refresh-and-retry on 401
    if (res.status === 401 && !skipAuthRetry && !path.startsWith('/auth/')) {
      try {
        await refreshAccessToken();
        return request(path, { ...options, skipAuthRetry: true });
      } catch (e) {
        clearSession();
        if (!location.pathname.endsWith('login.html')) {
          window.location.href = 'login.html';
        }
        throw new ApiError(401, 'Session expired. Please log in again.');
      }
    }

    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      // No JSON body (e.g. some 204s) — fine.
    }

    if (!res.ok) {
      throw new ApiError(res.status, data?.message || 'Something went wrong.', data?.details);
    }

    return data;
  }

  class ApiError extends Error {
    constructor(statusCode, message, details) {
      super(message);
      this.statusCode = statusCode;
      this.details = details;
    }
  }

  return {
    setAccessToken,
    getAccessToken,
    clearSession,
    request,
    ApiError,

    // ---- Auth ----
    register: (payload) => request('/auth/register', { method: 'POST', body: payload }),
    login: (payload) => request('/auth/login', { method: 'POST', body: payload }),
    logout: () => request('/auth/logout', { method: 'POST' }),
    me: () => request('/auth/me'),
    forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: { email } }),
    resetPassword: (token, newPassword) =>
      request('/auth/reset-password', { method: 'POST', body: { token, newPassword } }),
    verifyEmail: (token) => request('/auth/verify-email', { method: 'POST', body: { token } }),
    resendVerification: () => request('/auth/resend-verification', { method: 'POST' }),

    // ---- Dashboard ----
    getDashboardSummary: () => request('/dashboard/summary'),

    // ---- Users / settings ----
    updateProfile: (payload) => request('/users/me', { method: 'PATCH', body: payload }),
    changePassword: (payload) => request('/users/me/password', { method: 'PATCH', body: payload }),

    // ---- Courses ----
    listCourses: (params = '') => request(`/courses${params}`),
    createCourse: (payload) => request('/courses', { method: 'POST', body: payload }),
    updateCourse: (id, payload) => request(`/courses/${id}`, { method: 'PATCH', body: payload }),
    archiveCourse: (id) => request(`/courses/${id}/archive`, { method: 'PATCH' }),
    unarchiveCourse: (id) => request(`/courses/${id}/unarchive`, { method: 'PATCH' }),
    deleteCourse: (id) => request(`/courses/${id}`, { method: 'DELETE' }),

    // ---- Materials ----
    listMaterials: (params = '') => request(`/materials${params}`),
    getMaterial: (id) => request(`/materials/${id}`),
    uploadMaterial: (formData) => request('/materials/upload', { method: 'POST', body: formData, isForm: true }),
    deleteMaterial: (id) => request(`/materials/${id}`, { method: 'DELETE' }),

    // ---- Quizzes ----
    createQuiz: (payload) => request('/quizzes', { method: 'POST', body: payload }),
    listQuizzes: (params = '') => request(`/quizzes${params}`),
    getQuiz: (id) => request(`/quizzes/${id}`),
    getQuizQuestions: (id) => request(`/quizzes/${id}/questions`),

    // ---- Attempts ----
    startAttempt: (quizId) => request(`/quizzes/${quizId}/attempts`, { method: 'POST' }),
    retryWrongOnly: (quizId, attemptId) =>
      request(`/quizzes/${quizId}/attempts/${attemptId}/retry-wrong`, { method: 'POST' }),
    getAttempt: (id) => request(`/attempts/${id}`),
    saveAnswer: (attemptId, questionId, payload) =>
      request(`/attempts/${attemptId}/answers/${questionId}`, { method: 'PATCH', body: payload }),
    submitAttempt: (id) => request(`/attempts/${id}/submit`, { method: 'POST' }),

    // ---- Results ----
    listResults: (params = '') => request(`/results${params}`),
    getResultForAttempt: (attemptId) => request(`/results/${attemptId}`),
    listWrongAnswers: () => request('/results/wrong-answers'),

    // ---- Weak topics / revision / streak ----
    listWeakTopics: (params = '') => request(`/weak-topics${params}`),
    listRevisions: (params = '') => request(`/revisions${params}`),
    completeRevision: (id) => request(`/revisions/${id}/complete`, { method: 'PATCH' }),
    skipRevision: (id) => request(`/revisions/${id}/skip`, { method: 'PATCH' }),
    getStreak: () => request('/streak'),

    // ---- Analytics ----
    getStudyHours: (days) => request(`/analytics/study-hours${days ? `?days=${days}` : ''}`),
    getScoresOverTime: (limit) => request(`/analytics/scores-over-time${limit ? `?limit=${limit}` : ''}`),
    getAccuracyTrends: () => request('/analytics/accuracy-trends'),
    getTopicStrength: () => request('/analytics/topic-strength'),
    getStreakHistory: (days) => request(`/analytics/streak-history${days ? `?days=${days}` : ''}`),
    getRevisionCompletion: () => request('/analytics/revision-completion'),

    // ---- Notifications ----
    listNotifications: (unreadOnly) => request(`/notifications${unreadOnly ? '?unread_only=true' : ''}`),
    markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
    markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PATCH' }),
    generateNotifications: () => request('/notifications/generate', { method: 'POST' }),
  };
})();
