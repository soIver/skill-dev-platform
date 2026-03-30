from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from .auth.router import router as auth_router
from .config import global_config

app = FastAPI()
app.include_router(auth_router, prefix="/api")

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
    default_limits=["10/minute"],
)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


@app.get("/api")
async def root():
    return {"message": "API is running"}
