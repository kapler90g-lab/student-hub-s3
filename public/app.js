(() => {
  const tg = window.Telegram?.WebApp;
  if (tg) { tg.ready(); tg.expand(); }
  const $ = (selector) => document.querySelector(selector);
  const state = { viewer: null, subjects: [], announcements: [], resources: [], selectedSubject: 'all', query: '', type: 'all' };
  const priorityRank = { urgent: 0, important: 1, normal: 2 };
  const tabNames = ['announcements', 'timetable', 'subjects', 'search'];
  function activateTab(name) {
    if (!tabNames.includes(name)) return;
    document.querySelectorAll('[data-main-tab]').forEach(button => {
      const active = button.dataset.mainTab === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    document.querySelectorAll('[data-tab-panel]').forEach(panel => panel.classList.toggle('tab-hidden', panel.dataset.tabPanel !== name));
    if (name === 'timetable') document.querySelector('#timetable-section')?.scrollIntoView({behavior:'smooth',block:'start'});
    else document.querySelector('[data-tab-panel="' + name + '"]')?.scrollIntoView({behavior:'smooth',block:'start'});
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-main-tab]');
    if (button) activateTab(button.dataset.mainTab);
  });
  activateTab('announcements');
  let toastTimer;

  function escapeHtml(value = '') {
    return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function fmtDate(value, includeTime = false) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, includeTime
      ? { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }
      : { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
  }
  function humanType(type) {
    return ({ notes:'Lecture notes', slides:'Slides', assignment:'Assignment', past_paper:'Past paper', reading:'Reading', other:'Other' })[type] || type || 'Material';
  }
  function subjectName(id) { return state.subjects.find(s => s.id === id)?.name || 'General'; }
  function subjectEmoji(id) { return state.subjects.find(s => s.id === id)?.emoji || '📚'; }
  function showToast(message) {
    const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
  }
  function showError(message) { const el = $('#error-banner'); el.textContent = message; el.classList.remove('hidden'); }
  function clearError() { $('#error-banner').classList.add('hidden'); }
  function setBusy(form, busy, text) {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    if (busy) { button.dataset.original = button.textContent; button.disabled = true; button.textContent = text || 'Please wait…'; }
    else { button.disabled = false; button.textContent = button.dataset.original || 'Submit'; }
  }
  async function api(url, options = {}) {
    const initData = tg?.initData || '';
    if (!initData) throw new Error('Please open Student Hub from its Telegram bot. Browser preview cannot sign you in.');
    const headers = { 'x-telegram-init-data': initData, ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers['content-type'] = 'application/json';
    const response = await fetch(url, { ...options, headers });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
    return result;
  }
  function renderSubjects() {
    const grid = $('#subject-list');
    const subjectFilter = $('#subject-filter');
    const current = subjectFilter.value || 'all';
    subjectFilter.innerHTML = `<option value="all">All subjects</option>` + state.subjects.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
    subjectFilter.value = state.subjects.some(s => String(s.id) === String(current)) || current === 'all' ? current : 'all';
    $('#announcement-subject').innerHTML = `<option value="">General / all subjects</option>` + state.subjects.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
    $('#resource-subject').innerHTML = state.subjects.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`).join('');
    const orderedSubjects = [...state.subjects].sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || String(a.name || '').localeCompare(String(b.name || '')));
    grid.innerHTML = orderedSubjects.length ? orderedSubjects.map(s => {
      const count = state.resources.filter(r => String(r.subject_id) === String(s.id)).length;
      return `<button type="button" class="subject-tile ${state.selectedSubject === s.id ? 'selected' : ''}" data-subject="${escapeHtml(s.id)}">
        <span class="subject-emoji">${escapeHtml(s.emoji || '📚')}</span><span><strong>${escapeHtml(s.name)}</strong><small>${count} ${count === 1 ? 'resource' : 'resources'}</small></span></button>`;
    }).join('') : '<div class="empty-state">No subjects yet. A representative can add the class subjects.</div>';
    grid.querySelectorAll('[data-subject]').forEach(button => button.addEventListener('click', () => {
      state.selectedSubject = state.selectedSubject === button.dataset.subject ? 'all' : button.dataset.subject;
      $('#subject-filter').value = state.selectedSubject;
      renderSubjects(); renderResources();
      $('#library-title').textContent = state.selectedSubject === 'all' ? 'Recent study materials' : `${subjectName(state.selectedSubject)} materials`;
      $('#resource-list').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
  }
  function announcementMarkup(a, compact = false) {
    const priority = a.priority || 'normal';
    const deadline = a.deadline_at ? `<span>⏳ Deadline: ${escapeHtml(fmtDate(a.deadline_at, true))}</span>` : '';
    const subject = a.subjects?.name || (a.subject_id ? subjectName(a.subject_id) : 'All subjects');
    return `<article class="${compact ? 'priority-card' : 'announcement-card'} ${priority}">
      <div class="priority-top"><span class="priority-label ${priority}">${priority === 'urgent' ? '🔴 Urgent' : priority === 'important' ? '🟠 Important' : 'Announcement'}</span>${a.pinned ? '<span class="pin-label">📌 Pinned</span>' : ''}</div>
      <h3 class="card-title">${escapeHtml(a.title)}</h3><p class="card-body">${escapeHtml(a.body)}</p>
      <div class="card-meta"><span>${escapeHtml(subject)}</span><span>Published ${escapeHtml(fmtDate(a.created_at, true))}</span>${deadline}</div>
      ${state.viewer?.is_rep ? `<div class="resource-actions"><button type="button" class="text-button" data-delete-announcement="${escapeHtml(a.id)}">Delete notice</button></div>` : ''}
    </article>`;
  }
  function renderAnnouncements() {
    const now = Date.now();
    const live = state.announcements.filter(a => !a.expires_at || new Date(a.expires_at).getTime() > now);
    const sorted = [...live].sort((a,b) => Number(b.pinned)-Number(a.pinned) || priorityRank[a.priority]-priorityRank[b.priority] || new Date(b.created_at)-new Date(a.created_at));
    const important = sorted.filter(a => a.priority !== 'normal' || a.pinned).slice(0, 4);
    $('#notice-count').textContent = String(important.length);
    $('#priority-feed').innerHTML = important.length ? important.map(a => announcementMarkup(a, true)).join('') : '<div class="empty-state">No urgent or pinned updates right now. Check all announcements below.</div>';
    $('#all-announcements').innerHTML = sorted.length ? sorted.map(a => announcementMarkup(a)).join('') : '<div class="empty-state">No announcements yet.</div>';
    document.querySelectorAll('[data-delete-announcement]').forEach(button => button.addEventListener('click', async () => {
      if (!confirm('Delete this announcement? This cannot be undone.')) return;
      try { await api(`/api/announcements/${encodeURIComponent(button.dataset.deleteAnnouncement)}`, { method: 'DELETE' }); await reload(); showToast('Announcement deleted.'); }
      catch (e) { showToast(e.message); }
    }));
  }
  function renderResources() {
    const query = state.query.trim().toLowerCase();
    const filtered = state.resources.filter(r => {
      const subject = r.subjects?.name || subjectName(r.subject_id);
      const matchesQuery = !query || [r.title, r.description, r.file_name, subject, humanType(r.material_type)].some(v => String(v || '').toLowerCase().includes(query));
      return matchesQuery && (state.selectedSubject === 'all' || r.subject_id === state.selectedSubject)
        && (state.type === 'all' || r.material_type === state.type);
    });
    $('#resource-count').textContent = String(filtered.length);
    $('#resource-list').innerHTML = filtered.length ? filtered.map(r => {
      const size = r.file_size ? `${(r.file_size / (1024*1024)).toFixed(r.file_size < 1024*1024 ? 2 : 1)} MB` : '';
      const ext = (r.file_name || '').split('.').pop().toLowerCase();
      const icon = ext === 'pdf' ? '📕' : ['ppt','pptx'].includes(ext) ? '📊' : ['doc','docx','txt'].includes(ext) ? '📝' : ['jpg','jpeg','png'].includes(ext) ? '🖼️' : '📎';
      return `<article class="resource-card"><div class="file-icon">${icon}</div><div class="resource-content">
        <div class="resource-top"><span class="type-chip">${escapeHtml(humanType(r.material_type))}</span>${r.priority === 'important' ? '<span class="priority-label important">Important</span>' : ''}</div>
        <h3 class="card-title">${escapeHtml(r.title)}</h3>
        ${r.description ? `<p class="card-body">${escapeHtml(r.description)}</p>` : ''}
        <div class="card-meta"><span>${escapeHtml(r.subjects?.emoji || subjectEmoji(r.subject_id))} ${escapeHtml(r.subjects?.name || subjectName(r.subject_id))}</span><span>${escapeHtml(fmtDate(r.created_at))}</span>${size ? `<span>${escapeHtml(size)}</span>` : ''}</div>
        <div class="resource-actions">${r.download_url ? `<a class="download-link" href="${escapeHtml(r.download_url)}" target="_blank" rel="noopener noreferrer">Open / download ↗</a>` : '<span class="muted">File link unavailable — refresh to try again.</span>'}${state.viewer?.is_rep ? `<button type="button" class="text-button" data-delete-resource="${escapeHtml(r.id)}">Delete</button>` : ''}</div>
      </div></article>`;
    }).join('') : '<div class="empty-state">No materials match your search. Try another keyword or filter.</div>';
    document.querySelectorAll('[data-delete-resource]').forEach(button => button.addEventListener('click', async () => {
      if (!confirm('Delete this material and its stored file? This cannot be undone.')) return;
      try { await api(`/api/resources/${encodeURIComponent(button.dataset.deleteResource)}`, { method: 'DELETE' }); await reload(); showToast('Material deleted.'); }
      catch (e) { showToast(e.message); }
    }));
  }
  function renderAll() {
    $('#welcome-title').textContent = `Welcome, ${state.viewer?.first_name || 'student'} 👋`;
    $('#role-pill').textContent = state.viewer?.is_rep ? 'Representative' : 'Student';
    $('#rep-tools').classList.toggle('hidden', !state.viewer?.is_rep);
    renderSubjects(); renderAnnouncements(); renderResources();
  }
  async function reload() {
    clearError();
    const data = await api('/api/bootstrap');
    state.viewer = data.viewer; state.subjects = data.subjects || [];
    state.announcements = data.announcements || []; state.resources = data.resources || [];
    renderAll();
  }
  function openDialog(id) { const d = document.getElementById(id); if (d?.showModal) d.showModal(); else d?.setAttribute('open',''); }
  function closeDialog(id) { const d = document.getElementById(id); if (d?.close) d.close(); else d?.removeAttribute('open'); }
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeDialog(b.dataset.close)));
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));
  $('#open-announcement').addEventListener('click', () => openDialog('announcement-dialog'));
  $('#open-resource').addEventListener('click', () => openDialog('resource-dialog'));
  $('#open-subject').addEventListener('click', () => openDialog('subject-dialog'));
  $('#search-input').addEventListener('input', e => { state.query = e.target.value; renderResources(); });
  $('#clear-search').addEventListener('click', () => { $('#search-input').value = ''; state.query = ''; renderResources(); });
  $('#subject-filter').addEventListener('change', e => { state.selectedSubject = e.target.value; renderSubjects(); renderResources(); $('#library-title').textContent = state.selectedSubject === 'all' ? 'Recent study materials' : `${subjectName(state.selectedSubject)} materials`; });
  $('#type-filter').addEventListener('change', e => { state.type = e.target.value; renderResources(); });

  $('#announcement-form').addEventListener('submit', async e => {
    e.preventDefault(); const form = e.currentTarget; setBusy(form, true, 'Publishing…');
    try {
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      payload.pinned = fd.has('pinned');
      for (const key of ['deadline_at','expires_at']) if (payload[key]) payload[key] = new Date(payload[key]).toISOString(); else payload[key] = null;
      await api('/api/announcements', { method: 'POST', body: JSON.stringify(payload) });
      form.reset(); closeDialog('announcement-dialog'); await reload(); showToast('Announcement published.');
    } catch (err) { showToast(err.message); } finally { setBusy(form, false); }
  });
  $('#resource-form').addEventListener('submit', async e => {
    e.preventDefault(); const form = e.currentTarget; setBusy(form, true, 'Uploading…');
    try {
      const fd = new FormData(form);
      await api('/api/resources', { method: 'POST', body: fd });
      form.reset(); closeDialog('resource-dialog'); await reload(); showToast('Material uploaded and published.');
    } catch (err) { showToast(err.message); } finally { setBusy(form, false); }
  });
  $('#subject-form').addEventListener('submit', async e => {
    e.preventDefault(); const form = e.currentTarget; setBusy(form, true, 'Adding…');
    try {
      const fd = new FormData(form);
      await api('/api/subjects', { method: 'POST', body: JSON.stringify({ name: fd.get('name'), emoji: fd.get('emoji'), sort_order: fd.get('sort_order') }) });
      form.reset(); form.elements.emoji.value = '📚'; closeDialog('subject-dialog'); await reload(); showToast('Subject added.');
    } catch (err) { showToast(err.message); } finally { setBusy(form, false); }
  });

  reload().catch(err => {
    showError(err.message);
    $('#priority-feed').innerHTML = '<div class="empty-state">Could not load updates. Open this app from Telegram and check the server setup.</div>';
    $('#resource-list').innerHTML = '<div class="empty-state">Materials will appear here once the app is connected.</div>';
  });
})();
