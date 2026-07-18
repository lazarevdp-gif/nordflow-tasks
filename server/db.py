import sqlite3
import hashlib
import os
import secrets
from datetime import datetime, timedelta
import random

DB_PATH = os.path.join(os.path.dirname(__file__), 'db', 'nordflow.db')

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def hash_password(password):
    salt = secrets.token_hex(16)
    h = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000)
    return f"{salt}:{h.hex()}"

def verify_password(password, stored_hash):
    if ':' not in stored_hash:
        return hashlib.sha256(password.encode()).hexdigest() == stored_hash
    salt, h = stored_hash.split(':', 1)
    return hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 100000).hex() == h

def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)
    conn = get_db()
    c = conn.cursor()

    c.executescript('''
    CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        position TEXT,
        photo TEXT,
        role TEXT DEFAULT 'employee',
        theme TEXT DEFAULT 'light',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        manager_id INTEGER REFERENCES users(id),
        start_date DATE,
        end_date DATE,
        status TEXT DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE project_members (
        project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        PRIMARY KEY (project_id, user_id)
    );
    CREATE TABLE tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        identifier TEXT,
        title TEXT NOT NULL,
        description TEXT,
        project_id INTEGER REFERENCES projects(id),
        status TEXT DEFAULT 'backlog',
        priority TEXT DEFAULT 'medium',
        assignee_id INTEGER REFERENCES users(id),
        creator_id INTEGER REFERENCES users(id),
        deadline DATE,
        start_date DATE,
        tags TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE task_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        filename TEXT,
        url TEXT,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE task_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id),
        field TEXT,
        old_value TEXT,
        new_value TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        type TEXT,
        message TEXT,
        task_id INTEGER REFERENCES tasks(id),
        is_read INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    ''')
    conn.commit()
    _seed_demo_data(conn)
    conn.close()

def _seed_demo_data(conn):
    c = conn.cursor()
    pw = hash_password('password123')

    users = [
        ('dmitriy.lazarev@nordflow.ru', pw, 'Дмитрий', 'Лазарев', 'Операционный директор', 'admin'),
        ('maxim.orlov@nordflow.ru', pw, 'Максим', 'Орлов', 'Руководитель проекта', 'project_manager'),
        ('elena.sokolova@nordflow.ru', pw, 'Елена', 'Соколова', 'Дизайнер', 'employee'),
        ('ilya.morozov@nordflow.ru', pw, 'Илья', 'Морозов', 'Frontend-разработчик', 'employee'),
        ('viktor.lebedev@nordflow.ru', pw, 'Виктор', 'Лебедев', 'Backend-разработчик', 'employee'),
        ('olga.krylova@nordflow.ru', pw, 'Ольга', 'Крылова', 'Маркетолог', 'employee'),
        ('dmitriy.frolov@nordflow.ru', pw, 'Дмитрий', 'Фролов', 'Тестировщик', 'employee'),
        ('maria.belova@nordflow.ru', pw, 'Мария', 'Белова', 'Аналитик', 'employee'),
    ]
    c.executemany("INSERT INTO users (email, password_hash, first_name, last_name, position, role) VALUES (?,?,?,?,?,?)", users)

    projects = [
        ('Разработка сайта для GreenStone', 'Полная разработка корпоративного сайта с CMS и личным кабинетом клиента', 2, '2026-01-15', '2026-06-30', 'active'),
        ('Запуск рекламной кампании NordFlow', 'Комплексная маркетинговая кампания для продвижения услуг компании', 2, '2026-03-01', '2026-08-15', 'active'),
        ('Внутренняя автоматизация отдела продаж', 'Автоматизация CRM-процессов, интеграция с почтой и телефонией', 1, '2026-05-01', '2026-12-31', 'planning'),
    ]
    c.executemany("INSERT INTO projects (name, description, manager_id, start_date, end_date, status) VALUES (?,?,?,?,?,?)", projects)

    members = [
        (1,1),(1,2),(1,3),(1,4),(1,5),(1,7),(1,8),
        (2,2),(2,3),(2,6),(2,7),
        (3,1),(3,2),(3,5),(3,8),
    ]
    c.executemany("INSERT INTO project_members (project_id, user_id) VALUES (?,?)", members)

    today = datetime.now().date()
    tasks_data = [
        # Project 1 - GreenStone
        ('NDF-101', 'Дизайн главной страницы', 'Разработать макет главной страницы в Figma', 1, 'done', 'high', 3, 2, (today - timedelta(days=20)).isoformat(), 'дизайн,UI'),
        ('NDF-102', 'Верстка главной страницы', 'Верстка по утверждённому макету', 1, 'done', 'high', 4, 2, (today - timedelta(days=10)).isoformat(), 'верстка,frontend'),
        ('NDF-103', 'Каталог продукции', 'Создать страницу каталога с фильтрами', 1, 'in_progress', 'high', 4, 2, (today + timedelta(days=5)).isoformat(), 'frontend'),
        ('NDF-104', 'Личный кабинет клиента', 'Разработка системы авторизации и личного кабинета', 1, 'in_progress', 'critical', 5, 2, (today + timedelta(days=10)).isoformat(), 'backend'),
        ('NDF-105', 'Интеграция с CMS', 'Подключение админки к CMS', 1, 'planned', 'medium', 5, 2, (today + timedelta(days=20)).isoformat(), 'backend'),
        ('NDF-106', 'Тестирование формы обратной связи', 'Проверка работы формы на всех устройствах', 1, 'review', 'medium', 7, 2, (today + timedelta(days=2)).isoformat(), 'тестирование'),
        ('NDF-107', 'Оптимизация изображений', 'Сжатие и конвертация всех изображений сайта', 1, 'backlog', 'low', 3, 2, (today + timedelta(days=15)).isoformat(), 'дизайн'),
        ('NDF-108', 'SEO-оптимизация', 'Настройка мета-тегов и структуры URL', 1, 'planned', 'medium', 8, 2, (today + timedelta(days=25)).isoformat(), 'SEO'),
        ('NDF-109', 'Деплой на продакшн', 'Настройка сервера и развертывание сайта', 1, 'backlog', 'high', 5, 2, (today + timedelta(days=30)).isoformat(), 'DevOps'),
        ('NDF-110', 'Кросс-браузерное тестирование', 'Проверка в Chrome, Firefox, Safari, Edge', 1, 'backlog', 'medium', 7, 2, (today + timedelta(days=28)).isoformat(), 'тестирование'),
        # Project 2 - Рекламная кампания
        ('NDF-201', 'Маркетинговый анализ', 'Анализ целевой аудитории и конкурентов', 2, 'done', 'high', 8, 2, (today - timedelta(days=30)).isoformat(), 'аналитика'),
        ('NDF-202', 'Стратегия продвижения', 'Разработка стратегии на 3 месяца', 2, 'done', 'critical', 8, 2, (today - timedelta(days=25)).isoformat(), 'стратегия'),
        ('NDF-203', 'Создание рекламных креативов', 'Дизайн баннеров и рекламных материалов', 2, 'in_progress', 'high', 3, 2, (today + timedelta(days=7)).isoformat(), 'дизайн'),
        ('NDF-204', 'Настройка Яндекс.Директ', 'Создание и настройка рекламных кампаний', 2, 'planned', 'high', 6, 2, (today + timedelta(days=12)).isoformat(), 'реклама'),
        ('NDF-205', 'Настройка таргетированной рекламы', 'Запуск рекламы в социальных сетях', 2, 'planned', 'medium', 6, 2, (today + timedelta(days=14)).isoformat(), 'реклама'),
        ('NDF-206', 'Контент для блога', 'Написание 5 статей для корпоративного блога', 2, 'in_progress', 'medium', 6, 2, (today + timedelta(days=10)).isoformat(), 'контент'),
        ('NDF-207', 'Email-рассылка', 'Создание шаблона и рассылки для клиентов', 2, 'backlog', 'low', 6, 2, (today + timedelta(days=20)).isoformat(), 'маркетинг'),
        ('NDF-208', 'A/B тестирование', 'Тестирование двух вариантов лендинга', 2, 'backlog', 'low', 7, 2, (today + timedelta(days=25)).isoformat(), 'тестирование'),
        # Project 3 - Автоматизация
        ('NDF-301', 'Анализ текущих процессов', 'Документирование текущих бизнес-процессов отдела продаж', 3, 'done', 'high', 8, 1, (today - timedelta(days=15)).isoformat(), 'аналитика'),
        ('NDF-302', 'Выбор CRM-системы', 'Сравнительный анализ доступных CRM', 3, 'in_progress', 'critical', 8, 1, (today + timedelta(days=5)).isoformat(), 'аналитика'),
        ('NDF-303', 'Настройка интеграции с почтой', 'Подключение корпоративной почты к CRM', 3, 'planned', 'high', 5, 1, (today + timedelta(days=30)).isoformat(), 'интеграция'),
        ('NDF-304', 'Миграция данных', 'Перенос клиентской базы из Excel в CRM', 3, 'backlog', 'high', 5, 1, (today + timedelta(days=45)).isoformat(), 'данные'),
        ('NDF-305', 'Обучение сотрудников', 'Проведение тренинга по работе с CRM', 3, 'backlog', 'medium', 2, 1, (today + timedelta(days=60)).isoformat(), 'обучение'),
        ('NDF-306', 'Настройка отчётности', 'Автоматические отчёты по воронке продаж', 3, 'backlog', 'medium', 5, 1, (today + timedelta(days=50)).isoformat(), 'аналитика'),
        ('NDF-307', 'Настройка уведомлений', 'Автоматические напоминания о задачах в CRM', 3, 'backlog', 'low', 5, 1, (today + timedelta(days=55)).isoformat(), 'автоматизация'),
        ('NDF-308', 'Тестирование интеграций', 'Проверка всех интеграций CRM в пилотной группе', 3, 'backlog', 'medium', 7, 1, (today + timedelta(days=65)).isoformat(), 'тестирование'),
    ]

    for t in tasks_data:
        c.execute("INSERT INTO tasks (identifier, title, description, project_id, status, priority, assignee_id, creator_id, deadline, tags) VALUES (?,?,?,?,?,?,?,?,?,?)", t)

    # Comments
    comments = [
        (1, 2, 'Макет готов, жду вашего ревью', (today - timedelta(days=22)).isoformat() + ' 10:00:00'),
        (1, 3, 'Всё выглядит отлично, утверждаю!', (today - timedelta(days=21)).isoformat() + ' 14:30:00'),
        (4, 2, 'Какой стек планируем для бэкенда? Я предлагаю Python + FastAPI', (today - timedelta(days=5)).isoformat() + ' 09:00:00'),
        (4, 5, 'Согласен, FastAPI подходит. Начинаю работу', (today - timedelta(days=4)).isoformat() + ' 11:20:00'),
        (6, 7, 'Форма работает, но на iPhone 12 кнопка отправки перекрыта футером', (today - timedelta(days=1)).isoformat() + ' 16:45:00'),
        (13, 6, 'Креативы готовы, загрузил в общий доступ', (today - timedelta(days=1)).isoformat() + ' 10:00:00'),
        (22, 8, 'CRM выбираем между Bitrix24 иamoCRM. Нужно решение до конца недели', (today).isoformat() + ' 08:30:00'),
    ]
    for task_id, user_id, text, created in comments:
        c.execute("INSERT INTO comments (task_id, user_id, text, created_at) VALUES (?,?,?,?)", (task_id, user_id, text, created))

    # Task history
    history = [
        (1, 2, 'status', 'in_progress', 'review', (today - timedelta(days=21)).isoformat() + ' 15:00:00'),
        (1, 3, 'status', 'review', 'done', (today - timedelta(days=20)).isoformat() + ' 09:00:00'),
        (3, 4, 'status', 'planned', 'in_progress', (today - timedelta(days=3)).isoformat() + ' 10:00:00'),
        (4, 2, 'status', 'planned', 'in_progress', (today - timedelta(days=5)).isoformat() + ' 14:00:00'),
    ]
    for task_id, user_id, field, old, new, created in history:
        c.execute("INSERT INTO task_history (task_id, user_id, field, old_value, new_value, created_at) VALUES (?,?,?,?,?,?)", (task_id, user_id, field, old, new, created))

    # Notifications
    notifs = [
        (4, 'task_assigned', 'Вам назначена задача NDF-104: Личный кабинет клиента', 4, 1, (today - timedelta(days=5)).isoformat() + ' 14:00:00'),
        (3, 'task_assigned', 'Вам назначена задача NDF-203: Создание рекламных креативов', 13, 0, (today - timedelta(days=3)).isoformat() + ' 10:00:00'),
        (7, 'new_comment', 'Новый комментарий к задаче NDF-106', 6, 0, (today - timedelta(days=1)).isoformat() + ' 16:45:00'),
        (8, 'new_comment', 'Новый комментарий к задаче NDF-302', 22, 0, (today).isoformat() + ' 08:30:00'),
        (5, 'deadline_approaching', 'Дедлайн задачи NDF-104 приближается', 4, 0, (today).isoformat() + ' 09:00:00'),
    ]
    for user_id, ntype, message, task_id, is_read, created in notifs:
        c.execute("INSERT INTO notifications (user_id, type, message, task_id, is_read, created_at) VALUES (?,?,?,?,?,?)", (user_id, ntype, message, task_id, is_read, created))

    conn.commit()


def task_to_dict(row):
    if row is None:
        return None
    d = dict(row)
    d['created_at'] = str(d.get('created_at', ''))
    d['deadline'] = str(d.get('deadline', ''))
    return d


def user_to_dict(row, exclude_password=True):
    if row is None:
        return None
    d = dict(row)
    if exclude_password:
        d.pop('password_hash', None)
    d['created_at'] = str(d.get('created_at', ''))
    return d


def project_to_dict(row):
    if row is None:
        return None
    d = dict(row)
    d['created_at'] = str(d.get('created_at', ''))
    d['start_date'] = str(d.get('start_date', ''))
    d['end_date'] = str(d.get('end_date', ''))
    return d
