import Phaser from 'phaser';
import { NetworkSession } from './client/session/NetworkSession';
import { preloadReferenceArt, ReferenceArt } from './game/campaign/ReferenceArt';
import { MAPS } from './shared/content/Maps';
import { mapPreviewSvg } from './client/presentation/MapPreview';
import { CoopRecords } from './client/session/CoopRecords';
import { radarSvg } from './client/presentation/Radar';
import { WEAPONS, SPECIAL_OFFHANDS } from './game/campaign/Catalog';
import type { OffhandView } from './shared/simulation/Offhand';
import './campaign.css';

function equipmentText(actor: { weapon: string; ammo: number; reserve: number; offhand?: OffhandView }) {
  const offhand = actor.offhand;
  if (offhand?.equipped && offhand.kind !== 'firearm') return offhand.kind === 'melee'
    ? `战术刀 · ${offhand.age < 0 ? '点击攻击' : '挥击中'}`
    : `防弹盾 ${Math.ceil(offhand.durability)}/120 · ${offhand.deployed ? '防御中' : '按住攻击部署'}`;
  return `${actor.weapon.toUpperCase()} ${actor.ammo} / ${actor.reserve}`;
}

export function startOnline() {
  document.body.innerHTML = `<main style="max-width:1120px;margin:24px auto"><h1>联机对战</h1><a href="/">返回单人游戏</a><div class="loadout"><label>服务器<input id="server" value="ws://43.142.165.82:4180"></label><label>昵称<input id="name" value="玩家" maxlength="24"></label><label>房间码<input id="code"></label><button id="create">创建房间</button><button id="join">加入房间</button><button id="reconnect">断线重连</button></div><p id="status">连接服务器后可创建或加入房间。</p><div id="lobby"></div><p id="online-hud" aria-live="off"></p><div id="online-game"></div><p>A/D移动 · 空格跳跃 · S蹲伏 · 鼠标射击 · Q切枪 · R换弹</p></main>`;
  const el = (id: string) => document.getElementById(id)!;
  el('online-game').style.position = 'relative';
  const radar = document.createElement('div'); radar.id = 'online-radar'; radar.hidden = true;
  radar.style.cssText = 'position:absolute;right:12px;top:12px;width:230px;max-width:30%;z-index:2;pointer-events:none';
  el('online-game').append(radar);
  let storage: Storage | undefined; try { storage = localStorage; } catch { /* Browsing without storage still works. */ }
  const records = new CoopRecords(storage);
  const history = document.createElement('details'); history.id = 'coop-history';
  document.querySelector('main')!.append(history);
  const renderHistory = () => {
    history.replaceChildren(); const title = document.createElement('summary'); title.textContent = '本机合作记录（最近50局）'; history.append(title);
    const note = document.createElement('p'); note.textContent = records.persistent ? '保存在当前浏览器，不计入战役军资或等级。' : '浏览器存储不可用，结果仅保留到此页面关闭。'; history.append(note);
    for (const record of records.list()) {
      const line = document.createElement('p');
      line.textContent = `${MAPS.find(m => m.id === record.mapId)?.name ?? record.mapId} · ${record.outcome === 'won' ? '合作胜利' : '合作失败'} · 第${record.wave}/${record.totalWaves}波 · 击杀${record.kills} · 阵亡${record.deaths} · ${Math.ceil(record.ticks / 30)}秒`;
      history.append(line);
    }
  };
  renderHistory();
  let network: NetworkSession | undefined, game: Phaser.Game | undefined;
  const connect = (create: boolean) => {
    network?.close(); game?.destroy(true); game = undefined;
    try { network = new NetworkSession((el('server') as HTMLInputElement).value); }
    catch { el('status').textContent = '服务器地址无效'; return; }
    const current = network;
    current.onError = message => { if (network === current) el('status').textContent = message; };
    let signature = '';
    current.onChange = () => {
      const room = current.room; if (!room) return;
      el('lobby').hidden = room.phase !== 'lobby' && !current.state?.result;
      radar.hidden = !current.state;
      if (current.state) radar.innerHTML = radarSvg(MAPS.find(m => m.id === current.state!.mapId)!.geometry,
        current.state, room.players.find(p => p.id === current.playerId)?.team ?? 1);
      if (current.socket.readyState === WebSocket.OPEN) el('status').textContent = `房间码 ${room.id} · ${room.players.length}/8`;
      if (room.phase === 'lobby' && game) { game.destroy(true); game = undefined; el('online-hud').textContent = ''; }
      const key = JSON.stringify(room);
      if (key !== signature) {
        signature = key;
        el('status').textContent = `房间码 ${room.id} · ${room.players.length}/8`;
        el('lobby').replaceChildren();
        for (const player of room.players) { const line = document.createElement('p'); line.textContent = `${player.team === 1 ? '蓝队' : '红队'} · ${player.name} · ${player.spectator ? '观战（下局参战）' : player.ready ? '已准备' : '未准备'}`; el('lobby').append(line); }
        if (room.phase === 'lobby') {
          const own = room.players.find(p => p.id === current.playerId);
          if (own) {
            const primary = document.createElement('select'); primary.id = 'online-primary'; primary.setAttribute('aria-label', '主武器');
            const secondary = document.createElement('select'); secondary.id = 'online-secondary'; secondary.setAttribute('aria-label', '副手');
            for (const [id, item] of Object.entries(WEAPONS)) {
              const option = document.createElement('option'); option.value = id; option.textContent = item.name;
              (item.slot === 'primary' ? primary : secondary).append(option);
            }
            for (const [id, item] of Object.entries(SPECIAL_OFFHANDS)) {
              const option = document.createElement('option'); option.value = id; option.textContent = item.name; secondary.append(option);
            }
            primary.value = own.equipment.primary; secondary.value = own.equipment.secondary;
            const equip = () => current.send({ type: 'equip', equipment: { primary: primary.value, secondary: secondary.value } });
            primary.onchange = equip; secondary.onchange = equip;
            const note = document.createElement('p'); note.textContent = '联机装备统一开放；更改配装后需重新准备。';
            el('lobby').append(note, primary, secondary);
          }
          const preview = document.createElement('div'); preview.id = 'online-map-preview';
          preview.innerHTML = mapPreviewSvg(MAPS.find(m => m.id === room.mapId)!); el('lobby').append(preview);
          const ready = document.createElement('button'); ready.textContent = '准备'; ready.id = 'online-ready'; ready.onclick = () => current.send({ type: 'ready', ready: true }); el('lobby').append(ready);
          if (room.hostId === current.playerId) {
            const maps = document.createElement('select'); maps.id = 'online-map';
            for (const map of MAPS) { const option = document.createElement('option'); option.value = map.id; option.textContent = map.name; maps.append(option); }
            maps.value = room.mapId;
            const mode = document.createElement('select'); mode.id = 'online-mode';
            for (const [id, name] of [['tdm', '团队交火'], ['dom', '据点争夺'], ['coop', '合作生存'], ['ctf', '公文包争夺']]) { const option = document.createElement('option'); option.value = id; option.textContent = name; mode.append(option); }
            mode.value = room.mode;
            for (const option of Array.from(mode.options)) {
              option.disabled = !MAPS.find(m => m.id === room.mapId)!.modes.includes(option.value as 'tdm' | 'dom' | 'coop');
              option.title = option.disabled ? '此地图尚未配置该模式的目标点' : '';
            }
            const configure = () => {
              const selected = MAPS.find(m => m.id === maps.value)!;
              if (!selected.modes.includes(mode.value as 'tdm' | 'dom' | 'coop')) mode.value = selected.modes[0];
              current.send({ type: 'configure', mapId: maps.value, mode: mode.value });
            };
            maps.onchange = configure; mode.onchange = configure; el('lobby').append(maps, mode);
          }
          if (room.hostId === current.playerId) { const start = document.createElement('button'); start.textContent = '开始对战'; start.id = 'online-start'; start.onclick = () => current.send({ type: 'start' }); el('lobby').append(start); }
        }
      }
      if (current.state && !game) {
        el('online-game').setAttribute('aria-busy', 'true');
        game = new Phaser.Game({ type: Phaser.AUTO, parent: 'online-game', width: 1120, height: 620,
          scale: { mode: Phaser.Scale.FIT }, scene: [new OnlineScene(current)] });
      }
      if (current.state) {
        const actor = current.state.state.actors.find(a => a.id === current.state!.actorId);
        if (actor) el('online-hud').textContent = `HP ${Math.ceil(actor.life.health)} · ${equipmentText(actor)}${current.state.state.waves ? '' : ` · ${current.state.state.scores.join(' : ')}`}`;
        else el('online-hud').textContent = `观战中 · Tab切换跟随角色 · ${current.state.state.scores.join(' : ')}`;
        if (current.state.state.waves) { const w = current.state.state.waves;
          el('online-hud').textContent += ` · 第${w.wave}/${w.scenario.waves.length}波 · 团队复活${w.revives} · ${w.spawnBlocked ? '增援入口受阻，请离开入口' : w.phase === 'intermission' ? '休整中' : '战斗中'}`; }
        if (current.state.mode === 'ctf') el('online-hud').textContent += ` · 公文包争夺：交付3次获胜 · ${current.state.state.deliveryTargets?.map(t => `${t.team === 1 ? '蓝' : '橙'}包${t.carrierId ? '携带中' : '在基地'}`).join(' / ')}`;
      }
      if (current.state?.result) {
        if (records.record(room.instanceId, current.state)) renderHistory();
        if (current.socket.readyState === WebSocket.OPEN) el('status').textContent = current.state.result.draw ? '平局' : `${current.state.result.winner === 1 ? '蓝队' : '红队'}获胜`;
        if (room.hostId === current.playerId && !document.getElementById('online-return')) {
          const back = document.createElement('button'); back.id = 'online-return'; back.textContent = '返回大厅'; back.onclick = () => current.send({ type: 'return' }); el('lobby').append(back);
        }
      }
    };
    current.send({ type: create ? 'create' : 'join', code: (el('code') as HTMLInputElement).value.trim(), name: (el('name') as HTMLInputElement).value });
  };
  el('reconnect').onclick = () => network?.reconnect();
  el('create').onclick = () => connect(true); el('join').onclick = () => connect(false);
}

class OnlineScene extends Phaser.Scene {
  private rig!: ReferenceArt;
  private graphics!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private keys = new Set<string>();
  private elapsed = 0;
  private spectateIndex = 0;
  constructor(private network: NetworkSession) { super('Online'); }
  preload() { preloadReferenceArt(this); }
  create() {
    if (document.getElementById('lobby')?.contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur();
    document.getElementById('online-game')?.setAttribute('aria-busy', 'false');
    this.input.on('pointerdown', () => (document.activeElement as HTMLElement)?.blur());
    const map = MAPS.find(m => m.id === this.network.state!.mapId)!.geometry;
    this.cameras.main.setBounds(0, 0, map.width, map.height ?? 700).setBackgroundColor(map.palette.sky);
    const background = this.add.graphics();
    for (const t of map.terrain) background.fillStyle(map.palette.wall).fillRect(t.x, t.y, t.width, t.height);
    if (map.artwork) { const a = map.artwork; this.add.image(a.x, a.y, `ref-${a.id}`).setOrigin(0).setDisplaySize(a.width, a.height); }
    this.rig = new ReferenceArt(this); this.graphics = this.add.graphics().setDepth(3);
    this.hud = this.add.text(16, 16, '', { fontSize: '18px', backgroundColor: '#10202dcc', padding: { x: 10, y: 10 } }).setScrollFactor(0).setDepth(10);
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.matches('input,button,select')) return;
      if (e.code === 'Tab' && !this.network.state?.actorId) { e.preventDefault(); if (!e.repeat) this.spectateIndex++; return; }
      if (e.code === 'Space') e.preventDefault(); this.keys.add(e.code);
      if (!e.repeat && e.code === 'KeyQ') this.network.action('swap');
      if (!e.repeat && e.code === 'KeyR') this.network.action('reload');
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => this.keys.clear();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    this.events.once('shutdown', () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); });
  }
  update(_time: number, delta: number) {
    const message = this.network.state; if (!message) return;
    const self = message.state.actors.find(a => a.id === message.actorId);
    const followed = self ?? message.state.actors[this.spectateIndex % message.state.actors.length];
    const predicted = self ? this.network.prediction.movement ?? self : followed && this.network.interpolation.position(followed, performance.now());
    if (predicted) this.cameras.main.centerOn(predicted.x, predicted.y - 150);
    const aim = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    this.elapsed += delta;
    if (self && this.elapsed >= 1000 / 30) {
      this.elapsed %= 1000 / 30;
      this.network.input({ left: this.keys.has('KeyA'), right: this.keys.has('KeyD'), crouch: this.keys.has('KeyS'), jump: this.keys.has('Space') || this.keys.has('KeyW'), fire: this.input.activePointer.isDown && document.hasFocus(), aim: { x: aim.x, y: aim.y } });
    }
    this.rig.begin(); this.graphics.clear();
    const positions = new Map<string, { x: number; y: number }>();
    for (const actor of message.state.actors) {
      const pose = message.poses.find(p => p.id === actor.id)!;
      const position = actor.id === message.actorId && predicted ? predicted : this.network.interpolation.position(actor, performance.now());
      positions.set(actor.id, position);
      this.rig.soldier(position.x, position.y, actor.crouching, actor.vx, actor.jumping, message.state.frame, pose.aim, actor.weapon, actor.team === 1 ? 0xb7e8de : 0xf1b0a0, actor.life.alive, actor.reload > 0, false, actor.offhand);
    }
    this.rig.delivery(message.state.deliveryTargets, positions, this.graphics);
    for (const effect of message.effects) if (message.state.frame - effect.frame < 3) this.graphics.lineStyle(2, 0xffe9ad).lineBetween(effect.trace.origin.x, effect.trace.origin.y, effect.trace.end.x, effect.trace.end.y);
    const wave = message.state.waves;
    const heading = wave ? `第${wave.wave}/${wave.scenario.waves.length}波 · 待增援${wave.remaining} · 团队复活${wave.revives} · ${wave.spawnBlocked ? '增援入口受阻，请离开入口' : wave.phase === 'intermission' ? '休整中' : '战斗中'}` : message.state.scores.join(' : ');
    this.hud.setText(`${message.mode === 'ctf' ? '公文包 · 先交付3次获胜 · ' : ''}${heading}  |  ${message.state.seconds}s\n${self ? `HP ${Math.ceil(self.life.health)}  ${equipmentText(self)}` : `观战：${message.poses.find(p => p.id === followed?.id)?.name ?? '等待角色'} · Tab切换`}`);
  }
}
