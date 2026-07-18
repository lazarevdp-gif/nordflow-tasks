const TasksPage = {
  filters: { status: '', project: '', priority: '', overdue: false, search: '' },
  viewMode: 'list',
  tasks: [],
  projects: [],
  users: [],

  async render(container) {
    try {
      const [tasks, projects, users] = await Promise.all([API.getMyTasks(), API.getProjects(), API.getUsers()]);
      this.tasks = Array.isArray(tasks) ? tasks : [];
      this.projects = Array.isArray(projects) ? projects : [];
      this.users = Array.isArray(users) ? users : [];
    } catch (e) { this.tasks = []; this.projects = []; this.users = []; }
    this.renderPage(container);
  },

  renderPage(container) {
    const filtered = this.getFiltered();
    let h = `<div class="page-header"><div><h1>Мои задачи</h1><span class="task-count">${filtered.length} задач</span></div><div style="display:flex;gap:8px;align-items:center"><button class="btn btn-primary" onclick="TasksPage.showCreateModal()">+ Создать задачу</button><div class="view-toggle"><button class="btn btn-sm ${this.viewMode==='list'?'btn-primary':'btn-secondary'}" onclick="TasksPage.setView('list')">📋 Список</button><button class="btn btn-sm ${this.viewMode==='board'?'btn-primary':'btn-secondary'}" onclick="TasksPage.setView('board')">📊 Доска</button></div></div></div>`;
    h += `<div class="filters-bar"><select onchange="TasksPage.setFilter('status',this.value)"><option value="">Все статусы</option><option value="backlog">Бэклог</option><option value="planned">Запланировано</option><option value="in_progress">В работе</option><option value="review">На проверке</option><option value="done">Выполнено</option></select><select onchange="TasksPage.setFilter('project',this.value)"><option value="">Все проекты</option>${this.projects.map(p => `<option value="${p.id}">${App.esc(p.name)}</option>`).join('')}</select><select onchange="TasksPage.setFilter('priority',this.value)"><option value="">Все приоритеты</option><option value="low">Низкий</option><option value="medium">Средний</option><option value="high">Высокий</option><option value="critical">Критический</option></select><label class="filter-checkbox"><input type="checkbox" onchange="TasksPage.setFilter('overdue',this.checked)"> Просроченные</label><input type="text" placeholder="Поиск..." oninput="TasksPage.setFilter('search',this.value)"></div>`;
    h += `<div id="tasks-content">${this.viewMode === 'list' ? this.renderList(filtered) : this.renderBoard(filtered)}</div>`;
    container.innerHTML = h;
  },

  renderList(tasks) {
    if (!tasks.length) return '<div class="empty-state"><p>Задач не найдено</p></div>';
    return `<div class="table-wrapper"><table class="data-table"><thead><tr><th>ID</th><th>Название</th><th>Проект</th><th>Статус</th><th>Приоритет</th><th>Дедлайн</th><th>Создатель</th></tr></thead><tbody>${tasks.map(t => {
      const od = this.isOverdue(t.deadline) && t.status !== 'done';
      return `<tr class="clickable-row ${od ? 'overdue-row' : ''}" onclick="TaskDetailPage.open(${t.id})"><td><span class="task-id">${App.esc(t.identifier||t.id)}</span></td><td>${App.esc(t.title)}</td><td>${App.esc(t.project_name||'')}</td><td>${this.statusBadge(t.status)}</td><td>${this.priBadge(t.priority)}</td><td class="${od?'overdue-text':''}">${this.fmtDate(t.deadline)}</td><td>${App.esc(t.creator_name||'')}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  },

  renderBoard(tasks) {
    const cols = [{s:'backlog',l:'Бэклог'},{s:'planned',l:'Запланировано'},{s:'in_progress',l:'В работе'},{s:'review',l:'На проверке'},{s:'done',l:'Выполнено'}];
    return `<div class="kanban-board">${cols.map(col => {
      const ct = tasks.filter(t => t.status === col.s);
      return `<div class="kanban-column" data-status="${col.s}" ondragover="event.preventDefault()" ondrop="TasksPage.onDrop(event,'${col.s}')"><div class="kanban-column-header"><span class="kanban-col-dot" style="background:${this.statusColor(col.s)}"></span><span>${col.l}</span><span class="kanban-col-count">${ct.length}</span></div><div class="kanban-cards">${ct.map(t => this.kanbanCard(t)).join('')}</div></div>`;
    }).join('')}</div>`;
  },

  kanbanCard(t) {
    const od = this.isOverdue(t.deadline) && t.status !== 'done';
    return `<div class="kanban-card ${od?'overdue':''}" draggable="true" ondragstart="TasksPage.onDragStart(event,${t.id})" onclick="TaskDetailPage.open(${t.id})"><div class="kanban-card-header"><span class="task-id">${App.esc(t.identifier||t.id)}</span><span class="priority-dot" style="background:${this.priColor(t.priority)}"></span></div><div class="kanban-card-title">${App.esc(t.title)}</div><div class="kanban-card-footer"><span class="${od?'overdue-text':''}">${this.fmtDate(t.deadline)}</span></div></div>`;
  },

  getFiltered() {
    let f = [...this.tasks];
    if (this.filters.status) f = f.filter(t => t.status === this.filters.status);
    if (this.filters.project) f = f.filter(t => t.project_id == this.filters.project);
    if (this.filters.priority) f = f.filter(t => t.priority === this.filters.priority);
    if (this.filters.overdue) f = f.filter(t => this.isOverdue(t.deadline) && t.status !== 'done');
    if (this.filters.search) { const q = this.filters.search.toLowerCase(); f = f.filter(t => (t.title||'').toLowerCase().includes(q)); }
    return f;
  },

  setFilter(k, v) { this.filters[k] = v; this.updateContent(); },
  setView(m) { this.viewMode = m; const c = document.getElementById('main-content'); if (c) this.renderPage(c); },
  updateContent() {
    const el = document.getElementById('tasks-content');
    if (el) el.innerHTML = this.viewMode === 'list' ? this.renderList(this.getFiltered()) : this.renderBoard(this.getFiltered());
    const cnt = document.querySelector('.task-count');
    if (cnt) cnt.textContent = `${this.getFiltered().length} задач`;
  },

  showCreateModal() {
    const projectOpts = this.projects.map(p => `<option value="${p.id}">${App.esc(p.name)}</option>`).join('');
    const userOpts = this.users.map(u => `<option value="${u.id}">${App.esc(Auth.getFullName(u))}</option>`).join('');
    App.showModal('Создать задачу', `
      <form id="create-task-form">
        <div class="form-group"><label>Название *</label><input type="text" id="nt-title" class="form-control" required></div>
        <div class="form-group"><label>Описание</label><textarea id="nt-desc" class="form-control" rows="3"></textarea></div>
        <div class="form-group"><label>Проект</label><select id="nt-project" class="form-control"><option value="">Без проекта</option>${projectOpts}</select></div>
        <div class="form-group"><label>Исполнитель</label><select id="nt-assignee" class="form-control"><option value="">Не назначен</option>${userOpts}</select></div>
        <div class="form-group"><label>Приоритет</label><select id="nt-priority" class="form-control"><option value="low">Низкий</option><option value="medium" selected>Средний</option><option value="high">Высокий</option><option value="critical">Критический</option></select></div>
        <div class="form-row"><div class="form-group"><label>Дата начала</label><input type="date" id="nt-start" class="form-control"></div><div class="form-group"><label>Срок выполнения</label><input type="date" id="nt-deadline" class="form-control"></div></div>
        <div class="form-group"><label>Теги</label><input type="text" id="nt-tags" class="form-control" placeholder="Через запятую"></div>
        <div class="form-actions"><button type="button" class="btn btn-secondary" onclick="App.closeModal()">Отмена</button><button type="submit" class="btn btn-primary">Создать</button></div>
      </form>`);
    document.getElementById('create-task-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await API.createTask({
          title: document.getElementById('nt-title').value.trim(),
          description: document.getElementById('nt-desc').value.trim(),
          project_id: document.getElementById('nt-project').value ? parseInt(document.getElementById('nt-project').value) : null,
          assignee_id: document.getElementById('nt-assignee').value ? parseInt(document.getElementById('nt-assignee').value) : null,
          priority: document.getElementById('nt-priority').value,
          start_date: document.getElementById('nt-start').value || null,
          deadline: document.getElementById('nt-deadline').value || null,
          tags: document.getElementById('nt-tags').value.trim()
        });
        App.closeModal();
        App.showToast('Задача создана', 'success');
        const c = document.getElementById('main-content');
        if (c) this.render(c);
      } catch (err) { App.showToast(err.error || 'Ошибка создания задачи', 'error'); }
    });
  },

  onDragStart(e, id) { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; },
  async onDrop(e, status) {
    e.preventDefault();
    const id = parseInt(e.dataTransfer.getData('text/plain'));
    const t = this.tasks.find(x => x.id === id);
    if (!t || t.status === status) return;
    await API.updateTaskStatus(id, status);
    t.status = status;
    this.updateContent();
    App.updateNotificationBadge();
  },
  statusBadge(s) { return `<span class="badge badge-${s==='done'?'success':s==='in_progress'?'warning':s==='review'?'critical':s==='planned'?'primary':'neutral'}">${this.statusLabel(s)}</span>`; },
  priBadge(p) { return `<span class="badge badge-${p==='critical'?'critical':p==='high'?'danger':p==='medium'?'warning':'success'}">${this.priLabel(p)}</span>`; },
  statusLabel(s) { return {backlog:'Бэклог',planned:'Запланировано',in_progress:'В работе',review:'На проверке',done:'Выполнено'}[s]||s; },
  priLabel(p) { return {low:'Низкий',medium:'Средний',high:'Высокий',critical:'Критический'}[p]||p; },
  statusColor(s) { return {backlog:'#94a3b8',planned:'#00A9A5',in_progress:'#d97706',review:'#7c3aed',done:'#16a34a'}[s]||'#94a3b8'; },
  priColor(p) { return {low:'#16a34a',medium:'#d97706',high:'#ea580c',critical:'#dc2626'}[p]||'#94a3b8'; },
  isOverdue(d) { return d && d !== 'None' && d !== '' && new Date(d) < new Date(); },
  fmtDate(d) { if (!d || d === 'None') return '—'; return new Date(d).toLocaleDateString('ru-RU', { day:'numeric', month:'short' }); }
};
