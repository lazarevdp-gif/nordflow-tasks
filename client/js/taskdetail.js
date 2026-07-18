const TaskDetailPage = {
  task: null,

  async render(container, params) {
    if (!params?.id) { container.innerHTML = '<div class="empty-state">Задача не найдена</div>'; return; }
    try { this.task = await API.getTask(params.id); } catch (e) { container.innerHTML = '<div class="empty-state">Задача не найдена</div>'; return; }
    const t = this.task;
    const od = t.deadline && new Date(t.deadline) < new Date() && t.status !== 'done';
    const sc = {backlog:'#94a3b8',planned:'#00A9A5',in_progress:'#d97706',review:'#7c3aed',done:'#16a34a'}[t.status]||'#94a3b8';
    const pc = {low:'#16a34a',medium:'#d97706',high:'#ea580c',critical:'#dc2626'}[t.priority]||'#94a3b8';
    const canEdit = Auth.isPM() || App.currentUser.id === t.creator_id;

    let h = `<div class="page-header"><div><a href="#tasks" style="color:var(--primary);text-decoration:none">← Назад к задачам</a><h1>${App.esc(t.title)} <span style="color:var(--text-secondary);font-size:0.8em">${App.esc(t.identifier||'')}</span></h1></div>${canEdit?`<button class="btn btn-danger btn-sm" onclick="TaskDetailPage.deleteTask()">Удалить</button>`:''}</div>`;
    h += '<div class="task-detail-grid"><div class="task-detail-main">';
    h += `<div class="card"><div class="card-body"><div class="info-grid">`;
    h += `<div class="info-row"><span class="info-label">Статус</span><span>${this.statusBadge(t.status)}</span></div>`;
    h += `<div class="info-row"><span class="info-label">Приоритет</span><span style="display:flex;align-items:center;gap:6px"><span class="priority-dot" style="background:${pc}"></span>${this.priLabel(t.priority)}</span></div>`;
    h += `<div class="info-row"><span class="info-label">Исполнитель</span><span>${App.esc(t.assignee_name||'Не назначен')}</span></div>`;
    h += `<div class="info-row"><span class="info-label">Постановщик</span><span>${App.esc(t.creator_name||'')}</span></div>`;
    h += `<div class="info-row"><span class="info-label">Проект</span><span><a href="#project/${t.project_id}">${App.esc(t.project_name||'')}</a></span></div>`;
    h += `<div class="info-row"><span class="info-label">Дедлайн</span><span class="${od?'overdue-text':''}">${this.fmtDate(t.deadline)}${od?' ⚠️':''}</span></div>`;
    h += `<div class="info-row"><span class="info-label">Создано</span><span>${this.fmtDate(t.created_at)}</span></div>`;
    if (t.tags) h += `<div class="info-row"><span class="info-label">Теги</span><span>${t.tags.split(',').map(tg => `<span class="tag">${App.esc(tg.trim())}</span>`).join(' ')}</span></div>`;
    h += '</div></div></div>';

    if (t.description) {
      h += `<div class="card"><div class="card-header"><h3>Описание</h3></div><div class="card-body"><div class="task-description">${App.esc(t.description).replace(/\n/g,'<br>')}</div></div></div>`;
    }

    h += `<div class="card"><div class="card-header"><h3>История изменений</h3></div><div class="card-body">`;
    if (t.history?.length) {
      t.history.forEach(hi => {
        const labels = {status:'Статус',priority:'Приоритет',assignee_id:'Исполнитель',deadline:'Дедлайн',title:'Название',description:'Описание'};
        h += `<div class="history-item"><div class="history-item-dot"></div><div class="history-item-content"><div>${App.esc(hi.user_name||'')} изменил(а) ${labels[hi.field]||hi.field}: ${App.esc(hi.old_value||'—')} → ${App.esc(hi.new_value||'—')}</div><div class="history-item-time">${this.relativeTime(hi.created_at)}</div></div></div>`;
      });
    } else { h += '<p style="color:var(--text-secondary)">Нет изменений</p>'; }
    h += '</div></div></div>';

    h += '<div class="task-detail-sidebar">';

    if (canEdit) {
      h += `<div class="card"><div class="card-header"><h3>Действия</h3></div><div class="card-body">`;
      h += `<div class="form-group"><label>Статус</label><select id="td-status" class="form-control" onchange="TaskDetailPage.changeStatus(this.value)">`;
      ['backlog','planned','in_progress','review','done'].forEach(s => { h += `<option value="${s}" ${t.status===s?'selected':''}>${ProjectPage.statusLabel(s)}</option>`; });
      h += '</select></div>';
      h += `<div class="form-group"><label>Приоритет</label><select id="td-priority" class="form-control" onchange="TaskDetailPage.changePriority(this.value)">`;
      ['low','medium','high','critical'].forEach(p => { h += `<option value="${p}" ${t.priority===p?'selected':''}>${ProjectPage.priLabel(p)}</option>`; });
      h += '</select></div>';
      h += '</div></div>';
    }

    h += `<div class="card"><div class="card-header"><h3>Комментарии (${(t.comments||[]).length})</h3></div><div class="card-body">`;
    (t.comments||[]).forEach(cm => {
      const canDel = App.currentUser.id === cm.user_id || Auth.isAdmin();
      h += `<div class="comment"><div class="comment-header">${Auth.getAvatarHTML({id:cm.user_id,first_name:cm.author_name?.split(' ')[0]||'',last_name:cm.author_name?.split(' ')[1]||''},'sm')}<div><div class="comment-author">${App.esc(cm.author_name||'')}</div><div class="comment-time">${this.relativeTime(cm.created_at)}</div></div>${canDel?`<button class="btn btn-ghost btn-sm" onclick="TaskDetailPage.deleteComment(${cm.id})">✕</button>`:''}</div><div class="comment-text">${App.esc(cm.text)}</div></div>`;
    });
    h += `<div class="comment-form"><textarea id="comment-text" class="form-control" placeholder="Напишите комментарий..." rows="2"></textarea><button class="btn btn-primary btn-sm" onclick="TaskDetailPage.addComment()" style="margin-top:8px">Отправить</button></div>`;
    h += '</div></div></div></div>';

    if (t.attachments?.length) {
      h += `<div class="card" style="margin-top:16px"><div class="card-header"><h3>Вложения</h3></div><div class="card-body">`;
      t.attachments.forEach(a => { h += `<a href="${App.esc(a.url)}" target="_blank" class="attachment-link">📎 ${App.esc(a.filename)}</a> `; });
      h += '</div></div>';
    }

    h += `<div style="margin-top:16px"><label class="btn btn-secondary btn-sm">📎 Прикрепить файл<input type="file" style="display:none" onchange="TaskDetailPage.uploadFile(this.files[0])"></label></div>`;

    container.innerHTML = h;
  },

  open(id) { App.navigate('task', { id }); },

  async changeStatus(s) {
    try { await API.updateTaskStatus(this.task.id, s); this.task.status = s; App.showToast('Статус обновлён'); App.updateNotificationBadge(); } catch (e) { App.showToast('Ошибка', 'error'); }
  },
  async changePriority(p) {
    try { await API.updateTask(this.task.id, { priority: p }); this.task.priority = p; App.showToast('Приоритет обновлён'); } catch (e) { App.showToast('Ошибка', 'error'); }
  },
  async addComment() {
    const inp = document.getElementById('comment-text');
    const text = inp?.value.trim();
    if (!text) return;
    try { await API.addComment(this.task.id, text); inp.value = ''; App.showToast('Комментарий добавлен'); const c = document.getElementById('main-content'); if (c) this.render(c, { id: this.task.id }); } catch (e) { App.showToast('Ошибка', 'error'); }
  },
  async deleteComment(cid) {
    if (!confirm('Удалить комментарий?')) return;
    try { await API.deleteComment(cid); const c = document.getElementById('main-content'); if (c) this.render(c, { id: this.task.id }); } catch (e) { App.showToast('Ошибка', 'error'); }
  },
  async deleteTask() {
    if (!confirm('Удалить задачу?')) return;
    try { await API.deleteTask(this.task.id); App.showToast('Задача удалена'); App.navigate('tasks'); } catch (e) { App.showToast('Ошибка', 'error'); }
  },
  async uploadFile(file) {
    if (!file) return;
    try { await API.uploadFile(this.task.id, file); App.showToast('Файл загружен'); const c = document.getElementById('main-content'); if (c) this.render(c, { id: this.task.id }); } catch (e) { App.showToast('Ошибка загрузки', 'error'); }
  },

  statusBadge(s) { return `<span class="badge badge-${s==='done'?'success':s==='in_progress'?'warning':s==='review'?'critical':s==='planned'?'primary':'neutral'}">${ProjectPage.statusLabel(s)}</span>`; },
  priLabel(p) { return {low:'Низкий',medium:'Средний',high:'Высокий',critical:'Критический'}[p]||p; },
  fmtDate(d) { if (!d || d === 'None' || d === '') return '—'; const dt = new Date(d); return isNaN(dt) ? '—' : dt.toLocaleDateString('ru-RU', { day:'numeric', month:'short', year:'numeric' }); },
  relativeTime(s) {
    if (!s) return '';
    const d = new Date(s), now = new Date(), diff = now - d;
    const mins = Math.floor(diff/60000);
    if (mins < 1) return 'только что';
    if (mins < 60) return `${mins} мин. назад`;
    const hrs = Math.floor(mins/60);
    if (hrs < 24) return `${hrs} ч. назад`;
    const days = Math.floor(hrs/24);
    if (days < 7) return `${days} дн. назад`;
    return d.toLocaleDateString('ru-RU', { day:'numeric', month:'short' });
  }
};
