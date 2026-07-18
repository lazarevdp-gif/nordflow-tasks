const NotificationsPage = {
  async render(container) {
    let notifs = [];
    try { notifs = await API.getNotifications(); } catch (e) {}
    const unread = notifs.filter(n => !n.is_read).length;
    let h = `<div class="page-header"><h1>Уведомления</h1>${unread > 0 ? `<button class="btn btn-secondary" onclick="NotificationsPage.markAllRead()">Отметить все прочитанными</button>` : ''}</div>`;
    if (!notifs.length) { h += '<div class="empty-state"><p>Нет уведомлений</p></div>'; container.innerHTML = h; return; }
    h += '<div class="notifications-list">';
    notifs.forEach(n => {
      const icon = {task_assigned:'📋',status_changed:'🔄',deadline_changed:'📅',new_comment:'💬',deadline_approaching:'⏰',task_overdue:'⚠️'}[n.type]||'🔔';
      const time = this.relativeTime(n.created_at);
      h += `<div class="notification-item ${n.is_read?'':'unread'}" onclick="NotificationsPage.handleClick(${n.id},${n.task_id||'null'})"><div class="notification-icon">${icon}</div><div class="notification-body"><div class="notification-message">${App.esc(n.message)}</div><div class="notification-time">${time}</div></div></div>`;
    });
    h += '</div>';
    container.innerHTML = h;
  },
  async handleClick(id, taskId) {
    await API.markRead(id);
    App.updateNotificationBadge();
    if (taskId) App.navigate('task', { id: taskId });
  },
  async markAllRead() {
    await API.markAllRead();
    App.updateNotificationBadge();
    const c = document.getElementById('main-content'); if (c) this.render(c);
    App.showToast('Все уведомления прочитаны');
  },
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
