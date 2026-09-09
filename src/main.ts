import Phaser from 'phaser';
import { BootScene } from './game/scenes/BootScene';
import { MovementLabScene } from './game/scenes/MovementLabScene';
import { defaults, tuningControls } from './game/config/movement';
import './styles.css';

let lab: MovementLabScene | undefined;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
window.addEventListener('strike-ready', ((event: CustomEvent<MovementLabScene>) => { lab = event.detail; }) as EventListener);
el('reset').onclick = () => lab?.reset();
el('pause').onclick = () => lab?.togglePause();
el('step').onclick = () => lab?.step();
el('slow').onclick = () => { if (lab) lab.slow = !lab.slow; };
el('debug').onclick = () => { if (lab) lab.debugVisible = !lab.debugVisible; };
document.querySelectorAll<HTMLButtonElement>('[data-station]').forEach(b => b.onclick = () => lab?.reset(Number(b.dataset.station)));
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
  el('telemetry').innerHTML = [['STATE', s.state], ['POSITION', `${s.x.toFixed(1)}, ${s.y.toFixed(1)}`], ['VELOCITY', `${s.vx.toFixed(1)}, ${s.vy.toFixed(1)}`], ['GROUNDED', s.grounded ? 'YES' : 'NO'], ['SIM TIME', `${s.time.toFixed(2)} s`], ['STEP ASSIST', `${s.step.toFixed(1)} px`]].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  el('simulation-status').textContent = s.paused ? 'PAUSED / SINGLE STEP READY' : s.slow ? '0.25× / 120 Hz FIXED SIMULATION' : '120 Hz FIXED SIMULATION';
  el('pause').classList.toggle('active', s.paused); el('slow').classList.toggle('active', s.slow);
  el('debug').classList.toggle('active', !!lab?.debugVisible);
  if (s.measurement) { const m = s.measurement; el('measurement').textContent = `顶点 ${m.apexMs} ms  /  滞空 ${m.airtimeMs} ms  /  高度 ${m.heightPx} px  /  位移 ${m.distancePx} px`; }
}) as EventListener);
el('export-measurement').onclick = () => {
  if (!lab) return;
  const blob = new Blob([JSON.stringify({ source: 'Project Strike Movement Lab; not original SFH', evidenceType: 'TUNED', timestamp: new Date().toISOString(), ...lab.snapshot() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'strike-movement-measurement.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
renderTuning();
new Phaser.Game({
  type: Phaser.AUTO, parent: 'game', width: 1120, height: 620, backgroundColor: '#18252e',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  physics: { default: 'arcade', arcade: { gravity: { x: 0, y: 0 }, debug: false, fps: 120, fixedStep: true } },
  scene: [BootScene, MovementLabScene], render: { antialias: true, pixelArt: false },
});
