import json
import logging
import re
import time
import uuid
from datetime import datetime, timezone


def redact(value):
    # TV URLs are credentials: keep them out of application logs and tracebacks.
    return re.sub(r'/tv/[^/\s?\'"<>]+', '/tv/[redacted]', str(value))


class SafeJsonFormatter(logging.Formatter):
    def format(self, record):
        request = getattr(record, 'request', None)
        payload = {
            'time': datetime.now(timezone.utc).isoformat(),
            'level': record.levelname,
            'logger': record.name,
            'message': redact(record.getMessage()),
        }
        request_id = getattr(record, 'request_id', None) or getattr(request, 'request_id', None)
        if request_id:
            payload['request_id'] = request_id
        for key in ['route', 'method', 'status', 'duration_ms']:
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if record.exc_info:
            payload['exception'] = redact(self.formatException(record.exc_info))
        return json.dumps(payload, ensure_ascii=False)


class RequestLogMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.logger = logging.getLogger('muro.requests')

    def __call__(self, request):
        request.request_id = uuid.uuid4().hex
        started = time.monotonic()
        response = self.get_response(request)
        response['X-Request-ID'] = request.request_id
        match = getattr(request, 'resolver_match', None)
        route = match.view_name if match else 'unmatched'
        # Log routes rather than URLs, query strings, cookies, or form values.
        if not (route in ['health_live', 'health_ready'] and response.status_code == 200):
            level = logging.ERROR if response.status_code >= 500 else logging.INFO
            self.logger.log(level, 'request', extra={
                'request_id': request.request_id, 'route': route, 'method': request.method,
                'status': response.status_code, 'duration_ms': round((time.monotonic() - started) * 1000, 1),
            })
        return response
