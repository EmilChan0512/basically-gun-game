"""Remove only border-connected neutral white from the local ComfyUI module output."""
import json
import sys
from collections import deque
from PIL import Image

image = Image.open(sys.argv[1]).convert('RGBA')
pixels = image.load()
width, height = image.size
queue = deque([(x, y) for x in range(width) for y in (0, height-1)] +
              [(x, y) for y in range(height) for x in (0, width-1)])
visited = set()
while queue:
    x, y = queue.popleft()
    if (x, y) in visited or x < 0 or x >= width or y < 0 or y >= height:
        continue
    visited.add((x, y))
    r, g, b, a = pixels[x, y]
    if min(r, g, b) < 232 or max(r, g, b)-min(r, g, b) > 18:
        continue
    pixels[x, y] = (r, g, b, 0)
    queue.extend(((x-1, y), (x+1, y), (x, y-1), (x, y+1)))
bounds = image.getchannel('A').getbbox()
if not bounds or bounds == (0, 0, width, height):
    raise ValueError('Expected a border-separated module; inspect the new generation before publishing')
image = image.crop(bounds)
image.save(sys.argv[2], optimize=True)
print(json.dumps({'width': image.width, 'height': image.height, 'sourceBounds': bounds,
                  'transform': 'border-connected neutral white removal and tight alpha crop'}))
