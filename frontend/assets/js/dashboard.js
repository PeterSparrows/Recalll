(async () => {
  const user = await Auth.requireAuth();
  if (!user) return;

  Shell.render({ page: currentSectionFromHash(), title: 'Dashboard', sub: new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) });

  const loadedSections = new Set();

  function currentSectionFromHash() {
    return (location.hash || '#dashboard').slice(1);
  }

  function showSection(id) {
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('is-active'));
    const target = document.getElementById(`view-${id}`) || document.getElementById('view-dashboard');
    target.classList.add('is-active');

    document.querySelectorAll('.nav-link').forEach((l) => {
      const href = l.getAttribute('href') || '';
      const matches = (id === 'dashboard' && href === 'dashboard.html') || href === `dashboard.html#${id}`;
      l.classList.toggle('is-active', matches);
    });

    if (!loadedSections.has(id)) {
      loadedSections.add(id);
      loadSection(id);
    }
  }

  window.addEventListener('hashchange', () => showSection(currentSectionFromHash()));
  document.body.addEventListener('click', (e) => {
    const gotoBtn = e.target.closest('[data-goto]');
    if (gotoBtn) location.hash = `#${gotoBtn.dataset.goto}`;
  });

  function loadSection(id) {
    const loaders = {
      dashboard: loadDashboard,
      history: loadHistory,
      wrong: loadWrong,
      weak: loadWeak,
      revision: loadRevision,
      streak: loadStreak,
      settings: loadSettings,
    };
    (loaders[id] || loadDashboard)().catch((err) => UI.toast(UI.apiErrorMessage(err), 'error'));
  }

  function renderVerifyBanner() {
    const u = Auth.getUser();
    const el = document.getElementById('verify-banner');
    if (!el || !u || u.email_verified) {
      if (el) el.innerHTML = '';
      return;
    }
    el.innerHTML = `
      <div class="glass card" style="border-left:3px solid var(--marigold); margin-bottom:20px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;">
        <div>
          <strong>Verify your email</strong>
          <p class="text-sm text-muted mt-16">Check your inbox for a verification link, or resend one below.</p>
        </div>
        <button class="btn btn--ghost btn--sm" id="resend-verify-btn">Resend email</button>
      </div>`;
    document.getElementById('resend-verify-btn').addEventListener('click', async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Sending…';
      try {
        await Api.resendVerification();
        UI.toast('Verification email sent — check your inbox.', 'success');
      } catch (err) {
        UI.toast(UI.apiErrorMessage(err), 'error');
      }
      e.target.disabled = false;
      e.target.textContent = 'Resend email';
    });
  }

  // ---------------- Dashboard ----------------
  async function loadDashboard() {
    renderVerifyBanner();

    const summary = await Api.getDashboardSummary();
    const d = summary.data;
    document.getElementById('summary-cards').innerHTML = `
      ${summaryCard('Materials Uploaded', d.materials_uploaded)}
      ${summaryCard('Materials Analyzed', d.materials_analyzed)}
      ${summaryCard('Total Quizzes', d.total_quizzes)}
      ${summaryCard('Average Score', d.average_score + '%', true)}
      ${summaryCard('Weak Topics', d.weak_topics)}
      ${summaryCard('Study Streak', d.study_streak + ' days')}
    `;

    try {
      const quizzes = await Api.listQuizzes();
      const list = (quizzes.data.quizzes || []).slice(0, 5);
      document.getElementById('recent-quizzes-list').innerHTML = list.length
        ? list
            .map(
              (q) => `<div class="flex" style="justify-content:space-between; padding:10px 0; border-top:1px solid var(--border-glass);">
                <span class="text-sm">${UI.escapeHtml(q.title)}</span>
                <span class="badge badge--neutral">${q.status}</span>
              </div>`
            )
            .join('')
        : emptyInline('No quizzes yet — generate one from a course material.');
    } catch (e) {
      document.getElementById('recent-quizzes-list').innerHTML = emptyInline('Could not load recent quizzes.');
    }

    renderCharts();
  }

  function summaryCard(label, value, isHighlight) {
    return `
      <div class="glass summary-card">
        <div class="summary-card__label">${label}</div>
        <div class="summary-card__value">${isHighlight ? `<span class="highlight">${value}</span>` : value}</div>
      </div>`;
  }

  function emptyInline(msg) {
    return `<p class="text-sm text-muted" style="padding:20px 0;">${msg}</p>`;
  }

  async function renderCharts() {
    const chartColors = getChartColors();

    try {
      const res = await Api.getScoresOverTime(15);
      const rows = res.data.scores || [];
      new Chart(document.getElementById('chart-scores'), {
        type: 'line',
        data: {
          labels: rows.map((r) => new Date(r.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
          datasets: [{ label: 'Score %', data: rows.map((r) => r.percentage), borderColor: chartColors.marigold, backgroundColor: chartColors.marigoldFade, tension: 0.35, fill: true }],
        },
        options: chartBaseOptions(chartColors),
      });
    } catch (e) { /* leave canvas empty, non-fatal */ }

    try {
      const res = await Api.getTopicStrength();
      const grouped = res.data.topic_strength || { weak: [], improving: [], strong: [] };
      const rows = [...grouped.weak, ...grouped.improving, ...grouped.strong];
      new Chart(document.getElementById('chart-topics'), {
        type: 'bar',
        data: {
          labels: rows.map((r) => r.topic),
          datasets: [{ label: 'Accuracy %', data: rows.map((r) => r.accuracy), backgroundColor: rows.map((r) => (r.accuracy < 50 ? chartColors.coral : r.accuracy < 75 ? chartColors.marigold : chartColors.mint)) }],
        },
        options: { ...chartBaseOptions(chartColors), indexAxis: 'y' },
      });
    } catch (e) { /* non-fatal */ }

    try {
      const res = await Api.getStudyHours(7);
      const rows = res.data.study_hours || [];
      new Chart(document.getElementById('chart-hours'), {
        type: 'bar',
        data: {
          labels: rows.map((r) => new Date(r._id).toLocaleDateString(undefined, { weekday: 'short' })),
          datasets: [{ label: 'Minutes', data: rows.map((r) => r.total_minutes), backgroundColor: chartColors.mint }],
        },
        options: chartBaseOptions(chartColors),
      });
    } catch (e) { /* non-fatal */ }
  }

  function getChartColors() {
    const styles = getComputedStyle(document.documentElement);
    return {
      marigold: styles.getPropertyValue('--marigold').trim() || '#f5a623',
      marigoldFade: 'rgba(245,166,35,0.15)',
      mint: styles.getPropertyValue('--mint').trim() || '#2fbf95',
      coral: styles.getPropertyValue('--coral').trim() || '#f0553b',
      text: styles.getPropertyValue('--text-secondary').trim() || '#888',
      grid: styles.getPropertyValue('--border-glass').trim() || 'rgba(255,255,255,0.1)',
    };
  }

  function chartBaseOptions(colors) {
    return {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: colors.text, font: { family: 'Inter' } }, grid: { color: colors.grid } },
        y: { ticks: { color: colors.text, font: { family: 'Inter' } }, grid: { color: colors.grid } },
      },
    };
  }

  // ---------------- Quiz History ----------------
  async function loadHistory() {
    try {
      const res = await Api.listResults('?limit=50');
      const rows = res.data.results || [];
      document.getElementById('history-table-body').innerHTML = rows.length
        ? rows
            .map(
              (r) => `<tr>
                <td>${UI.escapeHtml(r.quiz?.title || 'Quiz')}</td>
                <td class="mono">${r.correct_count}/${r.total_questions}</td>
                <td><span class="badge badge--${r.grade === 'F' || r.grade === 'D' ? 'weak' : r.grade === 'C' ? 'improving' : 'strong'}">${r.grade}</span></td>
                <td class="text-muted text-sm">${UI.timeAgo(r.createdAt)}</td>
                <td><a href="results.html?attempt=${r.attempt}" style="color:var(--marigold); font-weight:600; font-size:0.85rem;">View</a></td>
              </tr>`
            )
            .join('')
        : `<tr><td colspan="5">${emptyInline('No quiz attempts yet.')}</td></tr>`;
    } catch (e) {
      document.getElementById('history-table-body').innerHTML = `<tr><td colspan="5">${emptyInline('Could not load quiz history.')}</td></tr>`;
    }
  }

  // ---------------- Wrong Questions ----------------
  async function loadWrong() {
    try {
      const res = await Api.listWrongAnswers();
      const rows = res.data.wrong_answers || [];
      document.getElementById('wrong-list').innerHTML = rows.length
        ? rows
            .map(
              (r) => `<div class="glass card review-item is-wrong">
                <div class="q-num">${UI.escapeHtml(r.topic || 'General')}</div>
                <div class="q-text">${UI.escapeHtml(r.question_text)}</div>
                <div class="answer-row"><span class="label">Your answer</span> ${UI.escapeHtml(r.user_answer || '(skipped)')}</div>
                <div class="answer-row"><span class="label">Correct answer</span> ${UI.escapeHtml(r.correct_answer)}</div>
                ${r.explanation ? `<div class="explanation">${UI.escapeHtml(r.explanation)}</div>` : ''}
              </div>`
            )
            .join('')
        : emptyState('No wrong answers yet', 'Nice — you have not missed anything so far. Keep it up.');
    } catch (e) {
      document.getElementById('wrong-list').innerHTML = emptyInline('Could not load wrong-answer review.');
    }
  }

  // ---------------- Weak Topics ----------------
  async function loadWeak() {
    try {
      const res = await Api.listWeakTopics();
      const rows = res.data.weak_topics || [];
      document.getElementById('weak-topics-list').innerHTML = rows.length
        ? rows
            .map(
              (t) => `<div class="glass stack-card card">
                <div class="flex" style="justify-content:space-between;">
                  <strong>${UI.escapeHtml(t.topic)}</strong>
                  <span class="badge badge--${t.status}">${t.status}</span>
                </div>
                <div class="summary-card__value mt-16" style="font-size:1.6rem;">${Math.round(t.accuracy)}%</div>
                <div class="text-sm text-muted mt-16">${t.times_tested} attempt${t.times_tested === 1 ? '' : 's'} · ${t.times_wrong} wrong</div>
              </div>`
            )
            .join('')
        : emptyState('No weak topics yet', 'Take a quiz and Recall will flag anything you are shaky on.');
    } catch (e) {
      document.getElementById('weak-topics-list').innerHTML = emptyInline('Could not load weak topics.');
    }
  }

  // ---------------- Revision Schedule ----------------
  async function loadRevision() {
    try {
      const res = await Api.listRevisions('?status=pending');
      const rows = res.data.revisions || [];
      document.getElementById('revision-list').innerHTML = rows.length
        ? rows
            .map(
              (r) => `<div class="glass card" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                <div>
                  <div class="flex gap-8"><strong>${UI.escapeHtml(r.topic)}</strong><span class="badge badge--${r.priority === 'high' ? 'weak' : r.priority === 'medium' ? 'improving' : 'neutral'}">${r.priority}</span></div>
                  <div class="text-sm text-muted mt-16">Scheduled for ${new Date(r.scheduled_date).toLocaleDateString()}</div>
                </div>
                <div class="flex gap-8">
                  <button class="btn btn--ghost btn--sm" data-revision-skip="${r._id}">Skip</button>
                  <button class="btn btn--primary btn--sm" data-revision-complete="${r._id}">Mark done</button>
                </div>
              </div>`
            )
            .join('')
        : emptyState('Nothing scheduled', 'When a topic needs revisiting, it will show up here automatically.');
    } catch (e) {
      document.getElementById('revision-list').innerHTML = emptyInline('Could not load revision schedule.');
    }
  }

  document.getElementById('view-revision').addEventListener('click', async (e) => {
    const completeId = e.target.dataset.revisionComplete;
    const skipId = e.target.dataset.revisionSkip;
    try {
      if (completeId) { await Api.completeRevision(completeId); UI.toast('Marked as done.', 'success'); }
      if (skipId) { await Api.skipRevision(skipId); UI.toast('Skipped.', 'info'); }
      if (completeId || skipId) loadRevision();
    } catch (err) {
      UI.toast(UI.apiErrorMessage(err), 'error');
    }
  });

  // ---------------- Study Streak ----------------
  async function loadStreak() {
    try {
      const res = await Api.getStreakHistory(90);
      const s = res.data.streak_history;
      document.getElementById('streak-cards').innerHTML = `
        ${summaryCard('Current Streak', `<span class="highlight highlight--mint">${s.current_streak}</span> days`)}
        ${summaryCard('Longest Streak', s.longest_streak + ' days')}
        ${summaryCard('Total Study Days', s.total_study_days)}
      `;

      const activeDays = new Set(res.data.active_days || []);
      const cells = [];
      for (let i = 89; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        cells.push(`<div title="${key}" style="aspect-ratio:1; border-radius:3px; background:${activeDays.has(key) ? 'var(--mint)' : 'var(--surface)'}; opacity:${activeDays.has(key) ? '1' : '0.5'};"></div>`);
      }
      document.getElementById('streak-calendar').innerHTML = cells.join('');
    } catch (e) {
      document.getElementById('streak-cards').innerHTML = emptyInline('Could not load streak data.');
    }
  }

  // ---------------- Settings ----------------
  async function loadSettings() {
    const u = Auth.getUser();
    if (!u) return;
    document.getElementById('s-full-name').value = u.full_name || '';
    document.getElementById('s-department').value = u.department || '';
    document.getElementById('s-level').value = u.level || '';
    document.getElementById('s-goal').value = u.daily_study_goal_minutes || 30;
    document.getElementById('s-email-reminders').checked = u.email_reminders_enabled !== false;
  }

  document.getElementById('s-email-reminders').addEventListener('change', async (e) => {
    const enabled = e.target.checked;
    try {
      await Api.updateProfile({ email_reminders_enabled: enabled });
      UI.toast(enabled ? 'Daily reminders turned on.' : 'Daily reminders turned off.', 'info');
    } catch (err) {
      e.target.checked = !enabled;
      UI.toast(UI.apiErrorMessage(err), 'error');
    }
  });

  document.getElementById('settings-profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Api.updateProfile({
        full_name: document.getElementById('s-full-name').value.trim(),
        department: document.getElementById('s-department').value.trim(),
        level: document.getElementById('s-level').value.trim(),
        daily_study_goal_minutes: Number(document.getElementById('s-goal').value),
      });
      UI.toast('Profile updated.', 'success');
    } catch (err) {
      UI.toast(UI.apiErrorMessage(err), 'error');
    }
  });

  document.getElementById('settings-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await Api.changePassword({
        current_password: document.getElementById('s-current-pw').value,
        new_password: document.getElementById('s-new-pw').value,
      });
      UI.toast('Password changed.', 'success');
      e.target.reset();
    } catch (err) {
      UI.toast(UI.apiErrorMessage(err), 'error');
    }
  });

  function emptyState(title, msg) {
    return `<div class="empty-state glass"><h3>${title}</h3><p>${msg}</p></div>`;
  }

  // ---------------- Notification bell ----------------
  async function loadNotifBell() {
    try {
      const res = await Api.listNotifications(true);
      const count = (res.data.notifications || []).length;
      document.getElementById('notif-dot').style.display = count > 0 ? 'block' : 'none';
    } catch (e) { /* non-fatal */ }
  }
  setTimeout(loadNotifBell, 400);

  // ---------------- Boot ----------------
  showSection(currentSectionFromHash());
})();
