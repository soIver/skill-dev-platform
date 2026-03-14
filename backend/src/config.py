import os
from dotenv import load_dotenv
from datetime import timezone, timedelta


load_dotenv()

class Config:
    # данные
    DATA_PATH = os.getenv("DATA_PATH", "../data")
    REDIS_URL = os.getenv("REDIS_URL")
    DATABASE_URL = os.getenv("DATABASE_URL")

    # JWT
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY')
    JWT_ALGORITHM = os.getenv('JWT_ALGORITHM', 'HS256')
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv(
        'JWT_ACCESS_TOKEN_EXPIRE_MINUTES', '180'
        )
    )
    JWT_REFRESH_TOKEN_EXPIRE_MINUTES = int(os.getenv(
        'JWT_REFRESH_TOKEN_EXPIRE_MINUTES', '10080'
        )
    )

    # CORS
    ALLOWED_ORIGINS = os.environ.get(
        'ALLOWED_ORIGINS', 'http://localhost:5173, http://127.0.0.1:5173'
    ).split(',')

    UTC3 = timezone(timedelta(hours=3))
    
    @classmethod
    def validate(cls):
        if not all(cls.DATABASE_URL, cls.REDIS_URL, cls.JWT_SECRET_KEY):
            print("Переменные среды требуют проверки")
            return False
        return True