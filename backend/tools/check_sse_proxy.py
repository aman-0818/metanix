"""Exercise the repository's SSE Nginx location using isolated local containers.

Requires prebuilt metanix-enterprise-worker-test:local and nginx:alpine images.
No production services, credentials, published ports, or provider calls are used.
"""
import json
from pathlib import Path
import re
import subprocess
import tempfile
import uuid


def docker(*args, check=True):
    result = subprocess.run(['docker', *args], capture_output=True, text=True, timeout=60)
    if check and result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def main():
    root = Path(__file__).resolve().parents[2]
    config = (root / 'nginx/nginx.conf').read_text(encoding='utf-8')
    location = re.search(r'location = /api/admin/chat/stream/\s*\{[^}]+\}', config).group()
    name = 'metanix-sse-check-' + uuid.uuid4().hex[:8]
    worker, proxy = name + '-backend', name + '-proxy'
    image = 'metanix-enterprise-worker-test:local'
    with tempfile.TemporaryDirectory(prefix='metanix_sse_') as folder:
        path = Path(folder)
        (path / 'nginx.conf').write_text('events {}\nhttp { upstream backend_upstream { server backend:8000; } '
            'server { listen 80; proxy_http_version 1.1; ' + location + ' } }', encoding='utf-8')
        (path / 'server.py').write_text('''from http.server import BaseHTTPRequestHandler, HTTPServer
import time
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.end_headers()
        for i in range(3):
            self.wfile.write(('data: %s\\n\\n' % i).encode())
            self.wfile.flush()
            if i < 2: time.sleep(.4)
HTTPServer(('0.0.0.0', 8000), Handler).serve_forever()
''', encoding='utf-8')
        (path / 'client.py').write_text('''import json, time, urllib.request
for attempt in range(30):
    try:
        start = time.monotonic()
        response = urllib.request.urlopen('http://proxy/api/admin/chat/stream/', timeout=5)
        break
    except OSError:
        if attempt == 29: raise
        time.sleep(.1)
times = []
for line in response:
    if line.startswith(b'data:'):
        times.append(round((time.monotonic()-start)*1000, 1))
assert len(times) == 3, times
assert times[-1] - times[0] >= 600, ('Buffered events', times)
print(json.dumps({'event_arrival_ms': times, 'unbuffered': True}))
''', encoding='utf-8')
        docker('network', 'create', '--internal', name)
        try:
            docker('run', '--pull', 'never', '--rm', '-d', '--name', worker, '--network', name,
                   '--network-alias', 'backend', '--mount', f'type=bind,source={folder},target=/fixture,readonly',
                   image, 'python', '/fixture/server.py')
            docker('run', '--pull', 'never', '--rm', '-d', '--name', proxy, '--network', name,
                   '--network-alias', 'proxy', '--mount',
                   f'type=bind,source={path / "nginx.conf"},target=/etc/nginx/nginx.conf,readonly', 'nginx:alpine')
            print(docker('run', '--pull', 'never', '--rm', '--network', name, '--mount',
                         f'type=bind,source={folder},target=/fixture,readonly', image, 'python', '/fixture/client.py'))
        finally:
            docker('stop', worker, proxy, check=False)
            docker('network', 'rm', name, check=False)


if __name__ == '__main__':
    main()
