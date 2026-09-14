import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { WEAPONS } from '../../src/game/campaign/Catalog';
import { AudioEventCursor, AudioPresentation } from '../../src/client/audio/AudioPresentation';
import { AudioService, VoiceGate, audioCatalog, normalizeSettings, audioDefaults } from '../../src/client/audio/AudioService';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import { MISSIONS } from '../../src/game/campaign/Missions';
import type { SimulationEvent } from '../../src/shared/simulation/Events';
import { visibleState } from '../../src/shared/protocol/VisibleState';
import type { StateMessage } from '../../src/shared/protocol/State';

afterEach(() => vi.unstubAllGlobals());
it('maps every weapon and cue to a bundled, checksummed clip with documented provenance', () => {
  expect(Object.keys(audioCatalog.weapons).sort()).toEqual(Object.keys(WEAPONS).sort());
  for (const clips of Object.values(audioCatalog.weapons)) for (const clip of [clips.shot, clips.reload]) expect(audioCatalog.assets[clip]).toBeDefined();
  for (const clip of Object.values(audioCatalog.cues)) expect(audioCatalog.assets[clip]).toBeDefined();
  const manifest = JSON.parse(readFileSync('public/assets/audio/manifest.json','utf8'));
  for (const a of Object.values(manifest.assets) as any[]) {
    const path = `public/assets/audio/${a.file}`; expect(existsSync(path)).toBe(true);
    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(a.sha256);
    expect(a.source).toBeTruthy(); expect(a.license).toBeTruthy();
    if (a.category === 'voice') { expect(a.text).toMatch(/[\u4e00-\u9fff]/); expect(a.originalText).toBeTruthy(); }
  }
});
it('seeds historical events, deduplicates snapshots, expires stale events and scopes reconnects/rounds', () => {
  const cursor = new AudioEventCursor();
  const shot = (id: number, tick: number): SimulationEvent => ({ id, tick, kind:'shot', actorId:'player', weapon:'shotgun' });
  expect(cursor.accept('room:1:0',100,[shot(1,99)])).toEqual([]);
  expect(cursor.accept('room:1:0',101,[shot(1,99),shot(2,101)])).toHaveLength(1);
  expect(cursor.accept('room:1:0',101,[shot(2,101)])).toEqual([]);
  expect(cursor.accept('room:1:0',150,[shot(3,110)])).toEqual([]);
  expect(cursor.accept('room:1:1',160,[shot(4,160)])).toEqual([]);
  expect(cursor.accept('room:2:1',1,[shot(1,1)])).toEqual([]);
  expect(cursor.accept('room:2:1',2,[shot(2,2)])).toHaveLength(1);
});
it('limits repeated voice groups to eight seconds and clamps persisted settings', () => {
  const gate = new VoiceGate(); expect(gate.accept('kill',0)).toBe(true); expect(gate.accept('kill',7999)).toBe(false);
  expect(gate.accept('medic',100)).toBe(true); expect(gate.accept('kill',8000)).toBe(true);
  expect(normalizeSettings({master: 9, effects:-1, voice:NaN, muted:true})).toEqual({...audioDefaults, master:1,effects:0,muted:true});
  vi.stubGlobal('localStorage',{getItem:()=>'{broken',setItem:vi.fn()}); expect(new AudioService().settings).toEqual(audioDefaults);
});
it('plays an authoritative shotgun event once and retains its event-time weapon after switching', () => {
  const audio = { stop:vi.fn(), pause:vi.fn(), voice:vi.fn(), weapon:vi.fn(), cue:vi.fn() };
  const p = new AudioPresentation(audio as unknown as AudioService);
  const actors = [{id:'player',x:0,y:0,weapon:'usp',reload:0,life:{alive:true},team:1}];
  p.accept('one',0,[],actors,'player');
  const events: SimulationEvent[] = [{id:1,tick:1,kind:'shot',actorId:'player',weapon:'shotgun'}];
  p.accept('one',1,events,actors,'player'); p.accept('one',1,events,actors,'player');
  expect(audio.weapon).toHaveBeenCalledTimes(1); expect(audio.weapon.mock.calls[0].slice(0,2)).toEqual(['shotgun','shot']);
  p.accept('one',2,[{id:2,tick:2,kind:'shot',actorId:'player',weapon:'usp'}],actors,'player',undefined,false);
  p.accept('one',2,[{id:2,tick:2,kind:'shot',actorId:'player',weapon:'usp'}],actors,'player');
  expect(audio.weapon).toHaveBeenCalledTimes(1);
});
it('does not double-play a descriptive heal event alongside its authoritative sound sample or a repeated snapshot',()=>{
  const audio={stop:vi.fn(),voice:vi.fn(),weapon:vi.fn(),cue:vi.fn()};
  const p=new AudioPresentation(audio as unknown as AudioService);
  const actors=[{id:'player',x:0,y:0,weapon:'usp',reload:0,life:{alive:true},team:1}];
  p.accept('growth',0,[],actors,'player');
  const events:SimulationEvent[]=[{id:1,tick:1,kind:'heal',actorId:'player',targetId:'player',amount:3},
    {id:2,tick:1,kind:'tactical-sound',sound:{cue:'heal',pan:0,distance:0}}];
  p.accept('growth',1,events,actors,'player');p.accept('growth',1,events,actors,'player');
  expect(audio.cue).toHaveBeenCalledTimes(1);
});
it('emits one gunshot per discharge and covers automatic reload without altering restored simulation', () => {
  const b = new Battle(MISSIONS[0], 'normal', 'shotgun', seededRandom(7));
  b.player.arsenal.gun.ammo = 1;
  b.tick({...idleInput(),fire:true});
  expect(b.journal.since(0).filter(e=>e.kind==='shot' && e.actorId==='player')).toHaveLength(1);
  expect(b.journal.since(0).find(e=>e.kind==='reload' && e.actorId==='player')).toMatchObject({weapon:'shotgun'});
  const restored = Battle.restore(b.checkpoint());
  for (let i=0;i<60;i++) { b.tick(idleInput()); restored.tick(idleInput()); }
  expect(restored.checkpoint()).toEqual(b.checkpoint());
});
it('filters hidden sound actors and explosion positions from online state', () => {
  const b = new Battle(MISSIONS[0]);
  const m: StateMessage = { type:'state',roomId:'x',round:1,actorId:'player',mapId:'x',mode:'tdm',state:b.snapshot(),result:null,ack:0,poses:[],effects:[],bursts:[],grenades:[],
    events:[{id:1,tick:1,kind:'footstep',actorId:'enemy-0'},{id:2,tick:1,kind:'explosion',actorId:'player',position:{x:99999,y:99999}},{id:3,tick:1,kind:'reload',actorId:'player',weapon:'m4'}] };
  expect(visibleState(m,new Set(['player']),1,()=>false).events.map(e=>e.id)).toEqual([3]);
});
it('tolerates unavailable devices, missing assets, and corrupt decodes without playback', async () => {
  vi.stubGlobal('document',{hidden:false});
  vi.stubGlobal('AudioContext',class { constructor(){throw Error('no device');} });
  const unavailable = new AudioService(); await expect(unavailable.unlock()).resolves.toBeUndefined();
  const node = () => ({gain:{value:1},threshold:{value:0},knee:{value:0},ratio:{value:1},connect:vi.fn()});
  vi.stubGlobal('AudioContext',class { state='running'; destination={}; createGain=node; createDynamicsCompressor=node; createWaveShaper=node; decodeAudioData=()=>Promise.reject(Error('corrupt')); });
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:false})));
  const missing = new AudioService(); await missing.unlock(); await missing.play('S_Click');
  expect(missing.diagnostics.failed).toBeGreaterThan(0); expect(missing.diagnostics.played).toBe(0);
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,arrayBuffer:async()=>new ArrayBuffer(1)})));
  const corrupt = new AudioService(); await corrupt.unlock(); await corrupt.play('S_Click');
  expect(corrupt.diagnostics.failed).toBeGreaterThan(0); expect(corrupt.diagnostics.played).toBe(0);
  corrupt.configure({muted:true}); await corrupt.play('S_Click'); expect(corrupt.diagnostics.played).toBe(0);
});
