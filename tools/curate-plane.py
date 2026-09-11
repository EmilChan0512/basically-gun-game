"""Static collision mask: Movement.hitTest accepts only fully opaque pixels."""
from pathlib import Path
from PIL import Image
import json, hashlib

root = Path(__file__).resolve().parent.parent
source = root/'archaeology/exported/sprites/DefineSprite_1323_MBFZ_fla.Wall_plane_231/1.png'
im = Image.open(source).convert('RGBA')
alpha = im.getchannel('A')
rows = []
for y in range(im.height):
    row = []; active = False
    for x in range(im.width):
        solid = alpha.getpixel((x, y)) == 255
        if solid != active:
            row.append(x); active = solid
    if active: row.append(im.width)
    rows.append(row)
nodes = json.loads((root/'archaeology/local/plane-nodes.json').read_text())
out = root/'src/shared/content/maps'
out.mkdir(parents=True, exist_ok=True)
data = dict(id='hijack', width=im.width, height=im.height,
    collisionMask=dict(x=0, y=0, width=im.width, height=im.height, rows=rows), **nodes)
(out/'hijack.json').write_text(json.dumps(data, separators=(',', ':')), encoding='utf-8')
asset = root/'public/assets/reference/hijack.png'
Image.open(root/'archaeology/exported/images/1320.png').save(asset)
manifest = dict(sourceSwf=nodes['source'], collisionSymbol=1323, shape=1322,
    alphaRule=255, localBounds=[0,0,2873.95,1429.7], artworkImage=1320,
    artworkShape=1321, artworkOrigin=[143.45,312.1],
    sha256=hashlib.sha256(asset.read_bytes()).hexdigest())
(asset.parent/'hijack-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(f'Plane collision: {im.width}x{im.height}, {sum(len(r)//2 for r in rows)} solid runs')
