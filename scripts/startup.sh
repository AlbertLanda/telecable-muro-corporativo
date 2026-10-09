#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export DJANGO_DEBUG=0
export DJANGO_USE_SQLITE=0
python scripts/release.py
exec gunicorn muro.wsgi:application --bind 0.0.0.0:8000 --workers 2 --threads 4 --timeout 120 --error-logfile - --capture-output
