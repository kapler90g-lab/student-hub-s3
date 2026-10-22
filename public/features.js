(() => {
  const tg = window.Telegram && window.Telegram.WebApp;
  const $ = (s, root = document) => root.querySelector(s);
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (v, time) => {
    if (!v) return '';
    const d = new Date(v); if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, time ? {month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'} : {month:'short',day:'numeric',year:'numeric'}).format(d);
  };
  const humanType = (v) => ({notes:'Lecture notes',slides:'Slides',assignment:'Assignment',past_paper:'Past paper',reading:'Reading',other:'Other'}[v] || v || 'Material');
  const readSet = new Set(readList('student-hub-read-announcements'));
  const savedSet = new Set(readList('student-hub-bookmarks'));
  let data = {subjects:[],announcements:[],resources:[]};
  let folderSubject = null, folderTab = 'overview', searchQuery = '';
  function readList(key) { try { const x = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(x) ? x.map(String) : []; } catch (_) { return []; } }
  function persist(key, set) { try { localStorage.setItem(key, JSON.stringify(Array.from(set))); } catch (_) {} }
  function saved(kind, id) { return savedSet.has(kind + ':' + id); }
  function subjectName(id) { const s = data.subjects.find(x => String(x.id) === String(id)); return s ? s.name : 'General'; }
  function toast(message) {
    const el = $('#toast'); if (!el) return;
    el.textContent = message; el.classList.add('show');
    window.setTimeout(() => el.classList.remove('show'), 2200);
  }
  async function loadData() {
    const initData = tg && tg.initData || '';
    if (!initData) return;
    try {
      const res = await fetch('/api/bootstrap', {headers:{'x-telegram-init-data':initData}});
      if (!res.ok) return;
      data = await res.json();
      data.subjects = data.subjects || []; data.announcements = data.announcements || []; data.resources = data.resources || [];
      renderFolder(); renderDeadlines(); renderSaved(); renderGlobalSearch();
      decorateCards();
    } catch (_) {}
  }
  function announcementCard(a) {
    const unread = !readSet.has(String(a.id));
    return '<article class="announcement-card"><div class="priority-top"><span class="priority-label ' + esc(a.priority || 'normal') + '">' + esc(a.priority || 'normal') + '</span>' +
      (unread ? '<span class="new-label">NEW</span>' : '') + '</div><h3 class="card-title">' + esc(a.title) + '</h3><p class="card-body">' + esc(a.body) + '</p>' +
      '<div class="card-meta"><span>' + esc(a.subjects && a.subjects.name || subjectName(a.subject_id)) + '</span><span>' + esc(fmt(a.created_at, true)) + '</span>' +
      (a.deadline_at ? '<span>Due ' + esc(fmt(a.deadline_at, true)) + '</span>' : '') + '</div><div class="resource-actions">' +
      '<button type="button" class="text-button" data-feature-read="' + esc(a.id) + '">' + (unread ? 'Mark as read' : '✓ Read') + '</button>' +
      '<button type="button" class="text-button" data-feature-save-announcement="' + esc(a.id) + '">' + (saved('announcement', a.id) ? '★ Saved' : '☆ Save') + '</button></div></article>';
  }
  function resourceCard(r) {
    return '<article class="resource-card"><div class="file-icon">📎</div><div class="resource-content"><div class="resource-top"><span class="type-chip">' + esc(humanType(r.material_type)) + '</span></div>' +
      '<h3 class="card-title">' + esc(r.title) + '</h3>' + (r.description ? '<p class="card-body">' + esc(r.description) + '</p>' : '') +
      '<div class="card-meta"><span>' + esc((r.subjects && r.subjects.emoji || '📚') + ' ' + (r.subjects && r.subjects.name || subjectName(r.subject_id))) + '</span><span>' + esc(fmt(r.created_at)) + '</span></div>' +
      '<div class="resource-actions">' + (r.download_url ? '<a class="download-link" href="' + esc(r.download_url) + '" target="_blank" rel="noopener noreferrer">Open / download ↗</a>' : '<span class="muted">File link unavailable. Refresh to try again.</span>') +
      '<button type="button" class="text-button" data-feature-save-resource="' + esc(r.id) + '">' + (saved('resource', r.id) ? '★ Saved' : '☆ Save') + '</button></div></div></article>';
  }
  function renderFolder() {
    const section = $('#subject-detail');
    if (!section || !folderSubject) return;
    const subject = data.subjects.find(s => String(s.id) === String(folderSubject));
    if (!subject) { section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    const anns = data.announcements.filter(a => String(a.subject_id || '') === String(subject.id));
    const general = data.announcements.filter(a => !a.subject_id);
    const files = data.resources.filter(r => String(r.subject_id) === String(subject.id));
    const deadlines = anns.filter(a => a.deadline_at).sort((a,b) => new Date(a.deadline_at)-new Date(b.deadline_at));
    const assignments = files.filter(r => r.material_type === 'assignment');
    const papers = files.filter(r => r.material_type === 'past_paper');
    $('#folder-title').textContent = (subject.emoji || '📚') + ' ' + subject.name;
    $('#folder-summary').textContent = files.length + ' materials · ' + anns.length + ' related announcements';
    document.querySelectorAll('[data-folder-tab]').forEach(b => b.classList.toggle('active', b.dataset.folderTab === folderTab));
    let out = '';
    if (folderTab === 'overview') {
      out = '<div class="folder-stat-grid"><div><strong>' + files.length + '</strong><span>Materials</span></div><div><strong>' + anns.length + '</strong><span>Announcements</span></div><div><strong>' + (deadlines.length + assignments.length) + '</strong><span>Assignments / deadlines</span></div></div>';
      out += '<h3 class="subheading">Latest announcements</h3>' + (anns.length ? anns.slice(0,3).map(announcementCard).join('') : '<div class="empty-state">No subject announcements yet.</div>');
      out += '<h3 class="subheading">Study materials</h3>' + (files.length ? files.slice(0,4).map(resourceCard).join('') : '<div class="empty-state">No files have been shared for this subject yet.</div>');
      if (general.length) out += '<h3 class="subheading">Class-wide announcements</h3>' + general.slice(0,2).map(announcementCard).join('');
    } else if (folderTab === 'announcements') out = anns.length ? anns.map(announcementCard).join('') : '<div class="empty-state">No announcements for this subject yet.</div>';
    else if (folderTab === 'materials') {
      const list = files.filter(r => !['assignment','past_paper'].includes(r.material_type));
      out = list.length ? list.map(resourceCard).join('') : '<div class="empty-state">No lecture notes or general materials yet.</div>';
    } else if (folderTab === 'assignments') {
      out = deadlines.map(a => '<article class="deadline-card"><span class="type-chip">Announcement deadline</span><h3 class="card-title">' + esc(a.title) + '</h3><p class="card-body">' + esc(a.body) + '</p><div class="deadline-date">Due ' + esc(fmt(a.deadline_at, true)) + '</div>' + featureButtons(a) + '</article>').join('');
      out += assignments.map(resourceCard).join('');
      if (!deadlines.length && !assignments.length) out = '<div class="empty-state">No assignments or deadlines posted for this subject yet.</div>';
    } else out = papers.length ? papers.map(resourceCard).join('') : '<div class="empty-state">No past papers have been shared for this subject yet.</div>';
    $('#folder-content').innerHTML = out;
  }
  function featureButtons(a) {
    return '<div class="resource-actions"><button type="button" class="text-button" data-feature-read="' + esc(a.id) + '">' + (readSet.has(String(a.id)) ? '✓ Read' : 'Mark as read') + '</button><button type="button" class="text-button" data-feature-save-announcement="' + esc(a.id) + '">' + (saved('announcement', a.id) ? '★ Saved' : '☆ Save') + '</button></div>';
  }
  function renderDeadlines() {
    const el = $('#deadline-list'); if (!el) return;
    const items = data.announcements.filter(a => a.deadline_at && new Date(a.deadline_at).getTime() >= Date.now()).sort((a,b) => new Date(a.deadline_at)-new Date(b.deadline_at));
    $('#deadline-count').textContent = String(items.length);
    el.innerHTML = items.length ? items.map(a => '<article class="deadline-card"><div class="priority-top"><span class="type-chip">' + esc(a.subjects && a.subjects.name || subjectName(a.subject_id)) + '</span><span class="deadline-date">Due ' + esc(fmt(a.deadline_at, true)) + '</span></div><h3 class="card-title">' + esc(a.title) + '</h3><p class="card-body">' + esc(a.body) + '</p>' + featureButtons(a) + '</article>').join('') : '<div class="empty-state">No upcoming deadlines have been posted yet. Representatives can add a deadline to an announcement.</div>';
  }
  function renderSaved() {
    const el = $('#saved-list'); if (!el) return;
    const items = Array.from(savedSet).map(k => { const p = k.indexOf(':'); const kind = k.slice(0,p), id = k.slice(p+1); return kind === 'resource' ? data.resources.find(r => String(r.id) === id) : data.announcements.find(a => String(a.id) === id); }).filter(Boolean);
    $('#saved-count').textContent = String(items.length);
    el.innerHTML = items.length ? items.map(x => data.resources.includes(x) ? resourceCard(x) : announcementCard(x)).join('') : '<div class="empty-state">Nothing saved yet. Use ☆ Save on an announcement or material to keep it here for revision.</div>';
  }
  function renderGlobalSearch() {
    const el = $('#global-search-results'); if (!el) return;
    const q = searchQuery.trim().toLowerCase();
    if (!q) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    const subjects = data.subjects.filter(s => (s.name + ' ' + (s.emoji || '')).toLowerCase().includes(q));
    const anns = data.announcements.filter(a => [a.title,a.body,a.subjects && a.subjects.name,subjectName(a.subject_id)].join(' ').toLowerCase().includes(q));
    const files = data.resources.filter(r => [r.title,r.description,r.file_name,r.subjects && r.subjects.name,subjectName(r.subject_id),humanType(r.material_type)].join(' ').toLowerCase().includes(q));
    el.classList.remove('hidden');
    el.innerHTML = '<h3 class="subheading">Search all content</h3>' +
      (subjects.length ? '<div class="search-subjects">' + subjects.map(s => '<button type="button" class="subject-tile" data-open-feature-subject="' + esc(s.id) + '"><span class="subject-emoji">' + esc(s.emoji || '📚') + '</span><span><strong>' + esc(s.name) + '</strong><small>Open subject folder</small></span></button>').join('') + '</div>' : '') +
      (anns.length ? '<h4 class="subheading">Announcements (' + anns.length + ')</h4>' + anns.slice(0,8).map(announcementCard).join('') : '') +
      (files.length ? '<h4 class="subheading">Materials (' + files.length + ')</h4>' + files.slice(0,8).map(resourceCard).join('') : '') +
      (!subjects.length && !anns.length && !files.length ? '<div class="empty-state">No subjects, announcements, or materials matched that search.</div>' : '');
  }
  function decorateCards() {
    document.querySelectorAll('#all-announcements article, #priority-feed article').forEach(card => {
      const title = $('.card-title', card); if (!title) return;
      const a = data.announcements.find(x => x.title === title.textContent); if (!a) return;
      if (!$('[data-feature-save-announcement]', card)) {
        const actions = $('.resource-actions', card) || card.appendChild(document.createElement('div'));
        actions.classList.add('resource-actions');
        actions.insertAdjacentHTML('beforeend', featureButtons(a));
      }
      if (!readSet.has(String(a.id)) && !$('.new-label', card)) $('.priority-top', card)?.insertAdjacentHTML('beforeend', '<span class="new-label">NEW</span>');
    });
    document.querySelectorAll('#resource-list article.resource-card').forEach(card => {
      const title = $('.card-title', card); if (!title) return;
      const r = data.resources.find(x => x.title === title.textContent); if (!r || $('[data-feature-save-resource]', card)) return;
      const actions = $('.resource-actions', card); if (actions) actions.insertAdjacentHTML('beforeend', '<button type="button" class="text-button" data-feature-save-resource="' + esc(r.id) + '">' + (saved('resource', r.id) ? '★ Saved' : '☆ Save') + '</button>');
    });
  }
  function refresh() { renderFolder(); renderDeadlines(); renderSaved(); renderGlobalSearch(); decorateCards(); }
  document.addEventListener('click', (e) => {
    const subjectButton = e.target.closest('[data-subject]');
    if (subjectButton && subjectButton.closest('#subject-list')) {
      e.preventDefault(); e.stopImmediatePropagation();
      folderSubject = subjectButton.dataset.subject; folderTab = 'overview'; renderFolder();
      $('#subject-detail').scrollIntoView({behavior:'smooth',block:'start'}); return;
    }
  }, true);
  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-folder-tab]');
    if (tab) { folderTab = tab.dataset.folderTab; renderFolder(); return; }
    if (e.target.closest('#close-subject')) { folderSubject = null; $('#subject-detail').classList.add('hidden'); $('#subject-list').scrollIntoView({behavior:'smooth',block:'start'}); return; }
    const open = e.target.closest('[data-open-feature-subject]');
    if (open) { folderSubject = open.dataset.openFeatureSubject; folderTab = 'overview'; renderFolder(); $('#subject-detail').scrollIntoView({behavior:'smooth',block:'start'}); return; }
    const read = e.target.closest('[data-feature-read]');
    if (read) { readSet.add(String(read.dataset.featureRead)); persist('student-hub-read-announcements', readSet); refresh(); return; }
    const saveA = e.target.closest('[data-feature-save-announcement]');
    if (saveA) { const k = 'announcement:' + saveA.dataset.featureSaveAnnouncement; savedSet.has(k) ? savedSet.delete(k) : savedSet.add(k); persist('student-hub-bookmarks', savedSet); refresh(); return; }
    const saveR = e.target.closest('[data-feature-save-resource]');
    if (saveR) { const k = 'resource:' + saveR.dataset.featureSaveResource; savedSet.has(k) ? savedSet.delete(k) : savedSet.add(k); persist('student-hub-bookmarks', savedSet); refresh(); }
  });
  const search = $('#search-input');
  if (search) {
    const box = search.closest('.search-box');
    if (box) box.insertAdjacentHTML('afterend', '<div id="global-search-results" class="global-search-results hidden"></div>');
    search.addEventListener('input', () => { searchQuery = search.value || ''; renderGlobalSearch(); });
    $('#clear-search')?.addEventListener('click', () => { searchQuery = ''; renderGlobalSearch(); });
  }
  const observer = new MutationObserver(() => decorateCards());
  ['#all-announcements','#priority-feed','#resource-list'].forEach(sel => { const el = $(sel); if (el) observer.observe(el, {childList:true,subtree:true}); });
  loadData();
  document.addEventListener('submit', (e) => { if (e.target.matches('#announcement-form,#resource-form,#subject-form')) window.setTimeout(loadData, 1800); }, true);
})();