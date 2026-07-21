const API_BASE = window.API_BASE_URL || '';
const API = {
  async request(method, url, data = null) {
    const fullUrl = API_BASE + url;
    const opts = { method, credentials: 'include', headers: {} };
    if (data && method !== 'GET') {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(data);
    }
    const res = await fetch(fullUrl, opts);
    const json = await res.json();
    if (!res.ok) throw json;
    return json;
  },
  get(u) { return this.request('GET', u); },
  post(u, d) { return this.request('POST', u, d); },
  put(u, d) { return this.request('PUT', u, d); },
  del(u) { return this.request('DELETE', u); },
  qs(params) {
    if (!params) return '';
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '' && v !== false) s.append(k, v);
    }
    const str = s.toString();
    return str ? '?' + str : '';
  },
  login(email, password) { return this.post('/api/auth/login', { email, password }); },
  logout() { return this.post('/api/auth/logout'); },
  me() { return this.get('/api/auth/me'); },
  getUsers() { return this.get('/api/users'); },
  getUser(id) { return this.get('/api/users/' + id); },
  createUser(d) { return this.post('/api/users', d); },
  updateUser(id, d) { return this.put('/api/users/' + id, d); },
  deleteUser(id) { return this.del('/api/users/' + id); },
  getTeam() { return this.get('/api/team'); },
  getProjects() { return this.get('/api/projects'); },
  getProject(id) { return this.get('/api/projects/' + id); },
  createProject(d) { return this.post('/api/projects', d); },
  updateProject(id, d) { return this.put('/api/projects/' + id, d); },
  addProjectMember(pid, uid) { return this.post('/api/projects/' + pid + '/members', { user_id: uid }); },
  removeProjectMember(pid, uid) { return this.del('/api/projects/' + pid + '/members/' + uid); },
  getMyTasks(f) { return this.get('/api/tasks/my' + this.qs(f)); },
  getTasks(f) { return this.get('/api/tasks' + this.qs(f)); },
  getTask(id) { return this.get('/api/tasks/' + id); },
  createTask(d) { return this.post('/api/tasks', d); },
  updateTask(id, d) { return this.put('/api/tasks/' + id, d); },
  deleteTask(id) { return this.del('/api/tasks/' + id); },
  updateTaskStatus(id, s) { return this.put('/api/tasks/' + id + '/status', { status: s }); },
  addComment(tid, text) { return this.post('/api/tasks/' + tid + '/comments', { text }); },
  updateComment(id, text) { return this.put('/api/comments/' + id, { text }); },
  deleteComment(id) { return this.del('/api/comments/' + id); },
  getNotifications() { return this.get('/api/notifications'); },
  getUnreadCount() { return this.get('/api/notifications/unread-count'); },
  markAllRead() { return this.put('/api/notifications/read'); },
  markRead(id) { return this.put('/api/notifications/' + id + '/read'); },
  search(q) { return this.get('/api/search' + this.qs({ q })); },
  getDashboard() { return this.get('/api/dashboard'); },
  uploadFile(taskId, file) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('task_id', taskId);
    return fetch(API_BASE + '/api/upload', { method: 'POST', credentials: 'include', body: fd })
      .then(async r => { const j = await r.json(); if (!r.ok) throw j; return j; });
  },
  uploadAvatar(file) {
    const fd = new FormData();
    fd.append('file', file);
    return fetch(API_BASE + '/api/upload/avatar', { method: 'POST', credentials: 'include', body: fd })
      .then(async r => { const j = await r.json(); if (!r.ok) throw j; return j; });
  }
};
