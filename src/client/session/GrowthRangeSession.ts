import { Battle, idleInput, seededRandom, type BattleInput } from '../../game/campaign/Battle';
import { defaultGrowthLoadoutV3, type GrowthLoadoutV3 } from '../../shared/content/growth-v3/Loadout';
import { GROWTH_V3_STAGE } from '../../shared/content/growth-v3/Core';
import { grantArmor } from '../../shared/simulation/growth-v3/DamageRules';
import { OriginalLife } from '../../game/combat/OriginalLife';
import type { StateMessage } from '../../shared/protocol/State';
import { visibleState } from '../../shared/protocol/VisibleState';

export interface RangeTarget { distance: number; health: 90 | 95 | 100 | 115; armor: 0 | 15 | 25 }
/** Local, disposable real Battle. No account/network session and no settlement callback. */
export class GrowthRangeSession {
  readonly battle: Battle;
  readonly impacts: { x: number; y: number; damage: number; tick: number }[] = [];
  firstShot: number | null = null;
  killTick: number | null = null;
  shots = 0; hits = 0; damage = 0;
  constructor(loadout: GrowthLoadoutV3, readonly target: RangeTarget, slot: 'primary' | 'secondary' = 'primary') {
    if(!Number.isFinite(target.distance)||target.distance<60||target.distance>1800||![90,95,100,115].includes(target.health)||![0,15,25].includes(target.armor))throw Error('Invalid range target');
    const b=this.battle=new Battle({id:'growth-range',title:'成长靶场',location:'',brief:'',debrief:'',mode:'tdm',debug:true,
      goal:Number.MAX_SAFE_INTEGER,seconds:900,allies:0,enemies:1,width:2200,height:600,
      spawns:[[{x:20,y:500}],[{x:2180,y:500}]],objective:{x:2100,y:500},
      terrain:[{x:0,y:500,width:2200,height:100}],navigation:[],palette:{sky:0,wall:0,trim:0}},'normal','m4',seededRandom(43191));
    b.enableGrowthV3({player:structuredClone(loadout),'enemy-0':defaultGrowthLoadoutV3()},GROWTH_V3_STAGE);
    b.actors.forEach((a,i)=>{a.human=true;a.life.spawnProtectionFrames=0;a.movement.reset(i?120+target.distance:120,499.5);});
    b.actors[1].life=new OriginalLife(target.health);b.actors[1].life.spawnProtectionFrames=0;
    if(target.armor)grantArmor(b.growthV3!.participant('enemy-0').armor,target.armor,27000,0,'range-target');
    if(slot==='secondary'){b.swap();b.tickPlayers(new Map());}
  }
  get aim() { const a=this.battle.actors[1];return {x:a.movement.x,y:a.movement.y-33}; }
  get ttk() { return this.killTick!==null&&this.firstShot!==null?(this.killTick-this.firstShot)/30:null; }
  presentation(): StateMessage {
    const b = this.battle;
    const message: StateMessage = {
      type: 'state', roomId: 'growth-range', round: 1, actorId: 'player', mapId: b.mission.id, mode: 'tdm',
      state: b.snapshot(), result: b.result, ack: -1, poses: b.actors.map(a => ({ id:a.id, name:a.name, aim:{...a.aim} })),
      effects: b.effects, bursts: b.bursts, grenades: [], events: b.journal.since(Math.max(0,b.journal.cursor-64)),
      growthV3: b.growthV3!.privateView('player'),
    };
    return visibleState(message,b.growthV3!.visibleActors(1),1,b.wall,(a,z)=>b.growthV3!.gadgets.smokeBlocks(a,z));
  }
  step(input: Partial<BattleInput> = {}) {
    if(this.killTick!==null||!this.battle.player.life.alive)return;
    const b=this.battle, before=b.journal.cursor;
    b.tickPlayers(new Map([['player',{...idleInput(),aim:this.aim,...input}]]));
    for(const event of b.journal.since(before))if(event.kind==='shot'&&event.actorId==='player'){this.shots++;this.firstShot??=event.tick;}
    for(const effect of b.effects)if(effect.frame===b.frame&&effect.actorId==='player') {
      if(effect.trace.hit?.type==='unit'&&effect.trace.hit.target==='enemy-0')this.hits++;
      this.damage+=effect.damage;
    }
    for(const effect of this.presentation().effects)if(effect.frame===b.frame&&effect.actorId==='player'&&effect.trace.hit)
      this.impacts.push({...effect.trace.end,damage:effect.damage,tick:b.frame});
    if(this.impacts.length>600)this.impacts.splice(0,this.impacts.length-600);
    if(!b.actors[1].life.alive)this.killTick=b.frame;
  }
}
