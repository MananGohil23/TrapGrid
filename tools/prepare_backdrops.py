import os

from PIL import Image, ImageFilter, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIR = os.path.join(ROOT, 'assets')
OUT_DIR = os.path.join(ASSET_DIR, 'hd')
TARGET = (1920, 1080)

os.makedirs(OUT_DIR, exist_ok=True)

for index in range(1, 6):
    source = Image.open(os.path.join(ASSET_DIR, 'bg' + str(index) + '.jpg')).convert('RGB')
    hd = ImageOps.fit(source, TARGET, method=Image.LANCZOS, centering=(0.5, 0.5))
    hd = hd.filter(ImageFilter.UnsharpMask(radius=1.0, percent=75, threshold=3))
    path = os.path.join(OUT_DIR, 'bg' + str(index) + '.webp')
    hd.save(path, quality=90, method=6)
    print(path, hd.size, os.path.getsize(path))
