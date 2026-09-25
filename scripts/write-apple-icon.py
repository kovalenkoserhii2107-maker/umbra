#!/usr/bin/env python3
"""Write a sharp 180x180 eclipse PNG with only the stdlib."""
import struct
import zlib
from pathlib import Path

SIZE = 180
SS = 4
S = SIZE * SS
BG = (10, 10, 10)
SUN = (255, 184, 122)


def circle(px, cx, cy, r, color):
    r2 = r * r
    y0 = max(0, int(cy - r))
    y1 = min(S, int(cy + r) + 1)
    x0 = max(0, int(cx - r))
    x1 = min(S, int(cx + r) + 1)
    for y in range(y0, y1):
        dy = y + 0.5 - cy
        row = px[y]
        for x in range(x0, x1):
            dx = x + 0.5 - cx
            if dx * dx + dy * dy <= r2:
                row[x] = color


def downsample(px):
    out = []
    for y in range(SIZE):
        row = []
        for x in range(SIZE):
            r = g = b = 0
            for oy in range(SS):
                src = px[y * SS + oy]
                for ox in range(SS):
                    cr, cg, cb = src[x * SS + ox]
                    r += cr
                    g += cg
                    b += cb
            n = SS * SS
            row.append((r // n, g // n, b // n))
        out.append(row)
    return out


def png_bytes(img):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    raw = b''.join(b'\x00' + bytes(ch for pix in row for ch in pix) for row in img)
    return b''.join([
        b'\x89PNG\r\n\x1a\n',
        chunk(b'IHDR', struct.pack('>IIBBBBB', SIZE, SIZE, 8, 2, 0, 0, 0)),
        chunk(b'IDAT', zlib.compress(raw, 9)),
        chunk(b'IEND', b''),
    ])


def main():
    px = [[BG for _ in range(S)] for _ in range(S)]
    cx = cy = S / 2
    circle(px, cx, cy, S * 0.30, SUN)
    circle(px, cx + S * 0.028, cy, S * 0.268, BG)
    data = png_bytes(downsample(px))
    Path('apple-touch-icon.png').write_bytes(data)
    Path('public').mkdir(exist_ok=True)
    Path('public/apple-touch-icon.png').write_bytes(data)
    print('wrote', len(data), 'bytes')


if __name__ == '__main__':
    main()
