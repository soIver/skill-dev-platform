import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session

from src.models import Base


@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)

    with Session(engine, expire_on_commit=False) as session:
        yield session

    Base.metadata.drop_all(engine)
    engine.dispose()
