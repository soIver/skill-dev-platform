## Инструкции по локальному запуску
### Требования
- Python 3.12+
- Node.js 18+
- npm 9+
- Docker 20.10+
- Docker Compose 2.20+

### Полный запуск через Docker
1. В директории `backend` создать `.env` на основе `.env.test`
2. В корне проекта выполнить `docker compose -f docker-compose.test.yml up -d`

URL после запуска:
- Клиент: `http://localhost`
- Сервер: `http://localhost/api`

Остановка: `docker compose -f docker-compose.test.yml up -d stop`

Удаление: `docker compose -f docker-compose.test.yml down` (`-v` для удаления хранилищ)


### Запуск в режиме разработки
#### PostgreSQL, Redis, Celery
1. В директории `backend` создать `.env` на основе `.env.dev`
2. В корне проекта выполнить `docker compose -f docker-compose.dev.yml up -d`

#### Сервер
1. Открыть терминал в директории `backend`
2. Выполнить `python -m venv .venv` для создания виртуального окружения (единожды)
3. Выполнить `.venv\Scripts\activate` (Windows) или `source .venv/bin/activate` (Linux) для активации виртуального окружения
4. Выполнить `pip install -r requirements.txt` для установки зависимостей в окружение (единожды)
5. Выполнить `uvicorn src.main:app --reload` для поднятия сервера

#### Клиент
1. Открыть терминал в директории `frontend`
2. Выполнить `npm install` для установки зависимостей (единожды)
3. Выполнить `npx vite` для поднятия сервера

URL после запуска:
- Клиент: `http://localhost:5173`
- Сервер: `http://localhost:8000`

Остановка: `docker compose -f docker-compose.dev.yml up -d stop`

Удаление: `docker compose -f docker-compose.dev.yml down` (`-v` для удаления хранилищ)
