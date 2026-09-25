#!/usr/bin/env python3
import base64
from pathlib import Path

raw = Path('scripts/apple-touch-icon.b64').read_text().strip()
data = base64.b64decode(raw)
Path('apple-touch-icon.png').write_bytes(data)
Path('public').mkdir(exist_ok=True)
Path('public/apple-touch-icon.png').write_bytes(data)
print('wrote apple-touch-icon.png')
