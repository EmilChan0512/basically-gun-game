"""Local-only ASR review aid; model/cache/output stay outside distribution."""
from pathlib import Path
import sys, os, json
root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root/'archaeology/local/audio-python'))
os.environ['HF_HUB_DISABLE_XET'] = '1'
from faster_whisper import WhisperModel
model = WhisperModel(str(root/'archaeology/local/audio-review-model'), device='cpu', compute_type='int8')
results = {}
for f in sorted((root/'archaeology/exported/sounds').glob('*_V_*.mp3')):
    if not any(x in f.name for x in ['Medic','Sniper','Soldier','Tank']): continue
    segments, info = model.transcribe(str(f), language='en', beam_size=5, vad_filter=False, condition_on_previous_text=False)
    results[f.name] = ' '.join(s.text.strip() for s in segments)
    print(f.name, results[f.name], flush=True)
(root/'archaeology/local/audio-transcripts.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
