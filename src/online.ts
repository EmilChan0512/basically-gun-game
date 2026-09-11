import { renderOnlineArmory, renderOnlineLoadoutSummary } from './client/presentation/OnlineArmory';
import { starterEquipment } from './shared/content/OnlineProgress';
import type { EquipmentLoadout } from './shared/content/Equipment';
import Phaser from 'phaser';
import { NetworkSession } from './client/session/NetworkSession';
import { preloadReferenceArt, ReferenceArt } from './game/campaign/ReferenceArt';
import { MAPS } from './shared/content/Maps';
import { mapPreviewSvg } from './client/presentation/MapPreview';
import { CoopRecords } from './client/session/CoopRecords';
import { radarSvg } from './client/presentation/Radar';
import { SPECIAL_OFFHANDS, CLASSES, SKILLS, ITEMS, type SkillId, type ItemId } from './game/campaign/Catalog';
import type { OffhandView } from './shared/simulation/Offhand';
import './campaign.css';
import './client/presentation/OnlineArmory.css';
import { VisionOverlay } from './client/presentation/VisionOverlay';
import { CollisionWorld } from './shared/content/CollisionWorld';
import { NETWORK_TICK_MS } from './shared/protocol/Timing';
import { FireInput } from './client/session/FireInput';

function abilityText(actor: { skill?: SkillId | null; skillCooldown: number; skillFrames: number; item?: ItemId | null; itemCharges: number }) {
  return actor.skill ? `E ${SKILLS[actor.skill].name} · ${actor.skillFrames > 0 ? '生效中' : actor.skillCooldown > 0 ? (actor.skillCooldown / 30).toFixed(1) + 's' : '就绪'}${actor.item ? ` | G ${ITEMS[actor.item].name} ×${actor.itemCharges}` : ''}` : '';
}

function equipmentText(actor: { weapon: string; ammo: number; reserve: number; offhand?: OffhandView }) {
  const offhand = actor.offhand;
  if (offhand?.equipped && offhand.kind !== 'firearm') return offhand.kind === 'melee'
    ? `${SPECIAL_OFFHANDS[offhand.id ?? 'knife'].name} · ${offhand.age < 0 ? '点击攻击' : '挥击中'}`
    : `${SPECIAL_OFFHANDS[offhand.id ?? 'shield'].name} · ${offhand.deployed ? '防御中' : '按住攻击部署'}`;
  return `${actor.weapon.toUpperCase()} ${actor.ammo} / ${actor.reserve}`;
}

export function startOnline() {
  document.body.innerHTML = `<main class="online-app"><header class="online-header"><a class="online-brand" href="/"><span class="online-mark">S</span><span>PROJECT STRIKE<small>ONLINE OPERATIONS</small></span></a><nav aria-label="联机主导航"><a id="online-lobby-nav" href="#lobby">联机大厅</a><a id="online-armory-nav" href="#loadout">出战配装</a></nav><span id="online-profile-chip">游客档案</span></header><p id="status" role="status">连接服务器后可创建或加入房间。</p><div id="online-lobby-page"><div class="online-lobby-title"><p class="arsenal-eyebrow">MULTIPLAYER / BRIEFING</p><h1>联机大厅</h1><p>整备你的装备，和队友一起出发。</p></div><section id="online-account"><h2>联机账号</h2><p>联机进度保存在当前服务器，与本机单人存档独立。</p><div class="loadout" id="account-login"><label>账号<input id="account-name" autocomplete="username" maxlength="24"></label><label>密码<input id="account-password" type="password" autocomplete="current-password" minlength="8" maxlength="128"></label><button id="account-register">注册联机账号</button><button id="account-signin">登录</button></div><p id="account-status" role="status">普通联机需登录；公共调试房间可直接试玩。</p><button id="account-logout" hidden>退出账号</button><button id="online-leave" hidden>离开房间 / 返回配装</button></section><div id="online-loadout-brief"></div><section id="online-connection"><h2>加入行动</h2><div class="loadout"><label>服务器<input id="server" value="ws://43.142.165.82:4180"></label><label>调试昵称<input id="name" value="玩家" maxlength="24"></label><label>房间码<input id="code"></label></div><div class="online-room-actions"><button id="create">创建房间</button><button id="join">加入房间</button><button id="join-debug">加入公共调试房间</button><button id="reconnect">断线重连</button></div></section><div id="lobby"></div><p id="online-hud" aria-live="off"></p><div id="online-game"></div><p class="online-keys">A/D移动 · 空格跳跃 · S蹲伏 · 鼠标射击 · Q切枪 · R换弹 · E技能 · G道具</p></div><section id="online-preflight" hidden><div id="preflight-armory"></div></section></main>`;
  const el = (id: string) => document.getElementById(id)!;
  el('online-game').style.position = 'relative';
  const radar = document.createElement('div'); radar.id = 'online-radar'; radar.hidden = true;
  radar.style.cssText = 'position:absolute;right:12px;top:12px;width:230px;max-width:30%;z-index:2;pointer-events:none';
  el('online-game').append(radar);
  let storage: Storage | undefined; try { storage = localStorage; } catch { /* Browsing without storage still works. */ }
  const records = new CoopRecords(storage);
  const transportNote = document.createElement('p'); transportNote.id = 'account-transport';
  el('online-account').append(transportNote);
  const history = document.createElement('details'); history.id = 'coop-history';
  el('online-lobby-page').append(history);
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
  let serverUrl = '', profileSignature = '', draft: EquipmentLoadout = starterEquipment();
  const sessionKey = (url: string) => `strike-online-session:${url}`;
  const readToken = (url: string) => { try { return sessionStorage.getItem(sessionKey(url)); } catch { return null; } };
  const writeToken = (url: string, token: string) => { try { if (token) sessionStorage.setItem(sessionKey(url), token); else sessionStorage.removeItem(sessionKey(url)); } catch { /* Session remains usable in memory. */ } };
  let armorySignature = '';
  const canEdit = () => !network?.room || network.room.debug || network.room.phase === 'lobby';
  const currentEquipment = () => network?.room?.players.find(p => p.id === network?.playerId)?.equipment ?? draft;
  const renderPreflight = () => {
    const profile = network?.profile ?? null, room = network?.room;
    renderOnlineLoadoutSummary(el('online-loadout-brief'), currentEquipment());
    if (location.hash !== '#loadout' || !canEdit()) return;
    renderOnlineArmory(el('preflight-armory'), currentEquipment(), profile, !!room?.debug, equipment => {
      if (!canEdit()) return;
      if (room) network?.send({ type: 'equip', equipment });
      else { draft = equipment; if (network?.profile) network.send({ type: 'profileEquip', equipment }); renderPreflight(); }
    }, profile && !room ? (kind, id) => network?.send({ type: 'purchase', kind, id }) : undefined);
  };
  let viewSignature = '';
  const syncView = () => {
    const wantsArmory = location.hash === '#loadout';
    if (wantsArmory && !canEdit()) historyReplace('#lobby');
    const armory = location.hash === '#loadout';
    const nextView = `${armory}:${canEdit()}`;
    if (viewSignature === nextView) return;
    viewSignature = nextView;
    el('online-preflight').hidden = !armory; el('online-lobby-page').hidden = armory;
    el('online-lobby-nav').setAttribute('aria-current', armory ? 'false' : 'page');
    el('online-armory-nav').setAttribute('aria-current', armory ? 'page' : 'false');
    el('online-armory-nav').setAttribute('aria-disabled', String(!canEdit()));
    el('online-loadout-brief').hidden = !canEdit();
    document.body.classList.toggle('online-armory-open', armory);
    if (armory) renderPreflight();
    else el('preflight-armory').replaceChildren();
  };
  const historyReplace = (hash: string) => window.history.replaceState(null, '', hash);
  window.addEventListener('hashchange', () => {
    syncView(); network?.clearActions(); window.dispatchEvent(new Event('online-view-change'));
    window.scrollTo({ top: 0, behavior: 'instant' });
    const heading = el(location.hash === '#loadout' ? 'preflight-armory' : 'online-lobby-page').querySelector('h1');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  });
  el('online-armory-nav').onclick = event => { if (!canEdit()) event.preventDefault(); };
  renderPreflight(); syncView();
  const connect = () => {
    const url = (el('server') as HTMLInputElement).value.trim();
    if (network && serverUrl === url && network.socket.readyState <= WebSocket.OPEN) return network;
    network?.close(); game?.destroy(true); game = undefined; el('lobby').replaceChildren();
    serverUrl = url; profileSignature = '';
    try { network = new NetworkSession((el('server') as HTMLInputElement).value); }
    catch { el('status').textContent = '服务器地址无效'; return; }
    const current = network;
    current.onError = message => { if (network === current) { if (current.profile && !current.room) draft = current.profile.classes[current.profile.selected].equipment; renderPreflight(); el('status').textContent = message; if (!current.room) el('account-status').textContent = message; } };
    let signature = '';
    current.onChange = () => {
      if (network !== current) return;
      const profile = current.profile, room = current.room;
      transportNote.textContent = current.allowInsecureAccounts && serverUrl.startsWith('ws:')
        ? '当前为 WS 测试兼容模式，请使用独立测试密码。联机进度仍保存在服务器。' : '';
      syncView();
      el('online-profile-chip').textContent = profile ? `${profile.name} · ${profile.credits} 金币` : room?.debug ? '游客 · 调试模式' : '游客档案';
      el('online-leave').hidden = !room;
      el('account-login').hidden = !!profile;
      el('account-logout').hidden = !profile;
      for (const id of ['create', 'join', 'join-debug', 'server', 'account-signin', 'account-register']) (el(id) as HTMLButtonElement).disabled = !!room;
      if (profile) {
        if (!room && current.socket.readyState === WebSocket.OPEN) el('status').textContent = '联机账号已登录，请选择配装后创建或加入房间。';
        el('account-status').textContent = `${profile.name} · 金币 ${profile.credits} · 对局 ${profile.matches} · 胜利 ${profile.wins}`;
        if (current.authToken) writeToken(serverUrl, current.authToken);
      }
      const nextProfile = JSON.stringify(profile);
      if (nextProfile !== profileSignature) { profileSignature = nextProfile; if (profile) draft = profile.classes[profile.selected].equipment; }
      const nextArmory = JSON.stringify([currentEquipment(), profile, room?.id, room?.phase]);
      if (nextArmory !== armorySignature) { armorySignature = nextArmory; renderPreflight(); }
      if (!room) {
        if (game) { game.destroy(true); game = undefined; }
        el('lobby').replaceChildren(); el('online-hud').textContent = ''; radar.hidden = true; signature = '';
        return;
      }
      el('lobby').hidden = !room.debug && room.phase !== 'lobby' && !current.state?.result;
      radar.hidden = !current.state;
      if (current.state) radar.innerHTML = radarSvg(MAPS.find(m => m.id === current.state!.mapId)!.geometry,
        current.state, room.players.find(p => p.id === current.playerId)?.team ?? 1);
      if (current.socket.readyState === WebSocket.OPEN) el('status').textContent = `${room.debug ? '公共调试房间 · 无时限' : `房间码 ${room.id}`} · ${room.players.length}/8`;
      if (room.phase === 'lobby' && game) { game.destroy(true); game = undefined; el('online-hud').textContent = ''; }
      const key = JSON.stringify([room, current.profile]);
      if (key !== signature) {
        signature = key;
        el('status').textContent = `${room.debug ? '公共调试房间 · 无时限' : `房间码 ${room.id}`} · ${room.players.length}/8`;
        el('lobby').replaceChildren();
        for (const player of room.players) { const line = document.createElement('p'); line.textContent = `${player.team === 1 ? '蓝队' : '红队'} · ${player.name} · ${CLASSES[player.equipment.classId ?? 'medic'].name} · ${room.debug ? '调试中' : player.spectator ? '观战（下局参战）' : player.ready ? '已准备' : '未准备'}`; el('lobby').append(line); }
        if (room.phase === 'lobby' || room.debug) {
          if (!room.debug) {
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
      }
      if (current.state && !game) {
        el('online-game').setAttribute('aria-busy', 'true');
        game = new Phaser.Game({ type: Phaser.AUTO, parent: 'online-game', width: 1120, height: 620,
          scale: { mode: Phaser.Scale.FIT }, scene: [new OnlineScene(current)] });
      }
      if (current.state) {
        const actor = current.state.state.actors.find(a => a.id === current.state!.actorId);
        if (actor) el('online-hud').textContent = `HP ${Math.ceil(actor.life.health)} · ${equipmentText(actor)} · ${abilityText(actor)}${current.state.state.waves ? '' : ` · ${current.state.state.scores.join(' : ')}`}`;
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
    return current;
  };
  const enter = (action: 'create' | 'join' | 'joinDebug') => {
    const current = connect(); if (!current) return;
    if (action !== 'joinDebug' && !current.profile) { el('status').textContent = '请先注册或登录联机账号，然后选择出战配装。'; return; }
    historyReplace('#lobby'); syncView();
    current.send({ type: action, code: (el('code') as HTMLInputElement).value.trim(), name: (el('name') as HTMLInputElement).value, equipment: draft });
  };
  const authenticate = (mode: 'register' | 'login') => {
    const current = connect(); if (!current) return;
    el('status').textContent = '正在登录联机账号…';
    current.send({ type: 'auth', mode, name: (el('account-name') as HTMLInputElement).value, password: (el('account-password') as HTMLInputElement).value });
    (el('account-password') as HTMLInputElement).value = '';
  };
  el('account-register').onclick = () => authenticate('register');
  el('account-signin').onclick = () => authenticate('login');
  el('account-logout').onclick = () => {
    writeToken(serverUrl, ''); network?.send({ type: 'logout' }); network?.close(); network = undefined;
    game?.destroy(true); game = undefined; draft = starterEquipment(); profileSignature = '';
    el('account-login').hidden = false; el('account-logout').hidden = true; el('online-leave').hidden = true;
    historyReplace('#lobby'); syncView(); el('online-profile-chip').textContent = '游客档案'; el('lobby').replaceChildren(); el('online-hud').textContent = ''; radar.hidden = true;
    el('account-status').textContent = '已退出联机账号'; el('status').textContent = '请登录或加入公共调试房间。';
    for (const id of ['create', 'join', 'join-debug', 'server', 'account-signin', 'account-register']) (el(id) as HTMLButtonElement).disabled = false;
    renderPreflight();
  };
  el('online-leave').onclick = () => { network?.send({ type: 'leave' }); };
  el('join-debug').onclick = () => enter('joinDebug');
  el('reconnect').onclick = () => network?.reconnect();
  el('create').onclick = () => enter('create'); el('join').onclick = () => enter('join');
  const restore = () => {
    const url = (el('server') as HTMLInputElement).value.trim(), token = readToken(url);
    if (token) { const current = connect(); current?.send({ type: 'auth', mode: 'restore', token }); }
  };
  el('server').addEventListener('change', () => { if (serverUrl && serverUrl !== (el('server') as HTMLInputElement).value.trim()) {
    network?.close(); network = undefined; profileSignature = ''; draft = starterEquipment();
    el('account-login').hidden = false; el('account-logout').hidden = true; el('account-status').textContent = '请登录当前服务器的账号'; renderPreflight();
  } restore(); });
  restore();
}

class OnlineScene extends Phaser.Scene {
  private rig!: ReferenceArt;
  private graphics!: Phaser.GameObjects.Graphics;
  private hud!: Phaser.GameObjects.Text;
  private keys = new Set<string>();
  private elapsed = 0;
  private animationFrame = 0;
  private vision!: VisionOverlay;
  private fire = new FireInput();
  private spectateIndex = 0;
  constructor(private network: NetworkSession) { super('Online'); }
  preload() { preloadReferenceArt(this); }
  create() {
    if (document.getElementById('lobby')?.contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur();
    document.getElementById('online-game')?.setAttribute('aria-busy', 'false');
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      (document.activeElement as HTMLElement)?.blur();
      if (pointer.leftButtonDown()) this.fire.edge(true, performance.now());
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => { if (!pointer.leftButtonDown()) this.fire.edge(false, performance.now()); });
    const map = MAPS.find(m => m.id === this.network.state!.mapId)!.geometry;
    this.cameras.main.setBounds(0, 0, map.width, map.height ?? 700).setBackgroundColor(map.palette.sky);
    const background = this.add.graphics();
    for (const t of map.terrain) background.fillStyle(map.palette.wall).fillRect(t.x, t.y, t.width, t.height);
    if (map.artwork) { const a = map.artwork; this.add.image(a.x, a.y, `ref-${a.id}`).setOrigin(0).setDisplaySize(a.width, a.height); }
    this.vision = new VisionOverlay(this, new CollisionWorld(map.terrain, map.collisionMask).solid);
    this.add.text(16, 592, '共享视野 · 阴影内敌人不可见 · 开火或携包会暴露位置', { fontSize: '13px', color: '#d7e5ef', backgroundColor: '#10202dcc', padding: { x: 8, y: 4 } }).setScrollFactor(0).setDepth(10);
    this.rig = new ReferenceArt(this); this.graphics = this.add.graphics().setDepth(3);
    this.hud = this.add.text(16, 16, '', { fontSize: '18px', backgroundColor: '#10202dcc', padding: { x: 10, y: 10 } }).setScrollFactor(0).setDepth(10);
    const down = (e: KeyboardEvent) => {
      if (!document.getElementById('online-preflight')?.hidden || (e.target as HTMLElement)?.closest('input,button,select,a')) return;
      if (e.code === 'Tab' && !this.network.state?.actorId) { e.preventDefault(); if (!e.repeat) this.spectateIndex++; return; }
      if (e.code === 'Space') e.preventDefault(); this.keys.add(e.code);
      if (!e.repeat && e.code === 'KeyQ') this.network.action('swap');
      if (!e.repeat && e.code === 'KeyR') this.network.action('reload');
      if (!e.repeat && e.code === 'KeyE') this.network.action('skill');
      if (!e.repeat && e.code === 'KeyG') this.network.action('item');
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => { this.keys.clear(); this.fire.clear(); this.network.clearActions(); };
    const viewChanged = () => { blur(); if (document.getElementById('online-preflight')?.hidden) this.scale.refresh(); };
    const focus = (event: FocusEvent) => { if ((event.target as HTMLElement)?.closest('#lobby, #online-account, #online-preflight')) blur(); };
    window.addEventListener('focusin', focus);
    window.addEventListener('online-view-change', viewChanged);
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    this.events.once('shutdown', () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); window.removeEventListener('focusin', focus); window.removeEventListener('online-view-change', viewChanged); });
  }
  update(_time: number, delta: number) {
    const message = this.network.state; if (!message) return;
    const self = message.state.actors.find(a => a.id === message.actorId);
    const followed = self ?? message.state.actors[this.spectateIndex % message.state.actors.length];
    const now = performance.now();
    const editing = !document.getElementById('online-preflight')?.hidden;
    // A hidden canvas has no usable pointer transform. Keep the authoritative
    // aim while browsing equipment and send neutral input to stop movement.
    const pointerAim = editing ? undefined
      : this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const aim = pointerAim && Number.isFinite(pointerAim.x) && Number.isFinite(pointerAim.y) ? pointerAim
      : message.poses.find(p => p.id === message.actorId)?.aim ?? { x: 0, y: 0 };
    this.elapsed += Math.min(delta, 100);
    this.animationFrame += Math.min(delta, 100) / NETWORK_TICK_MS;
    while (this.elapsed >= NETWORK_TICK_MS) {
      this.elapsed -= NETWORK_TICK_MS;
      if (editing) { this.keys.clear(); this.fire.clear(); this.network.clearActions(); }
      if (self) this.network.input({ left: this.keys.has('KeyA'), right: this.keys.has('KeyD'), crouch: this.keys.has('KeyS'), jump: this.keys.has('Space') || this.keys.has('KeyW'), fire: !editing && document.hasFocus() && this.fire.sample(this.input.activePointer.leftButtonDown(), now), aim: { x: aim.x, y: aim.y } });
    }
    // Take an immutable render position AFTER input. Camera, sprite and vision
    // must all consume the same position within this render frame.
    const renderAlpha = message.result || this.network.socket.readyState !== WebSocket.OPEN
      || now - this.network.lastStateAt > 500 || this.network.socket.bufferedAmount > 8192 ? 1 : this.elapsed / NETWORK_TICK_MS;
    const predicted = self ? this.network.prediction.position(renderAlpha, delta) ?? self
      : followed && this.network.interpolation.position(followed, now);
    if (predicted) this.cameras.main.centerOn(predicted.x, predicted.y - 150);
    this.rig.begin(); this.graphics.clear();
    const positions = new Map<string, { x: number; y: number }>();
    for (const actor of message.state.actors) {
      const pose = message.poses.find(p => p.id === actor.id)!;
      const position = actor.id === message.actorId && predicted ? predicted : this.network.interpolation.position(actor, now);
      positions.set(actor.id, position);
      const motion = actor.id === message.actorId ? this.network.prediction.movement ?? actor : actor;
      this.rig.soldier(position.x, position.y, motion.crouching, motion.vx, motion.jumping, this.animationFrame, actor.id === message.actorId ? aim : pose.aim, actor.weapon, actor.team === 1 ? 0xb7e8de : 0xf1b0a0, actor.life.alive, actor.reload, this.network.shots.visible(now).some(e => !e.reflected && e.actorId === actor.id), actor.offhand, actor.classId ?? 'medic', actor.id);
    }
    this.rig.delivery(message.state.deliveryTargets, positions, this.graphics);
    for (const effect of this.network.shots.visible(now)) this.rig.tracer(this.graphics, effect.trace, effect.reflected ? undefined : effect.actorId, Math.max(0, message.state.frame - effect.frame), message.state.actors.find(a => a.id === effect.actorId)?.weapon);
    const team = this.network.room?.players.find(p => p.id === this.network.playerId)?.team ?? self?.team ?? 1;
    this.vision.draw(message.state.actors.filter(a => a.team === team && a.life.alive)
      .map(a => ({ id: a.id, ...(positions.get(a.id) ?? a) })));
    const wave = message.state.waves;
    const heading = wave ? `第${wave.wave}/${wave.scenario.waves.length}波 · 待增援${wave.remaining} · 团队复活${wave.revives} · ${wave.spawnBlocked ? '增援入口受阻，请离开入口' : wave.phase === 'intermission' ? '休整中' : '战斗中'}` : message.state.scores.join(' : ');
    this.hud.setText(`${message.mode === 'ctf' ? '公文包 · 先交付3次获胜 · ' : ''}${heading}  |  ${this.network.room?.debug ? '公共调试 · 无时限' : `${message.state.seconds}s`}\n${self ? `HP ${Math.ceil(self.life.health)}  ${equipmentText(self)}\n${abilityText(self)}` : `观战：${message.poses.find(p => p.id === followed?.id)?.name ?? '等待角色'} · Tab切换`}`);
    if (now - this.network.lastStateAt > 500) this.hud.setText(this.hud.text + '\n网络停顿，等待服务器更新…');
  }
}
