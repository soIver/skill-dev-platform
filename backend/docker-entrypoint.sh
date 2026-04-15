#!/bin/sh
set -e

echo "Starting backend..."
exec uvicorn src.main:app --host 0.0.0.0 --port 8000
