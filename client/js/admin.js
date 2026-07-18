const AdminPage = {
  async render(container) {
    if (!Auth.isAdmin()) { container.innerHTML = '<div class="empty-state"><h2>Доступ запрещён</h2></div>'; return; }
    let users = [];
    try { users = await API.getUsers(); } catch (e) {}
    let h = `<div class="page-header"><h1>Управление пользователями</h1><button class="btn btn-primary" onclick="AdminPage.showCreateModal()">+ Добавить</button></div>`;
    if (!users.length) { h += '<div class="empty-state"><p>Нет пользователей</p></div>'; container.innerHTML = h; return; }
    h += '<div class="table-wrapper"><table class="data-table"><thead><tr><th>Пользователь</th><th>Email</th><th>Должность</th><th>Роль</th><th>Действия</th></tr></thead><tbody>';
    users.forEach(u => {
      const rl = {admin:'Администратор',project_manager:'Рук. проекта',employee:'Сотрудник'}[u.role]||u.role;
      const rc = {admin:'#7c3aed',project_manager:'#00A9A5',employee:'#6b7280'}[u.role]||'#6b7280';
      h += `<tr><td style="display:flex;align-items:center;gap:10px">${Auth.getAvatarHTML(u,'sm')}<span>${App.esc(Auth.getFullName(u))}</span></td><td>${App.esc(u.email)}</td><td>${App.esc(u.position||'')}</td><td><span class="badge" style="background:${rc}">${rl}</span></td><td><button class="btn btn-secondary btn-sm" onclick="AdminPage.showEditModal(${u.id})">Изменить</button> <button class="btn btn-danger btn-sm" onclick="AdminPage.deleteUser(${u.id},'${App.esc(Auth.getFullName(u)).replace(/'/g,"\\'")}')">Удалить</button></td></tr>`;
    });
    h += '</tbody></table></div>';
    container.innerHTML = h;
  },

  showCreateModal() {
    App.showModal('Добавить пользователя', `
      <form id="admin-create-form"><div class="form-group"><label>Имя *</label><input type="text" id="ac-first" class="form-control" required></div>
      <div class="form-group"><label>Фамилия *</label><input type="text" id="ac-last" class="form-control" required></div>
      <div class="form-group"><label>Email *</label><input type="email" id="ac-email" class="form-control" required></div>
      <div class="form-group"><label>Должность</label><input type="text" id="ac-pos" class="form-control"></div>
      <div class="form-group"><label>Роль</label><select id="ac-role" class="form-control"><option value="employee">Сотрудник</option><option value="project_manager">Руководитель</option><option value="admin">Администратор</option></select></div>
      <div class="form-group"><label>Пароль</label><input type="password" id="ac-pwd" class="form-control" value="password123"></div>
      <div class="form-actions"><button type="button" class="btn btn-secondary" onclick="App.closeModal()">Отмена</button><button type="submit" class="btn btn-primary">Создать</button></div></form>`);
    document.getElementById('admin-create-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await API.createUser({ first_name: document.getElementById('ac-first').value.trim(), last_name: document.getElementById('ac-last').value.trim(), email: document.getElementById('ac-email').value.trim(), position: document.getElementById('ac-pos').value.trim(), role: document.getElementById('ac-role').value, password: document.getElementById('ac-pwd').value });
        App.closeModal(); App.showToast('Пользователь создан');
        const c = document.getElementById('main-content'); if (c) this.render(c);
      } catch (err) { App.showToast(err.error || 'Ошибка', 'error'); }
    });
  },

  async showEditModal(uid) {
    let user;
    try { user = await API.getUser(uid); } catch (e) { App.showToast('Ошибка загрузки', 'error'); return; }
    App.showModal('Редактировать пользователя', `
      <form id="admin-edit-form"><div class="form-group"><label>Имя</label><input type="text" id="ae-first" class="form-control" value="${App.esc(user.first_name||'')}"></div>
      <div class="form-group"><label>Фамилия</label><input type="text" id="ae-last" class="form-control" value="${App.esc(user.last_name||'')}"></div>
      <div class="form-group"><label>Email</label><input type="email" id="ae-email" class="form-control" value="${App.esc(user.email||'')}"></div>
      <div class="form-group"><label>Должность</label><input type="text" id="ae-pos" class="form-control" value="${App.esc(user.position||'')}"></div>
      <div class="form-group"><label>Роль</label><select id="ae-role" class="form-control"><option value="employee" ${user.role==='employee'?'selected':''}>Сотрудник</option><option value="project_manager" ${user.role==='project_manager'?'selected':''}>Руководитель</option><option value="admin" ${user.role==='admin'?'selected':''}>Администратор</option></select></div>
      <div class="form-group"><label>Новый пароль</label><input type="text" id="ae-pwd" class="form-control" placeholder="Оставьте пустым, чтобы не менять"></div>
      <div class="form-actions"><button type="button" class="btn btn-secondary" onclick="App.closeModal()">Отмена</button><button type="submit" class="btn btn-primary">Сохранить</button></div></form>`);
    document.getElementById('admin-edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = { first_name: document.getElementById('ae-first').value.trim(), last_name: document.getElementById('ae-last').value.trim(), email: document.getElementById('ae-email').value.trim(), position: document.getElementById('ae-pos').value.trim(), role: document.getElementById('ae-role').value };
      const pwd = document.getElementById('ae-pwd').value.trim();
      if (pwd) data.password = pwd;
      try { await API.updateUser(uid, data); App.closeModal(); App.showToast('Пользователь обновлён'); const c = document.getElementById('main-content'); if (c) this.render(c); } catch (err) { App.showToast(err.error || 'Ошибка', 'error'); }
    });
  },

  async deleteUser(uid, name) {
    if (!confirm(`Удалить ${name}?`)) return;
    try { await API.deleteUser(uid); App.showToast('Пользователь удалён'); const c = document.getElementById('main-content'); if (c) this.render(c); } catch (err) { App.showToast(err.error || 'Ошибка', 'error'); }
  }
};
