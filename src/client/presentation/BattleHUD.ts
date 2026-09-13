import { uiArt } from './UIArt';
import './BattleHUD.css';

export interface BattleHUDState {
  mode: string; objective: string; seconds: number; scores: readonly number[];
  health: number; maxHealth: number; alive: boolean; armor: number;
  operator: string; weapon: string; ability: string; reload: number; cooldown: number;
  spectator: boolean; networkStalled: boolean;
}
export class BattleHUD {
  readonly root = document.createElement('div');
  private nodes: Record<string, HTMLElement> = {};
  constructor(parent: HTMLElement) {
    this.root.className = 'tactical-hud'; this.root.setAttribute('aria-label', '战斗状态');
    this.root.innerHTML = `<div class="tactical-hud-top"><div class="hud-mission"><small>LIVE OPERATION</small><strong data-hud="mode"></strong><span data-hud="objective"></span></div><div class="hud-score"><b data-hud="blue"></b><div><small>TIME LEFT</small><strong data-hud="clock"></strong></div><b data-hud="red"></b></div></div><div class="tactical-hud-bottom"><div class="hud-vitals"><small data-hud="operator"></small><strong data-hud="health"></strong><div class="hud-health-track"><i data-hud="health-fill"></i></div><span data-hud="armor"></span></div><div class="hud-ability"><img src="${uiArt('category-ability')}" alt=""><div><small>E / G · 战术系统</small><strong data-hud="ability"></strong><span data-hud="cooldown"></span></div></div><div class="hud-equipment"><small>Q 切换 · R 换弹</small><strong data-hud="weapon"></strong><span data-hud="reload"></span></div></div><div class="hud-network" data-hud="network" role="status" hidden>网络停顿 · 等待服务器更新</div>`;
    this.root.querySelectorAll<HTMLElement>('[data-hud]').forEach(node => this.nodes[node.dataset.hud!] = node); parent.append(this.root);
  }
  render(state: BattleHUDState) {
    const text = (id: string, value: string) => { if (this.nodes[id].textContent !== value) this.nodes[id].textContent = value; };
    text('mode', state.mode); text('objective', state.objective); text('blue', String(state.scores[0])); text('red', String(state.scores[1]));
    text('clock', `${Math.floor(state.seconds / 60)}:${String(state.seconds % 60).padStart(2, '0')}`);
    text('operator', state.spectator ? 'SPECTATOR · 观战' : state.operator);
    text('health', state.spectator ? 'Tab 切换跟随' : state.alive ? `${Math.ceil(state.health)} / ${state.maxHealth} HP` : 'OPERATOR DOWN · 已阵亡');
    const health = Math.max(0, Math.min(100, state.health / Math.max(1, state.maxHealth) * 100));
    this.nodes['health-fill'].style.width = `${health}%`; this.root.dataset.health = health <= 30 ? 'critical' : 'normal';
    text('armor', state.armor > 0 ? `临时护甲 +${Math.ceil(state.armor)}` : '');
    text('weapon', state.weapon); text('ability', state.ability);
    text('reload', state.reload ? `装填中 · ${(state.reload / 30).toFixed(1)}s` : '');
    text('cooldown', state.cooldown ? `冷却 ${Math.ceil(state.cooldown / 30)}s` : '');
    this.nodes.network.hidden = !state.networkStalled;
  }
  destroy() { this.root.remove(); }
}
