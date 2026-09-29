(async () => {
  const user = await Auth.requireAuth();
  if (!user) return;

  const params = new URLSearchParams(location.search);
  const quizId = params.get('quiz');
  if (!quizId) {
    UI.toast('No quiz specified.', 'error');
    setTimeout(() => (window.location.href = 'dashboard.html'), 1200);
    return;
  }

  let questions = [];
  let attempt = null;
  let currentIndex = 0;
  const answers = new Map(); // questionId -> user_answer
  const questionStartTimes = new Map();
  let timerInterval = null;
  let secondsRemaining = null;
  let saveDebounceTimer = null;

  const panel = document.getElementById('quiz-panel');
  const timerEl = document.getElementById('quiz-timer');

  try {
    const [quizRes, questionsRes, attemptRes] = await Promise.all([
      Api.getQuiz(quizId),
      Api.getQuizQuestions(quizId),
      Api.startAttempt(quizId),
    ]);

    document.getElementById('quiz-title-label').textContent = quizRes.data.quiz.title;
    questions = questionsRes.data.questions || [];
    attempt = attemptRes.data.attempt;
    document.getElementById('quiz-question-count').textContent = `${questions.length} questions`;

    if (quizRes.data.quiz.time_limit_minutes) {
      secondsRemaining = quizRes.data.quiz.time_limit_minutes * 60;
      startTimer();
    } else {
      timerEl.style.display = 'none';
    }

    renderJumpGrid();
    renderQuestion(0);
  } catch (err) {
    panel.innerHTML = `<div class="empty-state"><h3>Couldn't load this quiz</h3><p>${UI.apiErrorMessage(err)}</p></div>`;
    return;
  }

  function startTimer() {
    updateTimerDisplay();
    timerInterval = setInterval(() => {
      secondsRemaining--;
      updateTimerDisplay();
      if (secondsRemaining <= 0) {
        clearInterval(timerInterval);
        UI.toast("Time's up — submitting your quiz.", 'info');
        doSubmit();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const m = Math.floor(secondsRemaining / 60);
    const s = secondsRemaining % 60;
    timerEl.textContent = `${m}:${String(s).padStart(2, '0')}`;
    timerEl.classList.toggle('is-low', secondsRemaining <= 60);
  }

  function renderJumpGrid() {
    const grid = document.getElementById('jump-grid');
    grid.innerHTML = questions
      .map((q, i) => `<div class="question-jump-dot" data-jump="${i}">${i + 1}</div>`)
      .join('');
    grid.querySelectorAll('[data-jump]').forEach((dot) => {
      dot.addEventListener('click', () => goToQuestion(Number(dot.dataset.jump)));
    });
  }

  function updateJumpGrid() {
    document.querySelectorAll('[data-jump]').forEach((dot, i) => {
      dot.classList.toggle('is-current', i === currentIndex);
      dot.classList.toggle('is-answered', answers.has(questions[i]._id) && answers.get(questions[i]._id) !== '');
    });
  }

  function updateProgress() {
    const answeredCount = Array.from(answers.values()).filter((v) => v !== '').length;
    document.getElementById('progress-text').textContent = `${answeredCount} / ${questions.length} answered`;
    document.getElementById('progress-fill').style.width = `${(answeredCount / questions.length) * 100}%`;
  }

  function renderQuestion(index) {
    currentIndex = index;
    const q = questions[index];
    questionStartTimes.set(q._id, Date.now());

    let inputHtml = '';
    if (q.question_type === 'mcq') {
      inputHtml = `<div class="option-list">${q.options
        .map(
          (opt, i) => `<div class="option-row" data-option="${UI.escapeHtml(opt)}">
            <span class="option-letter">${String.fromCharCode(65 + i)}</span><span>${UI.escapeHtml(opt)}</span>
          </div>`
        )
        .join('')}</div>`;
    } else if (q.question_type === 'true_false') {
      inputHtml = `<div class="option-list">
        <div class="option-row" data-option="True"><span class="option-letter">T</span><span>True</span></div>
        <div class="option-row" data-option="False"><span class="option-letter">F</span><span>False</span></div>
      </div>`;
    } else if (q.question_type === 'fill_blank') {
      inputHtml = `<input class="input" id="fill-blank-input" placeholder="Type the missing word or phrase" />`;
    } else {
      inputHtml = `<textarea class="input" id="short-answer-input" rows="5" placeholder="Type your answer in your own words"></textarea>`;
    }

    panel.innerHTML = `
      <div class="q-meta">
        <span class="badge badge--neutral mono">Q${index + 1} of ${questions.length}</span>
        <span class="badge badge--neutral">${q.topic}</span>
        <span class="badge badge--neutral">${q.difficulty}</span>
      </div>
      <div class="q-text">${UI.escapeHtml(q.question_text)}</div>
      ${inputHtml}
    `;

    // Restore any saved answer
    const saved = answers.get(q._id);
    if (saved !== undefined) {
      if (q.question_type === 'mcq' || q.question_type === 'true_false') {
        panel.querySelector(`[data-option="${cssEscape(saved)}"]`)?.classList.add('is-selected');
      } else if (q.question_type === 'fill_blank') {
        document.getElementById('fill-blank-input').value = saved;
      } else {
        document.getElementById('short-answer-input').value = saved;
      }
    }

    // Wire inputs
    if (q.question_type === 'mcq' || q.question_type === 'true_false') {
      panel.querySelectorAll('.option-row').forEach((row) => {
        row.addEventListener('click', () => {
          panel.querySelectorAll('.option-row').forEach((r) => r.classList.remove('is-selected'));
          row.classList.add('is-selected');
          recordAnswer(q._id, row.dataset.option);
        });
      });
    } else if (q.question_type === 'fill_blank') {
      document.getElementById('fill-blank-input').addEventListener('input', (e) => recordAnswer(q._id, e.target.value));
    } else {
      document.getElementById('short-answer-input').addEventListener('input', (e) => recordAnswer(q._id, e.target.value));
    }

    document.getElementById('prev-btn').disabled = index === 0;
    document.getElementById('next-btn').textContent = index === questions.length - 1 ? 'Review & submit' : 'Next →';
    updateJumpGrid();
    updateProgress();
  }

  function cssEscape(str) {
    return String(str).replace(/["\\]/g, '\\$&');
  }

  function recordAnswer(questionId, value) {
    answers.set(questionId, value);
    updateJumpGrid();
    updateProgress();

    // Debounced autosave to the backend
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
      const elapsed = Math.round((Date.now() - (questionStartTimes.get(questionId) || Date.now())) / 1000);
      Api.saveAnswer(attempt._id, questionId, { user_answer: value, time_spent_seconds: elapsed }).catch(() => {
        // Autosave failures are non-fatal to the in-progress UI — the
        // answer is still submitted in full at the end.
      });
    }, 500);
  }

  function goToQuestion(index) {
    if (index < 0 || index >= questions.length) return;
    renderQuestion(index);
  }

  document.getElementById('prev-btn').addEventListener('click', () => goToQuestion(currentIndex - 1));
  document.getElementById('next-btn').addEventListener('click', () => {
    if (currentIndex === questions.length - 1) {
      openSubmitModal();
    } else {
      goToQuestion(currentIndex + 1);
    }
  });

  function openSubmitModal() {
    const answeredCount = Array.from(answers.values()).filter((v) => v !== '').length;
    document.getElementById('submit-modal-body').textContent =
      answeredCount < questions.length
        ? `You've answered ${answeredCount} of ${questions.length} questions. Unanswered questions are marked wrong. You can't change answers after submitting.`
        : `You've answered all ${questions.length} questions. You can't change answers after submitting.`;
    document.getElementById('submit-modal').classList.add('is-open');
  }

  document.getElementById('submit-modal-cancel').addEventListener('click', () => {
    document.getElementById('submit-modal').classList.remove('is-open');
  });
  document.getElementById('submit-modal-confirm').addEventListener('click', doSubmit);

  async function doSubmit() {
    if (timerInterval) clearInterval(timerInterval);
    document.getElementById('submit-modal').classList.remove('is-open');
    panel.innerHTML = `<div style="text-align:center; padding:60px 0;"><span class="spinner" style="width:32px;height:32px;"></span><p class="text-muted mt-16">Grading your answers…</p></div>`;

    try {
      await Api.submitAttempt(attempt._id);
      window.location.href = `results.html?attempt=${attempt._id}`;
    } catch (err) {
      UI.toast(UI.apiErrorMessage(err), 'error');
    }
  }

  // Warn before leaving an in-progress quiz
  window.addEventListener('beforeunload', (e) => {
    e.preventDefault();
    e.returnValue = '';
  });
})();
