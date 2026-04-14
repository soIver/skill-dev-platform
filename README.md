## Инструкции по локальному запуску
### Требования
- Python 3.12+
- Node.js 18+
- npm 9+
- Docker 20.10+
- Docker Compose 2.20+

### Полный запуск через Docker
1. Создать `.env` на основе `.env.example`
2. В корне проекта выполнить `docker compose up -d`
По умолчанию будет использован `docker-compose.override.yml` со всей инфраструктурой, включая контейнер PostgreSQL

URL после запуска:
- Клиент: `http://localhost`
- Сервер: `http://localhost/api`

Остановка: `docker compose stop`
Удаление: `docker compose down`


### Запуск в режиме разработки
#### PostgreSQL, Redis, Celery
Перед запуском в корневом `.env` указать: 
```
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5433/skill_dev
REDIS_URL=redis://localhost:6379/0
CELERY_BROKER_URL=redis://localhost:6379/0
CELERY_RESULT_BACKEND=redis://localhost:6379/0
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```
Запуск: в корне проекта выполнить `docker compose -f docker-compose.dev.yml up -d`
Остановка: `docker compose -f docker-compose.dev.yml stop`
Удаление: `docker compose -f docker-compose.dev.yml down`

#### Сервер
1. Открыть терминал в директории `backend`
2. Выполнить `python -m venv .venv` для создания виртуального окружения (единожды)
3. Выполнить `.venv\Scripts\activate` (Windows) или `source .venv/bin/activate` (Linux) для активации виртуального окружения
4. Выполнить `pip install -r requirements.txt` для установки зависимостей в окружение (единожды)
5. Выполнить `alembic upgrade head` для применения миграций
6. Выполнить `uvicorn src.main:app --reload` для поднятия сервера (порт 8000)

#### Клиент
1. Открыть терминал в директории `frontend`
2. Выполнить `npm install` для установки зависимостей (единжды)
3. Создать `frontend/.env`, если его ещё нет, и указать `VITE_API_BASE_URL=http://localhost:8000/api`
4. Выполнить `npx vite` для поднятия сервера (порт 5173)

URL после запуска:
- Клиент: `http://localhost:5173`
- Сервер: `http://localhost:8000`