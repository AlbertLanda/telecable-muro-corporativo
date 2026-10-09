"""Create the first panel accounts interactively, using the wall's Azure settings."""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('subscription', 'group', 'app'):
        parser.add_argument('--' + name, required=True)
    parser.add_argument('--check', action='store_true', help='Validate without creating accounts.')
    args = parser.parse_args()
    if not args.check and not sys.stdin.isatty():
        raise RuntimeError('Ejecuta este asistente en una terminal interactiva.')
    scope = ['--subscription', args.subscription, '-g', args.group, '-n', args.app]

    def azure(command):
        result = subprocess.run(['az', *command, *scope, '--only-show-errors', '-o', 'json'], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError('Azure no pudo leer la configuración del muro. Revisa la sesión y el recurso.')
        return json.loads(result.stdout)

    app = azure(['webapp', 'show'])
    if (app.get('tags') or {}).get('project') != 'telecable-muro-corporativo':
        raise RuntimeError('El destino no está identificado como la aplicación del muro.')
    settings = {x['name']: x['value'] for x in azure(['webapp', 'config', 'appsettings', 'list'])}
    if settings.get('POSTGRES_DB') != 'telecable_muro' or settings.get('POSTGRES_USER') != 'telecable_muro_app':
        raise RuntimeError('La conexión no corresponde a la base y usuario exclusivos del muro.')
    if not all(settings.get(k) for k in ('POSTGRES_HOST', 'POSTGRES_PASSWORD', 'DJANGO_SECRET_KEY')):
        raise RuntimeError('Falta completar la configuración privada de Azure.')
    if settings.get('POSTGRES_SSLMODE') not in ('require', 'verify-ca', 'verify-full'):
        raise RuntimeError('La conexión PostgreSQL debe exigir TLS.')
    for key, value in settings.items():
        if key.startswith(('DJANGO_', 'POSTGRES_')) and value is not None:
            os.environ[key] = value
    os.environ.update(DJANGO_DEBUG='0', DJANGO_USE_SQLITE='0', DJANGO_SETTINGS_MODULE='muro.settings')
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

    import django
    django.setup()
    from django.contrib.auth import get_user_model
    from django.contrib.auth.models import Group
    from django.core.management import call_command
    from wall.models import Wall

    users = get_user_model()
    if not Wall.objects.filter(pk=1).exists() or not Group.objects.filter(name='Editores de Imagen').exists():
        raise RuntimeError('Primero debe terminar el despliegue y la preparación del muro.')
    admin_exists = users.objects.filter(is_superuser=True).exists()
    editor_exists = users.objects.filter(username='jefeimagen').exists()
    print(f'Aplicación: {args.app}\nBase: telecable_muro')
    print(f'Administrador existente: {admin_exists}; jefeimagen existente: {editor_exists}')
    if args.check:
        print('Preparación de accesos validada. No se crearon ni modificaron usuarios.')
        return
    print('Crearás tu administrador de TI y el editor jefeimagen. Las contraseñas se ingresan ocultas.')
    print('TI podrá administrar usuarios y pantallas. Imagen podrá editar y publicar contenidos.')
    print('Los usuarios existentes se conservan; sus claves y permisos no se reemplazan.')
    if input('Para continuar, escribe CREAR ACCESOS: ').strip() != 'CREAR ACCESOS':
        raise RuntimeError('Cancelado sin cambios.')
    if not admin_exists:
        call_command('createsuperuser', interactive=True)
    if not editor_exists:
        call_command('create_editor', 'jefeimagen')
    print('Accesos preparados. Ya puedes iniciar sesión en el panel del muro.')


if __name__ == '__main__':
    try:
        main()
    except (EOFError, KeyboardInterrupt):
        raise SystemExit('Interrumpido. Puedes repetir el asistente: no modifica usuarios existentes.') from None
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
