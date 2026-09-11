"""Select default SFH1 skins from static FFDec exports (no SWF execution)."""
from pathlib import Path
from PIL import Image
import hashlib
import json

root = Path(__file__).resolve().parent.parent
output = root / 'public/assets/reference'
records = []
for role, frame in dict(assassin=1, medic=51, tank=101, commando=151).items():
    for part, symbol in dict(boot=538, leg=568, arm=598, torso=631, head=666).items():
        source = root / f'archaeology/local/class-export/DefineSprite_{symbol}/{frame}.png'
        image = Image.open(source).convert('RGBA')
        bounds = image.getbbox()
        if bounds is None:
            raise ValueError(f'Empty skin: {source}')
        image = image.crop(bounds)
        target = output / f'{role}-{part}.png'
        image.save(target, optimize=True)
        records.append(dict(id=f'{role}-{part}', symbol=symbol, frame=frame,
                            crop=bounds, size=image.size, sha256=hashlib.sha256(target.read_bytes()).hexdigest()))
(output / 'classes-manifest.json').write_text(json.dumps(dict(
    source='SFH1 v1.2.1', swfSha256=hashlib.sha256((root / 'archaeology/swf/sfh1_reference.swf').read_bytes()).hexdigest(),
    method='Static FFDec sprite export; Stats_Classes.startFrame + skin 1; UnitMC.setSkin',
    assets=records), indent=2), encoding='utf-8')
print(f'Curated {len(records)} class parts')
