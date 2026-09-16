import { expect, it } from 'vitest';
import { GrowthRangeSession } from '../../src/client/session/GrowthRangeSession';
import { defaultGrowthLoadoutV3, changeGrowthAbility } from '../../src/shared/content/growth-v3/Loadout';
import { Battle } from '../../src/game/campaign/Battle';
import { GrowthFeedback } from '../../src/client/presentation/GrowthFeedback';
import { ShotPresentation } from '../../src/client/session/ShotPresentation';
import { visibleState } from '../../src/shared/protocol/VisibleState';
import { resolveGrowthWeapon } from '../../src/shared/content/growth-v3/Attachments';
import { Prediction } from '../../src/client/session/Prediction';

const fixture = (armor:0|25=0) => new GrowthRangeSession(defaultGrowthLoadoutV3(),{distance:180,health:100,armor});
it('headshot receipts preserve actual shield absorption and post-defense life damage',()=>{
  const b=new Battle(fixture().battle.mission,'normal','m4');
  b.enableGrowthV3({player:defaultGrowthLoadoutV3(),'enemy-0':changeGrowthAbility(defaultGrowthLoadoutV3('tank'),'tk_shield')},5);
  b.actors.forEach((a,i)=>{a.human=true;a.life.spawnProtectionFrames=0;a.movement.reset(120+i*180,499.5);});
  const target=b.actors[1];target.aim={x:120,y:466.5};expect(b.useSkill(target)).toBe(true);
  for(let i=0;i<7;i++)b.tickPlayers(new Map());
  const cursor=b.journal.cursor;
  b.growthV3!.directDamage(target,{kind:'bullet',amount:30,sourceId:'player',origin:{x:120,y:466.5},hitPoint:{x:300,y:466.5},headshot:true});
  const receipts=b.journal.since(cursor).filter(e=>e.impact);
  expect(receipts).toHaveLength(1);expect(receipts[0].impact).toMatchObject({life:10.5,shield:19.5,armor:0,headshot:true});
});
it('reports actual capped life and armor damage separately, without duplicate receipts',()=>{
  const r=fixture(25), b=r.battle;
  b.damage(b.actors[1],30,b.player);
  const impacts=b.journal.since(0).filter(e=>e.impact);
  expect(impacts).toHaveLength(1);
  expect(impacts[0].impact).toEqual({life:5,armor:25,shield:0,structure:0,headshot:false});
  b.damage(b.actors[1],9999,b.player);
  expect(b.journal.since(0).filter(e=>e.impact).at(-1)?.impact?.life).toBe(95);
});
it('armor-only shots still provide a receipt and shotgun pellets aggregate once per target',()=>{
  const r=fixture(25);r.step({fire:true});
  expect(r.battle.journal.since(0).filter(e=>e.impact)).toHaveLength(1);
  expect(r.battle.journal.since(0).find(e=>e.impact)?.impact).toMatchObject({life:0,armor:10});
  const build=defaultGrowthLoadoutV3();build.primary='shotgun';
  const shotgun=new GrowthRangeSession(build,{distance:60,health:100,armor:0});shotgun.step({fire:true});
  const hits=shotgun.battle.journal.since(0).filter(e=>e.impact);
  expect(hits).toHaveLength(1);expect(hits[0].impact!.life).toBe(shotgun.damage);
});
it('aggregates a short burst, expires on local time, and removes hidden targets immediately',()=>{
  const r=fixture(),f=new GrowthFeedback();f.accept(r.presentation(),0,'0',true);
  r.step({fire:true});const first=r.presentation();f.accept(first,10,'0',true);
  expect(f.floats).toHaveLength(1);expect(f.floats[0].life).toBe(10);
  f.accept(first,20,'0',true);expect(f.floats[0].life).toBe(10);
  r.battle.damage(r.battle.actors[1],5,r.battle.player);f.accept(r.presentation(),50,'0',true);
  expect(f.floats).toHaveLength(1);expect(f.floats[0].life).toBe(15);
  f.accept(r.presentation(),820,'0',true);expect(f.floats).toHaveLength(0);expect(f.bars.size).toBe(1);
  const hidden=r.presentation();hidden.state.actors=hidden.state.actors.filter(a=>a.id==='player');
  f.accept(hidden,830,'0',true);expect(f.bars.size).toBe(0);
});
it('kills always confirm, repeated snapshots and reconnects never replay them',()=>{
  const r=fixture(),f=new GrowthFeedback();f.accept(r.presentation(),0,'0',true);
  r.battle.damage(r.battle.actors[1],100,r.battle.player);const message=r.presentation();
  f.accept(message,10,'0',true);expect(f.kill).toContain('击杀');expect(f.cues).toHaveLength(1);
  f.accept(message,20,'0',true);expect(f.cues).toHaveLength(0);
  f.accept(message,30,'1',true);expect(f.cues).toHaveLength(0);expect(f.killUntil).toBe(0);
  f.accept(message,40,'1',false);f.accept(message,50,'1',true);expect(f.killUntil).toBe(0);
});
it('growth transitions distinguish level, selection and awakening without initial playback',()=>{
  const r=fixture(),f=new GrowthFeedback(),m=r.presentation();f.accept(m,0,'0',true);
  m.growthV3!.level=2;f.accept(m,10,'0',true);expect(f.notice).toContain('Lv.2');
  m.growthV3!.selected=['as_C1'];f.accept(m,20,'0',true);expect(f.notice).toContain('强化已生效');
  m.growthV3!.ultimate=true;f.accept(m,30,'0',true);expect(f.notice).toContain('已觉醒');
  f.accept(m,40,'1',true);expect(f.noticeUntil).toBe(0);expect(f.cues).toEqual([]);
});
it('bursts remain bounded, distinguish multiple targets and confirm every rapid kill',()=>{
  const r=fixture(),m=r.presentation(),f=new GrowthFeedback();f.accept(m,0,'0',true);
  for(let i=1;i<=40;i++) {
    m.events=[{id:i,tick:m.state.frame,kind:'damage',actorId:'player',targetId:'enemy-0',impact:{life:1,armor:0,shield:0,structure:0,headshot:false}}];
    f.accept(m,i*121,'0',true);expect(f.floats.length).toBeLessThanOrEqual(24);
  }
  m.events=[{id:41,tick:m.state.frame,kind:'death',actorId:'player',targetId:'enemy-0'}];f.accept(m,5000,'0',true);
  expect(f.cues).toHaveLength(1);
  m.events=[{id:42,tick:m.state.frame,kind:'death',actorId:'player',targetId:'enemy-1'}];f.accept(m,5100,'0',true);
  expect(f.kill).toContain('2 连杀');expect(f.cues).toHaveLength(1);
});
it('growth tracers remain visible for 150ms and fade even with stopped snapshots',()=>{
  const r=fixture();r.step({fire:true});const m=r.presentation(),s=new ShotPresentation();s.accept(m,100);
  expect(s.visible(201)).toHaveLength(1);expect(s.visualAge(s.visible(201)[0],201)).toBeCloseTo(2.02);
  s.accept(m,205);expect(s.visible(249)).toHaveLength(1);expect(s.visible(250)).toHaveLength(0);
});
it('confirms a local hidden-target kill without revealing target identity or coordinates',()=>{
  const r=fixture(),m=r.presentation(),f=new GrowthFeedback();f.accept(m,0,'0',true);
  m.events=[{id:99,tick:0,kind:'death',actorId:'player',targetId:'enemy-0',position:{x:300,y:460}}];
  const filtered=visibleState(m,new Set(['player']),1,()=>false,()=>true);
  expect(filtered.events).toEqual([{id:99,tick:0,kind:'death',actorId:'player'}]);
  f.accept(filtered,10,'0',true);expect(f.kill).toBe('击杀 敌人');expect(f.cues).toHaveLength(1);
});
it('hidden shooters expose only disconnected visible intervals, not muzzle, identity or hit metadata',()=>{
  const r=fixture(),m=r.presentation();
  m.effects=[{actorId:'enemy-0',team:2,frame:0,damage:90,killed:true,trace:{origin:{x:400,y:460},end:{x:100,y:460},maxDistance:2000,steps:200,preSteps:4,headMarked:true,initialHit:null,hit:{type:'unit',target:'enemy-0',region:'head'}}}];
  const filtered=visibleState(m,new Set(['player']),1,()=>false,(_a,p)=>p.x>330||p.x>220&&p.x<270);
  expect(filtered.effects).toHaveLength(2);
  for(const shot of filtered.effects) {
    expect(shot.actorId).toBeUndefined();expect(shot.team).toBe(0);
    expect(shot.trace.origin.x).toBeLessThanOrEqual(330);expect(shot.trace.maxDistance).toBeLessThan(150);
    expect(shot.trace).toMatchObject({hit:null,initialHit:null,headMarked:false,preSteps:0});
    expect(shot.damage).toBe(0);expect(shot.killed).toBe(false);
  }
  expect(m.effects[0].trace.origin.x).toBe(400);
});
it('heavy sniper imposes a held-weapon cost and retains 54-tick cadence after switching',()=>{
  const build=defaultGrowthLoadoutV3('sniper');build.primary='heavy_sniper';
  const r=new GrowthRangeSession(build,{distance:1800,health:100,armor:0}),b=r.battle;
  r.step({fire:true,aim:{x:100,y:100}});expect(b.player.movement.speedScale).toBe(.85);
  expect(b.growthV3!.weapons.get('player')!.checkpoint().shootReadyTick).toBe(55);
  b.swap();r.step();expect(b.player.movement.speedScale).toBe(1);
  expect(resolveGrowthWeapon('heavy_sniper',['S01']).speedScale).toBeCloseTo(.8755);
});
it('assault authority movement scale is preserved by prediction',()=>{
  const r=fixture();r.step({right:true});const m=r.presentation();m.mapId='signal';m.movement=r.battle.player.movement.checkpoint();
  expect(m.movement.speedScale).toBe(1.1);
  const p=new Prediction();p.accept(m);expect(p.movement!.speedScale).toBe(1.1);
});
