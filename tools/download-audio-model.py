"""Fetch the public ASR model into the ignored local research cache."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import urllib.request, time
root = Path(__file__).resolve().parents[1]/'archaeology/local/audio-review-model'
root.mkdir(exist_ok=True)
base = 'https://huggingface.co/Systran/faster-whisper-base.en/resolve/main/'
for name in ['config.json','tokenizer.json','vocabulary.txt']:
    urllib.request.urlretrieve(base+name+'?t='+str(time.time()),root/name)
size=145216508
def part(i):
    start=i*size//8; end=(i+1)*size//8-1
    request=urllib.request.Request(base+'model.bin?part='+str(i)+'&t='+str(time.time()),headers={'Range':f'bytes={start}-{end}'})
    with urllib.request.urlopen(request,timeout=90) as response:
        if response.status != 206: raise RuntimeError('Range not supported')
        data=response.read()
        if len(data)!=end-start+1: raise RuntimeError('Incomplete chunk')
    print('Chunk',i,'complete',flush=True)
    return data
with ThreadPoolExecutor(max_workers=8) as pool:
    parts=list(pool.map(part,range(8)))
(root/'model.bin').write_bytes(b''.join(parts))
print('Model ready',flush=True)
