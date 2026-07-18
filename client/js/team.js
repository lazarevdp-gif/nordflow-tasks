const TeamPage = {
  async render(container) {
    let members = [];
    try { members = await API.getTeam(); } catch (e) {}
    let h = '<div class="page-header"><h1>Команда</h1></div>';
    if (!members.length) { h += '<div class="empty-state"><p>Нет сотрудников</p></div>'; container.innerHTML = h; return; }
    h += '<div class="team-grid">';
    members.forEach(m => {
      const active = m.active_tasks || 0;
      const overdue = m.overdue_tasks || 0;
      const pct = Math.min(100, (active / 10) * 100);
      const col = overdue > 0 ? 'var(--danger)' : active > 5 ? 'var(--warning)' : 'var(--primary)';
      h += `<div class="team-card" onclick="TeamPage.showProfile(${m.id})">${Auth.getAvatarHTML(m,'lg')}<div class="team-card-info"><div class="team-card-name">${App.esc(Auth.getFullName(m))}</div><div class="team-card-position">${App.esc(m.position||'')}</div><div class="team-card-email">${App.esc(m.email||'')}</div><span class="badge badge-${m.role==='admin'?'critical':m.role==='project_manager'?'primary':'neutral'}">${Auth.getRoleName(m.role)}</span></div><div class="team-card-stats"><div>${active} активных</div><div class="${overdue>0?'overdue-text':''}">${overdue} просрочено</div></div><div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${col}"></div></div></div>`;
    });
    h += '</div>';
    container.innerHTML = h;
  },

  async showProfile(userId) {
    let member, tasks;
    try {
      [member, tasks] = await Promise.all([
        API.getUser(userId),
        API.getTasks({ assignee_id: userId })
      ]);
    } catch (e) { App.showToast('Ошибка загрузки', 'error'); return; }
    const list = Array.isArray(tasks) ? tasks : [];
    const activeTasks = list.filter(t => t.status !== 'done' && t.status !== 'backlog');
    const overdueTasks = activeTasks.filter(t => t.deadline && new Date(t.deadline) < new Date());
    const avatarHTML = Auth.getAvatarHTML(member, 'lg');
    const roleBadge = `<span class="badge badge-${member.role==='admin'?'critical':member.role==='project_manager'?'primary':'neutral'}">${Auth.getRoleName(member.role)}</span>`;

    let tasksHTML = '';
    if (activeTasks.length) {
      tasksHTML = '<div style="margin-top:16px"><h4 style="margin-bottom:8px">Активные задачи</h4>';
      tasksHTML += activeTasks.map(t => {
        const od = t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done';
        return `<div class="task-list-item ${od?'overdue':''}"><div><strong>${App.esc(t.identifier||t.id)}</strong> ${App.esc(t.title)}</div><div>${ProjectPage.statusBadge(t.status)} ${ProjectPage.priBadge(t.priority)} ${t.deadline ? `<span class="${od?'overdue-text':''}">${ProjectPage.fmtDate(t.deadline)}</span>` : ''}</div></div>`;
      }).join('');
      tasksHTML += '</div>';
    } else {
      tasksHTML = '<div style="margin-top:16px;color:var(--text-secondary)">Нет активных задач</div>';
    }

    App.showModal(App.esc(Auth.getFullName(member)), `
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:16px">
        ${avatarHTML}
        <div>
          <div style="font-size:1.1rem;font-weight:600">${App.esc(Auth.getFullName(member))}</div>
          <div style="color:var(--text-secondary)">${App.esc(member.position||'Не указана')}</div>
          <div style="margin-top:4px">${roleBadge}</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div class="card" style="text-align:center;padding:12px"><div style="font-size:1.5rem;font-weight:700;color:var(--primary)">${activeTasks.length}</div><div style="font-size:0.8rem;color:var(--text-secondary)">Активных задач</div></div>
        <div class="card" style="text-align:center;padding:12px"><div style="font-size:1.5rem;font-weight:700;color:${overdueTasks.length?'var(--danger)':'var(--success)'}">${overdueTasks.length}</div><div style="font-size:0.8rem;color:var(--text-secondary)">Просрочено</div></div>
      </div>
      <div><strong>Email:</strong> <a href="mailto:${App.esc(member.email||'')}" style="color:var(--primary)">${App.esc(member.email||'—')}</a></div>
      ${tasksHTML}
    `);
  }
};
