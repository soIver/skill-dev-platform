from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from .auth.router import router as auth_router
from .config import global_config
from .utils.database import init_database
from .github.router import router as github_router
from .skills.router import router as skills_router
from .recommendations.router import router as recommendations_router
from .analysis.router import router as analysis_router
from .notifications.router import router as notifications_router


app = FastAPI()


@app.on_event("startup")
async def on_startup():
    await init_database()


app.include_router(auth_router, prefix="/api")
app.include_router(github_router, prefix="/api")
app.include_router(skills_router, prefix="/api")
app.include_router(recommendations_router, prefix="/api")
app.include_router(analysis_router, prefix="/api")
app.include_router(notifications_router, prefix="/api")

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=global_config.ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.limiter = Limiter(
    key_func=get_remote_address,  # рейт-лимит по айпи
    storage_uri=global_config.REDIS_URL,
    default_limits=[f"{global_config.RATE_LIMIT_RPM}/minute"],
)


@app.exception_handler(RateLimitExceeded)
async def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Вы сделали слишком много запросов за последнюю минуту. Повторите попытку позже"},
    )


app.add_middleware(SlowAPIMiddleware)
app.state.limiter._route_exceeded_handler = rate_limit_exceeded_handler


@app.get("/api")
async def root():
    return {"message": "API is running"}
