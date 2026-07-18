const ProjectsPage = {
  projects: [],
  async render(container) {
    try { this.projects = await API.getProjects(); } catch (e) { this.projects = []; }
    const canCreate = Auth.isPM();
    let h = `<div class="page-header"><h1>Проекты</h1>${canCreate ? '<button class="btn btn-primary" onclick="ProjectsPage.showCreateModal()">+ Создать проект</button>' : ''}</div>`;
    if (!this.projects.length) {
      h += '<div class="empty-state"><p>Проектов пока нет</p></div>';
    } else {
      h += '<div class="projects-grid">';
      this.projects.forEach(p => { h += this.card(p); });
      h += '</div>';
    }
    container.innerHTML = h;
  },
  card(p) {
    const st = {planning:'Планируется',active:'Активный',paused:'Приостановлен',completed:'Завершён',archived:'Архивный'}[p.status]||p.status;
    const sc = {planning:'#00A9A5',active:'#16a34a',paused:'#d97706',completed:'#6b7280',archived:'#9ca3af'}[p.status]||'#6b7280';
    return `<div class="project-card"><div class="project-card-header"><a href="#project/${p.id}" class="project-card-name">${App.esc(p.name)}</a><span class="badge" style="background:${sc}">${st}</span></div><div class="project-card-desc">${App.esc(p.description||'')}</div><div class="project-card-meta"><span>👤 ${App.esc(p.manager_name||'')}</span><span>📋 ${p.open_tasks||0} задач</span><span>👥 ${p.member_count||0}</span><span>📅 ${this.fmtDate(p.end_date)}</span></div></div>`;
  },
  async showCreateModal() {
    let users = [];
    try { users = await API.getUsers(); } catch (e) {}
    const opts = users.map(u => `<option value="${u.id}">${App.esc(Auth.getFullName(u))}</option>`).join('');
    const checks = users.map(u => `<label class="checkbox-label"><input type="checkbox" name="members" value="${u.id}" ${u.id===App.currentUser.id?'checked':''}> ${App.esc(Auth.getFullName(u))}</label>`).join('');
    App.showModal('Создать проект', `
      <form id="create-project-form"><div class="form-group"><label>Название *</label><input type="text" id="cp-name" class="form-control" required></div>
      <div class="form-group"><label>Описание</label><textarea id="cp-desc" class="form-control" rows="3"></textarea></div>
      <div class="form-group"><label>Руководитель</label><select id="cp-manager" class="form-control"><option value="">—</option>${opts}</select></div>
      <div class="form-group"><label>Участники</label><div class="checkbox-group">${checks}</div></div>
      <div class="form-row"><div class="form-group"><label>Дата начала</label><input type="date" id="cp-start" class="form-control"></div><div class="form-group"><label>Дата окончания</label><input type="date" id="cp-end" class="form-control"></div></div>
      <div class="form-group"><label>Статус</label><select id="cp-status" class="form-control"><option value="planning">Планируется</option><option value="active">Активный</option></select></div>
      <div class="form-actions"><button type="button" class="btn btn-secondary" onclick="App.closeModal()">Отмена</button><button type="submit" class="btn btn-primary">Создать</button></div></form>`);
    document.getElementById('create-project-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const members = Array.from(document.querySelectorAll('input[name="members"]:checked')).map(x => parseInt(x.value));
      try {
        const p = await API.createProject({ name: document.getElementById('cp-name').value.trim(), description: document.getElementById('cp-desc').value.trim(), manager_id: document.getElementById('cp-manager').value ? parseInt(document.getElementById('cp-manager').value) : null, start_date: document.getElementById('cp-start').value || null, end_date: document.getElementById('cp-end').value || null, status: document.getElementById('cp-status').value, members });
        App.closeModal(); App.showToast('Проект создан', 'success');
        const c = document.getElementById('main-content'); if (c) this.render(c);
      } catch (err) { App.showToast(err.error || 'Ошибка', 'error'); }
    });
  },
  fmtDate(d) { if (!d || d === 'None' || d === '') return '—'; return new Date(d).toLocaleDateString('ru-RU', { day:'numeric', month:'short', year:'numeric' }); }
};
