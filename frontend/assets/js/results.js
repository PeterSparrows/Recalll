(async () => {
  const user = await Auth.requireAuth();
  if (!user) return;
  Shell.render({ page: 'history', title: 'Results' });

  const params = new URLSearchParams(location.search);
  const attemptId = params.get('attempt');
  if (!attemptId) {
    UI.toast('No attempt specified.', 'error');
    return;
  }

  let breakdown = [];
  let currentFilter = 'all';

  try {
    const res = await Api.getResultForAttempt(attemptId);
    const result = res.data.result;
    breakdown = res.data.breakdown || [];

    renderHero(result);
    renderTopicChart(result.topic_breakdown || {});
    renderWeakCallout(result.topic_breakdown || {});
    renderReviewList();

    const hasWrong = breakdown.some((b) => !b.is_correct);
    if (hasWrong && result.quiz) {
      const retryBtn = document.getElementById('retry-wrong-btn');
      retryBtn.style.display = 'inline-flex';
      retryBtn.addEventListener('click', async () => {
        try {
          const retryRes = await Api.retryWrongOnly(result.quiz, attemptId);
          window.location.href = `quiz.html?quiz=${result.quiz}&attempt=${retryRes.data.attempt._id}`;
        } catch (err) {
          UI.toast(UI.apiErrorMessage(err), 'error');
        }
      });
    }
  } catch (err) {
    document.getElementById('results-hero').innerHTML = `<div class="empty-state"><h3>Couldn't load this result</h3><p>${UI.apiErrorMessage(err)}</p></div>`;
    return;
  }

  function renderHero(result) {
    const gradeColor = result.grade === 'A' || result.grade === 'B' ? 'var(--mint)' : result.grade === 'C' ? 'var(--marigold)' : 'var(--coral)';
    document.getElementById('results-hero').innerHTML = `
      <div class="score-ring-wrap">
        ${scoreRingSvg(result.percentage, gradeColor)}
        <div class="score-value">
          <span class="pct mono">${Math.round(result.percentage)}%</span>
          <span class="grade">Grade ${result.grade}</span>
        </div>
      </div>
      <h2 style="font-size:1.3rem;">${result.correct_count} of ${result.total_questions} correct</h2>
      <p class="text-muted text-sm mt-16">${result.wrong_count} question${result.wrong_count === 1 ? '' : 's'} to review below.</p>
    `;
  }

  function scoreRingSvg(pct, color) {
    const r = 78;
    const c = 2 * Math.PI * r;
    const offset = c - (pct / 100) * c;
    return `<svg width="180" height="180" viewBox="0 0 180 180">
      <circle cx="90" cy="90" r="${r}" fill="none" stroke="var(--border-glass)" stroke-width="12" />
      <circle cx="90" cy="90" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}" transform="rotate(-90 90 90)" style="transition: stroke-dashoffset 0.6s ease-out;" />
    </svg>`;
  }

  function renderTopicChart(topicBreakdown) {
    const topics = Object.keys(topicBreakdown);
    if (!topics.length) {
      document.getElementById('chart-topic-breakdown').outerHTML = '<p class="text-muted text-sm">No topic data for this attempt.</p>';
      return;
    }
    const styles = getComputedStyle(document.documentElement);
    new Chart(document.getElementById('chart-topic-breakdown'), {
      type: 'bar',
      data: {
        labels: topics,
        datasets: [
          {
            label: 'Accuracy %',
            data: topics.map((t) => Math.round((topicBreakdown[t].correct / topicBreakdown[t].total) * 100)),
            backgroundColor: topics.map((t) => {
              const acc = (topicBreakdown[t].correct / topicBreakdown[t].total) * 100;
              return acc < 50 ? styles.getPropertyValue('--coral') : acc < 75 ? styles.getPropertyValue('--marigold') : styles.getPropertyValue('--mint');
            }),
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: styles.getPropertyValue('--text-secondary') }, grid: { display: false } },
          y: { ticks: { color: styles.getPropertyValue('--text-secondary') }, grid: { color: styles.getPropertyValue('--border-glass') }, max: 100 },
        },
      },
    });
  }

  function renderWeakCallout(topicBreakdown) {
    const weak = Object.entries(topicBreakdown).filter(([, v]) => v.correct / v.total < 0.5);
    if (!weak.length) return;
    document.getElementById('weak-topics-callout').innerHTML = `
      <div class="glass card" style="border-left:3px solid var(--coral);">
        <strong>Focus areas from this attempt:</strong>
        <div class="flex gap-8 mt-16" style="flex-wrap:wrap;">
          ${weak.map(([topic]) => `<span class="badge badge--weak">${UI.escapeHtml(topic)}</span>`).join('')}
        </div>
        <p class="text-sm text-muted mt-16">These have been added to your revision schedule automatically.</p>
      </div>`;
  }

  function renderReviewList() {
    const rows = currentFilter === 'wrong' ? breakdown.filter((b) => !b.is_correct) : breakdown;
    document.getElementById('review-list').innerHTML = rows.length
      ? rows
          .map(
            (b, i) => `<div class="glass review-item ${b.is_correct ? 'is-correct' : 'is-wrong'}">
              <div class="q-num">Q${breakdown.indexOf(b) + 1} · ${UI.escapeHtml(b.topic || 'General')}</div>
              <div class="q-text">${UI.escapeHtml(b.question_text)}</div>
              <div class="answer-row"><span class="label">Your answer</span> ${UI.escapeHtml(b.user_answer || '(skipped)')}</div>
              ${!b.is_correct ? `<div class="answer-row"><span class="label">Correct answer</span> ${UI.escapeHtml(b.correct_answer)}</div>` : ''}
              ${b.explanation ? `<div class="explanation">${UI.escapeHtml(b.explanation)}</div>` : ''}
            </div>`
          )
          .join('')
      : `<p class="text-muted text-sm" style="padding:20px 0;">Nothing to show here.</p>`;
  }

  document.getElementById('filter-all').addEventListener('click', () => { currentFilter = 'all'; renderReviewList(); toggleFilterActive('filter-all'); });
  document.getElementById('filter-wrong').addEventListener('click', () => { currentFilter = 'wrong'; renderReviewList(); toggleFilterActive('filter-wrong'); });
  function toggleFilterActive(id) {
    document.getElementById('filter-all').classList.toggle('is-active', id === 'filter-all');
    document.getElementById('filter-wrong').classList.toggle('is-active', id === 'filter-wrong');
  }
})();
