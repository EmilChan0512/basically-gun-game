import { expect, it, vi } from 'vitest';
import { Battle, idleInput, seededRandom } from '../../src/game/campaign/Battle';
import type { Mission } from '../../src/game/campaign/Missions';
import { defaultGrowthLoadoutV3, changeGrowthAbility } from '../../src/shared/content/growth-v3/Loadout';
import { visibleState } from '../../src/shared/protocol/VisibleState';
import type { StateMessage } from '../../src/shared/protocol/State';
import { AudioPresentation } from '../../src/client/audio/AudioPresentation';
import { audioCatalog, type AudioService } from '../../src/client/audio/AudioService';
import { GROWTH_SOUND_CLIPS } from '../../src/client/audio/GrowthAudio';

function battleFixture(suppressor = false) {
  const mission: Mission = { id:'sound',title:'',location:'',brief:'',debrief:'',mode:'tdm',goal:100,seconds:900,
    allies:0,enemies:1,width:1600,height:700,spawns:[[{x:100,y:600}],[{x:1500,y:600}]],objective:{x:800,y:600},
    terrain:[{x:0,y:600,width:1600,height:100}],navigation:[],palette:{sky:0,wall:0,trim:0} };
  const b = new Battle(mission, 'normal', 'm4', seededRandom(42));
  const build=changeGrowthAbility(defaultGrowthLoadoutV3('sniper'), 'sn_relocate');
  if(suppressor)build.attachments.primary=['M03'];
  b.enableGrowthV3({ player:build, 'enemy-0':defaultGrowthLoadoutV3() }, 5);
  b.actors.forEach(a => { a.human = true; a.life.spawnProtectionFrames = 0; });
  b.player.movement.reset(600,599.5); b.actors[1].movement.reset(820,599.5);
  return b;
}
function advance(b: Battle, ticks: number) {
  for (let i=0;i<ticks;i++) b.tickPlayers(new Map([['player',{...idleInput(),right:true,aim:{x:1000,y:567}}]]));
}
function message(b: Battle): StateMessage {
  return { type:'state',roomId:'sound',round:1,actorId:'enemy-0',mapId:'sound',mode:'tdm',state:b.snapshot(),
    result:null,ack:0,poses:[],effects:[],bursts:[],grenades:[],events:b.journal.since(0) };
}
it('actually reduces footstep audience during relocation without hiding the operator', () => {
  const ordinary=battleFixture(), quiet=battleFixture(); quiet.useSkill();
  advance(ordinary,10); advance(quiet,10);
  const heard=(b:Battle)=>b.journal.since(0).filter(e=>e.kind==='tactical-sound').flatMap(e=>e.soundRecipients??[]).filter(s=>s.cue==='footstep'&&s.id==='enemy-0');
  expect(heard(ordinary)).toHaveLength(1); expect(heard(quiet)).toHaveLength(0);
  expect(quiet.growthV3!.visibleActors(2).has('player')).toBe(true);
});
it('transmits only a frozen coarse sound sample, with no hidden source or other listener identities', () => {
  const b=battleFixture(); advance(b,10);
  const first=visibleState(message(b),new Set(['enemy-0']),2,b.wall);
  const sounds=first.events.filter(e=>e.kind==='tactical-sound'); expect(sounds).toHaveLength(1);
  expect(Object.keys(sounds[0]).sort()).toEqual(['id','kind','sound','tick']);
  expect(sounds[0].sound).toMatchObject({cue:'footstep',pan:-1});
  expect(JSON.stringify(sounds)).not.toContain('player'); expect(JSON.stringify(sounds)).not.toContain('820');
  b.player.movement.x=1400; b.actors[1].movement.x=100;
  expect(visibleState(message(b),new Set(['enemy-0']),2,b.wall).events.filter(e=>e.kind==='tactical-sound')).toEqual(sounds);
  const restored=Battle.restore(b.checkpoint()); expect(restored.journal.since(0)).toEqual(b.journal.since(0));
});
it('applies the relocation card quarter-radius and suppressor gunshot range to real sound audiences', () => {
  const quiet=battleFixture(), quieter=battleFixture();
  quieter.growthV3!.participant('player').progression.selected=['sn_B3'];
  quieter.growthV3!.abilities.updateBuild('player',['sn_B3'],0);
  quiet.useSkill(); quieter.useSkill();
  for (const b of [quiet,quieter]) {
    advance(b,9); b.actors[1].movement.x=b.player.movement.x+110; advance(b,1);
  }
  const heard=(b:Battle,cue:string)=>b.journal.since(0).flatMap(e=>e.soundRecipients??[]).filter(s=>s.cue===cue&&s.id==='enemy-0');
  expect(heard(quiet,'footstep')).toHaveLength(1); expect(heard(quieter,'footstep')).toHaveLength(0);
  const loud=battleFixture(), silent=battleFixture(true);
  for(const b of [loud,silent]) {
    b.actors[1].movement.x=1100;
    b.tickPlayers(new Map([['player',{...idleInput(),fire:true,aim:{x:1200,y:100}}]]));
  }
  expect(heard(loud,'shot')).toHaveLength(1); expect(heard(silent,'shot')).toHaveLength(0);
});
it('plays each received tactical sample once and gives required cues distinct audio treatments', () => {
  const audio={stop:vi.fn(),voice:vi.fn(),weapon:vi.fn(),cue:vi.fn()}, view=new AudioPresentation(audio as unknown as AudioService);
  const actors=[{id:'listener',x:0,y:0,weapon:'usp',reload:0,life:{alive:true},team:2}];
  view.accept('sound',0,[],actors,'listener');
  const event={id:1,tick:1,kind:'tactical-sound' as const,sound:{cue:'emp' as const,pan:-1 as const,distance:2 as const}};
  view.accept('sound',1,[event],actors,'listener'); view.accept('sound',1,[event],actors,'listener');
  expect(audio.cue).toHaveBeenCalledExactlyOnceWith('S_Skill',{rate:.65,pan:-.65,gain:.35});
  const required=['throw-warning','shield-hit','structure-hit','emp','heal','gadget-empty'] as const;
  expect(new Set(required.map(id=>JSON.stringify(GROWTH_SOUND_CLIPS[id]))).size).toBe(6);
  for(const cue of Object.values(GROWTH_SOUND_CLIPS))expect(audioCatalog.assets[cue.clip]).toBeDefined();
});
