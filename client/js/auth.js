const Auth = {
  isAdmin() { return App.currentUser && App.currentUser.role === 'admin'; },
  isPM() { return App.currentUser && (App.currentUser.role === 'project_manager' || App.currentUser.role === 'admin'); },
  getInitials(u) { return ((u.first_name||'')[0]||'') + ((u.last_name||'')[0]||''); },
  getFullName(u) { return `${u.first_name||''} ${u.last_name||''}`.trim(); },
  getAvatarHTML(u, size) {
    if (u.photo) {
      const sz = { sm: 32, md: 40, lg: 64 }[size] || 40;
      return `<img src="${u.photo}" style="width:${sz}px;height:${sz}px;border-radius:50%;object-fit:cover;display:inline-block;flex-shrink:0" alt="${this.getInitials(u)}">`;
    }
    const sz = { sm: 32, md: 40, lg: 64 }[size] || 40;
    const hue = ((u.id || 0) * 137) % 360;
    const initials = this.getInitials(u).toUpperCase();
    return `<div class="avatar avatar-${size}" style="width:${sz}px;height:${sz}px;background:hsl(${hue},60%,45%);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:600;font-size:${sz*0.4}px;flex-shrink:0">${initials}</div>`;
  },
  getRoleName(r) { return { admin: 'Администратор', project_manager: 'Руководитель проекта', employee: 'Сотрудник' }[r] || r; }
};
