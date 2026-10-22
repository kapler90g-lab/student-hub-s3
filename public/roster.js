(() => {
  const tg = window.Telegram && window.Telegram.WebApp;
  const $ = (selector) => document.querySelector(selector);
  const panel = $('#roster-admin');
  if (!panel) return;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const date = (v) => {
    if (!v) return 'Never opened';
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? 'Unknown' : new Intl.DateTimeFormat(undefined, {year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(d);
  };
  let loading = false;
  async function api(url, options = {}) {
    const initData = tg && tg.initData || '';
    if (!initData) throw new Error('Open Student Hub from Telegram to manage the class roster.');
    const headers = {'x-telegram-init-data': initData, ...(options.headers || {})};
    if (options.body) headers['content-type'] = 'application/json';
    const response = await fetch(url, {...options, headers});
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Request failed (' + response.status + ').');
    return result;
  }
  function showMessage(text, error = false) {
    const el = $('#roster-message');
    el.textContent = text;
    el.classList.toggle('error-banner', error);
  }
  async function loadRoster() {
    if (loading || $('#rep-tools').classList.contains('hidden')) return;
    loading = true;
    $('#roster-list').innerHTML = '<div class="empty-state">Loading student activity…</div>';
    try {
      const result = await api('/api/students');
      const summary = result.summary || {};
      $('#roster-summary').innerHTML =
        '<div class="roster-stat"><strong>' + esc(summary.expected || 0) + '</strong><span>Expected students</span></div>' +
        '<div class="roster-stat"><strong>' + esc(summary.used || 0) + '</strong><span>Opened the app</span></div>' +
        '<div class="roster-stat"><strong>' + esc(summary.not_used || 0) + '</strong><span>Not yet opened</span></div>' +
        '<div class="roster-stat"><strong>' + esc(summary.other_accounts || 0) + '</strong><span>Other accounts</span></div>';
      const students = result.students || [];
      $('#roster-list').innerHTML = students.length ? students.map(s => {
        const expected = Boolean(s.expected);
        const used = Boolean(s.registered_at);
        const status = expected ? (used ? '<span class="roster-status used">Opened</span>' : '<span class="roster-status not-used">Not yet opened</span>') : '<span class="roster-status other">Not on roster</span>';
        const name = s.full_name || s.telegram_first_name || 'Unnamed student';
        const handle = s.username ? '@' + s.username : 'No username';
        return '<article class="roster-row"><div class="roster-person"><strong>' + esc(name) + '</strong><span>' + esc(handle) + ' · ID ' + esc(s.telegram_id) + '</span><small>Last active: ' + esc(date(s.last_seen_at)) + '</small></div>' + status + '</article>';
      }).join('') : '<div class="empty-state">No students listed yet. Add your expected class roster above.</div>';
    } catch (error) {
      $('#roster-summary').innerHTML = '<div class="empty-state">Could not load student usage. Check that the student-roster SQL migration has been run.</div>';
      $('#roster-list').innerHTML = '';
      showMessage(error.message, true);
    } finally { loading = false; }
  }
  $('#roster-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    showMessage('');
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      await api('/api/students', {method:'POST', body:JSON.stringify(payload)});
      form.reset();
      showMessage('Student added to the expected class roster.');
      await loadRoster();
    } catch (error) { showMessage(error.message, true); }
    finally { button.disabled = false; }
  });
  $('#refresh-roster').addEventListener('click', loadRoster);
  const repTools = $('#rep-tools');
  const observer = new MutationObserver(() => { if (!repTools.classList.contains('hidden')) loadRoster(); });
  observer.observe(repTools, {attributes:true,attributeFilter:['class']});
  if (!repTools.classList.contains('hidden')) loadRoster();
})();