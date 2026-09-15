import Phaser from 'phaser';
import { OnlineScene } from './online';
import { OfflineGrowthSession } from './client/session/OfflineGrowthSession';
import { GrowthCareerPanel } from './client/presentation/GrowthCareerPanel';
import { GrowthMatchView } from './client/presentation/GrowthMatchView';
import { freshGrowthCareerV3, ownedGrowthLoadoutV3 } from './shared/content/growth-v3/Career';
import { MAPS } from './shared/content/Maps';
import { validateGrowthPreset } from './shared/content/growth-v3/Presets';
import { installCombatMotionControl } from './client/presentation/CombatMotion';
import { radarSvg } from './client/presentation/Radar';

export function startOfflineGrowth(laboratory = false) {
  const storageKey = 'strike.offline.growth.loadout.v3';
  const career = freshGrowthCareerV3();
  let storageNote = '';
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) career.loadouts[0] = ownedGrowthLoadoutV3(career, JSON.parse(saved));
  } catch { storageNote = '本机旧配装无法读取，已使用默认配装；可重新选择后保存。'; }
  document.body.innerHTML = `<main class="online-app"><header class="online-header"><a class="online-brand" href="/?offline&growth">PROJECT STRIKE · 离线成长训练</a><nav><a href="/?offline">单人战役</a><a href="/?online">联机大厅</a></nav></header><section id="offline-setup"><h1>四干员 · 4v4机器人训练</h1><p>你与三名机器人队友对抗四名机器人。无需登录；局内成长使用正式规则，训练不计入联网账号资产。</p><div class="loadout"><label>地图<select id="offline-growth-map">${MAPS.filter(m => m.modes.includes('tdm')).map(m => `<option value="${m.id}">${m.name}</option>`).join('')}</select></label><label>模式<select id="offline-growth-mode"><option value="tdm">团队交火</option><option value="dom">据点争夺</option><option value="ctf">公文包争夺</option></select></label><label>对局时长<select id="offline-growth-preset"><option value="standard">15分钟标准 · 第12分钟觉醒</option><option value="short">10分钟实验 · 第7分钟觉醒</option></select></label><button id="offline-growth-start">使用已保存配装开始训练</button></div><p id="offline-growth-notice" role="status"></p></section><section id="online-preflight"><div id="growth-career-content"></div></section><div id="growth-session-controls" hidden><button id="offline-growth-leave">结束训练 / 返回配装</button><button id="offline-growth-pause">暂停训练</button><span id="offline-growth-status" role="status"></span></div><div id="online-game" hidden><section id="growth-panel" hidden aria-label="局内成长"></section></div></main>`;
  const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
  el('offline-growth-notice').textContent = storageNote;
  if (laboratory) {
    document.querySelector('.online-brand')!.textContent = 'PROJECT STRIKE · 联机成长模式实验室';
    document.querySelector('#offline-setup h1')!.textContent = '联机成长模式实验室';
    document.querySelector('#offline-setup > p')!.textContent = '使用联机同源规则测试四干员、武器改装、技能道具与局内成长。可进入实弹靶场或4v4机器人对局，训练不计入联网账号资产。';
  }

  el<HTMLSelectElement>('offline-growth-map').value = 'atrium';
  let session: OfflineGrowthSession | undefined, game: Phaser.Game | undefined;
  const panel = new GrowthCareerPanel(el('growth-career-content'), value => {
    try {
      const message = value as { type: string; loadout: unknown; slot: number };
      if (message.type !== 'growthSave' || message.slot !== 0) throw Error('离线训练使用一个本机配装槽');
      const loadout = ownedGrowthLoadoutV3(career, message.loadout);
      localStorage.setItem(storageKey, JSON.stringify(loadout));
      career.loadouts[0] = loadout; panel.render(career, false); panel.saved();
    } catch (error) { panel.failed(error instanceof Error ? error.message : '本机存储不可用'); }
  }, true);
  panel.render(career, false);
  const match = new GrowthMatchView(el('growth-panel'), message => { if (!session?.choose(message)) match.requestFailed(); });
  installCombatMotionControl(el('growth-session-controls'));
  const pauseButton = el<HTMLButtonElement>('offline-growth-pause');
  const pause = (paused: boolean) => {
    if (!session || session.battle.result) return;
    session.setPaused(paused); pauseButton.textContent = paused ? '继续训练' : '暂停训练';
    pauseButton.setAttribute('aria-pressed', String(paused));
    el('offline-growth-status').textContent = paused ? '训练已暂停，点击继续训练恢复。' : '';
    (document.activeElement as HTMLElement)?.blur();
  };
  pauseButton.onclick = () => pause(!session?.paused);
  const focusLost = () => pause(true);
  window.addEventListener('blur', focusLost);
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
  el('offline-growth-start').onclick = () => {
    if (game) return;
    try {
      const mode = el<HTMLSelectElement>('offline-growth-mode').value;
      if (mode !== 'tdm' && mode !== 'dom' && mode !== 'ctf') throw Error('不支持的训练模式');
      session = new OfflineGrowthSession(career.loadouts[0], el<HTMLSelectElement>('offline-growth-map').value,
        validateGrowthPreset(el<HTMLSelectElement>('offline-growth-preset').value), mode, crypto.getRandomValues(new Uint32Array(1))[0]);
      el('offline-setup').hidden = true; el('online-preflight').hidden = true;
      el('online-game').hidden = false; el('growth-session-controls').hidden = false;
      document.body.classList.add('online-match-playing', 'growth-playing');
      pauseButton.disabled = false; pauseButton.textContent = '暂停训练'; pauseButton.setAttribute('aria-pressed', 'false');
      el('offline-growth-status').textContent = '';
      const radar = document.createElement('div'); radar.className = 'online-radar'; radar.id = 'online-radar';
      radar.style.cssText = 'position:absolute;right:12px;top:12px;width:230px;max-width:30%;z-index:2;pointer-events:none';
      el('online-game').append(radar);
      let radarFrame = -1;
      session.onChange = () => {
        if (!session?.state) return;
        match.render(session.state);
        if (session.state.state.frame !== radarFrame) {
          radarFrame = session.state.state.frame; radar.innerHTML = radarSvg(session.battle.mission, session.state, 1);
        }
        if (session.battle.result) {
          const result = session.battle.result;
          el('offline-growth-status').textContent = `${result.winner === 1 ? '训练胜利' : result.winner === 2 ? '训练失败' : '训练平局'} · ${session.battle.scores.join(' : ')} · 可返回配装再来一局`;
          pauseButton.disabled = true;
        }
      };
      session.onChange(); el('online-game').setAttribute('aria-busy', 'true');
      (document.activeElement as HTMLElement)?.blur();
      game = new Phaser.Game({ type: Phaser.AUTO, parent: 'online-game', width: 1120, height: 620,
        scale: { mode: Phaser.Scale.FIT }, scene: [new OnlineScene(session)] });
    } catch (error) { el('offline-growth-notice').textContent = error instanceof Error ? error.message : '训练启动失败'; }
  };
  el('offline-growth-leave').onclick = () => {
    if (!game) return;
    session?.dispose(); session = undefined;
    const previous = game;
    previous.events.once(Phaser.Core.Events.DESTROY, () => {
      game = undefined; match.render(null); el('online-game').querySelector('.online-radar')?.remove();
      el('offline-setup').hidden = false; el('online-preflight').hidden = false;
      el('online-game').hidden = true; el('growth-session-controls').hidden = true;
      document.body.classList.remove('online-match-playing', 'growth-playing'); panel.render(career, false);
    });
    previous.destroy(true);
  };
  window.addEventListener('pagehide', () => { session?.dispose(); game?.destroy(true); });
}
