(() => {
  const tg = window.Telegram?.WebApp;
  const $ = (s) => document.querySelector(s);
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const periods = [
    { time: '2:00–2:50', label: 'PERIOD 1', lessons: ['Critical Thinking', 'Physical Fitness', 'English (1)', '', 'Psychology'] },
    { time: '3:00–3:50', label: 'PERIOD 2', lessons: ['Critical Thinking', 'Physical Fitness', 'English (1)', '', 'Psychology'] },
    { time: '4:00–4:50', label: 'PERIOD 3', lessons: ['English (2)', 'Physics', 'English (2)', '', ''] },
    { time: '5:00–5:50', label: 'PERIOD 4', lessons: ['English (2)', 'Physics', '', '', ''] },
    { time: '7:30–8:20', label: 'PERIOD 5', lessons: ['General Physics', 'Mathematics', 'Mathematics', 'Geography', ''] },
    { time: '8:30–9:20', label: 'PERIOD 6', lessons: ['Psychology (every 2 weeks)', 'Mathematics', "Critical Thinking (teacher won't come)", 'Geography', ''] },
    { time: '9:30–10:20', label: 'PERIOD 7', lessons: ['History', 'English (1)', 'Geography', '', ''] },
    { time: '10:30–11:20', label: 'PERIOD 8', lessons: ['History', '', '', '', ''] }
  ];
  let schedule = periods.map(p => ({...p, lessons:[...p.lessons]}));
  let isRep = false;
  let editing = false;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function api(url, options = {}) {
    const initData = tg?.initData || '';
    if (!initData) throw new Error('Open Student Hub from Telegram to view the timetable.');
    const headers = {'x-telegram-init-data': initData, ...(options.headers || {})};
    if (options.body) headers['content-type'] = 'application/json';
    const response = await fetch(url, {...options, headers});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Could not load timetable.');
    return data;
  }
  function render() {
    const head = '<thead><tr><th scope="col">PERIOD / TIME</th>' + days.map(d => '<th scope="col">' + d + '</th>').join('') + '</tr></thead>';
    const body = '<tbody>' + schedule.map((p, ri) => '<tr><th scope="row"><strong>' + escapeHtml(p.label) + '</strong><span class="timetable-time">' + escapeHtml(p.time) + '</span></th>' + p.lessons.map((lesson, di) => '<td data-day="' + days[di] + '">' + (editing ? '<input class="timetable-cell-input" aria-label="' + escapeHtml(p.label + ', ' + days[di]) + '" data-row="' + ri + '" data-day-index="' + di + '" maxlength="100" value="' + escapeHtml(lesson) + '" placeholder="—">' : '<span class="timetable-lesson">' + (lesson.trim() ? escapeHtml(lesson) : '<span class="timetable-empty">—</span>') + '</span>') + '</td>').join('') + '</tr>').join('') + '</tbody>';
    $('#timetable-table').innerHTML = head + body;
    $('#timetable-edit').classList.toggle('hidden', !isRep || editing);
    $('#timetable-save').classList.toggle('hidden', !isRep || !editing);
    $('#timetable-cancel').classList.toggle('hidden', !isRep || !editing);
    $('#timetable-status').textContent = editing ? 'Editing mode: update any cell, then save.' : (isRep ? 'Only the class representative can edit this timetable.' : 'Read-only class timetable.');
  }
  function collectEdits() {
    document.querySelectorAll('.timetable-cell-input').forEach(input => {
      const ri = Number(input.dataset.row), di = Number(input.dataset.dayIndex);
      if (schedule[ri] && Number.isInteger(di)) schedule[ri].lessons[di] = input.value.trim();
    });
  }
  $('#timetable-edit').addEventListener('click', () => { editing = true; render(); });
  $('#timetable-cancel').addEventListener('click', async () => { editing = false; await load(); });
  $('#timetable-save').addEventListener('click', async () => {
    collectEdits();
    const button = $('#timetable-save'); button.disabled = true; button.textContent = 'Saving…';
    try {
      const result = await api('/api/timetable', {method:'PUT', body:JSON.stringify({periods:schedule})});
      schedule = result.timetable.periods; editing = false; render();
      $('#timetable-status').textContent = 'Timetable saved.';
    } catch (error) { $('#timetable-status').textContent = error.message; }
    finally { button.disabled = false; button.textContent = 'Save timetable'; }
  });
  async function load() {
    try {
      const result = await api('/api/timetable');
      schedule = result.timetable.periods;
      isRep = Boolean(result.viewer?.is_rep);
      render();
    } catch (error) {
      $('#timetable-table').innerHTML = '<tbody><tr><td class="timetable-error">' + escapeHtml(error.message) + '</td></tr></tbody>';
      $('#timetable-edit').classList.add('hidden'); $('#timetable-save').classList.add('hidden'); $('#timetable-cancel').classList.add('hidden');
    }
  }
  load();
})();