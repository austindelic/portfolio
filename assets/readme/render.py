"""Rebuild README artwork: python3 assets/readme/render.py (requires Pillow).

Uses a saved AI-generated masthead, a recorded renderer capture, and geometric
primitives. Rebuilding uses saved assets locally; it does not call image generation.
"""
from pathlib import Path
from shutil import copyfile
from PIL import Image, ImageChops, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
FONT = ROOT / 'apps/portfolio/public/fonts/DepartureMono-Regular.woff2'
BG, WHITE, AMBER, MUTED, RULE = '#0d1117', '#e6e3db', '#ffa133', '#9da6b2', '#343b43'


def text(draw, xy, label, size, fill=WHITE):
    draw.text(xy, label, font=ImageFont.truetype(str(FONT), size), fill=fill, anchor='lt')


def save(image, name):
    image.save(HERE / name, format='WEBP', quality=92, method=6, exact=True)


def place_capture(canvas, size, xy, bounds):
    """Preserve glyph colors, lifting only the black floor to charcoal."""
    source = Image.open(HERE / 'source/black-hole.webp').convert('RGB')
    source = source.resize(size, Image.Resampling.LANCZOS)
    layer = Image.new('RGB', canvas.size, BG)
    layer.paste(source, xy)
    layer = ImageChops.lighter(layer, Image.new('RGB', canvas.size, BG))
    mask = Image.new('L', canvas.size)
    ImageDraw.Draw(mask).rectangle(bounds, fill=255)
    canvas.paste(layer, mask=mask)


def masthead():
    # The approved imagegen result is the source of truth. Copy without another
    # lossy encode; generation itself is not deterministic or performed here.
    source = HERE / 'source/navara-word-gap.webp'
    with Image.open(source) as image:
        if image.size != (2172, 724):
            raise ValueError('Unexpected generated masthead dimensions')
    copyfile(source, HERE / 'masthead-navara-word-gap.webp')


def strip(name, number, title, kind):
    image = Image.new('RGB', (1800, 220), BG)
    if kind == 'portfolio':
        place_capture(image, (1200, 630), (730, -180), (1010, 0, 1799, 219))
    draw = ImageDraw.Draw(image)
    draw.line((0, 219, 1800, 219), fill=RULE, width=2)
    text(draw, (44, 89), number, 32, AMBER)
    text(draw, (150, 65), title, 82)
    if kind == 'still':
        # Connected layers of a project environment; not a product screenshot.
        cards = [(1200, 40), (1320, 78), (1440, 116)]
        for index, (x, y) in enumerate(cards):
            if index < len(cards) - 1:
                draw.line((x + 100, y + 25, x + 220, y + 63), fill=RULE, width=3)
            draw.rectangle((x, y, x + 170, y + 64), fill=BG, outline=MUTED, width=3)
            draw.rectangle((x + 16, y + 18, x + 24, y + 26), fill=AMBER)
            draw.line((x + 44, y + 22, x + 143, y + 22), fill=MUTED, width=3)
            draw.line((x + 44, y + 42, x + 106, y + 42), fill=RULE, width=3)
        draw.line((1628, 150, 1640, 162, 1664, 138), fill=AMBER, width=5)
    elif kind == 'tactify':
        # Abstract dot diagram and audio waveform; no Braille text implied.
        for row in range(5):
            for col in range(7):
                x, y = 1210 + col * 28, 52 + row * 28
                active = row == 2 or col in (0, 6) or (row, col) in ((1, 2), (3, 4))
                draw.rectangle((x, y, x + 7, y + 7), fill=AMBER if active else RULE)
        draw.line((1450, 60, 1450, 171), fill=RULE, width=2)
        for index, height in enumerate([20, 42, 80, 116, 66, 36, 60, 94, 48, 24]):
            x = 1500 + index * 18
            draw.rectangle((x, 110 - height // 2, x + 5, 110 + height // 2), fill=AMBER)
    save(image, name)


def icons():
    # Shared 24px grid, transparent canvas, 2px strokes.
    shapes = {
        'terminal': '<path d="M3 5h18v14H3z" stroke="#8b949e"/><path d="m7 9 3 3-3 3m6 0h4" stroke="#ffa133"/>',
        'browser': '<path d="M3 4h18v16H3zM3 9h18" stroke="#8b949e"/><path d="M6 6.5h2m2 0h2m-4 6 2 2-2 2m5 0h4" stroke="#ffa133"/>',
        'systems': '<path d="M4 3h16v7H4zM4 14h16v7H4zM12 10v4" stroke="#8b949e"/><path d="M7 6.5h2m3 0h5m-10 11h2m3 0h5" stroke="#ffa133"/>',
        'tactile': '<path d="M4 5h3v3H4zM11 5h3v3h-3zM4 12h3v3H4zM11 19h3v3h-3z" fill="#ffa133" stroke="none"/><path d="M19 8v10m-3-7v4m6-10v16" stroke="#8b949e"/>',
    }
    for name, shape in shapes.items():
        (HERE / f'{name}.svg').write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" '
            'viewBox="0 0 24 24" fill="none" stroke-width="2" '
            'shape-rendering="crispEdges">' + shape + '</svg>\n'
        )


if __name__ == '__main__':
    masthead()
    strip('portfolio.webp', '01', 'Portfolio', 'portfolio')
    strip('still-environment.webp', '02', 'Still', 'still')
    strip('tactify.webp', '03', 'Tactify', 'tactify')
    icons()
    assets = sorted([*HERE.glob('*.webp'), *HERE.glob('*.svg')])
    for path in assets:
        print(f'{path.name}: {path.stat().st_size:,} bytes')
    print(f'README images: {sum(p.stat().st_size for p in assets):,} bytes')
