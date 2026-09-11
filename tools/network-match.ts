import { WebSocket } from 'ws';
import type { Socket } from 'node:net';
import { mkdirSync, writeFileSync } from 'node:fs';
import { startServer } from '../server/server';
import { Battle, seededRandom, idleInput, type Actor } from '../src/game/campaign/Battle';
import { customMatch } from '../src/shared/content/Maps';
import { createMode } from '../src/shared/simulation/ModeRules';
import { botInput } from '../src/shared/simulation/BotController';
import { CONTENT_VERSION } from '../src/shared/protocol/ContentVersion';
import type { StateMessage } from '../src/shared/protocol/State';
import { Arsenal } from '../src/game/campaign/Arsenal';
import { OriginalMovement } from '../src/game/movement/OriginalMovement';
import { OriginalLife } from '../src/game/combat/OriginalLife';
import { clearSight } from '../src/game/campaign/Navigation';
import { Prediction } from '../src/client/session/Prediction';
import { OffhandController, SHIELD_RULES } from '../src/shared/simulation/Offhand';
import { WEAPONS, isSpecialOffhand } from '../src/game/campaign/Catalog';
import type { EquipmentLoadout } from '../src/shared/content/Equipment';
import { SearchPatrol } from './network/search-patrol';

const mapId = process.argv[2] ?? 'hijack';
const modeId = process.argv[3] ?? 'tdm';
if (modeId !== 'tdm' && modeId !== 'dom' && modeId !== 'coop' && modeId !== 'ctf') throw Error('Expected tdm, dom, coop or ctf');
const clientCount = Number(process.argv[4] ?? 8);
const profile = process.argv[5] ?? 'basic';
const expectedOutcome = process.argv[6] ?? 'any';
const equipmentProfile = process.argv[7] ?? 'default';
if (!['default', 'mixed', 'marksman'].includes(equipmentProfile)) throw Error('Expected default, mixed or marksman equipment');
const equipment: EquipmentLoadout[] = Array.from({ length: clientCount }, (_, i) => equipmentProfile === 'default'
  ? { primary: 'm4', secondary: 'usp' } : equipmentProfile === 'marksman' ? { primary: 'dragunov', secondary: 'deagle' } : [
    { primary: 'ak47', secondary: 'knife' }, { primary: 'm4', secondary: 'shield' },
    { primary: 'dragunov', secondary: 'deagle' }, { primary: 'saw', secondary: 'usp' },
  ][Math.floor(i / 2) % 4] as EquipmentLoadout);
const heldFire = Array(clientCount).fill(false);
const pendingSwap = Array(clientCount).fill(-1);
const equipmentObservations = Array.from({ length: clientCount }, () => ({ meleeSnapshots: 0, shieldSnapshots: 0, deployedSnapshots: 0 }));
const combatDiagnostics = Array.from({ length: clientCount }, () => ({ fireCommands: 0, visibleEnemySnapshots: 0,
  aliveSnapshots: 0, reloadSnapshots: 0, emptyMagazineSnapshots: 0, observedShots: 0, lastShots: 0, lastDeaths: 0 }));
const deathSnapshots: { client: number; tick: number; x: number; y: number; weapon: string; ammo: number; shots: number; enemies: unknown[] }[] = [];
if (!['any', 'won', 'lost'].includes(expectedOutcome)) throw Error('Expected outcome: any, won or lost');
if (!['basic', 'precise', 'predicted'].includes(profile)) throw Error('Expected basic, precise or predicted driver');
if (!Number.isInteger(clientCount) || clientCount < (modeId === 'coop' ? 1 : 2) || clientCount > 8) throw Error('Invalid client count');
const server = startServer(0);
await new Promise<void>(r => server.wss.once('listening', r));
const address = server.wss.address(); if (!address || typeof address === 'string') throw Error('No listener');
const sockets: WebSocket[] = [], states: (StateMessage | undefined)[] = [], rosters: any[] = [];
const transports: Socket[] = [];
const models = Array.from({ length: clientCount }, (_, i) => new Battle(customMatch(mapId, modeId), 'hard', 'm4', seededRandom(i + 12)));
const random = models.map((_, i) => seededRandom(i + 12));
const modes = models.map(model => createMode(modeId, model.mission.deliveryBases));
const predictions = models.map(() => new Prediction());
const patrols = models.map(() => new SearchPatrol());
const deathEvents: { tick: number; targetId?: string; actorId?: string }[] = [];
const objectiveEvents: StateMessage['events'] = [];
const damageByTeam = [0, 0], protectedSourceDamageByTeam = [0, 0];
let damageSamples = 0, unresolvedDamageSamples = 0;
let eventCursor = 0;
const errors: string[] = [], rejected: { sequence: number; reason: string }[] = [], bytes = Array(clientCount).fill(0), commands = Array(clientCount).fill(0);
let peakLiveEnemies = 0;
let code = '', timer: ReturnType<typeof setInterval> | undefined;
const send = (i: number, data: object) => sockets[i].send(JSON.stringify({ protocol: 1, content: CONTENT_VERSION, ...data }));
const wait = async (condition: () => boolean, timeout = 6000) => {
  const end = performance.now() + timeout;
  while (!condition()) { if (performance.now() > end) throw Error('Network match timeout'); await new Promise(r => setTimeout(r, 10)); }
};
try {
  for (let i = 0; i < clientCount; i++) {
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}`); sockets.push(socket);
    socket.on('upgrade', response => { transports[i] = response.socket; });
    socket.on('message', raw => {
      bytes[i] += Buffer.byteLength(raw.toString()); const m = JSON.parse(raw.toString());
      if (m.type === 'probe') send(i, { type: 'probeReply', nonce: m.nonce });
      if (m.type === 'lobby') { code = m.room.id; rosters[i] = m.room; }
      if (m.type === 'state') {
        const snapshot = m as StateMessage, self = snapshot.state.actors.find(a => a.id === snapshot.actorId);
        if (self) {
          const diagnostic = combatDiagnostics[i], enemies = snapshot.state.actors.filter(a => a.team !== self.team && a.life.alive);
          diagnostic.visibleEnemySnapshots += Number(enemies.length > 0 && self.life.alive);
          diagnostic.aliveSnapshots += Number(self.life.alive);
          diagnostic.reloadSnapshots += Number(self.life.alive && self.reload > 0);
          diagnostic.emptyMagazineSnapshots += Number(self.life.alive && self.ammo === 0);
          diagnostic.observedShots += self.shots >= diagnostic.lastShots ? self.shots - diagnostic.lastShots : self.shots;
          diagnostic.lastShots = self.shots;
          if (self.life.deaths > diagnostic.lastDeaths) deathSnapshots.push({ client: i, tick: snapshot.state.frame,
            x: self.x, y: self.y, weapon: self.weapon, ammo: self.ammo, shots: self.shots,
            enemies: enemies.map(a => ({ id: a.id, x: a.x, y: a.y, health: a.life.health, protected: a.life.spawnProtectionFrames })) });
          diagnostic.lastDeaths = self.life.deaths;
        }
        const own = (m as StateMessage).state.actors.find(a => a.id === m.actorId)?.offhand;
        if (own?.equipped) {
          if (own.kind === 'melee') equipmentObservations[i].meleeSnapshots++;
          if (own.kind === 'shield') equipmentObservations[i].shieldSnapshots++;
          if (own.deployed) equipmentObservations[i].deployedSnapshots++;
        }
        states[i] = m; if (profile === 'predicted') predictions[i].accept(m);
        peakLiveEnemies = Math.max(peakLiveEnemies, m.state.actors.filter((a: any) => a.team === 2 && a.life.alive).length);
        if (i === 0) for (const event of m.events) if (event.id > eventCursor) {
          eventCursor = event.id;
          if (event.kind === 'death') deathEvents.push({ tick: event.tick, targetId: event.targetId, actorId: event.actorId });
          if (event.kind.startsWith('objective-')) objectiveEvents.push(event);
          if (event.kind === 'damage' && event.amount) {
            const source = m.state.actors.find((a: any) => a.id === event.actorId);
            damageSamples++;
            if (source) {
              damageByTeam[source.team - 1] += event.amount;
              if (source.life.spawnProtectionFrames > 0) protectedSourceDamageByTeam[source.team - 1] += event.amount;
            } else unresolvedDamageSamples++;
          }
        }
      }
      if (m.type === 'error') errors.push(m.message);
      if (m.type === 'rejected') rejected.push({ sequence: m.sequence, reason: m.reason });
    });
    await new Promise<void>(r => socket.once('open', r));
    send(i, i ? { type: 'join', code, name: `Agent ${i}` } : { type: 'create', name: 'Agent 0' });
    await wait(() => !!rosters[i]);
  }
  send(0, { type: 'configure', mapId, mode: modeId });
  await wait(() => rosters.every(r => r.mapId === mapId && r.mode === modeId));
  for (let i = 0; i < clientCount; i++) send(i, { type: 'equip', equipment: equipment[i] });
  for (let i = 0; i < clientCount; i++) send(i, { type: 'ready', ready: true });
  await wait(() => rosters[0].players.length === clientCount && rosters[0].players.every((p: any) => p.ready));
  send(0, { type: 'start' }); await wait(() => states.filter(Boolean).length === clientCount);
  bytes.fill(0); const wireStart = transports.map(socket => socket.bytesRead);
  const cpuStart = process.cpuUsage();
  const started = performance.now(); let sequence = 0, nextProgress = started + 15000;
  timer = setInterval(() => {
    const due = Math.floor((performance.now() - started) * 30 / 1000);
    while (sequence < due) {
      for (let i = 0; i < clientCount; i++) {
        const state = states[i]!; if (state.result) continue;
        const model = models[i]; model.frame = state.state.frame;
        model.scores = state.state.scores as [number, number]; model.objective = state.state.objective;
        if (state.state.deliveryTargets) modes[i].restore({ captureFrames: [0, 0], delivery: state.state.deliveryTargets });
        // Each driver only reads its received public snapshots. The authority
        // Battle is never read or mutated to aim, move, kill or finish a match.
        model.actors = state.state.actors.map(snapshot => {
          const actor: Actor = model.actors.find(a => a.id === snapshot.id) ?? {
            id: snapshot.id, name: snapshot.id, team: snapshot.team, human: snapshot.team === 1,
            movement: new OriginalMovement(model.wall), life: new OriginalLife(snapshot.maxHealth), arsenal: new Arsenal(snapshot.weapon),
            aim: { x: 0, y: 0 }, kills: 0, supplyReady: 0, kit: null, skillCooldown: 0, skillFrames: 0, itemCharges: 0, itemCooldown: 0,
            brain: { target: null, acquired: 0, offset: 0, lastX: snapshot.x, stuck: 0, state: 'advance' },
          };
          actor.team = snapshot.team;
          const pose = state.poses.find(p => p.id === actor.id)!;
          const kit = rosters[i].players.find((p: any) => p.name === pose.name)?.equipment as EquipmentLoadout | undefined;
          const primary = kit?.primary ?? (WEAPONS[snapshot.weapon].slot === 'primary' ? snapshot.weapon : 'm4');
          const secondary = kit?.secondary ?? (WEAPONS[snapshot.weapon].slot === 'secondary' ? snapshot.weapon : 'usp');
          if (actor.arsenal.primary !== primary || actor.arsenal.secondary !== (isSpecialOffhand(secondary) ? primary : secondary)) {
            actor.arsenal = new Arsenal(snapshot.weapon, primary, isSpecialOffhand(secondary) ? primary : secondary);
          }
          if (actor.life.deaths !== snapshot.life.deaths) { actor.brain.route = undefined; actor.arsenal = new Arsenal(snapshot.weapon, primary, isSpecialOffhand(secondary) ? primary : secondary); }
          Object.assign(actor.life, snapshot.life);
          Object.assign(actor.movement, { x: snapshot.x, y: snapshot.y, vx: snapshot.vx, vy: snapshot.vy,
            jumping: snapshot.jumping, crouching: snapshot.crouching });
          if (actor.id === state.actorId && state.movement) Object.assign(actor.movement, state.movement);
          if (profile === 'predicted' && actor.id === state.actorId && predictions[i].movement) Object.assign(actor.movement, predictions[i].movement!.checkpoint());
          actor.arsenal.selected = snapshot.weapon;
          actor.arsenal.gun.ammo = snapshot.ammo; actor.arsenal.gun.reserveAmmo = snapshot.reserve;
          actor.aim = pose.aim;
          const offhand = snapshot.offhand;
          actor.offhand = offhand ? OffhandController.restore({ kind: offhand.kind, selected: offhand.equipped,
            held: offhand.kind === 'shield' ? offhand.deployed : actor.id === state.actorId && heldFire[i],
            deployAge: offhand.deployed ? SHIELD_RULES.deployTicks : 0,
            shield: { durability: offhand.durability, deployed: offhand.deployed },
            melee: { age: offhand.age, facing: offhand.facing, serial: 0, hitIds: [] } }) : undefined;
          // Policy reconstruction only: public views do not contain authoritative hit history.
          actor.deliveryPreviousWeapon = state.state.deliveryTargets?.some(t => t.carrierId === actor.id) ? primary : undefined;
          return actor;
        });
        const actor = model.actors.find(a => a.id === state.actorId)!;
        const searching = modeId === 'coop' && !model.actors.some(a => a.team !== actor.team && a.life.alive);
        const searchTarget = searching ? patrols[i].target(actor.movement, model.frame, model.mission.navigation) : undefined;
        if (!searching || !actor.life.alive) patrols[i].reset();
        const mode = searchTarget ? { ...modes[i], botGoal: () => ({ destination: searchTarget, hold: false, stopToFight: false }) } : modes[i];
        const decision = actor.life.alive ? botInput({ actors: model.actors, frame: model.frame, mission: model.mission,
          difficulty: 'hard', mode, random: random[i], wall: model.wall, scores: model.scores, objective: model.objective }, actor)
          : { input: idleInput(), actions: [] };
        // Do not toggle again while the previous switch is still awaiting a snapshot acknowledgement.
        if (pendingSwap[i] > state.ack) decision.actions = decision.actions.filter(action => action !== 'swap');
        else if (decision.actions.includes('swap')) pendingSwap[i] = sequence;
        if (profile !== 'basic' && actor.life.alive && !actor.offhand?.equipped && !(actor.offhand && decision.actions.includes('swap'))) {
          const target = model.actors.filter(a => a.team !== actor.team && a.life.alive && !a.life.spawnProtectionFrames
            && Math.hypot(a.movement.x - actor.movement.x, a.movement.y - actor.movement.y) < 620
            && clearSight({ x: actor.movement.x, y: actor.movement.y - 42 }, { x: a.movement.x, y: a.movement.y - 33 }, model.wall))
            .sort((a, b) => Math.hypot(a.movement.x - actor.movement.x, a.movement.y - actor.movement.y)
              - Math.hypot(b.movement.x - actor.movement.x, b.movement.y - actor.movement.y))[0];
          decision.input.fire = !!target && (actor.arsenal.gun.weapon.automatic || sequence % 2 === 0);
          if (target) decision.input.aim = { x: target.movement.x, y: target.movement.y - (target.movement.crouching ? 35 : 52) };
          if (target && !actor.movement.jumping && Math.abs(target.movement.x - actor.movement.x) < 90
            && Math.abs(target.movement.y - actor.movement.y) < 55) {
            const direction = target.movement.x >= actor.movement.x ? -1 : 1;
            const nextX = actor.movement.x + direction * 24, feet = actor.movement.y;
            // A human can back away from muzzle overlap; never step off a platform to do so.
            if (nextX > 20 && nextX < model.mission.width - 20 && model.wall(nextX, feet + 8)
              && !model.wall(nextX, feet - 25)) {
              decision.input.left = direction < 0; decision.input.right = direction > 0; decision.input.crouch = false;
            }
          }
        }
        if (profile === 'predicted') predictions[i].input(sequence, decision.input);
        heldFire[i] = decision.input.fire;
        combatDiagnostics[i].fireCommands += Number(decision.input.fire);
        send(i, { type: 'input', roomId: code, round: state.round, command: { sequence, ...decision } }); commands[i]++;
      }
      sequence++;
    }
    if (performance.now() >= nextProgress) {
      console.log(JSON.stringify({ seconds: Math.round((performance.now() - started) / 1000), scores: states[0]!.state.scores,
        wave: states[0]!.state.waves?.wave, remaining: states[0]!.state.waves?.remaining, revives: states[0]!.state.waves?.revives,
        actors: states[0]!.state.actors.map(a => ({ id: a.id, x: a.x, y: a.y, alive: a.life.alive, health: a.life.health, ammo: a.ammo, deaths: a.life.deaths })) })); nextProgress += 15000;
    }
  }, 8);
  await wait(() => states.every(state => !!state?.result), (models[0].mission.seconds + 30) * 1000);
  clearInterval(timer); timer = undefined;
  const seconds = (performance.now() - started) / 1000, result = states[0]!.result;
  const consistent = states.every(state => JSON.stringify(state!.result) === JSON.stringify(result)
    && JSON.stringify(state!.state.scores) === JSON.stringify(states[0]!.state.scores));
  const outcome = result?.winner === 1 ? 'won' : result?.winner === 2 ? 'lost' : 'draw';
  const outcomeAccepted = expectedOutcome === 'any' || outcome === expectedOutcome;
  const equipmentAccepted = equipmentProfile !== 'mixed' ||
    (!equipment.some(e => e.secondary === 'knife') || equipmentObservations.some(e => e.meleeSnapshots > 0)) &&
    (!equipment.some(e => e.secondary === 'shield') || equipmentObservations.some(e => e.deployedSnapshots > 0));
  const report = { date: new Date().toISOString(), contentVersion: CONTENT_VERSION, mapId, modeId, clients: clientCount, profile, equipmentProfile, equipment, equipmentObservations, equipmentAccepted, expectedOutcome, outcomeAccepted, seconds, driver: 'snapshot-only scripted clients, loopback; no browser or physical-device claim',
    result, waves: states[0]!.state.waves, peakLiveEnemies, scores: states[0]!.state.scores, consistent, commands, rejected, errors, deathEvents, objectiveEvents,
    damageByTeam, protectedSourceDamageByTeam, damageSamples, unresolvedDamageSamples, combatDiagnostics, deathSnapshots,
    damageMeasurement: 'deduplicated public damage events; source protection sampled at receiving snapshot, not exact event tick; unresolved includes environment and removed actors',
    actors: states[0]!.state.actors.map(a => ({ id: a.id, kills: a.kills, deaths: a.life.deaths, currentLifeShots: a.shots })),
    kbPerSecond: bytes.map(n => n / seconds / 1000),
    wireKbPerSecond: transports.map((socket, i) => (socket.bytesRead - wireStart[i]) / seconds / 1000),
    wireMeasurement: 'received WebSocket frames on TCP stream; excludes TCP/IP headers and TLS',
    compression: sockets.map(socket => socket.extensions), processCpuMicros: process.cpuUsage(cpuStart),
    advanceMs: server.metrics() };
  mkdirSync('artifacts/qa', { recursive: true }); writeFileSync(`artifacts/qa/network-match-${mapId}-${modeId}-${clientCount}-${profile}-${CONTENT_VERSION}-${report.date.replace(/[:.]/g, '-')}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (!consistent || errors.length || rejected.some(r => r.reason !== 'match-ended') || !states[0]!.state.actors.some(a => a.kills > 0)) throw Error('Match acceptance failed');
  if (modeId === 'ctf' && !objectiveEvents.some(event => event.kind === 'objective-delivery')) throw Error('No natural delivery; report retained');
  if (!outcomeAccepted) throw Error(`Expected ${expectedOutcome}, received ${outcome}; report retained`);
  if (!equipmentAccepted) throw Error('Mixed loadout did not exercise equipped knife/deployed shield; report retained');
} finally { if (timer) clearInterval(timer); await server.close(); }
