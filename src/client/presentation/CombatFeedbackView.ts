import { CombatFeedback } from './CombatFeedback';
import './CombatFeedback.css';

const setText = (node: HTMLElement, text: string) => { if (node.textContent !== text) node.textContent = text; };

export class CombatFeedbackView {
  readonly root = document.createElement('div');
  private death: HTMLElement; private count: HTMLElement; private killer: HTMLElement; private cause: HTMLElement;
  private button: HTMLButtonElement; private hint: HTMLElement; private ammo: HTMLElement; private stage: HTMLElement; private hit: HTMLElement;
  constructor(parent: HTMLElement, private feedback: CombatFeedback) {
    this.root.className = 'combat-feedback'; this.root.hidden = true;
    this.root.innerHTML = `<div class="combat-hit" aria-hidden="true"><span>❯</span></div><div class="combat-status" role="status"></div><div class="combat-ammo" role="status"></div><section class="combat-death" aria-label="复活倒计时"><small>OPERATOR DOWN · 已阵亡</small><p class="combat-killer"></p><p class="combat-cause"></p><div class="combat-count"></div><p class="combat-hint"></p><button type="button" class="combat-observe">观察队友 / 战场 · Tab</button></section>`;
    const el = (selector: string) => this.root.querySelector<HTMLElement>(selector)!;
    this.death = el('.combat-death'); this.count = el('.combat-count'); this.killer = el('.combat-killer'); this.cause = el('.combat-cause');
    this.hint = el('.combat-hint'); this.ammo = el('.combat-ammo'); this.stage = el('.combat-status'); this.hit = el('.combat-hit'); this.button = el('button') as HTMLButtonElement;
    this.button.onclick = () => { feedback.cycle(); this.button.blur(); };
    parent.append(this.root);
  }
  render(visible: boolean, observing?: string) {
    this.root.hidden = !visible; if (!visible) return;
    const f = this.feedback;
    this.root.dataset.stage = f.stage.startsWith('危险') ? 'critical' : f.stage.startsWith('受压') ? 'suppressed' : 'normal';
    this.root.dataset.frozen = String(f.frozen);
    this.death.hidden = !f.dead; this.death.classList.toggle('observing', f.canObserve);
    setText(this.killer, `击杀者 · ${f.killer}`); setText(this.cause, f.cause);
    setText(this.count, f.noRevive ? 'NO RESPAWNS' : `RESPAWN IN ${f.seconds}`);
    setText(this.hint, f.noRevive ? '团队复活次数已用尽' : f.canObserve ? `正在观察 · ${observing ?? '阵亡位置 / 战场'}` : '2 秒后可观察队友 / 战场');
    this.button.disabled = !f.canObserve;
    setText(this.ammo, f.ammo); this.ammo.hidden = !f.ammo;
    setText(this.stage, f.stage); this.stage.hidden = !f.stage;
    this.hit.hidden = !f.hitStrength || f.dead;
    this.hit.style.opacity = String(f.hitStrength * .85);
    this.hit.style.setProperty('--hit-angle', `${f.direction ?? -90}deg`);
    this.hit.classList.toggle('unknown', f.direction === undefined);
  }
  destroy() { this.root.remove(); }
}
