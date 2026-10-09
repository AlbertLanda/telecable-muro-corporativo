"""Prepare each App Service instance; serialize schema changes in PostgreSQL."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'muro.settings')


def main():
    import django
    django.setup()
    from django.conf import settings
    from django.core.management import call_command
    from django.db import connection

    if settings.DEBUG or connection.vendor != 'postgresql':
        raise RuntimeError('El arranque de servidor requiere DEBUG=0 y PostgreSQL.')
    Path(settings.MEDIA_ROOT).mkdir(parents=True, exist_ok=True)
    call_command('check', deploy=True, fail_level='ERROR')
    # No credentials or account creation at startup. A session lock also covers
    # deployments starting more than one instance at the same time.
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_advisory_lock(734810521)')
        try:
            call_command('migrate', interactive=False)
            call_command('setup_wall')
        finally:
            cursor.execute('SELECT pg_advisory_unlock(734810521)')
    call_command('collectstatic', interactive=False)


if __name__ == '__main__':
    main()
