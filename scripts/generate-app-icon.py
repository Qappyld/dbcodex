"""Convert the user's original PNG to preview and Windows ICO formats.

Requires Pillow; generated assets are checked in, so packaging needs no Python.
Source artwork, colors, transparency and proportions are preserved.
"""
from pathlib import Path
from PIL import Image

root = Path(__file__).resolve().parents[1] / 'assets'
image = Image.open(root / 'dbcodex-source.png').convert('RGBA')
image.thumbnail((256, 256), Image.Resampling.LANCZOS)
canvas = Image.new('RGBA', (256, 256))
canvas.paste(image, ((256 - image.width) // 2, (256 - image.height) // 2))
canvas.save(root / 'dbcodex.png')
canvas.save(root / 'dbcodex.ico', sizes=[(s, s) for s in (16, 20, 24, 32, 40, 48, 64, 128, 256)])
print('Converted original PNG to assets/dbcodex.png and dbcodex.ico')
