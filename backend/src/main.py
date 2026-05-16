import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from .auth.router import router as auth_router
from .config import global_config
from .utils.database import init_database, db_engine
from .github.router import router as github_router
from .skills.router import router as skills_router
from .tasks.router import router as tasks_router
from .analysis.router import router as analysis_router
from .notifications.router import router as notifications_router
from .notifications.router import shutdown_event as notifications_shutdown_event
from .tests.router import router as tests_router
from .utils.redis import RedisClient


@asynccontextmanager
async def lifespan(app: FastAPI):
    # запуск
    await init_database()
    yield
    # завершение работы
    notifications_shutdown_event.set() # отправка сигнала SSE-генераторам
    await asyncio.sleep(1) # запас времени для закрытия SSE-соединений
    await RedisClient.close() # закрытие Redis
    await db_engine.dispose() # закрытие пула БД


app = FastAPI(lifespan=lifespan)


app.include_router(auth_router, prefix="/api")
app.include_router(github_router, prefix="/api")
app.include_router(skills_router, prefix="/api")
app.include_router(tasks_router, prefix="/api")
app.include_router(analysis_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")
app.include_router(tests_router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=global_config.ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

limiter = Limiter(
    key_func=get_remote_address,
    storage_uri=global_config.REDIS_URL,
    default_limits=[f"{global_config.RATE_LIMIT_RPM}/minute"],
)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Вы сделали слишком много запросов за последнюю минуту, повторите попытку позже"},
    )


limiter._route_exceeded_handler = rate_limit_exceeded_handler
app.add_middleware(SlowAPIMiddleware)


@app.get("/api")
async def root():
    return {"message": "API is running"}
