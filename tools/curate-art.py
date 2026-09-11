"""Curate static FFDec exports; no SWF execution. Requires Pillow."""
from pathlib import Path
from PIL import Image
import hashlib, json

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public/assets/reference'
OUT.mkdir(parents=True, exist_ok=True)
records = []

def curate(name, path, source, crop=True):
    image = Image.open(path).convert('RGBA')
    bounds = image.getbbox() if crop else (0, 0, image.width, image.height)
    if not bounds:
        raise ValueError(f'Empty asset: {name}')
    image = image.crop(bounds)
    target = OUT / f'{name}.png'
    image.save(target, optimize=True)
    records.append(dict(id=name, source=source, crop=bounds, size=image.size,
                        sha256=hashlib.sha256(target.read_bytes()).hexdigest()))

for name, frame in dict(usp=2, beretta=3, vector=17, m4=20, saw=32, shotgun=44, dragunov=52).items():
    path = next((ROOT/'archaeology/local/curated-export').glob(f'**/{frame}.png'))
    curate(name, path, f'DefineSprite 375 / frame {frame}; shotgun uses M3 artwork')
for name, symbol in dict(boot=538, leg=568, arm=598, torso=631, head=666, supply=1221, flash=394).items():
    path = next((ROOT/'archaeology/exported/sprites').glob(f'DefineSprite_{symbol}*/1.png'))
    curate(name, path, f'DefineSprite {symbol} / frame 1')
for name, symbol in dict(hills=839, clouds=1344, outpost=830, aircraft=852).items():
    curate(name, ROOT/f'archaeology/exported/images/{symbol}.png', f'DefineBits image {symbol}')
(OUT/'manifest.json').write_text(json.dumps(dict(
    source='SFH1 v1.2.1', swfSha256='0b8d92dfae85917dd9bc0dc87997979bb825b3211d95d92f84040ffc9a1cc989',
    method='Static FFDec export; cropped transparent margins; original scripts never executed',
    assets=records), ensure_ascii=False, indent=2), encoding='utf-8')
print(f'Curated {len(records)} textures into {OUT}')
