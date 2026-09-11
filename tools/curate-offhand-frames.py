"""Rebuild the cropped texture frames from unmodified static offhand PNGs."""
from pathlib import Path
from PIL import Image
import json

root = Path(__file__).resolve().parent.parent
assets = root / 'public/assets/reference'
manifest = json.loads((assets / 'offhand-manifest.json').read_text(encoding='utf-8'))
frames = {}
for asset in manifest['assets']:
    image = Image.open(assets / asset['file']).convert('RGBA')
    bounds = image.getbbox()
    if bounds is None:
        raise ValueError(f"Empty asset: {asset['id']}")
    x, y, right, bottom = bounds
    frames[asset['id']] = [x, y, right - x, bottom - y]
(root / 'src/client/presentation/offhand-frames.json').write_text(json.dumps(frames, indent=2) + '\n', encoding='utf-8')
