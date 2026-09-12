import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { MovementLabScene } from './game/scenes/MovementLabScene';
import { OriginalSandboxScene } from './game/scenes/OriginalSandboxScene';
import { defaults, tuningControls } from './game/config/movement';
import './styles.css';
import { startCampaign } from './campaign';
import { startOnline } from './online';
import { installAudioUI } from './client/audio/AudioSettings';

function startLabs() {
let lab: MovementLabScene | undefined;
let original: OriginalSandboxScene | undefined;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
window.addEventListener('strike-ready', ((event: CustomEvent<MovementLabScene>) => { lab = event.detail; }) as EventListener);
el('reset').onclick = () => (original ?? lab)?.reset();
el('pause').onclick = () => (original ?? lab)?.togglePause();
el('step').onclick = () => (original ?? lab)?.step();
el('slow').onclick = () => { const scene = original ?? lab; if (scene) scene.slow = !scene.slow; };
el('debug').onclick = () => { const scene = original ?? lab; if (scene) scene.debugVisible = !scene.debugVisible; };
document.querySelectorAll<HTMLButtonElement>('[data-station]').forEach(b => b.onclick = () => (original ?? lab)?.reset(Number(b.dataset.station)));
function renderTuning() {
  el('tuning').replaceChildren();
  for (const item of tuningControls) {
    const label = document.createElement('label');
    const line = document.createElement('span'); line.textContent = item.label;
    const output = document.createElement('output'); output.textContent = String(lab?.config[item.key] ?? defaults[item.key]);
    const slider = document.createElement('input'); slider.type = 'range'; slider.min = String(item.min); slider.max = String(item.max); slider.step = String(item.step); slider.value = output.textContent;
    slider.setAttribute('aria-label', item.label);
    slider.oninput = () => { output.textContent = slider.value; if (lab) lab.config[item.key] = Number(slider.value); };
    line.append(output); label.append(line, slider); el('tuning').append(label);
  }
}
el('defaults').onclick = () => { if (lab) Object.assign(lab.config, defaults); renderTuning(); };
window.addEventListener('strike-telemetry', ((event: CustomEvent<ReturnType<MovementLabScene['snapshot']>>) => {
  const s = event.detail;
  el('telemetry').innerHTML = [['STATE', s.state], ['POSITION', `${s.x.toFixed(1)}, ${s.y.toFixed(1)}`], ['VELOCITY', `${s.vx.toFixed(1)}, ${s.vy.toFixed(1)}`], ['GROUNDED', s.grounded ? 'YES' : 'NO'], ['SIM TIME', `${s.time.toFixed(2)} s`], ['STEP ASSIST', `${s.step.toFixed(1)} px`], ['WEAPON', `${s.combat.weapon.toUpperCase()} ${s.combat.ammo} ammo / ${s.combat.reserveAmmo} reserve`], ['TARGET', `${s.combat.health} hp`]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  el('simulation-status').textContent = s.paused ? 'PAUSED / SINGLE STEP READY' : s.slow ? '0.25× / 120 Hz FIXED SIMULATION' : '120 Hz FIXED SIMULATION';
  el('pause').classList.toggle('active', s.paused); el('slow').classList.toggle('active', s.slow);
  el('debug').classList.toggle('active', !!lab?.debugVisible);
  if (s.measurement) { const m = s.measurement; el('measurement').textContent = `顶点 ${m.apexMs} ms  /  滞空 ${m.airtimeMs} ms  /  高度 ${m.heightPx} px  /  位移 ${m.distancePx} px`; }
}) as EventListener);
el('export-measurement').onclick = () => {
  if (original) {
    const blob = new Blob([JSON.stringify({ source: 'Project Strike combat sandbox; reference-informed prototype, not an original observation', timestamp: new Date().toISOString(), ...original.snapshot() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'strike-original-rules.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
  }
  if (!lab) return;
  const blob = new Blob([JSON.stringify({ source: 'Project Strike Movement Lab; not original SFH', evidenceType: 'TUNED', timestamp: new Date().toISOString(), ...lab.snapshot() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'strike-movement-measurement.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
renderTuning();
window.addEventListener('strike-original-ready', ((event: CustomEvent<OriginalSandboxScene>) => {
  original = event.detail;
  document.querySelector('.intro h2')!.textContent = '先把移动与射击练顺。';
  document.querySelector('.intro > div > p:last-child')!.textContent = 'Project Strike · 跑跳、蹲伏、攀爬与双武器战斗；在经典机制基础上迭代自己的游戏。';
  el('tuning').textContent = '当前使用统一的基础机制配置。需要对比调参时可进入旧实验室。';
  el<HTMLButtonElement>('defaults').disabled = true;
  document.querySelector('footer > span')!.textContent = 'A D 移动 / SPACE 跳跃 / S 蹲下 / F 或鼠标射击 / Q 切枪 / L 换弹 / K 死亡测试 / R 重置';
  el('measurement').textContent = '射击靶子可查看命中、伤害和击杀反馈。靶子与玩家均会复活；蓝色生命条表示出生保护。';
  const labels = ['平地与起跳', '28px攀爬与60px墙', '180px缺口', '实心平台'];
  document.querySelectorAll<HTMLButtonElement>('[data-station]').forEach((button, i) => button.querySelector('span')!.textContent = labels[i]);
}) as EventListener);
window.addEventListener('strike-original-telemetry', ((event: CustomEvent<ReturnType<OriginalSandboxScene['snapshot']>>) => {
  const s = event.detail;
  el('telemetry').innerHTML = [['STATE', s.life.alive ? s.crouching ? 'CROUCH' : s.jumping ? 'AIR' : 'GROUND' : 'DEAD'], ['POSITION', `${s.x.toFixed(1)}, ${s.y.toFixed(1)}`], ['VELOCITY / FRAME', `${s.vx.toFixed(2)}, ${s.vy.toFixed(2)}`], ['HEALTH', `${Math.ceil(s.life.health)} / 85`], ['RESPAWN', `${s.life.respawnFrames} frames`], ['WEAPON', `${s.combat.weapon.toUpperCase()} ${s.combat.ammo} + ${s.combat.reserveAmmo}`], ['RELOAD', `${s.combat.reloadFrames} frames`], ['TARGET', `${s.target.health.toFixed(2)} hp`]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  el('simulation-status').textContent = `${s.paused ? 'PAUSED' : s.slow ? '0.25×' : 'LIVE'} / 30 Hz COMBAT SANDBOX`;
  el('pause').classList.toggle('active', s.paused); el('slow').classList.toggle('active', s.slow);
}) as EventListener);
new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: 1120, height: 620, backgroundColor: '#18252e',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false, fps: 120, fixedStep: true } },
  scene: [BootScene, MovementLabScene, OriginalSandboxScene], render: { antialias: true, pixelArt: false },
});

}
const rules = new URLSearchParams(location.search).get('rules');
if (new URLSearchParams(location.search).has('online')) startOnline(); else if (rules === 'lab' || rules === 'original') startLabs(); else if (new URLSearchParams(location.search).has('offline')) startCampaign(); else startOnline();
installAudioUI();
