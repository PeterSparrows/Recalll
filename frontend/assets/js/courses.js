(async () => {
  const user = await Auth.requireAuth();
  if (!user) return;
  Shell.render({ page: 'courses', title: 'Courses' });

  let currentFilter = 'active';
  const grid = document.getElementById('courses-grid');
  const modal = document.getElementById('course-modal');
  const form = document.getElementById('course-form');

  async function loadCourses() {
    grid.innerHTML = `<div class="skeleton" style="height:150px;"></div><div class="skeleton" style="height:150px;"></div>`;
    try {
      const res = await Api.listCourses(`?status=${currentFilter}`);
      const courses = res.data.courses || [];
      grid.innerHTML = courses.length ? courses.map(courseCard).join('') : emptyState();
    } catch (err) {
      grid.innerHTML = `<p class="text-muted">${UI.apiErrorMessage(err)}</p>`;
    }
  }

  function courseCard(c) {
    return `
      <div class="glass stack-card card" data-course-id="${c._id}">
        <div class="flex" style="justify-content:space-between; margin-bottom:10px;">
          <span class="badge badge--neutral mono">${UI.escapeHtml(c.code)}</span>
          <div class="flex gap-8">
            <button class="icon-btn btn--sm" style="width:30px;height:30px;" data-edit="${c._id}" title="Edit">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
            </button>
          </div>
        </div>
        <h3 style="font-size:1.05rem; margin-bottom:6px;">${UI.escapeHtml(c.title)}</h3>
        <p class="text-sm text-muted" style="min-height:2.6em;">${UI.escapeHtml(c.description || 'No description yet.')}</p>
        <div class="flex gap-8 mt-16">
          ${
            currentFilter === 'active'
              ? `<button class="btn btn--ghost btn--sm" data-archive="${c._id}">Archive</button>`
              : `<button class="btn btn--ghost btn--sm" data-unarchive="${c._id}">Unarchive</button>`
          }
          <button class="btn btn--danger btn--sm" data-delete="${c._id}">Delete</button>
        </div>
      </div>`;
  }

  function emptyState() {
    return `<div class="empty-state glass" style="grid-column:1/-1;">
      <h3>No ${currentFilter} courses</h3>
      <p>${currentFilter === 'active' ? 'Create your first course to start organizing materials.' : 'Nothing archived right now.'}</p>
      ${currentFilter === 'active' ? '<button class="btn btn--primary" id="empty-new-course">+ New course</button>' : ''}
    </div>`;
  }

  document.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach((b) => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      currentFilter = btn.dataset.filter;
      loadCourses();
    });
  });

  function openModal(course) {
    document.getElementById('course-modal-title').textContent = course ? 'Edit course' : 'New course';
    document.getElementById('course-id').value = course?._id || '';
    document.getElementById('course-code').value = course?.code || '';
    document.getElementById('course-title').value = course?.title || '';
    document.getElementById('course-desc').value = course?.description || '';
    modal.classList.add('is-open');
  }
  function closeModal() { modal.classList.remove('is-open'); }

  document.getElementById('new-course-btn').addEventListener('click', () => openModal(null));
  document.getElementById('course-modal-cancel').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('course-id').value;
    const payload = {
      code: document.getElementById('course-code').value.trim(),
      title: document.getElementById('course-title').value.trim(),
      description: document.getElementById('course-desc').value.trim(),
    };
    try {
      if (id) {
        await Api.updateCourse(id, payload);
        UI.toast('Course updated.', 'success');
      } else {
        await Api.createCourse(payload);
        UI.toast('Course created.', 'success');
      }
      closeModal();
      loadCourses();
    } catch (err) {
      UI.toast(UI.apiErrorMessage(err), 'error');
    }
  });

  grid.addEventListener('click', async (e) => {
    const editId = e.target.closest('[data-edit]')?.dataset.edit;
    const archiveId = e.target.dataset.archive;
    const unarchiveId = e.target.dataset.unarchive;
    const deleteId = e.target.dataset.delete;

    try {
      if (editId) {
        const res = await Api.listCourses(`?status=${currentFilter}`);
        const course = (res.data.courses || []).find((c) => c._id === editId);
        openModal(course);
      } else if (archiveId) {
        await Api.archiveCourse(archiveId);
        UI.toast('Course archived.', 'info');
        loadCourses();
      } else if (unarchiveId) {
        await Api.unarchiveCourse(unarchiveId);
        UI.toast('Course restored.', 'success');
        loadCourses();
      } else if (deleteId) {
        const ok = await UI.confirm(
          'Delete this course?',
          'Materials linked to this course will NOT be deleted — they will just become unlinked from this course.',
          'Delete course'
        );
        if (ok) {
          await Api.deleteCourse(deleteId);
          UI.toast('Course deleted. Materials were kept.', 'info');
          loadCourses();
        }
      }
    } catch (err) {
      UI.toast(UI.apiErrorMessage(err), 'error');
    }
  });

  document.body.addEventListener('click', (e) => {
    if (e.target.id === 'empty-new-course') openModal(null);
  });

  loadCourses();
})();
