import { expect, it } from 'vitest';
import { Room } from '../../src/shared/simulation/Room';
import { MatchSession } from '../../src/shared/simulation/MatchSession';
import { idleInput } from '../../src/game/campaign/Battle';
import { defaultGrowthLoadoutV3 } from '../../src/shared/content/growth-v3/Loadout';
import type { PlayerCommand } from '../../src/shared/protocol/Commands';

it('retains queued receipts through disconnect, restore and match end without requeueing dropped actions',()=>{
  const room=new Room('receipts','signal','tdm',false,'growth');
  room.join('client','Medic',undefined,defaultGrowthLoadoutV3('medic'));
  room.ready('client',true);room.start('client',27);
  const session=room.session!;
  const command:PlayerCommand={sequence:0,input:idleInput(),actions:['item']};
  expect(room.command('client',command)).toBe(true);
  const queued=session.checkpoint();
  expect(room.command('client',command)).toBe(true);
  expect(session.checkpoint()).toEqual(queued);
  room.disconnect('client');
  expect(room.command('client',command)).toBe(false);
  room.reconnect('client');
  const dropped=session.checkpoint(),restored=MatchSession.restore(dropped);
  expect(restored.submit('client',command)).toBe(true);
  expect(restored.checkpoint()).toEqual(dropped);
  expect(restored.diagnostics('client')?.queue).toBe(0);
  session.battle.endMatch(1,'receipt boundary');
  const ended=session.checkpoint();
  expect(room.command('client',command)).toBe(true);
  expect(session.checkpoint()).toEqual(ended);
  room.returnToLobby('client');room.ready('client',true);room.start('client',28);
  expect(room.session!.isAcceptedRetry('client',command)).toBe(false);
});

it('compares canonical values, rejects altered or malformed retries, and retains early receipts after later commands',()=>{
  const room=new Room('receipt-identity','signal','tdm',false,'growth');
  room.join('client','Medic',undefined,defaultGrowthLoadoutV3('medic'));
  room.ready('client',true);room.start('client',29);
  const s=room.session!,command:PlayerCommand={sequence:0,input:idleInput(),actions:[]};
  expect(s.submit('client',command)).toBe(true);
  for(let sequence=1;sequence<=300;sequence++)expect(s.submit('client',{...command,sequence})).toBe(true);
  const before=s.checkpoint();
  const input=command.input;
  const reordered:PlayerCommand={actions:[],input:{aim:{y:input.aim.y,x:input.aim.x},fire:input.fire,jump:input.jump,crouch:input.crouch,right:input.right,left:input.left},sequence:0};
  expect(s.submit('client',reordered)).toBe(true);
  expect(s.rejectionReason('client',{...command,actions:['item']})).toBe('sequence-conflict');
  expect(s.submit('client',{...command,actions:['item']})).toBe(false);
  expect(s.submit('client',{...command,gadgetId:'md_smoke'} as PlayerCommand)).toBe(false);
  expect(s.submit('other',command)).toBe(false);
  expect(s.checkpoint()).toEqual(before);
});
