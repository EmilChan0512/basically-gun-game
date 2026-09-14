import { expect, it } from 'vitest';
import { growthPlaytestReport } from '../../tools/growth-playtest-report';
import { createLogger } from '../../server/Logger';
import { startServer } from '../../server/server';
import { WebSocket } from 'ws';
import { authorizeSocket } from '../helpers/network-account';
import { CONTENT_VERSION } from '../../src/shared/protocol/ContentVersion';
import { awardGrowthV3 } from '../../src/shared/simulation/growth-v3/Progression';

it('reports a real server settlement after authenticated v3 choices including evolution',async()=>{
  const lines:string[]=[],server=startServer(0,'127.0.0.1',30000,createLogger({sink:line=>lines.push(line)}));
  let socket:WebSocket|undefined;
  const wait=async(check:()=>boolean)=>{const deadline=Date.now()+4000;while(!check()){if(Date.now()>deadline)throw Error('Report settlement timed out');await new Promise(resolve=>setTimeout(resolve,10));}};
  try{
    await new Promise<void>(resolve=>server.wss.once('listening',resolve));
    const address=server.wss.address();if(!address||typeof address==='string')throw Error('Missing port');
    socket=new WebSocket(`ws://127.0.0.1:${address.port}`);
    await new Promise<void>(resolve=>socket!.once('open',resolve));
    await authorizeSocket(server,socket,'Report participant');
    const send=(value:object)=>socket!.send(JSON.stringify({protocol:1,content:CONTENT_VERSION,...value}));
    send({type:'create',rules:'growth',name:'Report participant'});await wait(()=>server.rooms.size===1);
    const room=[...server.rooms.values()][0];send({type:'ready',ready:true});send({type:'start'});await wait(()=>!!room.session);
    const b=room.session!.battle,p=b.growthV3!.participant('player');
    awardGrowthV3(p.progression,p.loadout,1200,b.frame,()=>0);
    const chosen:string[]=[];
    for(let i=0;i<4;i++){
      const offer=p.progression.offer!,card=i<3?offer.cards.find(id=>id.startsWith('as_A'))!:'as_EV_A';
      expect(offer.cards).toContain(card);chosen.push(card);
      send({type:'growthChoice',roomId:room.id,round:room.round,batch:offer.batch,upgrade:card});
      await wait(()=>p.progression.selected.length===i+1);
    }
    b.endMatch(1,'report-fixture');await wait(()=>lines.some(line=>JSON.parse(line).event==='growth.playtest_result'));
    const report=growthPlaytestReport(lines),version=report.byVersion.find(v=>v.contentVersion===CONTENT_VERSION)!;
    expect(report.acceptedResults).toBe(1);expect(report.malformed).toBe(0);
    expect(version.training.matches).toBe(1);expect(version.multiplayerSeats.matches).toBe(0);
    expect(version.training.classes[0].selectionFrequency.map(c=>c.upgrade).sort()).toEqual(chosen.sort());
    expect(version.byScenario[0]).toMatchObject({mapId:room.mapId,mode:room.mode,growthPreset:room.growthPreset});
    expect(JSON.stringify(report)).not.toContain('Report participant');
  }finally{socket?.terminate();await server.close();}
});

it('skips malformed result rows and still processes a later valid result',()=>{
  const row={event:'growth.playtest_result',roomId:'malformed',round:1,trainingBots:0,players:[{classId:'assault',level:1,xp:0,choices:[]}]};
  const invalid=[{...row,players:null},{...row,players:[null]},{...row,players:[{level:1,xp:0,choices:[null]}]},
    {...row,players:[{level:1,xp:0,choices:'bad'}]},{...row,mapId:'unknown-map'},{...row,mode:'bad'},{...row,growthPreset:'bad'}];
  const report=growthPlaytestReport([...invalid,row].map(value=>JSON.stringify(value)));
  expect(report.malformed).toBe(invalid.length);expect(report.acceptedResults).toBe(1);
});

it('accepts v3 cards and evolutions from the actual logger content field without copying identity',()=>{
  const lines:string[]=[],logger=createLogger({sink:line=>lines.push(line)});
  logger.log('info','growth.playtest_result',{content:'96ee68b774800acd',mapId:'signal',mode:'tdm',growthPreset:'standard',roomId:'v3',round:1,trainingBots:0,
    players:[{actorId:'private-actor',classId:'assault',level:5,xp:1200,choices:[{id:'as_A1',latency:30},{id:'as_A2',latency:60},{id:'as_C1',latency:90},{id:'as_EV_A',latency:120}]}]});
  const report=growthPlaytestReport(lines);
  expect(report.acceptedResults).toBe(1);expect(report.malformed).toBe(0);
  expect(report.byVersion[0].contentVersion).toBe('96ee68b774800acd');
  expect(report.byVersion[0].multiplayerSeats.classes[0]).toMatchObject({classId:'assault',choices:4,meanChoiceSeconds:2.5,p95ChoiceSeconds:4});
  expect(JSON.stringify(report)).not.toContain('private-actor');
});

it('separates bot practice, counts per-seat choices and latency, and deduplicates copied log rows', () => {
  const row = { event: 'growth.playtest_result', roomId: 'test', round: 1, time: '2026-09-13T00:00:00Z', contentVersion: '0000000000000001', trainingBots: 0,
    players: [{ classId: 'assault', level: 3, xp: 450, choices: [{ id: 'momentum', latency: 60 }, { id: 'quickHands', latency: 120 }] },
      { classId: 'assault', level: 1, xp: 0, choices: [] }] };
  const report = growthPlaytestReport([JSON.stringify(row), JSON.stringify(row), JSON.stringify({ ...row, round: 2, trainingBots: 1 })]);
  expect(report.acceptedResults).toBe(2); expect(report.duplicates).toBe(1);
  expect(report.byVersion[0].multiplayerSeats.matches).toBe(1); expect(report.byVersion[0].training.matches).toBe(1);
  expect(report.byVersion[0].multiplayerSeats.averageEndLevelGap).toBe(2);
  expect(report.byVersion[0].multiplayerSeats.classes[0]).toMatchObject({ seats: 2, meanChoiceSeconds: 3, p95ChoiceSeconds: 4,
    selectionFrequency: [{ upgrade: 'momentum', count: 1, perSeat: .5 }, { upgrade: 'quickHands', count: 1, perSeat: .5 }] });
});

it('rejects broken samples and excludes unrelated log payloads and account identities', () => {
  const report = growthPlaytestReport(['not-json', JSON.stringify({ event: 'auth', password: 'do-not-copy' }),
    JSON.stringify({ event: 'growth.playtest_result', roomId: 'broken', round: 1, trainingBots: 0, players: [{ level: 1, xp: -1, choices: [] }] })]);
  expect(report.acceptedResults).toBe(0); expect(report.malformed).toBe(2);
  expect(report.byVersion).toEqual([]); expect(JSON.stringify(report)).not.toContain('do-not-copy');
});

it('keeps current versions separate and rejects conflicting or malformed version aliases',()=>{
  const row={event:'growth.playtest_result',roomId:'v3',round:1,trainingBots:0,players:[{classId:'medic',level:2,xp:200,choices:[{id:'md_B2',latency:30}]}]};
  const report=growthPlaytestReport([
    {...row,content:'0000000000000001'}, {...row,contentVersion:'0000000000000002'},
    {...row,content:'0000000000000001',contentVersion:'0000000000000002'}, {...row,content:'bad'},
    {...row,content:'0000000000000001',players:[{classId:'medic',level:2,xp:200,choices:[{id:'invented-card',latency:30}]}]},
  ].map(row=>JSON.stringify(row)));
  expect(report.acceptedResults).toBe(2);expect(report.malformed).toBe(3);
  expect(report.byVersion.map(v=>v.contentVersion)).toEqual(['0000000000000001','0000000000000002']);
});

it('separates maps, modes, presets and bot cohorts within a version, retaining unknown legacy dimensions',()=>{
  const row={event:'growth.playtest_result',content:'0000000000000001',roomId:'cohorts',round:1,trainingBots:0,players:[{classId:'tank',level:2,xp:200,choices:[{id:'tk_B3',latency:60}]}]};
  const report=growthPlaytestReport([
    {...row,mapId:'signal',mode:'tdm',growthPreset:'standard'},
    {...row,round:2,mapId:'signal',mode:'tdm',growthPreset:'short'},
    {...row,round:3,mapId:'foundry',mode:'dom',growthPreset:'standard',trainingBots:1},
    {...row,round:4},
  ].map(row=>JSON.stringify(row)));
  expect(report.acceptedResults).toBe(4);expect(report.byVersion[0].byScenario).toHaveLength(4);
  expect(report.byVersion[0].byScenario.map(s=>[s.mapId,s.mode,s.growthPreset,s.training.matches,s.multiplayerSeats.matches])).toEqual([
    ['foundry','dom','standard',1,0],['signal','tdm','short',0,1],['signal','tdm','standard',0,1],['unknown','unknown','unknown',0,1],
  ]);
});

it('deduplicates semantic copies without merging distinct scenario or bot-cohort records',()=>{
  const row={event:'growth.playtest_result',content:'0000000000000001',roomId:'same-code',round:1,time:'2026-09-14T00:00:00Z',mapId:'signal',mode:'tdm',growthPreset:'standard',trainingBots:0,
    players:[{classId:'assault',level:2,xp:200,choices:[{id:'as_A1',latency:30}]}]};
  const copy={...row,players:[{choices:[{latency:30,id:'as_A1'}],xp:200,level:2,classId:'assault'}]};
  const report=growthPlaytestReport([row,{...row,mapId:'foundry'},{...row,mode:'dom'},{...row,growthPreset:'short'},{...row,trainingBots:1},copy].map(value=>JSON.stringify(value)));
  expect(report.acceptedResults).toBe(5);expect(report.duplicates).toBe(1);
  expect(report.byVersion[0].training.matches).toBe(1);expect(report.byVersion[0].multiplayerSeats.matches).toBe(4);
});
