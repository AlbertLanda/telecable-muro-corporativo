"""Interactive first-time setup; run manually in Azure Cloud Shell.

Creates only the wall database/login in an existing PostgreSQL server and stores
its credentials in the wall App Service. Never changes a plan or firewall.
"""
import argparse
import getpass
import json
import os
import re
import secrets
import subprocess
import tempfile
from pathlib import Path

import psycopg
from psycopg import sql


def provision(connection_options, database, username, password):
    for name in (database, username):
        if not re.fullmatch(r'telecable_muro[a-z0-9_]{0,40}', name):
            raise ValueError('El nombre debe identificar exclusivamente al muro.')
    with psycopg.connect(**connection_options, dbname='postgres', autocommit=True) as admin:
        if admin.execute('SELECT 1 FROM pg_database WHERE datname=%s', (database,)).fetchone():
            raise RuntimeError('La base ya existe; revisar antes de continuar.')
        if admin.execute('SELECT 1 FROM pg_roles WHERE rolname=%s', (username,)).fetchone():
            raise RuntimeError('El usuario ya existe; no se cambiará su contraseña.')
        admin.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(database)))
    with psycopg.connect(**connection_options, dbname=database) as admin:
        admin.execute(sql.SQL(
            'CREATE ROLE {} LOGIN PASSWORD {} NOSUPERUSER NOCREATEDB NOCREATEROLE '
            'NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 16'
        ).format(sql.Identifier(username), sql.Literal(password)))
        admin.execute(sql.SQL('REVOKE ALL ON DATABASE {} FROM PUBLIC').format(sql.Identifier(database)))
        admin.execute(sql.SQL('GRANT CONNECT, TEMPORARY ON DATABASE {} TO {}').format(
            sql.Identifier(database), sql.Identifier(username)))
        admin.execute('REVOKE CREATE ON SCHEMA public FROM PUBLIC')
        admin.execute(sql.SQL('GRANT USAGE, CREATE ON SCHEMA public TO {}').format(sql.Identifier(username)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('subscription', 'group', 'app', 'host', 'admin'):
        parser.add_argument('--' + name, required=True)
    args = parser.parse_args()
    if not os.isatty(0):
        raise SystemExit('Ejecuta este asistente en una terminal interactiva.')
    scope = ['--subscription', args.subscription, '-g', args.group, '-n', args.app]

    def azure(command, *extra):
        result = subprocess.run(['az', *command, *scope, *extra, '--only-show-errors', '-o', 'json'], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError('Azure no completó la operación; revisa el recurso en el portal.')
        return json.loads(result.stdout) if result.stdout.strip() else None

    app = azure(['webapp', 'show'])
    if (app.get('tags') or {}).get('project') != 'telecable-muro-corporativo':
        raise SystemExit('El destino no está identificado como la aplicación del muro.')
    existing = {x['name']: x['value'] for x in azure(['webapp', 'config', 'appsettings', 'list'])}
    if any(existing.get(x) for x in ('POSTGRES_PASSWORD', 'POSTGRES_DB', 'POSTGRES_USER')):
        raise SystemExit('La aplicación ya tiene configuración PostgreSQL. No se sobrescribirá.')
    database, username = 'telecable_muro', 'telecable_muro_app'
    print(f'Aplicación: {args.app}\nServidor: {args.host}\nBase nueva: {database}\nUsuario nuevo: {username}')
    print('El usuario podrá crear y modificar las tablas del muro; no tendrá permisos de administrador del servidor.')
    print('La contraseña administrativa se usa solo para este paso. La nueva clave queda en las variables privadas de Azure.')
    if input('Para autorizar esta creación, escribe CREAR MURO: ').strip() != 'CREAR MURO':
        raise SystemExit('Cancelado sin cambios.')
    admin_password = getpass.getpass(f'Contraseña ACTUAL de PostgreSQL ({args.admin}): ')
    password = getpass.getpass('NUEVA contraseña exclusiva para telecable_muro_app (mínimo 20 caracteres): ')
    if len(password) < 20 or password == admin_password:
        raise SystemExit('Usa una clave nueva de al menos 20 caracteres, distinta de la administrativa.')
    if password != getpass.getpass('Repite la NUEVA contraseña: '):
        raise SystemExit('Las claves no coinciden; no se hicieron cambios.')
    options = dict(host=args.host, port=5432, user=args.admin, password=admin_password, sslmode='require', connect_timeout=10)
    try:
        provision(options, database, username, password)
    except psycopg.Error as error:
        raise SystemExit(f'PostgreSQL rechazó la preparación ({type(error).__name__}). No se imprimen datos privados. Si la base quedó creada, revisarla antes de reintentar.') from None
    finally:
        options.clear()
        admin_password = None
    settings = {
        'POSTGRES_HOST': args.host, 'POSTGRES_PORT': '5432', 'POSTGRES_DB': database,
        'POSTGRES_USER': username, 'POSTGRES_PASSWORD': password, 'POSTGRES_SSLMODE': 'require',
        'DJANGO_SECRET_KEY': existing.get('DJANGO_SECRET_KEY') or secrets.token_urlsafe(64),
    }
    with tempfile.TemporaryDirectory() as folder:
        path = Path(folder) / 'settings.json'
        with path.open('x', encoding='utf-8') as stream:
            path.chmod(0o600)
            json.dump(settings, stream)
        try:
            azure(['webapp', 'config', 'appsettings', 'set'], '--settings', '@' + str(path))
        except RuntimeError:
            raise SystemExit('La base y el usuario fueron creados, pero Azure no guardó las variables. Conserva la clave nueva e informa este estado; no repitas la creación.') from None
    print('Base y usuario del muro preparados. Variables privadas guardadas en Azure. Ya se puede desplegar el código.')


if __name__ == '__main__':
    try:
        main()
    except (EOFError, KeyboardInterrupt):
        raise SystemExit('Interrumpido; revisa el estado antes de repetir.') from None
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
