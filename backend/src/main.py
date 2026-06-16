import asyncio
import signal
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, APIRouter
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from .auth.router import router as auth_router
from .classifier.router import router as classifier_router
from .config import global_config
from .management.router import router as management_router
from .utils.database import init_database, db_engine
from .repositories.router import router as github_router
from .skills.router import router as skills_router
from .tasks.router import router as tasks_router
from .notifications.router import router as notifications_router
from .notifications.router import close_active_streams, reset_shutdown_state, trigger_shutdown
from .progress.router import router as progress_router
from .recommendations.router import router as recommendations_router
from .tests.router import router as tests_router
from .utils.redis import RedisClient
from .vacancies.router import router as vacancies_router

previous_signal_handlers: dict[int, signal.Handlers] = {}


def install_shutdown_signal_handlers():
    for sig in (signal.SIGINT, signal.SIGTERM):
        previous_handler = signal.getsignal(sig)
        previous_signal_handlers[sig] = previous_handler

        def handler(signum, frame, prev_handler=previous_handler):
            trigger_shutdown()
            if callable(prev_handler):
                prev_handler(signum, frame)

        signal.signal(sig, handler)


def restore_shutdown_signal_handlers():
    for sig, handler in previous_signal_handlers.items():
        signal.signal(sig, handler)
    previous_signal_handlers.clear()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # запуск
    reset_shutdown_state()
    install_shutdown_signal_handlers()
    await init_database()
    yield
    # завершение работы
    trigger_shutdown() # отправка сигнала SSE-генераторам
    await close_active_streams() # принудительное закрытие активных SSE-потоков
    await asyncio.sleep(0.1) # короткий запас времени для завершения генераторов
    await RedisClient.close() # закрытие Redis
    await db_engine.dispose() # закрытие пула БД
    restore_shutdown_signal_handlers()


app = FastAPI(lifespan=lifespan)

root_router = APIRouter(prefix="/api")

root_router.include_router(auth_router)
root_router.include_router(classifier_router)
root_router.include_router(management_router)
root_router.include_router(github_router)
root_router.include_router(skills_router)
root_router.include_router(tasks_router)
root_router.include_router(notifications_router)
root_router.include_router(progress_router)
root_router.include_router(recommendations_router)
root_router.include_router(tests_router)
root_router.include_router(vacancies_router)

app.include_router(root_router)

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
