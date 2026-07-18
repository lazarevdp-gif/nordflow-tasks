const App = {
  currentUser: null,
  currentPage: '',
  _searchTimeout: null,

  async init() {
    try {
      const user = await API.me();
      if (user && user.id) {
        this.currentUser = user;
        if (user.theme) document.documentElement.dataset.theme = user.theme;
        this.renderLayout();
        this.setupRouter();
        this.updateNotificationBadge();
        return;
      }
    } catch (e) {}
    this.renderLogin();
  },

  renderLogin() {
    document.getElementById('app').innerHTML = `
      <div class="login-page">
        <div class="login-card">
          <div class="login-brand">
            <div class="login-logo">
              <img src="logo/logoicon.png" alt="NordFlow" onerror="this.parentElement.innerHTML='<span class=\\'login-logo-text\\'>NordFlow</span>'">
            </div>
            <h1>NordFlow Tasks</h1>
            <p class="login-subtitle">Внутренний трекер задач</p>
          </div>
          <form id="login-form" class="login-form">
            <div class="form-group">
              <label for="login-email">Email</label>
              <input type="email" id="login-email" class="form-control" placeholder="user@nordflow.ru" required>
            </div>
            <div class="form-group">
              <label for="login-password">Пароль</label>
              <div class="password-input-wrapper">
                <input type="password" id="login-password" class="form-control" placeholder="Введите пароль" required>
                <button type="button" class="password-toggle" onclick="App.togglePassword()">👁</button>
              </div>
            </div>
            <div id="login-error" class="login-error"></div>
            <button type="submit" class="btn btn-primary btn-block" id="login-btn">Войти</button>
          </form>
        </div>
      </div>`;

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');
      const btn = document.getElementById('login-btn');
      errEl.textContent = '';
      btn.disabled = true;
      btn.textContent = 'Вход...';
      try {
        const user = await API.login(email, password);
        this.currentUser = user;
        if (user.theme) document.documentElement.dataset.theme = user.theme;
        this.renderLayout();
        this.setupRouter();
        this.updateNotificationBadge();
      } catch (err) {
        errEl.textContent = err.error || 'Неверный логин или пароль';
      } finally {
        btn.disabled = false;
        btn.textContent = 'Войти';
      }
    });
  },

  togglePassword() {
    const inp = document.getElementById('login-password');
    const btn = document.querySelector('.password-toggle');
    if (inp.type === 'password') { inp.type = 'text'; btn.textContent = '🔒'; }
    else { inp.type = 'password'; btn.textContent = '👁'; }
  },

  renderLayout() {
    const u = this.currentUser;
    const initials = ((u.first_name||'')[0]||'') + ((u.last_name||'')[0]||'');
    const fullName = `${u.first_name||''} ${u.last_name||''}`.trim() || u.email;
    const isAdmin = u.role === 'admin';

    document.getElementById('app').innerHTML = `
      <div class="app-layout">
        <button class="sidebar-hamburger" onclick="App.toggleSidebar()">☰</button>
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-logo">
            <img src="logo/logoicon.png" alt="NordFlow" onerror="this.style.display='none'">
            <span class="sidebar-logo-text">NordFlow</span>
          </div>
          <nav class="sidebar-nav">
            <a href="#home" class="nav-link" data-page="home"><span class="nav-icon">🏠</span> Главная</a>
            <a href="#tasks" class="nav-link" data-page="tasks"><span class="nav-icon">📋</span> Мои задачи</a>
            <a href="#projects" class="nav-link" data-page="projects"><span class="nav-icon">📁</span> Проекты</a>
            <a href="#team" class="nav-link" data-page="team"><span class="nav-icon">👥</span> Команда</a>
            <a href="#notifications" class="nav-link" data-page="notifications"><span class="nav-icon">🔔</span> Уведомления <span class="badge" id="nav-notif-badge" style="display:none"></span></a>
            ${isAdmin ? '<a href="#admin" class="nav-link" data-page="admin"><span class="nav-icon">⚙️</span> Управление</a>' : ''}
          </nav>
          <div class="sidebar-user">
            <div class="sidebar-user-avatar">${initials.toUpperCase()}</div>
            <div class="sidebar-user-info">
              <div class="sidebar-user-name">${this.esc(fullName)}</div>
              <div class="sidebar-user-role">${this.roleLabel(u.role)}</div>
            </div>
            <button class="sidebar-logout" onclick="App.logout()" title="Выйти">⏻</button>
          </div>
        </aside>
        <main class="main-content">
          <div class="top-bar">
            <div class="search-container">
              <input type="text" id="global-search" placeholder="Поиск задач, проектов, сотрудников...">
              <div class="search-results" id="search-results"></div>
            </div>
            <div class="top-bar-actions">
              <a href="#notifications" class="notification-bell" onclick="App.markNotificationsRead()">🔔 <span class="badge" id="top-notif-badge" style="display:none"></span></a>
              <div class="user-menu">
                <button class="user-menu-btn" onclick="App.toggleUserMenu()"><span class="user-menu-avatar">${initials.toUpperCase()}</span></button>
                <div class="user-dropdown" id="user-dropdown">
                  <div class="dropdown-header"><strong>${this.esc(fullName)}</strong><span>${this.roleLabel(u.role)}</span></div>
                  <a href="#profile" class="dropdown-item">Настройки профиля</a>
                  <hr>
                  <button class="dropdown-item dropdown-logout" onclick="App.logout()">Выйти</button>
                </div>
              </div>
            </div>
          </div>
          <div id="main-content" class="page-content"></div>
        </main>
      </div>
      <div class="modal-overlay" id="modal-overlay" style="display:none" onclick="App.closeModal()">
        <div class="modal" id="modal" onclick="event.stopPropagation()">
          <div class="modal-header"><h3 id="modal-title"></h3><button class="modal-close" onclick="App.closeModal()">✕</button></div>
          <div class="modal-body" id="modal-body"></div>
        </div>
      </div>
      <div id="toast-container" class="toast-container"></div>`;

    this.setupSearch();
  },

  setupRouter() {
    window.addEventListener('hashchange', () => this.handleRoute());
    this.handleRoute();
  },

  handleRoute() {
    const hash = window.location.hash.slice(1) || 'home';
    const [page, ...rest] = hash.split('/');
    const params = {};
    if (rest.length) params.id = rest[0];
    this.navigate(page, params, true);
  },

  navigate(page, params = {}, fromHash = false) {
    this.currentPage = page;
    if (!fromHash) {
      window.location.hash = params.id ? `${page}/${params.id}` : page;
    }
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
    const mc = document.getElementById('main-content');
    if (!mc) return;
    mc.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>Загрузка...</p></div>';
    this._renderPage(page, params, mc).catch(err => {
      console.error(err);
      mc.innerHTML = '<div class="empty-state"><h3>Ошибка загрузки</h3></div>';
    });
  },

  async _renderPage(page, params, mc) {
    switch (page) {
      case 'home': await HomePage.render(mc, params); break;
      case 'tasks': await TasksPage.render(mc, params); break;
      case 'projects': await ProjectsPage.render(mc, params); break;
      case 'project': await ProjectPage.render(mc, params); break;
      case 'team': await TeamPage.render(mc, params); break;
      case 'profile': await ProfilePage.render(mc, params); break;
      case 'notifications': await NotificationsPage.render(mc, params); break;
      case 'admin':
        if (this.currentUser.role === 'admin') await AdminPage.render(mc, params);
        else mc.innerHTML = '<div class="empty-state"><h2>Доступ запрещён</h2></div>';
        break;
      case 'task':
        await TaskDetailPage.render(mc, params);
        break;
      default:
        mc.innerHTML = '<div class="empty-state"><h2>404</h2><p>Страница не найдена</p></div>';
    }
  },

  toggleSidebar() { document.getElementById('sidebar')?.classList.toggle('open'); },

  showToast(msg, type = 'info') {
    const c = document.getElementById('toast-container');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    const icon = { success: '✓', error: '✕', warning: '⚠' }[type] || 'ℹ';
    t.innerHTML = `<span class="toast-icon">${icon}</span> ${this.esc(msg)}`;
    c.appendChild(t);
    requestAnimationFrame(() => t.classList.add('toast-show'));
    setTimeout(() => { t.classList.remove('toast-show'); t.classList.add('toast-hide'); setTimeout(() => t.remove(), 300); }, 3000);
  },

  showModal(title, content) {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-title').textContent = title;
    const body = document.getElementById('modal-body');
    body.innerHTML = typeof content === 'string' ? content : '';
    if (content instanceof HTMLElement) { body.innerHTML = ''; body.appendChild(content); }
    overlay.style.display = 'flex';
  },

  closeModal() {
    document.getElementById('modal-overlay').style.display = 'none';
  },

  setupSearch() {
    const inp = document.getElementById('global-search');
    const res = document.getElementById('search-results');
    if (!inp) return;
    inp.addEventListener('input', () => {
      clearTimeout(this._searchTimeout);
      const q = inp.value.trim();
      if (q.length < 2) { res.style.display = 'none'; res.innerHTML = ''; return; }
      this._searchTimeout = setTimeout(async () => {
        try {
          const data = await API.search(q);
          let html = '';
          if (data.tasks?.length) {
            html += '<div class="search-section"><div class="search-section-title">Задачи</div>';
            data.tasks.forEach(t => { html += `<a href="#task/${t.id}" class="search-item" onclick="document.getElementById(\'search-results\').style.display=\'none\'">${this.esc(t.identifier||'')} ${this.esc(t.title)}</a>`; });
            html += '</div>';
          }
          if (data.projects?.length) {
            html += '<div class="search-section"><div class="search-section-title">Проекты</div>';
            data.projects.forEach(p => { html += `<a href="#project/${p.id}" class="search-item" onclick="document.getElementById(\'search-results\').style.display=\'none\'">${this.esc(p.name)}</a>`; });
            html += '</div>';
          }
          if (data.users?.length) {
            html += '<div class="search-section"><div class="search-section-title">Сотрудники</div>';
            data.users.forEach(u => { html += `<a href="#team" class="search-item" onclick="document.getElementById(\'search-results\').style.display=\'none\'">${this.esc(u.first_name)} ${this.esc(u.last_name)}</a>`; });
            html += '</div>';
          }
          if (!html) html = '<div class="search-empty">Ничего не найдено</div>';
          res.innerHTML = html;
          res.style.display = 'block';
        } catch (e) {}
      }, 300);
    });
    inp.addEventListener('blur', () => setTimeout(() => { res.style.display = 'none'; }, 200));
    inp.addEventListener('focus', () => { if (res.innerHTML) res.style.display = 'block'; });
  },

  async updateNotificationBadge() {
    try {
      const { count } = await API.getUnreadCount();
      const nb = document.getElementById('nav-notif-badge');
      const tb = document.getElementById('top-notif-badge');
      [nb, tb].forEach(b => { if (b) { b.textContent = count > 0 ? count : ''; b.style.display = count > 0 ? 'inline-flex' : 'none'; } });
    } catch (e) {}
  },

  async markNotificationsRead() {
    await API.markAllRead();
    this.updateNotificationBadge();
  },

  toggleUserMenu() {
    const dd = document.getElementById('user-dropdown');
    if (!dd) return;
    dd.classList.toggle('open');
    if (dd.classList.contains('open')) {
      const h = (e) => { if (!dd.contains(e.target) && !e.target.closest('.user-menu-btn')) { dd.classList.remove('open'); document.removeEventListener('click', h); } };
      setTimeout(() => document.addEventListener('click', h), 0);
    }
  },

  async logout() {
    try { await API.logout(); } catch (e) {}
    this.currentUser = null;
    window.location.hash = '';
    this.renderLogin();
  },

  esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; },
  roleLabel(r) { return { admin: 'Администратор', project_manager: 'Руководитель проекта', employee: 'Сотрудник' }[r] || r; },
};

document.addEventListener('DOMContentLoaded', () => App.init());
