const HomePage = {
  async render(container) {
    try {
      const data = await API.getDashboard();
      this.renderDashboard(container, data);
    } catch (e) {
      container.innerHTML = `<div class="page-header"><h1>Главная</h1></div><div class="empty-state"><h3>Ошибка загрузки</h3><button class="btn btn-primary" onclick="HomePage.render(document.getElementById('main-content'))">Повторить</button></div>`;
    }
  },
  renderDashboard(c, d) {
    const u = App.currentUser;
    const firstName = u?.first_name || 'Пользователь';
    const deadlines = d.deadlines || [];
    const projects = d.my_projects || [];
    const updates = d.recent_updates || [];
    const team = d.team_stats || [];
    const active = d.active_tasks || 0;
    const overdue = d.overdue_tasks || 0;
    const week = d.due_this_week || 0;
    const showTeam = Auth.isPM();
    let h = `<div class="hero-banner"><img src="logo/coverhero.png" alt="NordFlow" class="hero-img"><div class="hero-overlay"><div class="hero-content"><h1>Добро пожаловать, ${App.esc(firstName)}!</h1><p>NordFlow — технологии без хаоса</p></div></div></div>`;
    h += `<div class="stats-grid"><div class="stat-card"><div class="stat-card-number">${active}</div><div class="stat-card-label">Активные задачи</div></div><div class="stat-card ${overdue > 0 ? 'stat-card-danger' : ''}"><div class="stat-card-number">${overdue}</div><div class="stat-card-label">Просроченные</div></div><div class="stat-card"><div class="stat-card-number">${week}</div><div class="stat-card-label">Дедлайны на неделе</div></div></div>`;
    h += `<div class="card"><div class="card-header"><h3>Ближайшие дедлайны</h3></div><div class="card-body">${deadlines.length ? `<table class="data-table"><thead><tr><th>ID</th><th>Название</th><th>Проект</th><th>Дедлайн</th><th>Приоритет</th></tr></thead><tbody>${deadlines.map(t => {
      const od = t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done';
      return `<tr class="${od ? 'overdue-row' : ''}"><td><a href="#task/${t.id}">${App.esc(t.identifier||t.id)}</a></td><td>${App.esc(t.title)}</td><td>${App.esc(t.project_name||'')}</td><td class="${od ? 'overdue-text' : ''}">${this.fmtDate(t.deadline)}</td><td>${this.priBadge(t.priority)}</td></tr>`;
    }).join('')}</tbody></table>` : '<p style="color:var(--text-secondary);text-align:center;padding:20px">Нет ближайших дедлайнов</p>'}</div></div>`;
    h += `<div class="dashboard-two-col"><div class="card"><div class="card-header"><h3>Мои проекты</h3></div><div class="card-body">${projects.length ? projects.map(p => `<a href="#project/${p.id}" class="dashboard-project-link"><div class="dashboard-project-name">${App.esc(p.name)}</div><div>${this.statusBadge(p.status)} <span style="color:var(--text-secondary);font-size:0.85rem">${p.open_tasks||0} задач</span></div></a>`).join('') : '<p style="color:var(--text-secondary)">Нет проектов</p>'}</div></div><div class="card"><div class="card-header"><h3>Последние обновления</h3></div><div class="card-body">${updates.length ? updates.map(u => `<div class="history-item"><div class="history-item-content"><div>${App.esc(u.identifier||'')} ${App.esc(u.title||'')}</div><div class="history-item-time">${App.esc(u.project_name||'')}</div></div></div>`).join('') : '<p style="color:var(--text-secondary)">Нет обновлений</p>'}</div></div></div>`;
    if (showTeam && team.length) {
      h += `<div class="card"><div class="card-header"><h3>Загрузка команды</h3></div><div class="card-body" style="padding:0"><table class="data-table"><thead><tr><th>Сотрудник</th><th>Активные</th><th>Просрочены</th><th>Загрузка</th></tr></thead><tbody>${team.map(m => {
        const pct = Math.min(100, ((m.active||0) / 10) * 100);
        const col = m.overdue > 0 ? 'var(--danger)' : m.active > 5 ? 'var(--warning)' : 'var(--primary)';
        return `<tr><td>${App.esc(m.first_name)} ${App.esc(m.last_name)}</td><td>${m.active}</td><td class="${m.overdue > 0 ? 'overdue-text' : ''}">${m.overdue}</td><td><div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${col}"></div></div></td></tr>`;
      }).join('')}</tbody></table></div></div>`;
    }
    c.innerHTML = h;
  },
  statusBadge(s) { return `<span class="badge badge-${s==='active'?'success':s==='planning'?'primary':'neutral'}">${{planning:'Планируется',active:'Активный',paused:'Приостановлен',completed:'Завершён',archived:'Архивный'}[s]||s}</span>`; },
  priBadge(p) { return `<span class="badge badge-${p==='critical'?'critical':p==='high'?'danger':p==='medium'?'warning':'success'}">${{low:'Низкий',medium:'Средний',high:'Высокий',critical:'Критический'}[p]||p}</span>`; },
  fmtDate(d) { if (!d || d === 'None') return '—'; return new Date(d).toLocaleDateString('ru-RU', { day:'numeric', month:'short', year:'numeric' }); }
};
