"""Exercise the first-time grants against the disposable CI PostgreSQL server."""
import os
import secrets
import subprocess
import sys
from pathlib import Path
import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from scripts.initialize_azure_database import provision

if os.environ.get('CI') != 'true' or os.environ.get('POSTGRES_DB') != 'muro_ci':
    raise SystemExit('Solo se ejecuta contra PostgreSQL desechable de CI.')
options = dict(host='localhost', port=5432, user='muro_ci', password=os.environ['POSTGRES_PASSWORD'], sslmode='prefer')
password = secrets.token_urlsafe(32)
database, username = 'telecable_muro_bootstrap_ci', 'telecable_muro_role_ci'
provision(options, database, username, password)
runtime = dict(options, user=username, password=password, dbname=database)
with psycopg.connect(**runtime) as connection:
    flags = connection.execute('SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname=current_user').fetchone()
    assert flags == (False, False, False, False, False), flags
    connection.execute('CREATE TABLE permissions_probe (id integer primary key)')
    connection.execute('INSERT INTO permissions_probe VALUES (1)')
    assert connection.execute('SELECT id FROM permissions_probe').fetchone() == (1,)
    connection.execute('DROP TABLE permissions_probe')
try:
    provision(options, database, username, 'must-not-replace-password')
except RuntimeError:
    pass
else:
    raise AssertionError('A repeated setup must stop without replacing credentials')
environment = dict(os.environ, POSTGRES_DB=database, POSTGRES_USER=username, POSTGRES_PASSWORD=password,
                   DJANGO_DEBUG='0', DJANGO_SECRET_KEY='ci-only-bootstrap-check-secret-not-for-production-734810521',
                   DJANGO_ALLOWED_HOSTS='localhost', DJANGO_MEDIA_ROOT='/tmp/muro-bootstrap-ci')
subprocess.run([sys.executable, 'scripts/release.py'], env=environment, check=True)
print('Restricted database user: migrations, permissions and repeat protection OK.')
