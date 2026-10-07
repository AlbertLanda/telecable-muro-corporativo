"""Deploy to an explicitly selected, existing Linux App Service using Azure CLI."""
import argparse
import json
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import urlopen
from package_release import build_zip


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--subscription', required=True)
    parser.add_argument('--group', required=True)
    parser.add_argument('--app', required=True)
    args = parser.parse_args()
    az = shutil.which('az')
    if not az:
        raise SystemExit('Instala Azure CLI e inicia sesión con az login.')
    scope = ['--subscription', args.subscription, '--resource-group', args.group, '--name', args.app]

    def invoke(command, *extra):
        result = subprocess.run([az, *command, *scope, *extra, '--only-show-errors', '--output', 'json'], capture_output=True, text=True)
        if result.returncode:
            # Configuration responses may contain secrets; do not echo them.
            raise SystemExit('Azure rechazó: az ' + ' '.join(command) + '. Revisa sesión, permisos y recurso en el portal.')
        return json.loads(result.stdout) if result.stdout.strip() else None

    app = invoke(['webapp', 'show'])
    if 'linux' not in app.get('kind', '').lower():
        raise SystemExit('El destino debe ser un App Service Linux dedicado al muro.')
    if (app.get('tags') or {}).get('project') != 'telecable-muro-corporativo':
        raise SystemExit('Añade la etiqueta project=telecable-muro-corporativo al App Service del muro para identificar el destino.')
    settings = {item['name']: item['value'] for item in invoke(['webapp', 'config', 'appsettings', 'list'])}
    missing = [key for key in ['DJANGO_SECRET_KEY', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST'] if not settings.get(key)]
    if missing:
        raise SystemExit('Configura en Azure estas variables antes de desplegar: ' + ', '.join(missing))
    host = app['defaultHostName']
    hosts = {item.strip() for item in settings.get('DJANGO_ALLOWED_HOSTS', '').split(',') if item.strip()} | {host}
    origins = {item.strip() for item in settings.get('DJANGO_CSRF_TRUSTED_ORIGINS', '').split(',') if item.strip()} | {'https://' + host}
    if any('*' in value for value in hosts | origins):
        raise SystemExit('Configura dominios exactos en los hosts y orígenes de confianza del muro.')
    sslmode = settings.get('POSTGRES_SSLMODE', 'require')
    if sslmode not in ['require', 'verify-ca', 'verify-full']:
        sslmode = 'require'
    public_settings = {
        'DJANGO_DEBUG': '0', 'DJANGO_USE_SQLITE': '0', 'DJANGO_TRUST_PROXY': '1',
        'DJANGO_ALLOWED_HOSTS': ','.join(sorted(hosts)), 'DJANGO_CSRF_TRUSTED_ORIGINS': ','.join(sorted(origins)),
        'DJANGO_MEDIA_ROOT': settings.get('DJANGO_MEDIA_ROOT') or '/home/telecable-muro/media', 'POSTGRES_SSLMODE': sslmode,
        'SCM_DO_BUILD_DURING_DEPLOYMENT': 'true', 'DISABLE_COLLECTSTATIC': 'true',
        'WEBSITES_ENABLE_APP_SERVICE_STORAGE': 'true',
    }
    print('Configurando el muro en ' + host, flush=True)
    invoke(['webapp', 'update'], '--https-only', 'true')
    with tempfile.TemporaryDirectory() as directory:
        # JSON files also avoid Windows az.cmd quoting problems with PYTHON|3.11.
        settings_file = Path(directory) / 'settings.json'
        config_file = Path(directory) / 'config.json'
        settings_file.write_text(json.dumps(public_settings), encoding='utf-8')
        config_file.write_text(json.dumps({
            'linuxFxVersion': 'PYTHON|3.11', 'appCommandLine': 'bash scripts/startup.sh',
            'healthCheckPath': '/health/ready/', 'alwaysOn': True, 'minTlsVersion': '1.2',
        }), encoding='utf-8')
        invoke(['webapp', 'config', 'appsettings', 'set'], '--settings', '@' + str(settings_file))
        invoke(['webapp', 'config', 'set'], '--generic-configurations', '@' + str(config_file))
        invoke(['webapp', 'log', 'config'], '--docker-container-logging', 'filesystem')
        archive = build_zip(directory + '/muro.zip')
        print('Subiendo código e instalando dependencias; puede tardar varios minutos.', flush=True)
        invoke(['webapp', 'deploy'], '--src-path', str(archive), '--type', 'zip')
    for attempt in range(24):
        try:
            with urlopen('https://' + host + '/health/ready/', timeout=10) as response:
                if response.status == 200 and json.load(response).get('status') == 'ok':
                    print('Servidor y base de datos disponibles. Panel: https://' + host + '/panel/')
                    return
        except (HTTPError, URLError, TimeoutError, ValueError):
            pass
        print('Esperando arranque (' + str(attempt + 1) + '/24)...', flush=True)
        time.sleep(10)
    raise SystemExit('El código se subió, pero la comprobación de salud no pasó. Revisa Log stream en Azure; el despliegue no se considera verificado.')


if __name__ == '__main__':
    main()
