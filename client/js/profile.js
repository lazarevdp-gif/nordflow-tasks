const ProfilePage = {
  async render(container) {
    const u = App.currentUser;
    const avatarHTML = u.photo
      ? `<img src="${App.esc(u.photo)}" style="width:64px;height:64px;border-radius:50%;object-fit:cover" alt="avatar">`
      : Auth.getAvatarHTML(u, 'lg');
    container.innerHTML = `
      <div class="page-header"><h1>Настройки профиля</h1></div>
      <div class="card" style="max-width:600px"><div class="card-body">
        <div style="text-align:center;margin-bottom:24px">
          <div style="position:relative;display:inline-block" id="avatar-wrapper">
            ${avatarHTML}
            <label for="pf-photo" style="position:absolute;bottom:0;right:0;background:var(--primary);color:#fff;border-radius:50%;width:24px;height:24px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:12px;border:2px solid var(--surface)">📷</label>
          </div>
          <input type="file" id="pf-photo" accept="image/*" style="display:none" onchange="ProfilePage.uploadPhoto(this)">
          <div style="font-size:1.2rem;font-weight:600;margin-top:8px">${App.esc(Auth.getFullName(u))}</div>
          <div style="color:var(--text-secondary)">${Auth.getRoleName(u.role)}</div>
        </div>
        <form id="profile-form"><div class="form-row"><div class="form-group"><label>Имя</label><input type="text" id="pf-first" class="form-control" value="${App.esc(u.first_name||'')}" required></div><div class="form-group"><label>Фамилия</label><input type="text" id="pf-last" class="form-control" value="${App.esc(u.last_name||'')}" required></div></div>
        <div class="form-group"><label>Должность</label><input type="text" id="pf-position" class="form-control" value="${App.esc(u.position||'')}"></div>
        <div class="form-group"><label>Email</label><input type="email" id="pf-email" class="form-control" value="${App.esc(u.email||'')}" ${u.role!=='admin'?'readonly':''}></div>
        ${u.role==='admin'?'<div class="form-group"><label>Роль</label><select id="pf-role" class="form-control"><option value="employee"'+(u.role==='employee'?' selected':'')+'>Сотрудник</option><option value="project_manager"'+(u.role==='project_manager'?' selected':'')+'>Руководитель проекта</option><option value="admin"'+(u.role==='admin'?' selected':'')+'>Администратор</option></select></div>':''}
        <div class="form-group"><label>Тема</label><div class="theme-toggle"><button type="button" class="btn btn-sm ${(u.theme||'light')==='light'?'btn-primary':'btn-secondary'}" onclick="ProfilePage.setTheme('light')">☀️ Светлая</button> <button type="button" class="btn btn-sm ${u.theme==='dark'?'btn-primary':'btn-secondary'}" onclick="ProfilePage.setTheme('dark')">🌙 Тёмная</button></div></div>
        <hr><h3>Изменить пароль</h3>
        <div class="form-group"><label>Новый пароль</label><input type="password" id="pf-pwd" class="form-control" placeholder="Оставьте пустым, чтобы не менять"></div>
        <div class="form-group"><label>Подтвердите</label><input type="password" id="pf-pwd2" class="form-control"></div>
        <div class="form-actions"><button type="submit" class="btn btn-primary">Сохранить</button></div></form>
      </div></div>`;
    document.getElementById('profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = { first_name: document.getElementById('pf-first').value.trim(), last_name: document.getElementById('pf-last').value.trim(), position: document.getElementById('pf-position').value.trim() };
      if (u.role === 'admin') { data.email = document.getElementById('pf-email').value.trim(); data.role = document.getElementById('pf-role')?.value; }
      const pwd = document.getElementById('pf-pwd').value;
      if (pwd) {
        if (pwd !== document.getElementById('pf-pwd2').value) { App.showToast('Пароли не совпадают', 'error'); return; }
        data.password = pwd;
      }
      try { App.currentUser = await API.updateUser(u.id, data); App.showToast('Профиль сохранён'); } catch (err) { App.showToast(err.error || 'Ошибка', 'error'); }
    });
  },

  async uploadPhoto(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { App.showToast('Файл слишком большой (макс. 5 МБ)', 'error'); return; }
    try {
      const res = await API.uploadAvatar(file);
      App.currentUser.photo = res.url;
      App.showToast('Фото обновлено', 'success');
      const c = document.getElementById('main-content');
      if (c) this.render(c);
    } catch (err) { App.showToast(err.error || 'Ошибка загрузки', 'error'); }
  },

  setTheme(t) { document.documentElement.dataset.theme = t; App.currentUser.theme = t; API.updateUser(App.currentUser.id, { theme: t }); const c = document.getElementById('main-content'); if (c) this.render(c); }
};