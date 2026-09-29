(async () => {
  const user = await Auth.requireAuth();
  if (!user) return;
  Shell.render({ page: 'upload', title: 'Upload Materials' });

  const ALLOWED_EXT = ['pdf', 'docx', 'pptx', 'txt'];
  const ALLOWED_MIME = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
  ];
  const MAX_SIZE_MB = 25;

  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('file-input');
  const materialsList = document.getElementById('materials-list');
  const courseSelect = document.getElementById('course-select');

  const pollTimers = new Map();

  try {
    const res = await Api.listCourses('?status=active');
    (res.data.courses || []).forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c._id;
      opt.textContent = `${c.code} — ${c.title}`;
      courseSelect.appendChild(opt);
    });
  } catch (e) { /* non-fatal, upload still works without course list */ }

  dropzone.addEventListener('click', () => fileInput.click());
  ['dragenter', 'dragover'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('is-dragover'); })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('is-dragover'); })
  );
  dropzone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

  function validateFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) return `"${file.name}": unsupported file type (.${ext}). Use PDF, DOCX, PPTX, or TXT.`;
    if (!ALLOWED_MIME.includes(file.type) && file.type !== '') {
      return `"${file.name}": file content doesn't match a supported document type.`;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) return `"${file.name}": exceeds the ${MAX_SIZE_MB}MB limit.`;
    return null;
  }

  async function handleFiles(fileList) {
    for (const file of Array.from(fileList)) {
      const error = validateFile(file);
      if (error) {
        UI.toast(error, 'error');
        continue;
      }
      await uploadOne(file);
    }
    fileInput.value = '';
  }

  async function uploadOne(file) {
    const rowId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    renderUploadingRow(rowId, file);

    const formData = new FormData();
    formData.append('file', file);
    if (courseSelect.value) formData.append('course_id', courseSelect.value);

    try {
      await Api.uploadMaterial(formData);
      UI.toast(`"${file.name}" uploaded — processing started.`, 'success');
      loadMaterials();
    } catch (err) {
      const row = document.getElementById(rowId);
      if (row) row.remove();
      UI.toast(`Upload failed: ${UI.apiErrorMessage(err)}`, 'error');
    }
  }

  function renderUploadingRow(id, file) {
    const row = document.createElement('div');
    row.className = 'glass upload-row';
    row.id = id;
    row.innerHTML = `
      <div class="file-icon">${extLabel(file.name)}</div>
      <div class="file-info">
        <div class="file-name">${UI.escapeHtml(file.name)}</div>
        <div class="progress-track mt-16" style="height:5px;"><div class="progress-fill" style="width:100%;"></div></div>
      </div>
      <span class="spinner"></span>
    `;
    materialsList.prepend(row);
  }

  function extLabel(filename) {
    return filename.split('.').pop().toUpperCase();
  }

  async function loadMaterials() {
    try {
      const res = await Api.listMaterials('?limit=50');
      const materials = res.data.materials || [];
      materialsList.innerHTML = materials.length ? materials.map(materialRow).join('') : emptyState();

      materials
        .filter((m) => m.status === 'uploaded' || m.status === 'processing')
        .forEach((m) => schedulePoll(m._id));
    } catch (err) {
      materialsList.innerHTML = `<p class="text-muted">${UI.apiErrorMessage(err)}</p>`;
    }
  }

  function materialRow(m) {
    return `
      <div class="glass upload-row" id="material-${m._id}">
        <div class="file-icon">${m.file_type.toUpperCase()}</div>
        <div class="file-info">
          <div class="file-name">${UI.escapeHtml(m.original_filename)}</div>
          <div class="file-meta">
            ${m.file_size_kb ? Math.round(m.file_size_kb) + ' KB' : ''}
            ${m.page_count ? ' · ' + m.page_count + ' page' + (m.page_count === 1 ? '' : 's') : ''}
            ${m.topics_detected?.length ? ' · ' + m.topics_detected.slice(0, 3).join(', ') : ''}
          </div>
        </div>
        <span class="status-pill status-pill--${m.status}">${m.status}</span>
        ${m.status === 'analyzed' ? `<button class="btn btn--ghost btn--sm" data-quiz-from="${m._id}">Make quiz</button>` : ''}
        <button class="icon-btn" style="width:34px;height:34px;" data-delete-material="${m._id}" title="Delete">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6"/></svg>
        </button>
      </div>`;
  }

  function emptyState() {
    return `<div class="empty-state"><h3>No materials yet</h3><p>Drag a file above to get started.</p></div>`;
  }

  function schedulePoll(materialId) {
    if (pollTimers.has(materialId)) return;
    const timer = setInterval(async () => {
      try {
        const res = await Api.getMaterial(materialId);
        const m = res.data.material;
        const row = document.getElementById(`material-${materialId}`);
        if (row) row.outerHTML = materialRow(m);
        if (m.status === 'analyzed' || m.status === 'failed') {
          clearInterval(pollTimers.get(materialId));
          pollTimers.delete(materialId);
          if (m.status === 'analyzed') UI.toast(`"${m.original_filename}" is ready.`, 'success');
          if (m.status === 'failed') UI.toast(`"${m.original_filename}" failed to process: ${m.error_message || 'unknown error'}`, 'error');
        }
      } catch (e) {
        clearInterval(pollTimers.get(materialId));
        pollTimers.delete(materialId);
      }
    }, 3000);
    pollTimers.set(materialId, timer);
  }

  materialsList.addEventListener('click', async (e) => {
    const deleteId = e.target.closest('[data-delete-material]')?.dataset.deleteMaterial;
    const quizFromId = e.target.dataset.quizFrom;

    if (deleteId) {
      const ok = await UI.confirm('Delete this material?', 'This also removes its quizzes and processed data. This cannot be undone.', 'Delete');
      if (ok) {
        try {
          await Api.deleteMaterial(deleteId);
          UI.toast('Material deleted.', 'info');
          loadMaterials();
        } catch (err) {
          UI.toast(UI.apiErrorMessage(err), 'error');
        }
      }
    }

    if (quizFromId) {
      openQuizModal(quizFromId);
    }
  });

  // --- Quiz generation modal ---
  const quizModal = document.getElementById('quiz-modal');
  const quizForm = document.getElementById('quiz-form');
  const scopeSelect = document.getElementById('quiz-scope');
  const topicsField = document.getElementById('quiz-topics-field');

  async function openQuizModal(materialId) {
    try {
      const res = await Api.getMaterial(materialId);
      const m = res.data.material;
      document.getElementById('quiz-material-id').value = materialId;
      document.getElementById('quiz-modal-material-name').textContent = m.original_filename;
      document.getElementById('quiz-title').value = `Quiz — ${m.original_filename.replace(/\.[^.]+$/, '')}`;

      const topicsBox = document.getElementById('quiz-topics-checkboxes');
      topicsBox.innerHTML = (m.topics_detected || [])
        .map((t) => `<label class="checkbox-row"><input type="checkbox" name="topic" value="${UI.escapeHtml(t)}" /> ${UI.escapeHtml(t)}</label>`)
        .join('') || '<span class="text-sm text-muted">No topics detected for this material.</span>';

      quizModal.classList.add('is-open');
    } catch (err) {
      UI.toast(UI.apiErrorMessage(err), 'error');
    }
  }

  scopeSelect.addEventListener('change', () => {
    topicsField.style.display = scopeSelect.value === 'topics' ? 'block' : 'none';
  });

  document.getElementById('quiz-modal-cancel').addEventListener('click', () => quizModal.classList.remove('is-open'));
  quizModal.addEventListener('click', (e) => { if (e.target === quizModal) quizModal.classList.remove('is-open'); });

  quizForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const materialId = document.getElementById('quiz-material-id').value;
    const scope = scopeSelect.value;
    const selectedTopics = Array.from(document.querySelectorAll('input[name="topic"]:checked')).map((i) => i.value);
    const questionTypes = Array.from(quizForm.querySelectorAll('input[type="checkbox"]:not([name="topic"]):checked')).map((i) => i.value);

    if (questionTypes.length === 0) {
      UI.toast('Select at least one question type.', 'error');
      return;
    }
    if (scope === 'topics' && selectedTopics.length === 0) {
      UI.toast('Select at least one topic, or switch scope to "Entire document".', 'error');
      return;
    }

    const submitBtn = document.getElementById('quiz-generate-submit');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span>';

    try {
      const res = await Api.createQuiz({
        material_id: materialId,
        title: document.getElementById('quiz-title').value.trim(),
        source_scope: scope,
        scope_detail: scope === 'topics' ? { topics: selectedTopics } : {},
        question_types: questionTypes,
        difficulty: document.getElementById('quiz-difficulty').value,
        total_questions: Number(document.getElementById('quiz-count').value),
        time_limit_minutes: document.getElementById('quiz-time-limit').value ? Number(document.getElementById('quiz-time-limit').value) : undefined,
      });
      UI.toast('Quiz generated! Redirecting…', 'success');
      setTimeout(() => (window.location.href = `quiz.html?quiz=${res.data.quiz._id}`), 500);
    } catch (err) {
      UI.toast(UI.apiErrorMessage(err), 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Generate quiz';
    }
  });

  loadMaterials();
})();
