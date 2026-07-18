const ProjectPage = {
  project: null,
  activeTab: 'board',

  async render(container, params) {
    if (!params?.id) { container.innerHTML = '<div class="empty-state">Проект не найден</div>'; return; }
    try { this.project = await API.getProject(params.id); } catch (e) { container.innerHTML = '<div class="empty-state">Проект не найден</div>'; return; }
    const p = this.project;
    const sc = {planning:'#00A9A5',active:'#16a34a',paused:'#d97706',completed:'#6b7280',archived:'#9ca3af'}[p.status]||'#6b7280';
    const st = {planning:'Планируется',active:'Активный',paused:'Приостановлен',completed:'Завершён',archived:'Архивный'}[p.status]||p.status;
    let h = `<div class="page-header"><div><a href="#projects" style="color:var(--primary);text-decoration:none">← Назад к проектам</a><h1>${App.esc(p.name)} <span class="badge" style="background:${sc}">${st}</span></h1></div></div>`;
    h += `<div class="tabs"><button class="tab ${this.activeTab==='board'?'active':''}" onclick="ProjectPage.switchTab('board',this)">Доска</button><button class="tab ${this.activeTab==='list'?'active':''}" onclick="ProjectPage.switchTab('list',this)">Список задач</button><button class="tab ${this.activeTab==='members'?'active':''}" onclick="ProjectPage.switchTab('members',this)">Участники</button><button class="tab ${this.activeTab==='info'?'active':''}" onclick="ProjectPage.switchTab('info',this)">Информация</button></div>`;
    if (this.activeTab === 'board' || this.activeTab === 'list') {
      h += `<div style="margin-bottom:16px"><button class="btn btn-primary" onclick="ProjectPage.showCreateTaskModal()">+ Создать задачу</button></div>`;
    }
    h += `<div id="tab-content"></div>`;
    container.innerHTML = h;
    this.renderTabContent();
  },

  switchTab(tab) { this.activeTab = tab; const c = document.getElementById('main-content'); if (c) this.render(c, { id: this.project.id }); },

  renderTabContent() {
    const tc = document.getElementById('tab-content');
    if (!tc) return;
    switch (this.activeTab) {
      case 'board': this.renderBoard(tc); break;
      case 'list': this.renderList(tc); break;
      case 'members': this.renderMembers(tc); break;
      case 'info': this.renderInfo(tc); break;
    }
  },

  renderBoard(tc) {
    const tasks = this.project.tasks || [];
    const cols = [{s:'backlog',l:'Бэклог'},{s:'planned',l:'Запланировано'},{s:'in_progress',l:'В работе'},{s:'review',l:'На проверке'},{s:'done',l:'Выполнено'}];
    tc.innerHTML = `<div class="kanban-board">${cols.map(col => {
      const ct = tasks.filter(t => t.status === col.s);
      return `<div class="kanban-column" data-status="${col.s}" ondragover="event.preventDefault()" ondrop="ProjectPage.onDrop(event,'${col.s}')"><div class="kanban-column-header"><span class="kanban-col-dot" style="background:${this.statusColor(col.s)}"></span><span>${col.l}</span><span class="kanban-col-count">${ct.length}</span></div><div class="kanban-cards">${ct.map(t => this.kanbanCard(t)).join('')}</div></div>`;
    }).join('')}</div>`;
  },

  kanbanCard(t) {
    const od = t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done';
    const assignee = t.assignee_name ? t.assignee_name.split(' ').map(n=>n[0]).join('').substring(0,2).toUpperCase() : '';
    return `<div class="kanban-card ${od?'overdue':''}" draggable="true" ondragstart="ProjectPage.onDragStart(event,${t.id})" onclick="TaskDetailPage.open(${t.id})"><div class="kanban-card-header"><span class="task-id">${App.esc(t.identifier||t.id)}</span><span class="priority-dot" style="background:${this.priColor(t.priority)}"></span></div><div class="kanban-card-title">${App.esc(t.title)}</div><div class="kanban-card-footer"><span class="${od?'overdue-text':''}">${this.fmtDate(t.deadline)}</span>${assignee?`<span class="avatar-mini" title="${App.esc(t.assignee_name)}">${assignee}</span>`:''}<span title="Комментарии">💬${t.comment_count||0}</span></div></div>`;
  },

  renderList(tc) {
    const tasks = this.project.tasks || [];
    if (!tasks.length) { tc.innerHTML = '<div class="empty-state"><p>Задач пока нет</p></div>'; return; }
    tc.innerHTML = `<div class="table-wrapper"><table class="data-table"><thead><tr><th>ID</th><th>Название</th><th>Статус</th><th>Приоритет</th><th>Исполнитель</th><th>Дедлайн</th><th>💬</th></tr></thead><tbody>${tasks.map(t => {
      const od = t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done';
      return `<tr class="clickable-row ${od?'overdue-row':''}" onclick="TaskDetailPage.open(${t.id})"><td>${App.esc(t.identifier||t.id)}</td><td>${App.esc(t.title)}</td><td>${this.statusBadge(t.status)}</td><td>${this.priBadge(t.priority)}</td><td>${App.esc(t.assignee_name||'—')}</td><td class="${od?'overdue-text':''}">${this.fmtDate(t.deadline)}</td><td>${t.comment_count||0}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  },

  renderMembers(tc) {
    const members = this.project.members || [];
    const isAdmin = Auth.isPM();
    let h = '';
    if (isAdmin) h += `<div style="margin-bottom:16px"><button class="btn btn-primary btn-sm" onclick="ProjectPage.showAddMemberModal()">+ Добавить участника</button></div>`;
    if (!members.length) { h += '<div class="empty-state"><p>Нет участников</p></div>'; tc.innerHTML = h; return; }
    h += '<div class="members-grid">';
    members.forEach(m => {
      const ini = ((m.first_name||'')[0]||'') + ((m.last_name||'')[0]||'');
      h += `<div class="member-card">${Auth.getAvatarHTML(m,'md')}<div><div style="font-weight:600">${App.esc(Auth.getFullName(m))}</div><div style="color:var(--text-secondary);font-size:0.85rem">${App.esc(m.position||'')}</div></div>${isAdmin?`<button class="btn btn-danger btn-sm" onclick="ProjectPage.removeMember(${m.id})">✕</button>`:''}</div>`;
    });
    h += '</div>';
    tc.innerHTML = h;
  },

  renderInfo(tc) {
    const p = this.project;
    const tasks = p.tasks || [];
    const counts = {};
    ['backlog','planned','in_progress','review','done'].forEach(s => { counts[s] = tasks.filter(t => t.status === s).length; });
    tc.innerHTML = `<div class="card"><div class="card-body"><div class="info-grid"><div class="info-row"><span class="info-label">Название</span><span>${App.esc(p.name)}</span></div><div class="info-row"><span class="info-label">Описание</span><span>${App.esc(p.description||'—')}</span></div><div class="info-row"><span class="info-label">Руководитель</span><span>${App.esc(p.manager_name||'—')}</span></div><div class="info-row"><span class="info-label">Дата начала</span><span>${this.fmtDate(p.start_date)}</span></div><div class="info-row"><span class="info-label">Дата окончания</span><span>${this.fmtDate(p.end_date)}</span></div><div class="info-row"><span class="info-label">Участники</span><span>${(p.members||[]).length}</span></div><div class="info-row"><span class="info-label">Всего задач</span><span>${tasks.length}</span></div></div></div></div>`;
  },

  async showCreateTaskModal() {
    const members = this.project.members || [];
    const opts = members.map(m => `<option value="${m.id}">${App.esc(Auth.getFullName(m))}</option>`).join('');
    App.showModal('Создать задачу', `
      <form id="create-task-form"><div class="form-group"><label>Название *</label><input type="text" id="ct-title" class="form-control" required></div>
      <div class="form-group"><label>Описание</label><textarea id="ct-desc" class="form-control" rows="3"></textarea></div>
      <div class="form-group"><label>Исполнитель</label><select id="ct-assignee" class="form-control"><option value="">Не назначен</option>${opts}</select></div>
      <div class="form-group"><label>Приоритет</label><select id="ct-priority" class="form-control"><option value="low">Низкий</option><option value="medium" selected>Средний</option><option value="high">Высокий</option><option value="critical">Критический</option></select></div>
      <div class="form-row"><div class="form-group"><label>Дата начала</label><input type="date" id="ct-start" class="form-control"></div><div class="form-group"><label>Срок выполнения</label><input type="date" id="ct-deadline" class="form-control"></div></div>
      <div class="form-group"><label>Теги</label><input type="text" id="ct-tags" class="form-control" placeholder="Через запятую"></div>
      <div class="form-actions"><button type="button" class="btn btn-secondary" onclick="App.closeModal()">Отмена</button><button type="submit" class="btn btn-primary">Создать</button></div></form>`);
    document.getElementById('create-task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await API.createTask({ title: document.getElementById('ct-title').value.trim(), description: document.getElementById('ct-desc').value.trim(), project_id: this.project.id, assignee_id: document.getElementById('ct-assignee').value ? parseInt(document.getElementById('ct-assignee').value) : null, priority: document.getElementById('ct-priority').value, start_date: document.getElementById('ct-start').value || null, deadline: document.getElementById('ct-deadline').value || null, tags: document.getElementById('ct-tags').value.trim() });
        App.closeModal(); App.showToast('Задача создана', 'success');
        this.project = await API.getProject(this.project.id);
        const c = document.getElementById('main-content'); if (c) this.render(c, { id: this.project.id });
      } catch (err) { App.showToast(err.error || 'Ошибка', 'error'); }
    });
  },

  showAddMemberModal() {
    const memberIds = (this.project.members||[]).map(m => m.id);
    App.showModal('Добавить участника', `<div id="add-member-container"><p>Загрузка...</p></div>`);
    API.getUsers().then(users => {
      const available = users.filter(u => !memberIds.includes(u.id));
      const el = document.getElementById('add-member-container');
      if (!el) return;
      if (!available.length) { el.innerHTML = '<p>Все уже добавлены</p>'; return; }
      el.innerHTML = `<select id="add-member-select" class="form-control">${available.map(u => `<option value="${u.id}">${App.esc(Auth.getFullName(u))}</option>`).join('')}</select><div class="form-actions" style="margin-top:16px"><button class="btn btn-secondary" onclick="App.closeModal()">Отмена</button><button class="btn btn-primary" onclick="ProjectPage.submitAddMember()">Добавить</button></div>`;
    });
  },

  async submitAddMember() {
    const uid = document.getElementById('add-member-select')?.value;
    if (!uid) return;
    await API.addProjectMember(this.project.id, parseInt(uid));
    App.closeModal(); App.showToast('Участник добавлен');
    this.project = await API.getProject(this.project.id);
    const c = document.getElementById('main-content'); if (c) this.render(c, { id: this.project.id });
  },

  async removeMember(uid) {
    if (!confirm('Удалить участника?')) return;
    await API.removeProjectMember(this.project.id, uid);
    this.project = await API.getProject(this.project.id);
    const c = document.getElementById('main-content'); if (c) this.render(c, { id: this.project.id });
  },

  onDragStart(e, id) { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; },
  async onDrop(e, status) {
    e.preventDefault();
    const id = parseInt(e.dataTransfer.getData('text/plain'));
    const t = (this.project.tasks||[]).find(x => x.id === id);
    if (!t || t.status === status) return;
    await API.updateTaskStatus(id, status);
    this.project = await API.getProject(this.project.id);
    this.renderTabContent();
  },

  statusBadge(s) { return `<span class="badge badge-${s==='done'?'success':s==='in_progress'?'warning':s==='review'?'critical':s==='planned'?'primary':'neutral'}">${this.statusLabel(s)}</span>`; },
  priBadge(p) { return `<span class="badge badge-${p==='critical'?'critical':p==='high'?'danger':p==='medium'?'warning':'success'}">${this.priLabel(p)}</span>`; },
  statusLabel(s) { return {backlog:'Бэклог',planned:'Запланировано',in_progress:'В работе',review:'На проверке',done:'Выполнено'}[s]||s; },
  priLabel(p) { return {low:'Низкий',medium:'Средний',high:'Высокий',critical:'Критический'}[p]||p; },
  statusColor(s) { return {backlog:'#94a3b8',planned:'#00A9A5',in_progress:'#d97706',review:'#7c3aed',done:'#16a34a'}[s]||'#94a3b8'; },
  priColor(p) { return {low:'#16a34a',medium:'#d97706',high:'#ea580c',critical:'#dc2626'}[p]||'#94a3b8'; },
  fmtDate(d) { if (!d || d === 'None' || d === '') return '—'; return new Date(d).toLocaleDateString('ru-RU', { day:'numeric', month:'short' }); }
};
