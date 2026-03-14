from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import Config
from auth.router import router as auth_router

app = FastAPI()
app.include_router(auth_router, prefix="/api")
origins = Config.ALLOWED_ORIGINS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "API is running"}