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

## Секреты окружения
Перед запуском необходимо самостоятельно задать значения для секретов окружения (расположены вместе с остальными переменными в .env.dev или .env.test в зависимости от режима). Ниже приведено описание всех секретов, значения которых следует изменить при запуске системы:
- `JWT_SECRET_KEY` - ключ для подписи JWT-токенов, случайная строка не менее 32 символов.
- `GITHUB_TOKEN_ENCRYPTION_SECRET` - ключ шифрования токенов доступа GitHub, случайная строка ровно 32 символа.
- `GITHUB_CLIENT_ID` - публичный идентификатор приложения GitHub App. Способ получения:
  1. Авторизоваться на https://github.com под своими учётными данными
  2. Перейти к регистрации нового OAuth-приложения: https://github.com/settings/applications/new
  3. В качестве Homepage URL указать URL клиента (например, `http://localhost:5173`)
  4. В качестве Authorization callback URL указать {URL-сервера}/github/callback (например, `http://localhost:8000/github/callback`) 
- `GITHUB_CLIENT_SECRET` - ключ для обмена временного кода авторизации на токен доступа GitHub. Способ получения:
  1. На странице созданного OAuth-приложения нажать "Generate a new client secret"
  2. Скопировать значение ключа сразу после генерации (GitHub покажет его только один раз)
