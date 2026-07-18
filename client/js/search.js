const SearchModule = {
  debounceTimer: null,
  init() {
    const inp = document.getElementById('global-search');
    if (!inp) return;
    inp.addEventListener('input', () => {
      clearTimeout(this.debounceTimer);
      const q = inp.value.trim();
      if (q.length < 2) { this.hideResults(); return; }
      this.debounceTimer = setTimeout(() => this.search(q), 300);
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-container')) this.hideResults();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hideResults();
    });
  },
  async search(query) {
    try {
      const results = await API.search(query);
      this.showResults(results);
    } catch (e) {}
  },
  showResults(results) {
    const dd = document.getElementById('search-results');
    if (!dd) return;
    const { tasks = [], projects = [], users = [] } = results;
    if (!tasks.length && !projects.length && !users.length) {
      dd.innerHTML = '<div class="search-empty">Ничего не найдено</div>';
      dd.style.display = 'block';
      return;
    }
    let html = '';
    if (tasks.length) {
      html += '<div class="search-section"><div class="search-section-title">Задачи</div>';
      tasks.forEach(t => { html += `<a href="#task/${t.id}" class="search-item" onclick="SearchModule.hideResults()">${App.esc(t.identifier||'')} ${App.esc(t.title)}</a>`; });
      html += '</div>';
    }
    if (projects.length) {
      html += '<div class="search-section"><div class="search-section-title">Проекты</div>';
      projects.forEach(p => { html += `<a href="#project/${p.id}" class="search-item" onclick="SearchModule.hideResults()">${App.esc(p.name)}</a>`; });
      html += '</div>';
    }
    if (users.length) {
      html += '<div class="search-section"><div class="search-section-title">Сотрудники</div>';
      users.forEach(u => { html += `<a href="#team" class="search-item" onclick="SearchModule.hideResults()">${App.esc(u.first_name)} ${App.esc(u.last_name)} — ${App.esc(u.position||'')}</a>`; });
      html += '</div>';
    }
    dd.innerHTML = html;
    dd.style.display = 'block';
  },
  hideResults() {
    const dd = document.getElementById('search-results');
    if (dd) { dd.innerHTML = ''; dd.style.display = 'none'; }
  }
};
