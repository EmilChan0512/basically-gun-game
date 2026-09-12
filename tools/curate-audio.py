"""Curate only used reference samples. Requires ffmpeg (pass executable as argv[1])."""
from pathlib import Path
import hashlib, json, re, subprocess, sys, zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public/assets/audio'
OUT.mkdir(parents=True, exist_ok=True)
sounds = ROOT / 'archaeology/exported/sounds'
weapons = json.loads((ROOT / 'src/shared/content/weapon-catalog.json').read_text(encoding='utf-8'))
reloads = dict(pistol='Pistol', mpistol='Pistol', magnum='Magnum', rifle='Rifle', shotgun='Shotgun', heavy='Heavy', sniper='Sniper', rocket='Rocket', launcher='Launcher', bullpup='Bulpup')
assets, mapping = {}, {}
def sample(symbol, category='effect', volume=.55):
    if symbol in assets: return symbol
    source = next(sounds.glob('*_' + symbol + '.mp3'))
    target = OUT / (symbol + '.ogg')
    subprocess.run([sys.argv[1], '-v', 'error', '-y', '-i', str(source), '-af', 'highpass=f=40,alimiter=limit=0.65:level=false', '-ac', '1', '-ar', '44100', '-c:a', 'libvorbis', '-q:a', '4', str(target)], check=True)
    assets[symbol] = dict(file=target.name, category=category, volume=volume, symbol=symbol, sourceFile=source.name,
        source='Strike Force Heroes 1 / local static SWF export', license='Original game asset; rights remain with original owners; no free redistribution license asserted.',
        sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(), sha256=hashlib.sha256(target.read_bytes()).hexdigest(),
        processing='40Hz high-pass, peak limiter 0.65 (Vorbis overshoot headroom), mono 44100Hz Vorbis q4; no voice cloning')
    return symbol

for id, w in weapons.items():
    # Complete type mapping derived from the existing original animation grips.
    shot = 'S_rocketFire' if w.get('projectile') else 'S_autoshotgunFire' if w['pellets'] > 1 and w['config']['automatic'] else 'S_shotgunFire' if w['pellets'] > 1 else 'S_sniperFire' if w['reloadGrip'] == 'sniper' else 'S_pistolFire' if w['grip'] in ['pistol','mpistol','magnum'] else 'S_assaultFire'
    specific = dict(uzi='S_uziFire', mp5='S_mp5', scout='S_scout', deagle='S_deagle', aug='S_aug', ak47='S_ak')
    shot = specific.get(id, shot)
    reload = 'S_' + reloads.get(w['reloadGrip'], 'Rifle') + 'Reload'
    mapping[id] = dict(shot=sample(shot, volume=.38), reload=sample(reload, volume=.45), basis='Catalog grip/reloadGrip; UnitMC.reloadSound; same-class fallback')

cues = dict(swap='S_Equip', empty='S_GunClick', hit='S_Headshot1', hurt='S_Blunt2', death='S_Die1', respawn='S_Powerup',
    melee='S_Whip1', **{'melee-hit':'S_Cut3'}, block='S_Reflect1', explosion='S_rocketExplode', skill='S_Skill', heal='S_Heal',
    item='S_Equip', supply='S_Powerup', click='S_Click', error='S_Error', win='S_Medal', lose='S_Beep',
    **{'objective-pickup':'S_Powerup','objective-delivery':'S_Medal','objective-return':'S_Beep'})
for cue, symbol in cues.items(): sample(symbol, volume=.35 if cue in ['hit','hurt','click'] else .55)
# Voice text is reviewed separately; only the class selection lines are selected here.
voices = json.loads((ROOT / 'tools/audio-voices.json').read_text(encoding='utf-8'))
for group, lines in voices.items():
    for line in lines:
        symbol = sample(line['symbol'], 'voice', .95)
        assets[symbol].update(text=line['text'], originalText=line['originalText'], group=group)

# Free-library movement transients, selected from Kenney's CC0 impact pack.
archive = zipfile.ZipFile(ROOT/'archaeology/local/kenney-impact.zip')
for name, source in [('footstep','footstep_concrete_000'),('jump','footstep_concrete_001'),('land','impactSoft_heavy_000')]:
    content = archive.read('Audio/'+source+'.ogg')
    (OUT/(name+'.ogg')).write_bytes(content)
    assets[name] = dict(file=name+'.ogg', category='effect', volume=.24 if name=='footstep' else .38,
        source='https://kenney.nl/assets/impact-sounds', sourceFile=source+'.ogg', license='CC0-1.0', processing='Unmodified selected sample', sha256=hashlib.sha256(content).hexdigest())
    cues[name] = name
(OUT/'Kenney-CC0.txt').write_bytes(archive.read('License.txt'))
# Missing generic kill confirmation: locally rendered ordinary installed speech voice.
speech = ROOT/'archaeology/local/voice-kill.wav'
target = OUT/'voice-kill.ogg'
subprocess.run([sys.argv[1],'-v','error','-y','-i',str(speech),'-af','highpass=f=200,lowpass=f=3800,alimiter=limit=0.85:level=false','-ac','1','-c:a','libvorbis','-q:a','4',str(target)],check=True)
assets['voice-kill'] = dict(file=target.name,category='voice',volume=.95,text='目标已消灭。',originalText='Target eliminated.',group='kill',source='Local Windows System.Speech / Microsoft Zira Desktop',license='Locally synthesized original text; installed Windows voice; no actor cloning.',processing='Offline TTS, radio band-pass and peak limiter',sha256=hashlib.sha256(target.read_bytes()).hexdigest())
voices['kill'] = [{'symbol':'voice-kill'}]

manifest = dict(version=1, assets=assets, weapons=mapping, cues=cues, voices={k:[l['symbol'] for l in v] for k,v in voices.items()})
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(ROOT/'src/client/audio').mkdir(parents=True,exist_ok=True)
(ROOT/'src/client/audio/catalog.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
(OUT/'SOURCES.txt').write_text('Project Strike audio sources\n\nOriginal SFH1 audio: extracted from local sfh1_reference.swf. Copyright remains with the original rights holders. No CC0 or other free license is asserted for these samples.\nMovement transients: Kenney Impact Sounds, https://kenney.nl/assets/impact-sounds, CC0-1.0; original license included.\nKill confirmation: original text rendered locally using installed Microsoft Zira Desktop (System.Speech); no cloned actor voice.\nSee manifest.json for individual symbols, processing, subtitles and SHA256 hashes.\n',encoding='utf-8')
print(f'Curated {len(assets)} clips and {len(mapping)} weapon mappings')
