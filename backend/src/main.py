from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
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
    default_limits=[f"{global_config.RATE_LIMIT_RPM}/minute"],
)


async def rate_limit_exceeded_handler(request: Request, exc: Exception):
    if isinstance(exc, RateLimitExceeded):
        return JSONResponse(
            status_code=429,
            content={"error": f"Rate limit exceeded: {exc.detail}"},
        )

    return JSONResponse(
        status_code=503,
        content={"error": "Rate limiter storage is unavailable"},
    )


app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)


@app.get("/api")
async def root():
    return {"message": "API is running"}
