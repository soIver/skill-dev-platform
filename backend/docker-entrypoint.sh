#!/bin/sh
set -e

echo "Applying database migrations..."
until alembic upgrade head; do
  echo "Database is unavailable, retrying in 3 seconds..."
  sleep 3
done

echo "Starting backend..."
exec uvicorn src.main:app --host 0.0.0.0 --port 8000
