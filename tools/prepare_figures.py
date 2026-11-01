import base64
import io
import os

from PIL import Image
from rembg import new_session, remove

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSET_DIR = os.path.join(ROOT, 'assets')
CUTOUT_DIR = os.path.join(ASSET_DIR, 'cutouts')
FIGURE_DIR = os.path.join(ASSET_DIR, 'figures')
MAX_HEIGHT = 620
DEFAULT_MODEL = 'isnet-general-use'
MODEL_BY_NAME = {
    'hogrider': 'u2net'
}
LABELS = {
    'archer': 'Archer',
    'bowler': 'Bowler',
    'hogrider': 'Hog Rider',
    'knight': 'Knight',
    'prince': 'Prince'
}
CHARACTERS = ['archer', 'bowler', 'hogrider', 'knight', 'prince']

os.makedirs(CUTOUT_DIR, exist_ok=True)
os.makedirs(FIGURE_DIR, exist_ok=True)
sessions = {}


def session_for(model_name):
    if model_name not in sessions:
        sessions[model_name] = new_session(model_name)
    return sessions[model_name]


def svg_for(image, label):
    buffer = io.BytesIO()
    image.save(buffer, format='PNG', optimize=True)
    payload = base64.b64encode(buffer.getvalue()).decode('ascii')
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" '
        'role="img" aria-label="{label}">\n'
        '  <title>{label}</title>\n'
        '  <image width="{w}" height="{h}" '
        'href="data:image/png;base64,{payload}"/>\n'
        '</svg>\n'
    ).format(w=image.width, h=image.height, label=label, payload=payload)


for name in CHARACTERS:
    source_path = None
    for extension in ('.jpg', '.jpeg', '.png'):
        candidate = os.path.join(ASSET_DIR, name + extension)
        if os.path.exists(candidate):
            source_path = candidate
            break

    if not source_path:
        print(name, 'missing')
        continue

    label = LABELS.get(name, name.replace('_', ' ').title())
    source = Image.open(source_path).convert('RGBA')
    cutout = remove(source, session=session_for(MODEL_BY_NAME.get(name, DEFAULT_MODEL)), post_process_mask=True)

    bbox = cutout.getchannel('A').getbbox()
    if bbox:
        cutout = cutout.crop(bbox)

    if cutout.height > MAX_HEIGHT:
        scale = MAX_HEIGHT / cutout.height
        cutout = cutout.resize((max(1, round(cutout.width * scale)), MAX_HEIGHT), Image.LANCZOS)

    bbox = cutout.getchannel('A').getbbox()
    if bbox:
        pad = 8
        cutout = cutout.crop((
            max(0, bbox[0] - pad),
            max(0, bbox[1] - pad),
            min(cutout.width, bbox[2] + pad),
            min(cutout.height, bbox[3] + pad)
        ))

    png_path = os.path.join(CUTOUT_DIR, name + '.png')
    cutout.save(png_path, optimize=True)

    with open(os.path.join(FIGURE_DIR, name + '.svg'), 'w', encoding='utf-8') as handle:
        handle.write(svg_for(cutout, label))

    print(name, cutout.size, os.path.getsize(png_path))
