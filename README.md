## Инструкции по локальному запуску
### Контейнеры (PostgreSQL + Redis)
1. Открыть терминал в директории backend
2. Выполнить `docker compose up -d`

Остановка: `docker compose stop`
Удаление: `docker compose down`
Удаление с хранилищем: `docker compose down -v`

### Сервер
1. Открыть терминал в директории backend
2. Выполнить `uvicorn src.main:app --reload`

### Клиент
1. Открыть терминал в директории frontend
2. Выполнить `npx vite`