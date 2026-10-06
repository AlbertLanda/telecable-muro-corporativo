"""Validate the shipped document/assets; --fixture emits a DOM for JS tests."""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

PILOT = Path(__file__).resolve().parents[1] / 'piloto'
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}


class Document(HTMLParser):
    def __init__(self):
        super().__init__()
        self.root = {'tag': 'document', 'attrs': {}, 'children': []}
        self.stack = [self.root]
        self.ids = set()
        self.assets = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            assert attrs['id'] not in self.ids, 'Duplicate ID: ' + attrs['id']
            self.ids.add(attrs['id'])
        for attribute in ('src', 'href'):
            value = attrs.get(attribute, '')
            if value and not value.startswith(('https:', 'http:', '#')):
                self.assets.append(value)
        node = {'tag': tag, 'attrs': attrs, 'children': []}
        self.stack[-1]['children'].append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_endtag(self, tag):
        assert self.stack[-1]['tag'] == tag, (tag, self.stack[-1]['tag'])
        self.stack.pop()

    def handle_data(self, data):
        self.stack[-1]['children'].append(data)


source = (PILOT / 'index.html').read_text(encoding='utf-8')
doc = Document()
doc.feed(source)
assert len(doc.stack) == 1
clips = json.loads(re.search(r'id="mvp-demo-data">([\s\S]*?)</script>', source)[1])
assert len(clips) == 2
for clip in clips:
    assert clip['url'].endswith('.mp4')
    doc.assets.append(clip['url'])
for asset in doc.assets:
    path = (PILOT / asset).resolve()
    assert path.is_relative_to(PILOT.resolve()), asset
    assert path.is_file() and path.stat().st_size > 0, asset
assert 'data:' not in source
css = (PILOT / 'wall.css').read_text(encoding='utf-8')
assert not any(token in css for token in ('light-dark(', 'cqw', '@container'))
assert (PILOT / 'assets' / 'logo-telecable.png').read_bytes().startswith(b'\x89PNG')
assert (PILOT / 'assets' / 'equipo-ilustrativo.jpg').read_bytes().startswith(b'\xff\xd8')
if '--fixture' in sys.argv:
    print(json.dumps(doc.root, ensure_ascii=True))
else:
    print('PASS: balanced HTML, unique IDs, local media references, image types and TV CSS fallbacks.')
