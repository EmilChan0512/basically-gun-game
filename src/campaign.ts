import { skillStatus } from './client/presentation/SkillStatus';
import Phaser from 'phaser';
import { MAPS, customMatch } from './shared/content/Maps';
import { mapPreviewSvg } from './client/presentation/MapPreview';
import { radarSvg } from './client/presentation/Radar';
import { RevealPolicy } from './shared/simulation/RevealPolicy';
import type { Mission } from './game/campaign/Missions';
import { CampaignScene } from './game/scenes/CampaignScene';
import { Battle } from './game/campaign/Battle';
import { MISSIONS } from './game/campaign/Missions';
import { CareerProgress, type Reward } from './game/campaign/CareerProgress';
import { canEquipWeapon, CLASSES, SKILLS, ITEMS, WEAPONS, SPECIAL_OFFHANDS } from './game/campaign/Catalog';
import { renderArmory } from './game/campaign/CareerPanels';
import './campaign.css';

type Screen = 'menu' | 'briefing' | 'playing' | 'paused' | 'result' | 'ending' | 'armory';
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function startCampaign() {
  let custom: Mission | null = null;
  document.title = 'Project Strike · 破晓行动';
  let storage: Storage | undefined;
  try { storage = window.localStorage; } catch { /* Continue without persistence. */ }
  const progress = new CareerProgress(storage);
  let reward: Reward | null = null;
  let armoryReturn: Screen = 'menu';
  let scene: CampaignScene | undefined, screen: Screen = 'menu', selected = progress.unlocked;
  document.querySelector('main')!.className = 'campaign-app';
  document.querySelector('main')!.innerHTML = `
    <header><div class="brand"><span class="mark">S</span><div><h1>PROJECT STRIKE</h1><p>OPERATION DAYBREAK / 单人战役</p></div></div><nav class="campaign-nav"><button id="campaign-home">任务地图</button><button id="armory-nav">职业与军械库</button><a id="offline-growth-nav" href="/?offline&growth">四干员成长训练</a><a id="account-nav" href="/?online">联网账号与资产</a><button id="sound">声音：开</button><a href="?rules=original">训练场</a></nav></header>
    <section class="campaign-title"><div><p class="eyebrow">一支小队 · 四场行动</p><h2 id="campaign-heading">破晓行动</h2></div><span id="save-status"></span></section>
    <section class="campaign-stage"><div id="game" aria-label="单人横版射击战役"></div>
      <div id="battle-top" hidden><span id="mission-label"></span><div class="scoreline"><b id="blue-score">0</b><div class="hud-score-center"><small id="goal-label"></small><strong id="battle-time"></strong></div><b id="red-score">0</b></div><button id="battle-pause">暂停 Esc</button></div>
      <div id="battle-bottom" hidden><div class="hud-vitals"><small>OPERATOR / VITALS</small><strong id="player-health"></strong><div class="hud-health-track"><i id="campaign-health-fill"></i></div></div><div class="hud-ability"><img src="/assets/ui-v2/v1/category-ability.png" alt=""><div><small>E / G · 战术系统</small><p id="abilities"></p></div></div><div class="hud-equipment"><small>Q 切换 · R 换弹</small><strong id="player-ammo"></strong></div><div class="hud-notices"><p id="battle-message"></p><p id="kill-feed"></p></div></div>
      <div id="campaign-overlay" aria-live="polite"></div>
    </section>
    <section class="campaign-help"><p><kbd>A D / ← →</kbd> 移动 <kbd>W / 空格</kbd> 跳跃 <kbd>S / ↓</kbd> 蹲伏 <kbd>鼠标 / F</kbd> 射击 <kbd>Q</kbd> 切枪 <kbd>R / L</kbd> 换弹 <kbd>E</kbd> 职业技能 <kbd>G</kbd> 道具 <kbd>Esc / P</kbd> 暂停</p><p>青色是队友，橙色是敌人。阵亡会复活；出生区补给箱可补充备用弹药。单机免登录，进度只保存在这台设备；联网账号资产由服务器独立管理。</p></section>`;

  function saveStatus() {
    $('save-status').textContent = progress.storageAvailable ? `本地进度 ${progress.data.completed.length} / ${MISSIONS.length}` : '存储不可用 · 本次仍可完整游玩';
    $('account-nav').textContent = '联网账号与资产';
  }
  const radar = document.createElement('div'); radar.id = 'campaign-radar'; radar.hidden = true;
  radar.style.cssText = 'position:absolute;right:12px;top:12px;width:230px;max-width:30%;z-index:2;pointer-events:none';
  document.querySelector('.campaign-stage')!.append(radar);
  let radarBattle: Battle | undefined, radarFrame = -1, reveal = new RevealPolicy();
  function bind(id: string, action: () => void) { $(id).onclick = () => { action(); (document.activeElement as HTMLElement)?.blur(); }; }
  function settings() {
    const l = progress.loadout;
    return `<div class="loadout"><label>行动难度<select id="difficulty"><option value="easy">轻松 · 更长反应时间</option><option value="normal">标准</option><option value="hard">老兵 · 更准的对手</option></select></label><label>主武器<select id="weapon">${progress.data.career.weapons.filter(id => canEquipWeapon(l.classId, id) && WEAPONS[id].slot === 'primary' && WEAPONS[id].level <= l.level).map(id => `<option value="${id}">${WEAPONS[id].name}</option>`).join('')}</select></label><button id="edit-loadout">配装与升级</button></div><p class="brief-tip">${CLASSES[l.classId].name} Lv.${l.level} · ${SKILLS[l.skill].passive ? '被动' : 'E'} ${SKILLS[l.skill].name} · G ${ITEMS[l.item].name} · 军资 ${progress.data.career.credits}</p>`;
  }
  function bindSettings() {
    $<HTMLSelectElement>('difficulty').value = progress.data.difficulty;
    $<HTMLSelectElement>('weapon').value = progress.loadout.primary;
    $('difficulty').onchange = () => { progress.data.difficulty = $<HTMLSelectElement>('difficulty').value as typeof progress.data.difficulty; progress.save(); saveStatus(); };
    $('weapon').onchange = () => { progress.equipWeapon($<HTMLSelectElement>('weapon').value as typeof progress.data.weapon); saveStatus(); };
    bind('edit-loadout', () => { armoryReturn = screen; show('armory'); });
  }
  function show(next: Screen) {
    screen = next;
    $<HTMLButtonElement>('armory-nav').disabled = ['playing', 'paused'].includes(screen);
    if (scene) { scene.activeBattle = screen === 'playing'; scene.clearInput(); if (screen !== 'result') scene.audio.stop(); scene.audio.pause(false); }
    $('campaign-overlay').hidden = screen === 'playing';
    $('battle-top').hidden = !['playing', 'paused', 'result'].includes(screen);
    $('battle-bottom').hidden = !['playing', 'paused'].includes(screen);
    radar.hidden = screen !== 'playing';
    $('campaign-overlay').dataset.screen = screen;
    $('campaign-overlay').scrollTop = 0;
    saveStatus();
    if (screen === 'playing') return;
    if (screen === 'armory') { renderArmory($('campaign-overlay'), progress, () => show(armoryReturn), saveStatus); return; }
    if (screen === 'menu') {
      custom = null;
      $('campaign-heading').textContent = '破晓行动';
      $('campaign-overlay').innerHTML = `<div class="menu-panel"><p class="eyebrow">CAMPAIGN / 01—04</p><h2>追回失联的信号。</h2><p class="story">从研究站到撤离平台，在四场连贯的小队战斗中回收被夺走的资料。独自出发，与队友并肩完成行动。</p><div class="mission-grid">${MISSIONS.map((m, i) => `<button class="mission-card" data-mission="${i}" ${progress.canPlay(i) ? '' : 'disabled'}><small>${m.mode === 'dom' ? '据点争夺' : `${m.allies + 1} 对 ${m.enemies} · 团队交火`}</small><strong>${m.title}</strong><span>${m.location}</span><em>${progress.data.completed.includes(m.id) ? '★'.repeat(progress.data.best[m.id] ?? 1) + ' 已完成' : progress.canPlay(i) ? '可行动 →' : '完成上一关解锁'}</em></button>`).join('')}</div>${settings()}<div class="panel-actions"><button id="continue-campaign" class="primary">${progress.finished ? '重玩最终行动' : progress.data.completed.length ? '继续行动' : '开始行动'}</button><span>移动 · 掩体 · 复活 · 小队配合</span></div></div>`;
      $('campaign-overlay').querySelector('.menu-panel')!.insertAdjacentHTML('beforeend', `<div class="loadout"><label>自定义地图<select id="custom-map">${MAPS.map(m => `<option value="${m.id}">${m.name}</option>`).join('')}</select></label><label>模式<select id="custom-mode"><option value="tdm">团队交火</option><option value="dom">据点争夺</option></select></label><button id="custom-start">开始自定义对局 · 4v4</button></div><p>自定义对局包含机器人，不影响战役进度。 <a href="/?online">进入联机大厅</a></p>`);
      $<HTMLSelectElement>('custom-mode').add(new Option('公文包争夺', 'ctf'));
      bind('custom-start', () => { custom = customMatch($<HTMLSelectElement>('custom-map').value, $<HTMLSelectElement>('custom-mode').value as import('./shared/simulation/ModeRules').ModeId); launch(); });
      const preview = document.createElement('div'); preview.id = 'custom-map-preview';
      $('custom-map').closest('.loadout')!.after(preview);
      const updateMap = () => {
        const map = MAPS.find(m => m.id === $<HTMLSelectElement>('custom-map').value)!;
        preview.innerHTML = mapPreviewSvg(map);
        const mode = $<HTMLSelectElement>('custom-mode');
        for (const option of Array.from(mode.options)) {
          option.disabled = !map.modes.includes(option.value as import('./shared/simulation/ModeRules').ModeId);
          option.title = option.disabled ? '此地图尚未配置该模式的目标点' : '';
        }
        if (mode.selectedOptions[0].disabled) mode.value = map.modes[0];
      };
      $('custom-map').onchange = updateMap; updateMap();
      document.querySelectorAll<HTMLButtonElement>('[data-mission]').forEach(button => button.onclick = () => brief(Number(button.dataset.mission)));
      bind('continue-campaign', () => brief(progress.unlocked)); bindSettings();
    } else if (screen === 'briefing') {
      const m = MISSIONS[selected]; $('campaign-heading').textContent = m.title;
      $('campaign-overlay').innerHTML = `<div class="brief-panel"><p class="eyebrow">任务简报 / ${m.location}</p><h2>${m.title}</h2><p class="story">${m.brief.replaceAll('\n', '<br><br>')}</p><div class="mission-facts"><span>${m.mode === 'tdm' ? '团队击杀' : '据点争夺'}<b>${m.goal} 分目标</b></span><span>小队编制<b>${m.allies + 1} 对 ${m.enemies}</b></span><span>行动时限<b>${m.seconds / 60} 分钟</b></span></div>${settings()}<p class="brief-tip">${selected === 0 ? '从左侧出生，向右寻找守卫。鼠标瞄准并按住左键射击。阵亡不是任务失败，敌方先达到目标分数才会失败。' : '胜利后自动保存关卡进度。失败可以重试，也可以回任务地图调整难度。'}</p><div class="panel-actions"><button id="deploy" class="primary">进入战斗</button><button id="brief-back">返回地图</button></div></div>`;
      bindSettings(); bind('deploy', launch); bind('brief-back', () => show('menu'));
    } else if (screen === 'paused') {
      $('campaign-overlay').innerHTML = `<div class="compact-panel"><p class="eyebrow">行动已暂停</p><h2>调整呼吸，再次出发。</h2><p class="story">计时、敌人和武器均已暂停。失去窗口焦点也会自动暂停。</p><div class="panel-actions"><button id="resume" class="primary">继续战斗</button><button id="retry">重试本关</button><button id="pause-home">任务地图</button></div></div>`;
      bind('resume', () => show('playing')); bind('retry', launch); bind('pause-home', () => show('menu'));
    } else if (screen === 'result') {
      const b = scene!.battle, won = b.phase === 'won';
      $('campaign-overlay').innerHTML = `<div class="compact-panel result-panel"><p class="eyebrow">${won ? 'MISSION COMPLETE' : 'MISSION FAILED'}</p><h2>${won ? '行动成功' : '行动未完成'}</h2><p class="result-score">${b.scores[0]} <span>—</span> ${b.scores[1]}</p><p class="story">${won ? b.mission.debrief : b.reason + '。利用掩体和队友的火力，或在任务地图降低难度再试。'}</p><p>个人击杀 ${b.player.kills} · 阵亡 ${b.player.life.deaths} · 用时 ${Math.ceil(b.frame / 30)} 秒${won && !custom ? ' · ' + '★'.repeat(progress.data.best[b.mission.id]) : ''}</p><div class="panel-actions">${won && !custom ? `<button id="next-mission" class="primary">${selected === MISSIONS.length - 1 ? '查看结局' : '下一关'}</button>` : ''}<button id="result-retry" ${won ? '' : 'class="primary"'}>重试本关</button><button id="result-home">任务地图</button></div></div>`;
      if (won && !custom) bind('next-mission', () => selected === MISSIONS.length - 1 ? show('ending') : brief(selected + 1));
      const summary = document.createElement('p'); summary.id = 'reward-summary';
      if (reward) summary.textContent = `经验 +${reward.xp} · 军资 +${reward.credits}${reward.firstClear ? ' · 首次完成奖励' : ''}${reward.level > reward.previousLevel ? ` · 职业升至Lv.${reward.level}，获得训练点！` : ''}`;
      $('campaign-overlay').querySelector('.panel-actions')!.before(summary);
      const upgrade = document.createElement('button'); upgrade.id = 'result-armory'; upgrade.textContent = '配装与升级'; upgrade.onclick = () => { armoryReturn = 'result'; show('armory'); };
      $('campaign-overlay').querySelector('.panel-actions')!.append(upgrade);
      bind('result-retry', launch); bind('result-home', () => show('menu'));
    } else {
      $('campaign-heading').textContent = '破晓已至';
      $('campaign-overlay').innerHTML = `<div class="brief-panel ending-panel"><p class="eyebrow">OPERATION DAYBREAK / 完整战役已完成</p><h2>信号再次响起。</h2><p class="story">你们在黎明前带回了资料。回声重新接通研究站的频道，北斗发来了全员安全的消息。远处的灯一盏盏亮起。<br><br>破晓行动，结束。</p><div class="ending-stars">${MISSIONS.map(m => `<p>${m.title}<span>${'★'.repeat(progress.data.best[m.id] ?? 1)}</span></p>`).join('')}</div><p class="brief-tip">可从任务地图重玩已解锁关卡，或选择老兵难度再次挑战。</p><button id="ending-home" class="primary">返回任务地图</button></div>`;
      bind('ending-home', () => show('menu'));
    }
  }
  function brief(index: number) {
    if (!progress.canPlay(index)) return;
    custom = null; selected = index;
    scene?.loadBattle(new Battle(MISSIONS[index], progress.data.difficulty, progress.loadout.primary, undefined, progress.loadout));
    show('briefing');
  }
  function launch() {
    if (!scene) return;
    reward = null; scene.audio.unlock(); scene.loadBattle(new Battle(custom ?? MISSIONS[selected], progress.data.difficulty, progress.loadout.primary, undefined, progress.loadout));
    $('mission-label').textContent = (custom ?? MISSIONS[selected]).title;
    $('goal-label').textContent = `目标 ${(custom ?? MISSIONS[selected]).goal}`;
    show('playing');
  }
  function pause() { if (screen === 'playing') show('paused'); else if (screen === 'paused') show('playing'); }
  bind('campaign-home', () => show('menu'));
  bind('armory-nav', () => { armoryReturn = screen === 'briefing' || screen === 'result' ? screen : 'menu'; show('armory'); }); bind('battle-pause', pause);
  bind('sound', () => { if (scene) { scene.audio.enabled = !scene.audio.enabled; scene.audio.unlock(); $('sound').textContent = scene.audio.enabled ? '声音：开' : '声音：关'; } });
  window.addEventListener('strike-campaign-ready', ((event: CustomEvent<CampaignScene>) => {
    scene = event.detail; scene.onPause = pause;
    scene.onFrame = () => {
      if (!['playing', 'paused'].includes(screen)) return;
      const b = scene!.battle, p = b.player, gun = p.arsenal.gun;
      if (radarBattle !== b) { radarBattle = b; radarFrame = -1; reveal = new RevealPolicy(); radar.replaceChildren(); }
      if (b.frame !== radarFrame && (radarFrame < 0 || b.frame - radarFrame >= 2)) {
        const state = b.snapshot();
        const carriers = new Set((state.deliveryTargets ?? []).flatMap(t => t.carrierId ? [t.carrierId] : []));
        const visible = reveal.visible(b.actors, b.frame, b.journal.since(0), b.wall, p.team, carriers);
        state.actors = state.actors.filter(actor => visible.has(actor.id));
        radar.innerHTML = radarSvg(b.mission, { state, actorId: p.id, mode: b.mission.mode }, p.team); radarFrame = b.frame;
      }
      $('blue-score').textContent = String(b.scores[0]); $('red-score').textContent = String(b.scores[1]);
      const seconds = Math.max(0, Math.ceil(b.mission.seconds - b.frame / 30));
      $('battle-time').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      $('player-health').textContent = p.life.alive ? `生命 ${Math.ceil(p.life.health)} / ${p.life.maxHealth}` : `阵亡 · ${((p.life.respawnFrames + 1) / 30).toFixed(1)} 秒后复活`;
      document.getElementById('campaign-health-fill')!.style.width = String(Math.max(0, Math.min(100, p.life.health / p.life.maxHealth * 100))) + '%';
      document.getElementById('battle-bottom')!.dataset.health = p.life.health / p.life.maxHealth <= .3 ? 'critical' : 'normal';
      const offhand = p.offhand?.view();
      $('player-ammo').textContent = offhand?.equipped && offhand.kind !== 'firearm'
        ? offhand.kind === 'melee' ? `${SPECIAL_OFFHANDS[offhand.id ?? 'knife'].name} · ${offhand.age < 0 ? '点击攻击挥刀' : '挥击中'} · Q切换`
          : `${SPECIAL_OFFHANDS[offhand.id ?? 'shield'].name} · ${offhand.deployed ? '防御中' : '按住攻击部署'} · Q切换`
        : `${p.arsenal.selected.toUpperCase()}  ${gun.ammo} / ${gun.reserveAmmo}${gun.reloadFrames ? ` · 换弹 ${(gun.reloadFrames / 30).toFixed(1)}s` : gun.ammo === 0 ? ' · Q切枪 / 返回出生区补给' : ''}`;
      $('abilities').textContent = p.kit ? `${CLASSES[p.kit.classId].name} Lv.${p.kit.level} | ${skillStatus({ skill: p.kit.skill, skillFrames: p.skillFrames, skillCooldown: p.skillCooldown, stealthFrames: p.stealthFrames })} | G ${ITEMS[p.kit.item].name} ×${p.itemCharges}` : '';
      $('battle-message').textContent = b.mission.mode === 'dom' ? `据点：${{ blue: '我方控制 +1/秒', red: '敌方控制 +1/秒', contested: '争夺中 · 暂停计分', neutral: '无人占领' }[b.objective]}` : p.life.spawnProtectionFrames && p.life.alive ? '出生保护中 · 向前推进' : '击败敌人为小队得分 · 阵亡后可复活';
      $('kill-feed').textContent = b.events.filter(e => b.frame - e.frame < 150).slice(0, 2).map(e => e.text).join('  /  ');
      if (b.notice && b.frame - b.noticeFrame < 90) $('battle-message').textContent = b.notice;
      if (b.mission.mode === 'ctf') $('battle-message').textContent = `公文包争夺 · 运回己方基地计分 · 携带时仅用副手 · ${b.mission.goal}分获胜`;
      if (screen === 'playing' && b.phase !== 'running') {
        reward = custom ? null : progress.settle(b);
        show('result');
      }
    };
    show('menu');
  }) as EventListener, { once: true });
  new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: 1120, height: 620, backgroundColor: '#142933',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: [CampaignScene], render: { antialias: true } });
}
