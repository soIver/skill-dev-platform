## Инструкции по локальному запуску
### Требования
#### Общие
- Docker 20.10+
- Docker Compose 2.20+
#### Для запуска в режиме разработки
- Python 3.11+
- Node.js 18+
- npm 9+

## Запуск в режиме тестирования

### PostgreSQL, Redis, Celery, Сервер, Клиент (`cd ./`)

#### Перед первым запуском
Выполнить `copy backend\.env.test backend\.env` (Windows) или `cp backend/.env.test backend/.env` (Linux/macOS) для создания файла с переменными окружения сервера

#### Запуск
Выполнить `docker compose -f docker-compose.test.yml up -d` (`--build` для пересборки после обновления проекта)

Остановка: `docker compose -f docker-compose.test.yml stop`  
Удаление: `docker compose -f docker-compose.test.yml down` (`-v` для удаления хранилищ)

#### URL после запуска
- Клиент: `http://localhost`
- Сервер: `http://localhost/api`

## Запуск в режиме разработки

### PostgreSQL, Redis, Celery (`cd ./`)

#### Перед первым запуском
Выполнить `copy backend\.env.dev backend\.env` (Windows) или `cp backend/.env.dev backend/.env` (Linux/macOS) для создания файла с переменными окружения сервера

#### Запуск
Выполнить `docker compose -f docker-compose.dev.yml up -d` (`--build` для пересборки после обновления проекта)

Остановка: `docker compose -f docker-compose.dev.yml stop`  
Удаление: `docker compose -f docker-compose.dev.yml down` (`-v` для удаления хранилищ)

### Сервер (`cd ./backend/`)

#### Перед первым запуском
1. Выполнить `python -m venv .venv` для создания виртуального окружения
2. Выполнить `.venv\Scripts\activate` (Windows) или `source .venv/bin/activate` (Linux) для активации виртуального окружения
3. Выполнить `pip install -r requirements.txt` для установки зависимостей в окружение
4. Выполнить `python -m src.init_db` для создания в БД необходимых записей для начала работы

#### Запуск
Выполнить `uvicorn src.main:app --reload`

### Клиент (`cd ./frontend/`)

#### Перед первым запуском
Выполнить `npm install` для установки зависимостей

#### Запуск
Выполнить `npx vite`

#### URL после запуска
- Клиент: `http://localhost:5173`
- Сервер: `http://localhost:8000`
