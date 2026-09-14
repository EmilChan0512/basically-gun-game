import { mkdir, writeFile } from 'node:fs/promises';
import { strict as assert } from 'node:assert';
import { performance } from 'node:perf_hooks';
import { Battle, seededRandom } from '../../src/game/campaign/Battle';
import { customMatch } from '../../src/shared/content/Maps';
import { defaultGrowthLoadoutV3, changeGrowthAbility } from '../../src/shared/content/growth-v3/Loadout';
import { GROWTH_V3_OPERATORS } from '../../src/shared/content/growth-v3/Operators';
import { GROWTH_V3_GADGETS } from '../../src/shared/content/growth-v3/Gadgets';
import { growthPrimaryPool, GROWTH_V3_SIDEARMS } from '../../src/shared/content/growth-v3/Weapons';
import { GROWTH_V3_ATTACHMENTS, validateAttachments, type GrowthAttachmentId } from '../../src/shared/content/growth-v3/Attachments';
import { GROWTH_V3_PRESETS } from '../../src/shared/content/growth-v3/Presets';
import { GROWTH_V3_STAGE, type GrowthClassId } from '../../src/shared/content/growth-v3/Core';
import { CONTENT_VERSION, contentFingerprint } from '../../src/shared/protocol/ContentVersion';
import { observeGrowthCastRequests } from './growth-cast-observer';

const maps=['signal','foundry','uplink','extraction','hijack'];
const compositions: {name:string; classes:GrowthClassId[]}[]=[
  {name:'balanced-a',classes:['assault','tank','sniper','medic','assault','tank','sniper','medic']},
  {name:'balanced-b',classes:['medic','sniper','tank','assault','medic','sniper','tank','assault']},
  {name:'double-medic',classes:['medic','medic','assault','tank','medic','medic','sniper','tank']},
  {name:'double-tank',classes:['tank','tank','assault','medic','tank','tank','sniper','medic']},
];
const partIds=Object.keys(GROWTH_V3_ATTACHMENTS) as GrowthAttachmentId[];
const cases=[];
const activatedG=new Set<string>(),activatedE=new Set<string>();
await mkdir('artifacts/qa',{recursive:true});
for(let mapIndex=0;mapIndex<maps.length;mapIndex++)for(let pattern=0;pattern<compositions.length;pattern++){
  const index: number=cases.length;
  const mapId=maps[mapIndex],composition=compositions[pattern],seed=810100+index;
  const preset=index%2?'short':'standard',mode=(mapIndex+pattern)%2?'dom':'tdm',clock=GROWTH_V3_PRESETS[preset];
  const b=new Battle({...customMatch(mapId,mode),growthPreset:preset,seconds:clock.matchTicks/30,goal:Number.MAX_SAFE_INTEGER,allies:3,enemies:4},
    'normal','m4',seededRandom(seed),null,`ai-matrix-${index}`);
  const builds=Object.fromEntries(b.actors.map((a,i)=>{
    a.human=false;const cls=composition.classes[i],operator=GROWTH_V3_OPERATORS[cls],rotation=mapIndex+pattern+i;
    const build=changeGrowthAbility(defaultGrowthLoadoutV3(cls),operator.abilities[rotation%2]);
    build.gadgetId=operator.gadgets[rotation%3];
    const pool=growthPrimaryPool(cls,GROWTH_V3_STAGE);build.primary=pool[(mapIndex*4+pattern+i)%pool.length];
    build.secondary=GROWTH_V3_SIDEARMS[rotation%3];
    for(const slot of ['primary','secondary'] as const){
      const limit=slot==='primary'?rotation%4:rotation%2;
      for(let k=0;k<partIds.length&&build.attachments[slot].length<limit;k++){
        const part=partIds[(k+index+i)%partIds.length];
        try{build.attachments[slot]=validateAttachments(build[slot],[...build.attachments[slot],part],GROWTH_V3_STAGE);}catch{/* Try the next legal slot/weapon combination. */}
      }
    }
    return [a.id,build];
  }));
  b.enableGrowthV3(builds,GROWTH_V3_STAGE);
  const castObserver=observeGrowthCastRequests(b);
  const usage=Object.fromEntries(b.actors.map(a=>[a.id,{skillCommits:0,gadgetEvents:0,firstGadgetTick:null as number|null,abilityEndReasons:{} as Record<string,number>,errors:{} as Record<string,number>}]));
  const levelSamples:{tick:number;actors:{id:string;classId:GrowthClassId;level:number;gapToTeamMean:number}[]}[]=[];
  let restored:Battle|undefined,cursor=b.journal.cursor;
  const samples:number[]=[],start=performance.now();
  while(b.phase==='running'){
    const before=performance.now();b.tickPlayers(new Map());samples.push(performance.now()-before);restored?.tickPlayers(new Map());
    for(const e of b.journal.since(cursor)){
      const u=e.actorId?usage[e.actorId]:undefined;if(!u)continue;
      if(e.kind==='skill'){u.skillCommits++;if(e.ability)activatedE.add(e.ability);}
      if(e.kind==='item'){u.gadgetEvents++;u.firstGadgetTick??=e.tick;if(e.ability)activatedG.add(e.ability);}
      if(e.kind==='error'){const reason=e.cause??'unknown';u.errors[reason]=(u.errors[reason]??0)+1;}
      if(e.kind==='abilityEnd'){const reason=e.cause??'unknown';u.abilityEndReasons[reason]=(u.abilityEndReasons[reason]??0)+1;}
    }
    cursor=b.journal.cursor;
    if(b.frame%900===0)levelSamples.push({tick:b.frame,actors:b.actors.map(a=>{
      const p=b.growthV3!.participant(a.id),team=b.actors.filter(other=>other.team===a.team);
      const mean=team.reduce((sum,other)=>sum+b.growthV3!.participant(other.id).progression.level,0)/team.length;
      return{id:a.id,classId:p.loadout.classId,level:p.progression.level,gapToTeamMean:p.progression.level-mean};
    })});
    if(b.frame===clock.matchTicks/2)restored=Battle.restore(b.checkpoint());
    assert(b.frame<=clock.matchTicks);
  }
  assert.equal(b.frame,clock.matchTicks);assert.deepEqual(restored!.checkpoint(),b.checkpoint());
  assert(b.actors.some(a=>a.kills>0),'Bots must engage');
  assert([...b.growthV3!.participants.values()].every(p=>p.progression.ultimate));
  samples.sort((a,z)=>a-z);const percentile=(p:number)=>samples[Math.min(samples.length-1,Math.ceil(samples.length*p)-1)];
  const castRequests=castObserver.report();
  const report={index,mapId,mode,preset,composition:composition.name,seed,content:CONTENT_VERSION,frames:b.frame,scores:b.scores,
    elapsedMs:performance.now()-start,restoredIdentically:true,checkpointHash:contentFingerprint(b.checkpoint()),
    simulationMs:{p95:percentile(.95),p99:percentile(.99),max:samples.at(-1),samples:samples.length},
    levelSamples,skillLevel:'normal-bot',castRequests,
    actors:b.actors.map(a=>{const p=b.growthV3!.participant(a.id);return{id:a.id,team:a.team,build:p.loadout,kills:a.kills,deaths:a.life.deaths,
      xp:p.progression.xp,selected:p.progression.selected,choiceLatencies:p.progression.choices.map(c=>c.latency),metrics:p.metrics,weaponMetrics:p.weaponMetrics,
      finalGadgetCharges:a.itemCharges,...usage[a.id],inventorySpent:castRequests[a.id].G.spentCharges,
      exhaustionTicks:castRequests[a.id].G.exhaustionTicks};})};
  cases.push(report);
  for(const channels of Object.values(report.castRequests))for(const c of Object.values(channels)){
    assert.equal(c.attempts,c.rejected+c.acceptedCasts+c.acceptedCancel+c.acceptedDetonation);
    assert.equal(Object.values(c.rejectionReasons).reduce((sum,value)=>sum+value,0),c.rejected);
    assert.equal(c.submitted,c.enqueueRejected+c.coalesced+c.queued);
    assert.equal(c.queued,c.evaluatedFromQueue+c.arbitrationSkipped+c.ownerUnavailable+c.unprocessed+c.queuedPending);
    assert.equal(c.acceptedCasts,c.committed+c.revalidationFailed+c.deathInterrupted+c.ownerEndedBeforeCommit+c.damageInterrupted+c.cancelledBeforeCommit+c.pendingCasts);
    assert(c.pendingCasts>=0);
  }
  for(const actor of report.actors){
    const inventory=b.growthV3!.gadgets.inventory(actor.id);
    assert.equal(GROWTH_V3_GADGETS[actor.build.gadgetId].charges+Number(inventory.extraGranted)-actor.inventorySpent,actor.finalGadgetCharges);
    assert.equal(castRequests[actor.id].G.committed,actor.inventorySpent);
  }
  const attachmentAssignments:Record<string,number>={};
  for(const match of cases)for(const actor of match.actors)for(const part of [...actor.build.attachments.primary,...actor.build.attachments.secondary])attachmentAssignments[part]=(attachmentAssignments[part]??0)+1;
  const document={date:new Date().toISOString(),content:CONTENT_VERSION,stage:GROWTH_V3_STAGE,complete:cases.length===20,
    telemetryNotes:'exhaustionTicks and inventorySpent record actual G commits before later same-tick choices can grant G1; exhaustion remains recorded even if the tick ends with replenished stock. Level gaps are sampled every 30 seconds against the same-team mean including self. castRequests counts actual E/G method calls; invalidRequestRate=rejected/attempts. Queue submissions, rejection, coalescing, arbitration and unavailable owners are separate counters; network retransmissions are deduplicated upstream. Committed casts, revalidation failures, death/damage interruptions and cancellations are tracked around actual phase transitions. pendingCasts is the unresolved remainder, not a failure. precommitFailureRate uses accepted new casts as denominator; activeCancelRate uses committed E casts. No samples gives null. Each queue, request, windup and inventory partition is asserted. abilityEndReasons records authoritative end reasons separately. Attachment assignments are deterministic fixture coverage, not player preference or a balance concentration estimate.',
    attachmentAssignments,
    scope:'20 local authority 4v4 bot matches across five maps and four compositions, with both presets separated and midpoint restore parity. No browser/transport/device performance or human balance evidence. Gadget activation events may include both decoy release and creation; inventorySpent counts actual committed stock consumption, excluding remote detonation.',
    activatedG:[...activatedG].sort(),activatedE:[...activatedE].sort(),missingGActivations:Object.keys(GROWTH_V3_GADGETS).filter(id=>!activatedG.has(id)),cases};
  await writeFile('artifacts/qa/growth-v3-ai-20.json',JSON.stringify(document,null,2)+'\n');
  process.stdout.write(JSON.stringify({completed:cases.length,mapId,preset,composition:composition.name,scores:b.scores,p99:report.simulationMs.p99,restored:true})+'\n');
}
