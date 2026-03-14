import logging
import os
from datetime import datetime

from config import Config


MOSCOW_TZ = Config.UTC3
DATA_PATH = Config.DATA_PATH

class MoscowFormatter(logging.Formatter):
    def formatTime(self, record, datefmt=None):
        dt = datetime.fromtimestamp(record.created, tz=MOSCOW_TZ)
        return dt.strftime(datefmt or "%d-%m-%Y %H:%M:%S")

def get_logger(name: str = "app", level: str = "INFO"):
    logger = logging.getLogger(name)
    logger.setLevel(level)

    if logger.hasHandlers():
        logger.handlers.clear()

    formatter = MoscowFormatter(
        fmt="[%(asctime)s] [%(levelname)s] [%(name)s] %(message)s",
        datefmt="%d-%m-%Y %H:%M:%S"
    )

    # ====================== КОНСОЛЬ ======================
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)

    # ====================== ФАЙЛ ======================
    os.makedirs(DATA_PATH, exist_ok=True)
    file_handler = logging.FileHandler(f"{DATA_PATH}/app.log", encoding="utf-8")
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)

    return logger