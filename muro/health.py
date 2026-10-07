import logging
import tempfile
from pathlib import Path
from django.conf import settings
from django.db import DatabaseError
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.cache import never_cache
from django.views.decorators.http import require_safe
from wall.models import Wall


@require_safe
@never_cache
def live(request):
    return JsonResponse({'status': 'ok'})


@require_safe
@never_cache
def ready(request):
    try:
        if not Wall.objects.filter(pk=1).exists():
            raise RuntimeError('wall_not_initialized')
        with tempfile.TemporaryFile(dir=Path(settings.MEDIA_ROOT)) as probe:
            probe.write(b'muro'); probe.flush(); probe.seek(0)
            if probe.read() != b'muro':
                raise OSError('media_check_failed')
    except (DatabaseError, OSError, RuntimeError) as error:
        logging.getLogger('muro.health').error('Readiness failed: %s', type(error).__name__, extra={'request_id': getattr(request, 'request_id', '')})
        return JsonResponse({'status': 'unavailable'}, status=503)
    return JsonResponse({'status': 'ok'})


def server_error(request):
    return render(request, 'wall/server_error.html', {'request_id': getattr(request, 'request_id', '')}, status=500)
