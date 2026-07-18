import os
import json
import secrets
import time
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, session, g
from flask_cors import CORS
from db import (get_db, init_db, hash_password, verify_password, user_to_dict, task_to_dict, project_to_dict)

app = Flask(__name__, static_folder='../client', static_url_path='')
app.secret_key = os.environ.get('SECRET_KEY') or secrets.token_hex(32)
CORS(app, supports_credentials=True, origins=os.environ.get('CORS_ORIGINS', 'http://localhost:5000').split(','))
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(hours=8)
app.config['SESSION_COOKIE_SECURE'] = False

UPLOAD_DIR = os.path.join(os.path.dirname(__file__), '..', 'client', 'uploads')
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_UPLOAD_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.zip', '.txt', '.csv'}
MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB

_login_attempts = {}
LOGIN_RATE_LIMIT = 5
LOGIN_RATE_WINDOW = 300

def _check_rate_limit(ip):
    now = time.time()
    if ip not in _login_attempts:
        _login_attempts[ip] = []
    _login_attempts[ip] = [t for t in _login_attempts[ip] if now - t < LOGIN_RATE_WINDOW]
    if len(_login_attempts[ip]) >= LOGIN_RATE_LIMIT:
        return False
    _login_attempts[ip].append(now)
    return True

def get_db_conn():
    if 'db' not in g:
        g.db = get_db()
    return g.db

@app.teardown_appcontext
def close_db(exception):
    db = g.pop('db', None)
    if db is not None:
        db.close()

def _check_session():
    if 'user_id' not in session:
        return False
    if 'last_activity' in session:
        last = datetime.fromisoformat(session['last_activity'])
        if datetime.now() - last > timedelta(hours=8):
            session.clear()
            return False
    session['last_activity'] = datetime.now().isoformat()
    return True

def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not _check_session():
            return jsonify({'error': 'Unauthorized'}), 401
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not _check_session():
            return jsonify({'error': 'Unauthorized'}), 401
        db = get_db_conn()
        user = db.execute("SELECT role FROM users WHERE id=?", (session['user_id'],)).fetchone()
        if not user or user['role'] != 'admin':
            return jsonify({'error': 'Forbidden'}), 403
        return f(*args, **kwargs)
    return decorated

def pm_or_admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not _check_session():
            return jsonify({'error': 'Unauthorized'}), 401
        db = get_db_conn()
        user = db.execute("SELECT role FROM users WHERE id=?", (session['user_id'],)).fetchone()
        if not user or user['role'] not in ('admin', 'project_manager'):
            return jsonify({'error': 'Forbidden'}), 403
        return f(*args, **kwargs)
    return decorated

def _validate_file_upload(f):
    ext = os.path.splitext(f.filename or '')[1].lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        return False, f"Разрешённые типы: {', '.join(ALLOWED_UPLOAD_EXTENSIONS)}"
    f.seek(0, os.SEEK_END)
    size = f.tell()
    f.seek(0)
    if size > MAX_UPLOAD_SIZE:
        return False, "Файл слишком большой (макс 10MB)"
    return True, None

# --- Auth ---

@app.route('/api/auth/login', methods=['POST'])
def login():
    ip = request.remote_addr
    if not _check_rate_limit(ip):
        return jsonify({'error': 'Слишком много попыток. Попробуйте через 5 минут'}), 429
    data = request.json
    email = (data.get('email') or '').strip()
    password = data.get('password') or ''
    if not email or not password:
        return jsonify({'error': 'Введите email и пароль'}), 400
    db = get_db_conn()
    user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
    if not user or not verify_password(password, user['password_hash']):
        return jsonify({'error': 'Неверный логин или пароль'}), 401
    session.permanent = True
    session['user_id'] = user['id']
    session['last_activity'] = datetime.now().isoformat()
    return jsonify(user_to_dict(user))

@app.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({'ok': True})

@app.route('/api/auth/me')
def me():
    if 'user_id' not in session:
        return jsonify(None)
    db = get_db_conn()
    user = db.execute("SELECT * FROM users WHERE id=?", (session['user_id'],)).fetchone()
    if not user:
        session.clear()
        return jsonify(None)
    return jsonify(user_to_dict(user))

# --- Users ---

@app.route('/api/users', methods=['GET'])
@login_required
def get_users():
    db = get_db_conn()
    rows = db.execute("SELECT * FROM users ORDER BY first_name").fetchall()
    return jsonify([user_to_dict(r) for r in rows])

@app.route('/api/users/<int:uid>', methods=['GET'])
@login_required
def get_user(uid):
    db = get_db_conn()
    row = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    return jsonify(user_to_dict(row))

@app.route('/api/users', methods=['POST'])
@admin_required
def create_user():
    data = request.json
    email = (data.get('email') or '').strip()
    first_name = (data.get('first_name') or '').strip()
    last_name = (data.get('last_name') or '').strip()
    if not email or not first_name or not last_name:
        return jsonify({'error': 'Email, имя и фамилия обязательны'}), 400
    if '@' not in email or '.' not in email:
        return jsonify({'error': 'Некорректный email'}), 400
    password = data.get('password') or 'password123'
    if len(password) < 6:
        return jsonify({'error': 'Пароль минимум 6 символов'}), 400
    db = get_db_conn()
    try:
        db.execute(
            "INSERT INTO users (email, password_hash, first_name, last_name, position, role) VALUES (?,?,?,?,?,?)",
            (email, hash_password(password),
             first_name, last_name, (data.get('position') or '').strip(), data.get('role', 'employee'))
        )
        db.commit()
        user = db.execute("SELECT * FROM users WHERE email=?", (email,)).fetchone()
        return jsonify(user_to_dict(user)), 201
    except Exception as e:
        return jsonify({'error': 'Пользователь с таким email уже существует'}), 400

@app.route('/api/users/<int:uid>', methods=['PUT'])
@login_required
def update_user(uid):
    if session['user_id'] != uid:
        db = get_db_conn()
        caller = db.execute("SELECT role FROM users WHERE id=?", (session['user_id'],)).fetchone()
        if not caller or caller['role'] != 'admin':
            return jsonify({'error': 'Forbidden'}), 403
    data = request.json
    db = get_db_conn()
    fields = []
    values = []
    for f in ['first_name', 'last_name', 'position', 'photo', 'theme']:
        if f in data:
            fields.append(f"{f}=?")
            values.append(data[f])
    if 'role' in data:
        caller = db.execute("SELECT role FROM users WHERE id=?", (session['user_id'],)).fetchone()
        if caller and caller['role'] == 'admin':
            fields.append("role=?")
            values.append(data['role'])
    if 'password' in data and data['password']:
        if len(data['password']) < 6:
            return jsonify({'error': 'Пароль минимум 6 символов'}), 400
        fields.append("password_hash=?")
        values.append(hash_password(data['password']))
    if 'email' in data:
        caller = db.execute("SELECT role FROM users WHERE id=?", (session['user_id'],)).fetchone()
        if caller and caller['role'] == 'admin':
            fields.append("email=?")
            values.append(data['email'])
    if not fields:
        return jsonify({'error': 'No fields to update'}), 400
    values.append(uid)
    db.execute(f"UPDATE users SET {', '.join(fields)} WHERE id=?", values)
    db.commit()
    user = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    return jsonify(user_to_dict(user))

@app.route('/api/users/<int:uid>', methods=['DELETE'])
@admin_required
def delete_user(uid):
    db = get_db_conn()
    db.execute("DELETE FROM users WHERE id=?", (uid,))
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/team')
@login_required
def get_team():
    db = get_db_conn()
    users = db.execute("SELECT * FROM users ORDER BY first_name").fetchall()
    result = []
    for u in users:
        ud = user_to_dict(u)
        ud['active_tasks'] = db.execute(
            "SELECT COUNT(*) FROM tasks WHERE assignee_id=? AND status NOT IN ('done','backlog')", (u['id'],)
        ).fetchone()[0]
        ud['overdue_tasks'] = db.execute(
            "SELECT COUNT(*) FROM tasks WHERE assignee_id=? AND status NOT IN ('done') AND deadline < date('now')", (u['id'],)
        ).fetchone()[0]
        result.append(ud)
    return jsonify(result)

# --- Projects ---

@app.route('/api/projects', methods=['GET'])
@login_required
def get_projects():
    db = get_db_conn()
    uid = session['user_id']
    user = db.execute("SELECT role FROM users WHERE id=?", (uid,)).fetchone()
    if user['role'] == 'admin':
        rows = db.execute("SELECT p.*, u.first_name || ' ' || u.last_name as manager_name FROM projects p LEFT JOIN users u ON p.manager_id=u.id ORDER BY p.created_at DESC").fetchall()
    else:
        rows = db.execute("""
            SELECT p.*, u.first_name || ' ' || u.last_name as manager_name
            FROM projects p
            LEFT JOIN users u ON p.manager_id=u.id
            WHERE p.id IN (SELECT project_id FROM project_members WHERE user_id=?)
            ORDER BY p.created_at DESC
        """, (uid,)).fetchall()
    result = []
    for r in rows:
        pd = project_to_dict(r)
        pd['manager_name'] = r['manager_name']
        pd['open_tasks'] = db.execute("SELECT COUNT(*) FROM tasks WHERE project_id=? AND status NOT IN ('done')", (r['id'],)).fetchone()[0]
        pd['member_count'] = db.execute("SELECT COUNT(*) FROM project_members WHERE project_id=?", (r['id'],)).fetchone()[0]
        result.append(pd)
    return jsonify(result)

@app.route('/api/projects', methods=['POST'])
@pm_or_admin_required
def create_project():
    data = request.json
    db = get_db_conn()
    db.execute(
        "INSERT INTO projects (name, description, manager_id, start_date, end_date, status) VALUES (?,?,?,?,?,?)",
        (data['name'], data.get('description', ''), data['manager_id'],
         data.get('start_date', ''), data.get('end_date', ''), data.get('status', 'planning'))
    )
    db.commit()
    proj = db.execute("SELECT * FROM projects ORDER BY id DESC LIMIT 1").fetchone()
    if 'members' in data:
        for mid in data['members']:
            db.execute("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?,?)", (proj['id'], mid))
        db.commit()
    elif data.get('manager_id'):
        db.execute("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?,?)", (proj['id'], data['manager_id']))
        db.commit()
    return jsonify(project_to_dict(proj)), 201

@app.route('/api/projects/<int:pid>', methods=['GET'])
@login_required
def get_project(pid):
    db = get_db_conn()
    p = db.execute("SELECT p.*, u.first_name || ' ' || u.last_name as manager_name FROM projects p LEFT JOIN users u ON p.manager_id=u.id WHERE p.id=?", (pid,)).fetchone()
    if not p:
        return jsonify({'error': 'Not found'}), 404
    pd = project_to_dict(p)
    pd['manager_name'] = p['manager_name']
    members = db.execute("SELECT u.id, u.first_name, u.last_name, u.position, u.photo FROM users u JOIN project_members pm ON u.id=pm.user_id WHERE pm.project_id=?", (pid,)).fetchall()
    pd['members'] = [dict(m) for m in members]
    tasks = db.execute("""
        SELECT t.*, u.first_name || ' ' || u.last_name as assignee_name, c.first_name || ' ' || c.last_name as creator_name
        FROM tasks t
        LEFT JOIN users u ON t.assignee_id=u.id
        LEFT JOIN users c ON t.creator_id=c.id
        WHERE t.project_id=?
        ORDER BY t.created_at DESC
    """, (pid,)).fetchall()
    pd['tasks'] = [task_to_dict(t) for t in tasks]
    for t in pd['tasks']:
        t['assignee_name'] = tasks[pd['tasks'].index(t)]['assignee_name']
        t['creator_name'] = tasks[pd['tasks'].index(t)]['creator_name']
        tc = db.execute("SELECT COUNT(*) FROM comments WHERE task_id=?", (t['id'],)).fetchone()[0]
        t['comment_count'] = tc
        ac = db.execute("SELECT COUNT(*) FROM task_attachments WHERE task_id=?", (t['id'],)).fetchone()[0]
        t['attachment_count'] = ac
    return jsonify(pd)

@app.route('/api/projects/<int:pid>', methods=['PUT'])
@login_required
def update_project(pid):
    data = request.json
    db = get_db_conn()
    fields = []
    values = []
    for f in ['name', 'description', 'manager_id', 'start_date', 'end_date', 'status']:
        if f in data:
            fields.append(f"{f}=?")
            values.append(data[f])
    if not fields:
        return jsonify({'error': 'No fields'}), 400
    values.append(pid)
    db.execute(f"UPDATE projects SET {', '.join(fields)} WHERE id=?", values)
    if 'members' in data:
        db.execute("DELETE FROM project_members WHERE project_id=?", (pid,))
        for mid in data['members']:
            db.execute("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?,?)", (pid, mid))
    db.commit()
    p = db.execute("SELECT * FROM projects WHERE id=?", (pid,)).fetchone()
    return jsonify(project_to_dict(p))

@app.route('/api/projects/<int:pid>/members', methods=['POST'])
@login_required
def add_project_member(pid):
    data = request.json
    db = get_db_conn()
    db.execute("INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES (?,?)", (pid, data['user_id']))
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/projects/<int:pid>/members/<int:uid>', methods=['DELETE'])
@login_required
def remove_project_member(pid, uid):
    db = get_db_conn()
    db.execute("DELETE FROM project_members WHERE project_id=? AND user_id=?", (pid, uid))
    db.commit()
    return jsonify({'ok': True})

# --- Tasks ---

@app.route('/api/tasks/my', methods=['GET'])
@login_required
def get_my_tasks():
    db = get_db_conn()
    uid = session['user_id']
    rows = db.execute("""
        SELECT t.*, p.name as project_name, u.first_name || ' ' || u.last_name as creator_name
        FROM tasks t
        LEFT JOIN projects p ON t.project_id=p.id
        LEFT JOIN users u ON t.creator_id=u.id
        WHERE t.assignee_id=?
        ORDER BY
            CASE t.priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
            t.deadline ASC
    """, (uid,)).fetchall()
    result = []
    for r in rows:
        td = task_to_dict(r)
        td['project_name'] = r['project_name']
        td['creator_name'] = r['creator_name']
        tc = db.execute("SELECT COUNT(*) FROM comments WHERE task_id=?", (r['id'],)).fetchone()[0]
        td['comment_count'] = tc
        ac = db.execute("SELECT COUNT(*) FROM task_attachments WHERE task_id=?", (r['id'],)).fetchone()[0]
        td['attachment_count'] = ac
        result.append(td)
    return jsonify(result)

@app.route('/api/tasks', methods=['GET'])
@login_required
def get_all_tasks():
    db = get_db_conn()
    project_id = request.args.get('project_id')
    status = request.args.get('status')
    priority = request.args.get('priority')
    assignee_id = request.args.get('assignee_id')
    search = request.args.get('search', '')
    query = """
        SELECT t.*, p.name as project_name, u.first_name || ' ' || u.last_name as assignee_name,
               c.first_name || ' ' || c.last_name as creator_name
        FROM tasks t
        LEFT JOIN projects p ON t.project_id=p.id
        LEFT JOIN users u ON t.assignee_id=u.id
        LEFT JOIN users c ON t.creator_id=c.id
        WHERE 1=1
    """
    params = []
    if project_id:
        query += " AND t.project_id=?"
        params.append(project_id)
    if status:
        query += " AND t.status=?"
        params.append(status)
    if priority:
        query += " AND t.priority=?"
        params.append(priority)
    if assignee_id:
        query += " AND t.assignee_id=?"
        params.append(assignee_id)
    if search:
        query += " AND t.title LIKE ?"
        params.append(f"%{search}%")
    query += " ORDER BY t.created_at DESC"
    rows = db.execute(query, params).fetchall()
    result = []
    for r in rows:
        td = task_to_dict(r)
        td['project_name'] = r['project_name']
        td['assignee_name'] = r['assignee_name']
        td['creator_name'] = r['creator_name']
        tc = db.execute("SELECT COUNT(*) FROM comments WHERE task_id=?", (r['id'],)).fetchone()[0]
        td['comment_count'] = tc
        ac = db.execute("SELECT COUNT(*) FROM task_attachments WHERE task_id=?", (r['id'],)).fetchone()[0]
        td['attachment_count'] = ac
        result.append(td)
    return jsonify(result)

@app.route('/api/tasks', methods=['POST'])
@login_required
def create_task():
    data = request.json
    title = (data.get('title') or '').strip()
    if not title:
        return jsonify({'error': 'Название задачи обязательно'}), 400
    if len(title) > 200:
        return jsonify({'error': 'Название слишком длинное (макс 200 символов)'}), 400
    db = get_db_conn()
    last = db.execute("SELECT id FROM tasks ORDER BY id DESC LIMIT 1").fetchone()
    next_num = (last['id'] + 1) if last else 101
    identifier = f"NDF-{next_num}"
    db.execute(
        "INSERT INTO tasks (identifier, title, description, project_id, status, priority, assignee_id, creator_id, deadline, start_date, tags) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        (identifier, title, data.get('description', ''), data.get('project_id'),
         data.get('status', 'backlog'), data.get('priority', 'medium'),
         data.get('assignee_id'), session['user_id'], data.get('deadline', ''), data.get('start_date', ''), data.get('tags', ''))
    )
    db.commit()
    task = db.execute("SELECT * FROM tasks ORDER BY id DESC LIMIT 1").fetchone()
    if data.get('assignee_id'):
        db.execute(
            "INSERT INTO notifications (user_id, type, message, task_id) VALUES (?,?,?,?)",
            (data['assignee_id'], 'task_assigned', f"Вам назначена задача {identifier}: {title}", task['id'])
        )
        db.commit()
    return jsonify(task_to_dict(task)), 201

@app.route('/api/tasks/<int:tid>', methods=['GET'])
@login_required
def get_task(tid):
    db = get_db_conn()
    r = db.execute("""
        SELECT t.*, p.name as project_name,
               u.first_name || ' ' || u.last_name as assignee_name,
               c.first_name || ' ' || c.last_name as creator_name
        FROM tasks t
        LEFT JOIN projects p ON t.project_id=p.id
        LEFT JOIN users u ON t.assignee_id=u.id
        LEFT JOIN users c ON t.creator_id=c.id
        WHERE t.id=?
    """, (tid,)).fetchone()
    if not r:
        return jsonify({'error': 'Not found'}), 404
    td = task_to_dict(r)
    td['project_name'] = r['project_name']
    td['assignee_name'] = r['assignee_name']
    td['creator_name'] = r['creator_name']
    comments = db.execute("""
        SELECT cm.*, u.first_name || ' ' || u.last_name as author_name, u.photo as author_photo
        FROM comments cm
        LEFT JOIN users u ON cm.user_id=u.id
        WHERE cm.task_id=?
        ORDER BY cm.created_at ASC
    """, (tid,)).fetchall()
    td['comments'] = []
    for cm in comments:
        cd = dict(cm)
        cd['created_at'] = str(cd['created_at'])
        td['comments'].append(cd)
    history = db.execute("""
        SELECT th.*, u.first_name || ' ' || u.last_name as user_name
        FROM task_history th
        LEFT JOIN users u ON th.user_id=u.id
        WHERE th.task_id=?
        ORDER BY th.created_at DESC
    """, (tid,)).fetchall()
    td['history'] = []
    for h in history:
        hd = dict(h)
        hd['created_at'] = str(hd['created_at'])
        td['history'].append(hd)
    attachments = db.execute("SELECT * FROM task_attachments WHERE task_id=?", (tid,)).fetchall()
    td['attachments'] = [dict(a) for a in attachments]
    for a in td['attachments']:
        a['uploaded_at'] = str(a['uploaded_at'])
    return jsonify(td)

@app.route('/api/tasks/<int:tid>', methods=['PUT'])
@login_required
def update_task(tid):
    data = request.json
    db = get_db_conn()
    old = db.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
    if not old:
        return jsonify({'error': 'Not found'}), 404
    caller = db.execute("SELECT role FROM users WHERE id=?", (session['user_id'],)).fetchone()
    uid = session['user_id']
    is_owner = old['assignee_id'] == uid or old['creator_id'] == uid
    is_pm_or_admin = caller['role'] in ('admin', 'project_manager')
    if not is_owner and not is_pm_or_admin:
        return jsonify({'error': 'Forbidden'}), 403
    if 'title' in data:
        title = (data['title'] or '').strip()
        if not title:
            return jsonify({'error': 'Название обязательно'}), 400
        data['title'] = title
    fields = []
    values = []
    for f in ['title', 'description', 'project_id', 'status', 'priority', 'assignee_id', 'deadline', 'tags']:
        if f in data and data[f] != old[f]:
            db.execute(
                "INSERT INTO task_history (task_id, user_id, field, old_value, new_value) VALUES (?,?,?,?,?)",
                (tid, session['user_id'], f, str(old[f] or ''), str(data[f] or ''))
            )
            if f == 'status' and old['assignee_id']:
                db.execute(
                    "INSERT INTO notifications (user_id, type, message, task_id) VALUES (?,?,?,?)",
                    (old['assignee_id'], 'status_changed',
                     f"Статус задачи {old['identifier']} изменён: {data[f]}", tid)
                )
            if f == 'deadline' and old['assignee_id']:
                db.execute(
                    "INSERT INTO notifications (user_id, type, message, task_id) VALUES (?,?,?,?)",
                    (old['assignee_id'], 'deadline_changed',
                     f"Дедлайн задачи {old['identifier']} изменён", tid)
                )
            fields.append(f"{f}=?")
            values.append(data[f])
    if not fields:
        return jsonify(task_to_dict(old))
    values.append(tid)
    db.execute(f"UPDATE tasks SET {', '.join(fields)} WHERE id=?", values)
    db.commit()
    task = db.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
    return jsonify(task_to_dict(task))

@app.route('/api/tasks/<int:tid>', methods=['DELETE'])
@login_required
def delete_task(tid):
    db = get_db_conn()
    task = db.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
    if not task:
        return jsonify({'error': 'Not found'}), 404
    caller = db.execute("SELECT role FROM users WHERE id=?", (session['user_id'],)).fetchone()
    if caller['role'] != 'admin' and task['creator_id'] != session['user_id']:
        return jsonify({'error': 'Forbidden'}), 403
    db.execute("DELETE FROM tasks WHERE id=?", (tid,))
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/tasks/<int:tid>/status', methods=['PUT'])
@login_required
def update_task_status(tid):
    data = request.json
    new_status = data.get('status')
    if new_status not in ('backlog', 'planned', 'in_progress', 'review', 'done'):
        return jsonify({'error': 'Недопустимый статус'}), 400
    db = get_db_conn()
    old = db.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
    if not old:
        return jsonify({'error': 'Not found'}), 404
    caller = db.execute("SELECT role FROM users WHERE id=?", (session['user_id'],)).fetchone()
    uid = session['user_id']
    is_owner = old['assignee_id'] == uid or old['creator_id'] == uid
    is_pm_or_admin = caller['role'] in ('admin', 'project_manager')
    if not is_owner and not is_pm_or_admin:
        return jsonify({'error': 'Forbidden'}), 403
    db.execute("UPDATE tasks SET status=? WHERE id=?", (new_status, tid))
    db.execute(
        "INSERT INTO task_history (task_id, user_id, field, old_value, new_value) VALUES (?,?,?,?,?)",
        (tid, session['user_id'], 'status', old['status'], new_status)
    )
    if old['assignee_id'] and old['assignee_id'] != session['user_id']:
        db.execute(
            "INSERT INTO notifications (user_id, type, message, task_id) VALUES (?,?,?,?)",
            (old['assignee_id'], 'status_changed',
             f"Статус задачи {old['identifier']} изменён на «{new_status}»", tid)
        )
    db.commit()
    return jsonify({'ok': True})

# --- Comments ---

@app.route('/api/tasks/<int:tid>/comments', methods=['POST'])
@login_required
def add_comment(tid):
    data = request.json
    db = get_db_conn()
    db.execute("INSERT INTO comments (task_id, user_id, text) VALUES (?,?,?)",
               (tid, session['user_id'], data['text']))
    db.commit()
    task = db.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone()
    if task and task['assignee_id'] and task['assignee_id'] != session['user_id']:
        db.execute(
            "INSERT INTO notifications (user_id, type, message, task_id) VALUES (?,?,?,?)",
            (task['assignee_id'], 'new_comment',
             f"Новый комментарий к задаче {task['identifier']}", tid)
        )
        db.commit()
    comment = db.execute("SELECT * FROM comments ORDER BY id DESC LIMIT 1").fetchone()
    return jsonify(dict(comment)), 201

@app.route('/api/comments/<int:cid>', methods=['PUT'])
@login_required
def update_comment(cid):
    data = request.json
    db = get_db_conn()
    c = db.execute("SELECT * FROM comments WHERE id=?", (cid,)).fetchone()
    if not c:
        return jsonify({'error': 'Not found'}), 404
    caller = db.execute("SELECT role FROM users WHERE id=?", (session['user_id'],)).fetchone()
    if c['user_id'] != session['user_id'] and caller['role'] != 'admin':
        return jsonify({'error': 'Forbidden'}), 403
    db.execute("UPDATE comments SET text=? WHERE id=?", (data['text'], cid))
    db.commit()
    updated = db.execute("SELECT * FROM comments WHERE id=?", (cid,)).fetchone()
    return jsonify(dict(updated))

@app.route('/api/comments/<int:cid>', methods=['DELETE'])
@login_required
def delete_comment(cid):
    db = get_db_conn()
    c = db.execute("SELECT * FROM comments WHERE id=?", (cid,)).fetchone()
    if not c:
        return jsonify({'error': 'Not found'}), 404
    caller = db.execute("SELECT role FROM users WHERE id=?", (session['user_id'],)).fetchone()
    if c['user_id'] != session['user_id'] and caller['role'] != 'admin':
        return jsonify({'error': 'Forbidden'}), 403
    db.execute("DELETE FROM comments WHERE id=?", (cid,))
    db.commit()
    return jsonify({'ok': True})

# --- Notifications ---

@app.route('/api/notifications', methods=['GET'])
@login_required
def get_notifications():
    db = get_db_conn()
    uid = session['user_id']
    rows = db.execute(
        "SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50", (uid,)
    ).fetchall()
    result = []
    for r in rows:
        nd = dict(r)
        nd['created_at'] = str(nd['created_at'])
        result.append(nd)
    return jsonify(result)

@app.route('/api/notifications/unread-count')
@login_required
def unread_count():
    db = get_db_conn()
    cnt = db.execute("SELECT COUNT(*) FROM notifications WHERE user_id=? AND is_read=0", (session['user_id'],)).fetchone()[0]
    return jsonify({'count': cnt})

@app.route('/api/notifications/read', methods=['PUT'])
@login_required
def mark_all_read():
    db = get_db_conn()
    db.execute("UPDATE notifications SET is_read=1 WHERE user_id=?", (session['user_id'],))
    db.commit()
    return jsonify({'ok': True})

@app.route('/api/notifications/<int:nid>/read', methods=['PUT'])
@login_required
def mark_read(nid):
    db = get_db_conn()
    db.execute("UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?", (nid, session['user_id']))
    db.commit()
    return jsonify({'ok': True})

# --- Search ---

@app.route('/api/search')
@login_required
def search():
    q = request.args.get('q', '')
    if len(q) < 2:
        return jsonify({'tasks': [], 'projects': [], 'users': []})
    db = get_db_conn()
    uid = session['user_id']
    user = db.execute("SELECT role FROM users WHERE id=?", (uid,)).fetchone()

    tasks = db.execute("""
        SELECT t.id, t.identifier, t.title, t.status, t.priority, p.name as project_name
        FROM tasks t LEFT JOIN projects p ON t.project_id=p.id
        WHERE t.title LIKE ? OR t.identifier LIKE ?
        LIMIT 10
    """, (f"%{q}%", f"%{q}%")).fetchall()

    if user['role'] == 'admin':
        projects = db.execute("SELECT id, name, status FROM projects WHERE name LIKE ? LIMIT 10", (f"%{q}%",)).fetchall()
    else:
        projects = db.execute("""
            SELECT p.id, p.name, p.status FROM projects p
            JOIN project_members pm ON p.id=pm.project_id
            WHERE pm.user_id=? AND p.name LIKE ?
            LIMIT 10
        """, (uid, f"%{q}%")).fetchall()

    users = db.execute("SELECT id, first_name, last_name, position FROM users WHERE first_name LIKE ? OR last_name LIKE ? LIMIT 10",
                       (f"%{q}%", f"%{q}%")).fetchall()

    return jsonify({
        'tasks': [dict(t) for t in tasks],
        'projects': [dict(p) for p in projects],
        'users': [dict(u) for u in users],
    })

# --- Dashboard stats ---

@app.route('/api/dashboard')
@login_required
def dashboard():
    db = get_db_conn()
    uid = session['user_id']
    user = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()

    active = db.execute("SELECT COUNT(*) FROM tasks WHERE assignee_id=? AND status NOT IN ('done','backlog')", (uid,)).fetchone()[0]
    overdue = db.execute("SELECT COUNT(*) FROM tasks WHERE assignee_id=? AND status NOT IN ('done') AND deadline < date('now')", (uid,)).fetchone()[0]
    week_end = (datetime.now() + timedelta(days=7)).strftime('%Y-%m-%d')
    due_this_week = db.execute("SELECT COUNT(*) FROM tasks WHERE assignee_id=? AND status NOT IN ('done') AND deadline<=? AND deadline>=date('now')", (uid, week_end)).fetchone()[0]

    deadlines = db.execute("""
        SELECT t.id, t.identifier, t.title, t.deadline, t.priority, t.status, p.name as project_name
        FROM tasks t LEFT JOIN projects p ON t.project_id=p.id
        WHERE t.assignee_id=? AND t.status NOT IN ('done') AND t.deadline IS NOT NULL
        ORDER BY t.deadline ASC LIMIT 5
    """, (uid,)).fetchall()

    recent = db.execute("""
        SELECT t.id, t.identifier, t.title, t.status, t.priority, t.created_at as changed_at,
               p.name as project_name, u.first_name || ' ' || u.last_name as editor_name
        FROM tasks t
        LEFT JOIN projects p ON t.project_id=p.id
        LEFT JOIN users u ON t.creator_id=u.id
        WHERE t.project_id IN (SELECT project_id FROM project_members WHERE user_id=?)
        ORDER BY t.created_at DESC LIMIT 5
    """, (uid,)).fetchall()

    my_projects = db.execute("""
        SELECT p.id, p.name, p.status, p.end_date,
               (SELECT COUNT(*) FROM tasks WHERE project_id=p.id AND status NOT IN ('done')) as open_tasks
        FROM projects p
        JOIN project_members pm ON p.id=pm.project_id
        WHERE pm.user_id=?
        ORDER BY p.name
    """, (uid,)).fetchall()

    result = {
        'active_tasks': active,
        'overdue_tasks': overdue,
        'due_this_week': due_this_week,
        'deadlines': [dict(d) for d in deadlines],
        'recent_updates': [dict(r) for r in recent],
        'my_projects': [dict(p) for p in my_projects],
    }

    if user['role'] in ('admin', 'project_manager'):
        if user['role'] == 'admin':
            team_stats = db.execute("""
                SELECT u.id, u.first_name, u.last_name,
                    (SELECT COUNT(*) FROM tasks WHERE assignee_id=u.id AND status NOT IN ('done','backlog')) as active,
                    (SELECT COUNT(*) FROM tasks WHERE assignee_id=u.id AND status NOT IN ('done') AND deadline < date('now')) as overdue
                FROM users u WHERE u.id != ? ORDER BY u.first_name
            """, (uid,)).fetchall()
        else:
            team_stats = db.execute("""
                SELECT u.id, u.first_name, u.last_name,
                    (SELECT COUNT(*) FROM tasks WHERE assignee_id=u.id AND status NOT IN ('done','backlog')) as active,
                    (SELECT COUNT(*) FROM tasks WHERE assignee_id=u.id AND status NOT IN ('done') AND deadline < date('now')) as overdue
                FROM users u
                JOIN project_members pm ON u.id=pm.user_id
                WHERE pm.project_id IN (SELECT project_id FROM project_members WHERE user_id=?)
                AND u.id != ?
                GROUP BY u.id ORDER BY u.first_name
            """, (uid, uid)).fetchall()
        result['team_stats'] = [dict(t) for t in team_stats]

    for d in result['deadlines']:
        for k in d:
            if d[k] is None:
                d[k] = ''
    for r in result['recent_updates']:
        for k in r:
            if r[k] is None:
                r[k] = ''
    for p in result['my_projects']:
        for k in p:
            if p[k] is None:
                p[k] = ''
    if 'team_stats' in result:
        for t in result['team_stats']:
            for k in t:
                if t[k] is None:
                    t[k] = ''
    return jsonify(result)

# --- File upload ---

@app.route('/api/upload', methods=['POST'])
@login_required
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400
    f = request.files['file']
    task_id = request.form.get('task_id')
    if not task_id:
        return jsonify({'error': 'task_id required'}), 400
    valid, err = _validate_file_upload(f)
    if not valid:
        return jsonify({'error': err}), 400
    filename = f.filename
    safe_name = f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{filename}"
    f.save(os.path.join(UPLOAD_DIR, safe_name))
    db = get_db_conn()
    db.execute("INSERT INTO task_attachments (task_id, filename, url) VALUES (?,?,?)",
               (task_id, filename, f"/uploads/{safe_name}"))
    db.commit()
    return jsonify({'filename': filename, 'url': f"/uploads/{safe_name}"}), 201

@app.route('/api/upload/avatar', methods=['POST'])
@login_required
def upload_avatar():
    if 'file' not in request.files:
        return jsonify({'error': 'No file'}), 400
    f = request.files['file']
    valid, err = _validate_file_upload(f)
    if not valid:
        return jsonify({'error': err}), 400
    ext = os.path.splitext(f.filename)[1] or '.png'
    if ext.lower() not in ('.jpg', '.jpeg', '.png', '.gif'):
        return jsonify({'error': 'Только изображения: jpg, png, gif'}), 400
    safe_name = f"avatar_{session['user_id']}_{datetime.now().strftime('%Y%m%d%H%M%S')}{ext}"
    f.save(os.path.join(UPLOAD_DIR, safe_name))
    url = f"/uploads/{safe_name}"
    db = get_db_conn()
    db.execute("UPDATE users SET photo=? WHERE id=?", (url, session['user_id']))
    db.commit()
    return jsonify({'url': url}), 201

# --- Static ---

@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory(app.static_folder, path)


@app.after_request
def set_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response


init_db()

if __name__ == '__main__':
    print("NordFlow Tasks server running at http://localhost:5000")
    app.run(debug=False, host='0.0.0.0', port=5000)
