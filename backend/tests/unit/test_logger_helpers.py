import logging

from src.utils.logger import MoscowFormatter, get_logger


def test_moscow_formatter_formats_record_time():
    formatter = MoscowFormatter(datefmt="%Y-%m-%d %H:%M")
    record = logging.LogRecord("test", logging.INFO, __file__, 1, "message", (), None)
    record.created = 0

    assert formatter.formatTime(record, "%Y-%m-%d %H:%M") == "1970-01-01 03:00"


def test_get_logger_replaces_handlers_and_writes_to_configured_data_path(tmp_path, monkeypatch):
    monkeypatch.setattr("src.utils.logger.DATA_PATH", str(tmp_path))

    logger = get_logger("test.logger", level="INFO")
    logger.info("hello")

    assert len(logger.handlers) == 2
    assert (tmp_path / "app.log").exists()

    logger = get_logger("test.logger", level="DEBUG")

    assert len(logger.handlers) == 2
    assert logger.level == logging.DEBUG
