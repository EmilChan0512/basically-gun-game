import { preloadAtrium, drawAtrium } from './client/presentation/AtriumView';
import { defaultGrowthLoadoutV3 as defaultGrowthLoadout } from './shared/content/growth-v3/Loadout';
import { GROWTH_V3_ABILITIES, type GrowthAbilityId } from './shared/content/growth-v3/Operators';
import { GROWTH_V3_GADGETS, type GrowthGadgetId } from './shared/content/growth-v3/Gadgets';
import { GrowthCareerPanel } from './client/presentation/GrowthCareerPanel';
import { GROWTH_CLASSES, type GrowthClassId } from './shared/content/GrowthCatalog';
import { GrowthPanel } from './client/presentation/GrowthPanel';
import './client/presentation/GrowthMatchView.css';
import { renderOnlineArmory, renderOnlineLoadoutSummary } from './client/presentation/OnlineArmory';
import { starterEquipment } from './shared/content/OnlineProgress';
import type { EquipmentLoadout } from './shared/content/Equipment';
import Phaser from 'phaser';
import { gameAudio } from './client/audio/AudioService';
import { AudioPresentation } from './client/audio/AudioPresentation';
import { NetworkSession } from './client/session/NetworkSession';
import type { BattlePresentationSession } from './client/session/BattlePresentationSession';
import { preloadReferenceArt, ReferenceArt } from './game/campaign/ReferenceArt';
import { MAPS } from './shared/content/Maps';
import { mapPreviewSvg } from './client/presentation/MapPreview';
import { CoopRecords } from './client/session/CoopRecords';
import { radarSvg } from './client/presentation/Radar';
import { SPECIAL_OFFHANDS, CLASSES, ITEMS, type SkillId, type ItemId } from './game/campaign/Catalog';
import type { OffhandView } from './shared/simulation/Offhand';
import './campaign.css';
import './client/presentation/OnlineArmory.css';
import './client/presentation/FutureUI.css';
import { operatorConcept } from './client/presentation/UIArt';
import { VisionOverlay } from './client/presentation/VisionOverlay';
import { CollisionWorld } from './shared/content/CollisionWorld';
import { NETWORK_TICK_MS } from './shared/protocol/Timing';
import { FireInput } from './client/session/FireInput';
import { skillStatus } from './client/presentation/SkillStatus';
import { isConcealed } from './shared/simulation/Stealth';
import { CombatFeedback } from './client/presentation/CombatFeedback';
import { CombatFeedbackView } from './client/presentation/CombatFeedbackView';
import { BattleHUD } from './client/presentation/BattleHUD';
import { combatMotion, installCombatMotionControl } from './client/presentation/CombatMotion';
import { GROWTH_V3_PRESETS } from './shared/content/growth-v3/Presets';
import { drawGrowthWorld, drawGrowthAbilities } from './client/presentation/GrowthWorldView';
import { GROWTH_V3_WEAPONS, type GrowthWeaponId } from './shared/content/growth-v3/Weapons';

function abilityText(actor: { growthV3?: { abilityId: GrowthAbilityId; gadgetId: GrowthGadgetId }; growth?: { classId: GrowthClassId }; classId?: string | null; stealthFrames?: number; skill?: SkillId | null; skillCooldown: number; skillFrames: number; item?: ItemId | null; itemCharges: number; life?: { alive: boolean } }, charge?: { armed: boolean }) {
  if (actor.growthV3) return 'E ' + GROWTH_V3_ABILITIES[actor.growthV3.abilityId].name + ' · ' + (actor.skillFrames ? '生效中' : actor.skillCooldown ? Math.ceil(actor.skillCooldown / 30) + '秒' : '就绪') + ' | G ' + GROWTH_V3_GADGETS[actor.growthV3.gadgetId].name + ' ×' + actor.itemCharges + (charge ? actor.life?.alive === false ? ' · 已部署，复活后可引爆' : charge.armed ? ' · 按 G 引爆' : ' · 武装中' : actor.itemCharges === 0 ? ' · 本局已用尽' : '');
  if (actor.growth) return `E ${GROWTH_CLASSES[actor.growth.classId].ability} · ${actor.skillFrames ? `生效中（${Math.ceil(actor.skillFrames / 30)}秒）` : actor.skillCooldown ? Math.ceil(actor.skillCooldown / 30) + '秒' : '就绪'} | G 手雷 ×${actor.itemCharges}`;
  return skillStatus(actor) + (actor.item ? ` | G ${ITEMS[actor.item].name} ×${actor.itemCharges}` : '');
}

function equipmentText(actor: { weapon: string; ammo: number; reserve: number; offhand?: OffhandView; growthV3?: { weaponId: GrowthWeaponId } }) {
  const offhand = actor.offhand;
  if (offhand?.equipped && offhand.kind !== 'firearm') return offhand.kind === 'melee'
    ? `${SPECIAL_OFFHANDS[offhand.id ?? 'knife'].name} · ${offhand.age < 0 ? '点击攻击' : '挥击中'}`
    : `${SPECIAL_OFFHANDS[offhand.id ?? 'shield'].name} · ${offhand.deployed ? '防御中' : '按住攻击部署'}`;
  return `${actor.growthV3 ? GROWTH_V3_WEAPONS[actor.growthV3.weaponId].name : actor.weapon.toUpperCase()} ${actor.ammo} / ${actor.reserve}`;
}

export function startOnline() {
  document.body.innerHTML = `<main class="online-app"><header class="online-header"><a class="online-brand" href="/"><span class="online-mark">S</span><span>PROJECT STRIKE<small>ONLINE OPERATIONS</small></span></a><nav aria-label="联机主导航"><a id="online-lobby-nav" href="#lobby">联机大厅</a><a href="/?offline">单机免登录</a><a href="/?lab">成长实验室</a><a id="online-armory-nav" href="#loadout">出战配装</a></nav><span id="online-profile-chip">游客档案</span></header><p id="status" role="status">连接服务器后可创建或加入房间。</p><div id="online-lobby-page"><div class="online-lobby-title"><p class="arsenal-eyebrow">MULTIPLAYER / BRIEFING</p><h1>联机大厅</h1><p>整备你的装备，和队友一起出发。</p></div><section id="online-account"><h2>联机账号</h2><p>账号等级、金币和装备权益由服务器保存。单机可免登录，离线进度不计入联网资产。</p><div class="loadout" id="account-login"><label>账号<input id="account-name" autocomplete="username" maxlength="24"></label><label>密码<input id="account-password" type="password" autocomplete="current-password" minlength="8" maxlength="128"></label><button id="account-register">注册联机账号</button><button id="account-signin">登录</button></div><p id="account-status" role="status">普通联机需登录；公共调试房间可直接试玩。</p><button id="account-logout" hidden>退出账号</button><button id="online-leave" hidden>离开房间 / 返回配装</button></section><div id="online-loadout-brief"></div><section id="online-connection"><h2>加入行动</h2><div class="loadout"><label>服务器<input id="server" value="ws://43.142.165.82:4180"></label><label>调试昵称<input id="name" value="玩家" maxlength="24"></label><label>房间码<input id="code"></label></div><div class="online-room-actions"><button id="create">创建房间</button><button id="create-growth">创建成长对战房间</button><button id="join">加入房间</button><button id="join-debug">加入公共调试房间</button><button id="reconnect">断线重连</button></div></section><div id="lobby"></div><div id="growth-session-controls" hidden><button id="growth-leave">离开成长房间</button><button id="growth-reconnect">断线重连</button></div><p id="online-hud" aria-live="off"></p><div id="online-game" hidden><section id="growth-panel" hidden aria-label="局内成长"></section></div><p class="online-keys">A/D移动 · 空格跳跃 · S蹲伏 · 鼠标射击 · Q切枪 · R换弹 · E技能 · G道具</p></div><section id="online-preflight" hidden><div class="armory-rule-tabs" aria-label="配装规则"><button id="armory-rule-growth" aria-pressed="true">成长对战</button><button id="armory-rule-classic" aria-pressed="false">经典配装 · 装备与技能</button></div><p id="growth-armory-login" hidden>登录后可配置成长职业、武器、技能与成长池。<a href="#lobby">前往大厅登录 →</a></p><div id="growth-career-section" hidden><div id="growth-career-content"></div></div><div id="preflight-armory"></div></section></main>`;
  const el = (id: string) => document.getElementById(id)!;
  installCombatMotionControl(el('growth-session-controls'));
  if (import.meta.env.DEV && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) {
    (el('server') as HTMLInputElement).value = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.hostname}:4180`;
  } else if (!['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) || location.port === '4180') {
    (el('server') as HTMLInputElement).value = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  }
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
  const growthCareer = new GrowthCareerPanel(el('growth-career-content'), message => network?.send(message));
  const growthPanel = new GrowthPanel(el('growth-panel'), message => network?.send(message));
  let serverUrl = '', profileSignature = '', draft: EquipmentLoadout = starterEquipment();
  const sessionKey = (url: string) => `strike-online-session:${url}`;
  const readToken = (url: string) => { try { return sessionStorage.getItem(sessionKey(url)); } catch { return null; } };
  const writeToken = (url: string, token: string) => { try { if (token) sessionStorage.setItem(sessionKey(url), token); else sessionStorage.removeItem(sessionKey(url)); } catch { /* Session remains usable in memory. */ } };
  let armorySignature = '';
  let armoryRule: 'growth' | 'classic' = 'growth';
  const canEdit = () => !network?.room || network.room.debug || network.room.phase === 'lobby';
  const growthRoom = () => network?.room?.rules === 'growth' ? { id: network.room.id, loadout: network.growthLoadout ?? defaultGrowthLoadout() } : undefined;
  const currentEquipment = () => network?.room?.players.find(p => p.id === network?.playerId)?.equipment ?? draft;
  const renderPreflight = () => {
    const profile = network?.profile ?? null, room = network?.room;
    renderOnlineLoadoutSummary(el('online-loadout-brief'), currentEquipment());
    if (armoryRule === 'growth' && profile?.growth) {
      const build = growthRoom()?.loadout ?? profile.growth.loadouts[profile.growth.selectedSlot], definition = GROWTH_CLASSES[build.classId];
      el('online-loadout-brief').innerHTML = `<div class="loadout-brief"><img src="${operatorConcept(build.classId)}" alt=""><div><small>成长对战 · 当前出战配装</small><strong>${definition.name}</strong><p>${build.primary.toUpperCase()} · ${GROWTH_V3_ABILITIES[build.abilityId].name} · ${GROWTH_V3_GADGETS[build.gadgetId].name} · ${build.perks?.length ?? 3}个 Perk · ${build.pool?.length ?? 8}张成长池</p></div><a href="#loadout" class="loadout-edit">编辑配装 →</a></div>`;
    }
    if (location.hash !== '#loadout' || !canEdit()) return;
    el('preflight-armory').hidden = armoryRule !== 'classic';
    el('growth-career-section').hidden = armoryRule !== 'growth' || !profile;
    el('growth-armory-login').hidden = armoryRule !== 'growth' || !!profile;
    el('armory-rule-growth').setAttribute('aria-pressed', String(armoryRule === 'growth'));
    el('armory-rule-classic').setAttribute('aria-pressed', String(armoryRule === 'classic'));
    growthCareer.render(profile?.growth, armoryRule !== 'growth', growthRoom());
    if (armoryRule === 'growth') return;
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
    const heading = el(location.hash === '#loadout' ? 'online-preflight' : 'online-lobby-page').querySelector('h1');
    if (heading) { heading.tabIndex = -1; heading.focus({ preventScroll: true }); }
  });
  el('online-armory-nav').onclick = event => { if (!canEdit()) event.preventDefault(); };
  for (const rule of ['growth', 'classic'] as const) el(`armory-rule-${rule}`).onclick = () => { armoryRule = rule; renderPreflight(); };
  renderPreflight(); syncView();
  const connect = () => {
    const url = (el('server') as HTMLInputElement).value.trim();
    if (network && serverUrl === url && network.socket.readyState <= WebSocket.OPEN) return network;
    network?.close(); game?.destroy(true); game = undefined; el('lobby').replaceChildren();
    serverUrl = url; profileSignature = '';
    try { network = new NetworkSession((el('server') as HTMLInputElement).value); }
    catch { el('status').textContent = '服务器地址无效'; return; }
    const current = network;
    current.onGrowthSaved = () => { if (network === current) growthCareer.saved(); };
    current.onError = message => { if (network === current) { growthCareer.failed(message); growthPanel.requestFailed(); gameAudio.cue('error'); if (current.profile && !current.room) draft = current.profile.classes[current.profile.selected].equipment; renderPreflight(); el('status').textContent = message; if (!current.room) el('account-status').textContent = message; } };
    let signature = '';
    current.onChange = () => {
      if (network !== current) return;
      const profile = current.profile, room = current.room;
      growthPanel.render(room ? current.state : null);
      el('online-game').hidden = !room || !current.state;
      if (room) armoryRule = room.rules === 'growth' ? 'growth' : 'classic';
      (el('armory-rule-growth') as HTMLButtonElement).disabled = !!room;
      (el('armory-rule-classic') as HTMLButtonElement).disabled = !!room;
      el('growth-career-section').hidden = !profile || armoryRule !== 'growth';
      growthCareer.render(profile?.growth, !canEdit() || armoryRule !== 'growth', growthRoom());
      const growthPlaying = room?.rules === 'growth' && room.phase === 'playing';
      document.body.classList.toggle('growth-playing', growthPlaying);
      const matchPlaying = !!room && !!current.state && room.phase === 'playing';
      document.body.classList.toggle('online-match-playing', matchPlaying);
      document.body.classList.toggle('online-debug-playing', matchPlaying && !!room?.debug);
      document.body.classList.toggle('online-match-result', matchPlaying && !!current.state?.result);
      el('growth-session-controls').hidden = !matchPlaying && !growthPlaying;
      if (!current.state?.result || room?.hostId !== current.playerId) document.getElementById('online-return')?.remove();
      el('growth-leave').textContent = growthPlaying ? '离开成长房间' : '离开对局 / 返回大厅';
      transportNote.textContent = current.allowInsecureAccounts && serverUrl.startsWith('ws:')
        ? '当前为 WS 测试兼容模式，请使用独立测试密码。联机进度仍保存在服务器。' : '';
      syncView();
      el('online-profile-chip').textContent = profile ? `${profile.name} · ${profile.credits} 金币` : room?.debug ? '游客 · 调试模式' : '游客档案';
      el('online-leave').hidden = !room;
      el('account-login').hidden = !!profile;
      el('account-logout').hidden = !profile;
      for (const id of ['create', 'create-growth', 'join', 'join-debug', 'server', 'account-signin', 'account-register']) (el(id) as HTMLButtonElement).disabled = !!room;
      if (profile) {
        if (!room && current.socket.readyState === WebSocket.OPEN) el('status').textContent = '联机账号已登录，请选择配装后创建或加入房间。';
        el('account-status').textContent = `${profile.name} · 金币 ${profile.credits} · 对局 ${profile.matches} · 胜利 ${profile.wins}`;
        if (current.authToken) writeToken(serverUrl, current.authToken);
      }
      const nextProfile = JSON.stringify(profile);
      if (nextProfile !== profileSignature) { profileSignature = nextProfile; if (profile) draft = profile.classes[profile.selected].equipment; }
      const nextArmory = JSON.stringify([currentEquipment(), current.growthLoadout, profile, room?.id, room?.phase]);
      if (nextArmory !== armorySignature) { armorySignature = nextArmory; renderPreflight(); }
      if (!room) {
        if (game) { game.destroy(true); game = undefined; }
        el('lobby').replaceChildren(); el('lobby').hidden = false; el('online-hud').textContent = ''; radar.hidden = true; signature = '';
        el('online-game').querySelectorAll('.tactical-hud, .combat-feedback').forEach(node => node.remove());
        el('audio-subtitle').hidden = true;
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
        for (const player of room.players) { const line = document.createElement('p'); line.textContent = `${player.team === 1 ? '蓝队' : '红队'} · ${player.name} · ${room.rules === 'growth' ? `${GROWTH_CLASSES[player.growthLoadout?.classId ?? 'assault'].name} · 成长对战` : CLASSES[player.equipment.classId ?? 'medic'].name} · ${room.debug ? '调试中' : player.spectator ? '观战（下局参战）' : player.ready ? '已准备' : '未准备'}`; el('lobby').append(line); }
        if (room.phase === 'lobby' || room.debug) {
          if (!room.debug) {
            if (room.rules === 'growth') {
              const edit = document.createElement('a'); edit.id = 'growth-room-armory'; edit.href = '#loadout'; edit.textContent = '出战配装 → 职业、武器、技能与成长池'; el('lobby').append(edit);
              const note = document.createElement('p'); note.id = 'growth-solo-note'; note.textContent = '可单人直接点击开始试玩，自动准备并添加一名训练机器人；多人开局使用真人队伍。战斗中加入先观战，下局参战。'; note.textContent += ' 当前预设：' + GROWTH_V3_PRESETS[room.growthPreset ?? 'standard'].name; el('lobby').append(note); }
            const preview = document.createElement('div'); preview.id = 'online-map-preview';
            preview.innerHTML = mapPreviewSvg(MAPS.find(m => m.id === room.mapId)!); el('lobby').append(preview);
            const ready = document.createElement('button'); ready.textContent = '准备'; ready.id = 'online-ready'; ready.onclick = () => current.send({ type: 'ready', ready: true }); el('lobby').append(ready);
            if (room.hostId === current.playerId) {
              const maps = document.createElement('select'); maps.id = 'online-map';
              for (const map of MAPS) { const option = document.createElement('option'); option.value = map.id; option.textContent = map.name; maps.append(option); }
              maps.value = room.mapId;
              const preset = document.createElement('select');preset.id='growth-match-preset';preset.setAttribute('aria-label','成长对局时长');
              for(const [id,def] of Object.entries(GROWTH_V3_PRESETS)){const option=document.createElement('option');option.value=id;option.textContent=def.name+' · 第'+def.ultimateTick/1800+'分钟觉醒';preset.append(option);}
              preset.value=room.growthPreset??'standard';
              const mode = document.createElement('select'); mode.id = 'online-mode';
              for (const [id, name] of [['tdm', '团队交火'], ['dom', '据点争夺'], ['coop', '合作生存'], ['ctf', '公文包争夺']]) { const option = document.createElement('option'); option.value = id; option.textContent = name; mode.append(option); }
              mode.value = room.mode;
              for (const option of Array.from(mode.options)) {
                option.disabled = room.rules === 'growth' && !['tdm', 'dom'].includes(option.value) || !MAPS.find(m => m.id === room.mapId)!.modes.includes(option.value as 'tdm' | 'dom' | 'coop');
                option.title = option.disabled ? '此地图尚未配置该模式的目标点' : '';
              }
              const configure = () => {
                const selected = MAPS.find(m => m.id === maps.value)!;
                if (!selected.modes.includes(mode.value as 'tdm' | 'dom' | 'coop')) mode.value = selected.modes[0];
                current.send({ type: 'configure', mapId: maps.value, mode: mode.value, ...(room.rules==='growth'?{growthPreset:preset.value}:{}) });
              };
              maps.onchange = configure; mode.onchange = configure; el('lobby').append(maps, mode);
              if(room.rules==='growth'){preset.onchange=configure;el('lobby').append(preset);}
            }
            if (room.hostId === current.playerId) {
              const soloGrowth = room.rules === 'growth' && room.players.length === 1;
              const start = document.createElement('button'); start.textContent = soloGrowth ? '开始单人试玩（对战机器人）' : '开始对战'; start.id = 'online-start';
              start.onclick = () => {
                if (soloGrowth) current.send({ type: 'ready', ready: true });
                current.send({ type: 'start' });
              };
              el('lobby').append(start);
            }
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
        if (actor) el('online-hud').textContent = `HP ${Math.ceil(actor.life.health)} · ${equipmentText(actor)} · ${abilityText(actor, current.state.state.growthWorld?.entities.find(e => e.gadgetId === 'as_charge' && e.sourceId === actor.id))}${current.state.state.waves ? '' : ` · ${current.state.state.scores.join(' : ')}`}`;
        else el('online-hud').textContent = `观战中 · Tab切换跟随角色 · ${current.state.state.scores.join(' : ')}`;
        if (current.state.growth && current.state.growth.momentumUntil > current.state.state.frame) el('online-hud').textContent += ' · 乘胜加速中';
        if (current.state.state.waves) { const w = current.state.state.waves;
          el('online-hud').textContent += ` · 第${w.wave}/${w.scenario.waves.length}波 · 团队复活${w.revives} · ${w.spawnBlocked ? '增援入口受阻，请离开入口' : w.phase === 'intermission' ? '休整中' : '战斗中'}`; }
        if (current.state.mode === 'ctf') el('online-hud').textContent += ` · 公文包争夺：交付3次获胜 · ${current.state.state.deliveryTargets?.map(t => `${t.team === 1 ? '蓝' : '橙'}包${t.carrierId ? '携带中' : '在基地'}`).join(' / ')}`;
      }
      if (current.state?.result) {
        if (records.record(room.instanceId, current.state)) renderHistory();
        if (current.socket.readyState === WebSocket.OPEN) el('status').textContent = current.state.result.draw ? '平局' : `${current.state.result.winner === 1 ? '蓝队' : '红队'}获胜`;
        if (room.hostId === current.playerId && !document.getElementById('online-return')) {
          const back = document.createElement('button'); back.id = 'online-return'; back.textContent = '返回大厅'; back.onclick = () => current.send({ type: 'return' }); el('growth-session-controls').append(back);
        }
      }
    };
    return current;
  };
  const enter = (action: 'create' | 'join' | 'joinDebug', rules: 'classic' | 'growth' = 'classic') => {
    const current = connect(); if (!current) return;
    if (action !== 'joinDebug' && !current.profile) { el('status').textContent = '请先注册或登录联机账号，然后选择出战配装。'; return; }
    historyReplace('#lobby'); syncView();
    current.send({ type: action, rules, code: (el('code') as HTMLInputElement).value.trim(), name: (el('name') as HTMLInputElement).value, equipment: draft });
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
    game?.destroy(true); game = undefined; growthPanel.render(null); draft = starterEquipment(); profileSignature = '';
    el('growth-career-section').hidden = true;
    el('account-login').hidden = false; el('account-logout').hidden = true; el('online-leave').hidden = true;
    historyReplace('#lobby'); syncView(); el('online-profile-chip').textContent = '游客档案'; el('lobby').replaceChildren(); el('online-hud').textContent = ''; radar.hidden = true;
    el('account-status').textContent = '已退出联机账号'; el('status').textContent = '请登录或加入公共调试房间。';
    for (const id of ['create', 'create-growth', 'join', 'join-debug', 'server', 'account-signin', 'account-register']) (el(id) as HTMLButtonElement).disabled = false;
    renderPreflight();
  };
  el('online-leave').onclick = () => { network?.send({ type: 'leave' }); };
  el('join-debug').onclick = () => enter('joinDebug');
  el('reconnect').onclick = () => network?.reconnect();
  el('growth-leave').onclick = () => network?.send({ type: 'leave' });
  el('growth-reconnect').onclick = () => network?.reconnect();
  el('create-growth').onclick = () => enter('create', 'growth');
  el('create').onclick = () => enter('create'); el('join').onclick = () => enter('join');
  const restore = () => {
    const url = (el('server') as HTMLInputElement).value.trim(), token = readToken(url);
    if (token) { const current = connect(); current?.send({ type: 'auth', mode: 'restore', token }); }
  };
  el('server').addEventListener('change', () => { if (serverUrl && serverUrl !== (el('server') as HTMLInputElement).value.trim()) {
    network?.close(); network = undefined; profileSignature = ''; draft = starterEquipment();
    el('growth-career-section').hidden = true;
    el('account-login').hidden = false; el('account-logout').hidden = true; el('account-status').textContent = '请登录当前服务器的账号'; renderPreflight();
  } restore(); });
  restore();
}

export class OnlineScene extends Phaser.Scene {
  private audioPresentation = new AudioPresentation();
  private rig!: ReferenceArt;
  private graphics!: Phaser.GameObjects.Graphics;
  private hud!: BattleHUD;
  private keys = new Set<string>();
  private elapsed = 0;
  private animationFrame = 0;
  private vision!: VisionOverlay;
  private fire = new FireInput();
  private spectateIndex = 0;
  private feedback = new CombatFeedback();
  private feedbackView?: CombatFeedbackView;
  constructor(private network: BattlePresentationSession) { super('Online'); }
  preload() { preloadReferenceArt(this); preloadAtrium(this); }
  create() {
    this.feedbackView = new CombatFeedbackView(document.getElementById('online-game')!, this.feedback);
    const destroyFeedback = () => this.feedbackView?.destroy();
    this.events.once('shutdown', destroyFeedback); this.events.once('destroy', destroyFeedback);
    if (document.getElementById('lobby')?.contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur();
    document.getElementById('online-game')?.setAttribute('aria-busy', 'false');
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      (document.activeElement as HTMLElement)?.blur();
      if (pointer.leftButtonDown()) this.fire.edge(true, performance.now());
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => { if (!pointer.leftButtonDown()) this.fire.edge(false, performance.now()); });
    const map = MAPS.find(m => m.id === this.network.state!.mapId)!.geometry;
    this.cameras.main.setBounds(0, 0, map.width, map.height ?? 700).setBackgroundColor(map.palette.sky);
    if (this.network.state!.mapId === 'atrium') drawAtrium(this,map);
    else {
      const background=this.add.graphics();
      for(const t of map.terrain)background.fillStyle(map.palette.wall).fillRect(t.x,t.y,t.width,t.height);
      if(map.artwork){const a=map.artwork;this.add.image(a.x,a.y,`ref-${a.id}`).setOrigin(0).setDisplaySize(a.width,a.height);}
    }
    this.vision = new VisionOverlay(this, new CollisionWorld(map.terrain, map.collisionMask).solid);
    this.rig = new ReferenceArt(this); this.graphics = this.add.graphics().setDepth(3);
    this.hud = new BattleHUD(document.getElementById('online-game')!);
    const destroyHud = () => this.hud.destroy();
    this.events.once('shutdown', destroyHud); this.events.once('destroy', destroyHud);
    const down = (e: KeyboardEvent) => {
      if (!document.getElementById('online-preflight')?.hidden || (e.target as HTMLElement)?.closest('input,button,select,a')) return;
      if (e.code === 'Tab' && this.feedback.dead) { e.preventDefault(); if (!e.repeat) this.feedback.cycle(); return; }
      if (e.code === 'Tab' && !this.network.state?.actorId) { e.preventDefault(); if (!e.repeat) this.spectateIndex++; return; }
      if (e.code === 'Space') e.preventDefault(); this.keys.add(e.code);
      if (!e.repeat && e.code === 'KeyQ') this.network.action('swap');
      if (!e.repeat && e.code === 'KeyR') this.network.action('reload');
      if (!e.repeat && e.code === 'KeyE') this.network.action('skill');
      if (!e.repeat && e.code === 'KeyG') this.network.action('item');
    };
    const up = (e: KeyboardEvent) => this.keys.delete(e.code);
    const blur = () => { this.keys.clear(); this.fire.clear(); this.network.clearActions(); };
    const viewChanged = () => {
      blur();
      if (document.getElementById('online-preflight')?.hidden) {
        this.scale.getParentBounds(); this.scale.refresh();
      }
    };
    const focus = (event: FocusEvent) => { if ((event.target as HTMLElement)?.closest('#lobby, #online-account, #online-preflight, #growth-panel')) blur(); };
    window.addEventListener('focusin', focus);
    const surface = document.getElementById('online-game')!;
    let surfaceSize = '';
    const resize = new ResizeObserver(() => {
      const next = `${surface.clientWidth}:${surface.clientHeight}`;
      if (next === surfaceSize || !surface.clientWidth || !surface.clientHeight) return;
      surfaceSize = next;
      const density = Math.min(2, window.devicePixelRatio || 1);
      this.scale.setGameSize(Math.round(surface.clientWidth*density), Math.round(surface.clientHeight*density)); this.scale.getParentBounds(); this.scale.refresh();
    });
    resize.observe(surface);
    this.events.once('shutdown', () => resize.disconnect());
    this.events.once('destroy', () => resize.disconnect());
    window.addEventListener('online-view-change', viewChanged);
    viewChanged();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    const cleanupInput = () => { this.audioPresentation.reset(); gameAudio.pause(false); window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); window.removeEventListener('focusin', focus); window.removeEventListener('online-view-change', viewChanged); };
    this.events.once('shutdown', cleanupInput); this.events.once('destroy', cleanupInput);
  }
  update(_time: number, delta: number) {
    this.network.advance?.(Math.min(delta, 100));
    const message = this.network.state; if (!message) { this.audioPresentation.reset(); return; }
    const self = message.state.actors.find(a => a.id === message.actorId);
    this.feedback.accept(`${message.roomId}:${message.round}:${this.network.audioGeneration}`, message.state.frame, message.events, self,
      !!message.state.waves && !message.state.waves.reserved.includes(self?.id ?? ''));
    const followed = self ? this.feedback.follow(self, message.state.actors) : message.state.actors[this.spectateIndex % message.state.actors.length];
    const now = performance.now();
    const editing = !document.getElementById('online-preflight')?.hidden || !!this.network.paused;
    const mapView = this.feedback.canObserve && this.feedback.observing > 0 && followed?.id === self?.id;
    this.feedbackView?.render(!editing && !message.result, mapView ? '地图总览' : followed?.id === self?.id ? undefined : message.poses.find(p => p.id === followed?.id)?.name);
    this.audioPresentation.accept(`${message.roomId}:${message.round}:${this.network.audioGeneration}`, message.state.frame, message.events, message.state.actors,
      message.actorId ?? followed?.id, message.result?.winner, !editing && this.network.socket.readyState === WebSocket.OPEN && now - this.network.lastStateAt < 500);
    // A hidden canvas has no usable pointer transform. Keep the authoritative
    // aim while browsing equipment and send neutral input to stop movement.
    const pointerAim = editing ? undefined
      : this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const aim = pointerAim && Number.isFinite(pointerAim.x) && Number.isFinite(pointerAim.y) ? { x: pointerAim.x, y: pointerAim.y - (self?.growthV3 ? 0 : this.feedback.punch) }
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
    // Freeze the scene only; authoritative vitals and countdowns must stay current.
    const wave = message.state.waves;
    const heading = wave ? `第${wave.wave}/${wave.scenario.waves.length}波 · 待增援${wave.remaining} · 团队复活${wave.revives} · ${wave.spawnBlocked ? '增援入口受阻，请离开入口' : wave.phase === 'intermission' ? '休整中' : '战斗中'}` : message.state.scores.join(' : ');
    this.hud.render({ mode: this.network.room?.debug ? '公共调试 · 无时限' : `${message.growthV3?.preset === 'short' ? '成长·10分钟实验 / ' : message.growthV3 || message.growth ? '成长 / ' : ''}${message.mode === 'coop' ? '合作生存' : message.mode === 'dom' ? '据点争夺' : message.mode === 'ctf' ? '公文包争夺' : '团队交火'}`,
      objective: wave ? heading : message.mode === 'ctf' ? '先交付3次获胜' : '共享视野 · 敌方阴影不可见', seconds: message.state.seconds, scores: message.state.scores,
      health: self?.life.health ?? 0, maxHealth: self?.maxHealth ?? 100, alive: self?.life.alive ?? false, armor: message.growthV3?.armor ?? message.growth?.armor ?? 0,
      operator: self?.growth ? GROWTH_CLASSES[self.growth.classId].name : self?.classId ? CLASSES[self.classId].name : 'OPERATOR',
      weapon: self ? equipmentText(self) : '正在观察战场', gadgetId: self?.growthV3?.gadgetId, ability: self ? abilityText(self, message.state.growthWorld?.entities.find(e => e.gadgetId === 'as_charge' && e.sourceId === self.id)) : `跟随 ${message.poses.find(p => p.id === followed?.id)?.name ?? '等待角色'}`,
      reload: self?.reload ?? 0, cooldown: self?.skillCooldown ?? 0, spectator: !self, networkStalled: now - this.network.lastStateAt > 500 });
    if (this.feedback.frozen && !message.result) return;
    const predicted = self && followed?.id === self.id ? this.network.prediction.position(renderAlpha, delta) ?? self
      : followed && this.network.interpolation.position(followed, now);
    const geometry = MAPS.find(m => m.id === message.mapId)!.geometry;
    this.cameras.main.setZoom(mapView ? Math.min(1, this.scale.width / geometry.width, this.scale.height / (geometry.height ?? 700)) : 0.8*this.scale.height/620);
    if (mapView) this.cameras.main.centerOn(geometry.width / 2, (geometry.height ?? 700) / 2);
    else if (predicted) this.cameras.main.centerOn(predicted.x, predicted.y - 150);
    this.rig.begin(); this.graphics.clear();
    drawGrowthWorld(this.graphics, message.state);
    const positions = new Map<string, { x: number; y: number }>();
    for (const actor of message.state.actors) {
      const pose = message.poses.find(p => p.id === actor.id)!;
      const position = actor.id === message.actorId && predicted ? predicted : this.network.interpolation.position(actor, now);
      positions.set(actor.id, position);
      const motion = actor.id === message.actorId ? this.network.prediction.movement ?? actor : actor;
      this.rig.soldier(position.x, position.y, motion.crouching, motion.vx, motion.jumping, this.animationFrame, actor.id === message.actorId ? aim : pose.aim, actor.weapon, actor.team === 1 ? 0xb7e8de : 0xf1b0a0, actor.life.alive, actor.reload, this.network.shots.visible(now).some(e => !e.reflected && e.actorId === actor.id), actor.offhand, actor.classId ?? 'medic', actor.id,
        isConcealed({ kit: actor.skill ? { skill: actor.skill } : null, skillFrames: actor.skillFrames, stealthFrames: actor.stealthFrames }), actor.growthV3 ? 0 : this.feedback.flinch(actor.id), actor.growthV3?.flashScale ?? 1,
        actor.growthV3 ? actor.growthV3.recoilDegrees * combatMotion.scale : undefined,
        !!self?.growthV3?.contrast && actor.team !== self.team && actor.life.alive);
    }
    this.rig.delivery(message.state.deliveryTargets, positions, this.graphics);
    drawGrowthAbilities(this.graphics, message, positions);
    if (self?.life.alive && !editing) this.graphics.lineStyle(1, 0xe4f49a).strokeCircle(aim.x, aim.y, 5);
    for (const p of message.projectiles ?? []) this.graphics.lineStyle(3, 0xffc56a, .9).lineBetween(p.x - p.vx * 2, p.y - p.vy * 2, p.x, p.y).fillStyle(0xffedbb).fillCircle(p.x, p.y, 3);
    for (const g of message.grenades) this.graphics.fillStyle(0xeec17a).fillCircle(g.x, g.y, 5);
    for (const burst of message.bursts) {
      const fraction = (message.state.frame - burst.frame) / 18;
      this.graphics.lineStyle(3, burst.color, 1 - fraction).strokeCircle(burst.x, burst.y, burst.radius * (.3 + fraction * .7));
    }
    for (const effect of this.network.shots.visible(now)) this.rig.tracer(this.graphics, effect.trace, effect.reflected ? undefined : effect.actorId, Math.max(0, message.state.frame - effect.frame), message.state.actors.find(a => a.id === effect.actorId)?.weapon);
    const team = this.network.room?.players.find(p => p.id === this.network.playerId)?.team ?? self?.team ?? 1;
    this.vision.draw(message.state.actors.filter(a => a.team === team && a.life.alive)
      .map(a => ({ id: a.id, ...(positions.get(a.id) ?? a) })));

  }
}
