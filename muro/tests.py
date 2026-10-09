import io
import json
import logging
import tempfile
from pathlib import Path
from unittest.mock import patch
from django.core.management import call_command
from django.db import OperationalError
from django.test import Client, SimpleTestCase, TestCase, override_settings
from django.urls import include, path
from .observability import SafeJsonFormatter
from wall.models import Wall


def fail(request):
    raise RuntimeError('Failure for integration test')


urlpatterns = [path('_failure/', fail), path('', include('muro.urls'))]
handler500 = 'muro.health.server_error'


class HealthTests(TestCase):
    def setUp(self):
        self.media = tempfile.TemporaryDirectory()
        self.addCleanup(self.media.cleanup)
        self.media_override = override_settings(MEDIA_ROOT=self.media.name)
        self.media_override.enable()
        self.addCleanup(self.media_override.disable)
        Wall.objects.create(pk=1)

    def test_readiness_checks_initialized_database_and_writable_media(self):
        response = self.client.get('/health/ready/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})
        self.assertIn('no-store', response['Cache-Control'])
        self.assertEqual(list(Path(self.media.name).iterdir()), [])
        Wall.objects.all().delete()
        self.assertEqual(self.client.get('/health/ready/').status_code, 503)

    def test_database_failure_is_private_and_liveness_remains_available(self):
        with patch('muro.health.Wall.objects.filter', side_effect=OperationalError('private connection details')):
            response = self.client.get('/health/ready/')
            self.assertEqual(response.status_code, 503)
            self.assertEqual(response.json(), {'status': 'unavailable'})
            self.assertEqual(self.client.get('/health/live/').status_code, 200)

    def test_media_failure_reports_unhealthy(self):
        with patch('muro.health.tempfile.TemporaryFile', side_effect=PermissionError('private media path')):
            response = self.client.get('/health/ready/')
            self.assertEqual(response.status_code, 503)
            self.assertNotContains(response, 'private media path', status_code=503)

    @override_settings(ROOT_URLCONF='muro.tests', DEBUG=False)
    def test_server_errors_have_a_traceable_code_without_debug_details(self):
        response = Client(raise_request_exception=False).get('/_failure/')
        self.assertEqual(response.status_code, 500)
        self.assertRegex(response['X-Request-ID'], r'^[a-f0-9]{32}$')
        self.assertContains(response, response['X-Request-ID'], status_code=500)
        self.assertNotContains(response, 'Failure for integration test', status_code=500)

    def test_request_logs_do_not_include_tv_tokens_or_query_strings(self):
        with self.assertLogs('muro.requests', level='INFO') as captured:
            response = self.client.get('/tv/private-screen-credential/?secret=private-query')
        self.assertEqual(response.status_code, 404)
        payload = SafeJsonFormatter().format(captured.records[0])
        self.assertNotIn('private-screen-credential', payload)
        self.assertNotIn('private-query', payload)
        self.assertEqual(json.loads(payload)['route'], 'tv')


class ReleasePackageTests(SimpleTestCase):
    def test_package_contains_application_without_local_data(self):
        from scripts.package_release import build_zip
        from zipfile import ZipFile
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in ['manage.py', 'requirements.txt', 'scripts/startup.sh', 'scripts/release.py', 'wall/views.py', 'piloto/assets/video.mp4', '.env', '.dev-secret', 'db.sqlite3', 'media/private.mp4', 'wall/.env', 'wall/__pycache__/cache.py']:
                target = root / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text('test')
            archive = build_zip(root / 'dist/muro.zip', root=root)
            with ZipFile(archive) as zipped:
                self.assertEqual(set(zipped.namelist()), {'manage.py', 'requirements.txt', 'scripts/startup.sh', 'scripts/release.py', 'wall/views.py', 'piloto/assets/video.mp4'})

    def test_error_log_redacts_tv_url_credentials(self):
        record = logging.LogRecord('django.request', logging.ERROR, '', 0, 'Internal Server Error: %s', ('/tv/private-token/manifest/',), None)
        result = SafeJsonFormatter().format(record)
        self.assertNotIn('private-token', result)
        self.assertIn('/tv/[redacted]/manifest/', result)
