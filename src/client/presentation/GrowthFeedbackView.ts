import Phaser from 'phaser';
import { GrowthFeedback } from './GrowthFeedback';
import type { StateMessage } from '../../shared/protocol/State';
import './GrowthFeedback.css';

export class GrowthFeedbackView {
  readonly root = document.createElement('div');
  private labels: Phaser.GameObjects.Text[] = [];
  constructor(private scene: Phaser.Scene, parent: HTMLElement, private model: GrowthFeedback) {
    this.root.className = 'growth-feedback';
    this.root.innerHTML = '<div class="growth-kill" role="status"></div><div class="growth-notice" role="status"></div>';
    parent.append(this.root);
  }
  render(message: StateMessage, now: number, graphics: Phaser.GameObjects.Graphics, positions: ReadonlyMap<string,{x:number;y:number}>, aim: {x:number;y:number}, active: boolean) {
    this.root.hidden = !message.growthV3 || !active;
    for (const label of this.labels) label.setVisible(false);
    if (this.root.hidden) return;
    const model = this.model;
    const kill = this.root.children[0] as HTMLElement, notice = this.root.children[1] as HTMLElement;
    kill.hidden = model.killUntil <= now; notice.hidden = model.noticeUntil <= now;
    if (kill.textContent !== model.kill) kill.textContent = model.kill;
    if (notice.textContent !== model.notice) notice.textContent = model.notice;
    for (const actor of message.state.actors) {
      if (!actor.life.alive || !model.bars.has(actor.id)) continue;
      const p = positions.get(actor.id) ?? actor, y = p.y - (actor.crouching ? 62 : 82);
      graphics.fillStyle(0x101820,.95).fillRect(p.x-26,y,52,6);
      graphics.fillStyle(0xffd18b).fillRect(p.x-25,y+1,50*model.healthTrail(actor,now)/actor.maxHealth,4);
      graphics.fillStyle(0xf27371).fillRect(p.x-25,y+1,50*actor.life.health/actor.maxHealth,4);
    }
    let index = 0;
    const label = (x:number,y:number,text:string,color:string,alpha=1) => {
      const node = this.labels[index] ??= this.scene.add.text(0,0,'',{fontFamily:'Segoe UI, Microsoft YaHei, sans-serif',fontSize:'17px',fontStyle:'bold',stroke:'#08131d',strokeThickness:4}).setOrigin(.5).setDepth(6);
      index++; node.setVisible(true).setPosition(x,y).setText(text).setColor(color).setAlpha(alpha);
    };
    const number = (value:number) => Number(value.toFixed(1)).toString();
    for (const f of model.floats) {
      const text = [f.life > 0 ? `${f.headshot ? '爆头 ' : ''}−${number(f.life)}` : '', f.armor > 0 ? `护甲 −${number(f.armor)}` : '', f.shield > 0 ? `盾 −${number(f.shield)}` : '', f.structure > 0 ? `部署物 −${number(f.structure)}` : ''].filter(Boolean).join(' · ');
      // Stack older receipts above newer ones so sustained fire stays readable.
      const newer = model.floats.filter(other => other.target === f.target && other.started > f.started).length;
      label(f.x+32,f.y-18-newer*22-(now-f.started)*.025,text,f.headshot?'#ffcf79':f.life?'#fff4df':'#89d8ff',Math.min(1,(f.until-now)/200));
    }
    if (model.markerUntil > now) {
      const color = model.marker === '击杀' ? 0xff9c70 : model.marker === '爆头' ? 0xffd477 : model.marker === '命中' ? 0xfff4df : 0x89d8ff;
      graphics.lineStyle(2,color,.95);
      for(const dx of [-1,1]) for(const dy of [-1,1]) graphics.lineBetween(aim.x+dx*8,aim.y+dy*8,aim.x+dx*13,aim.y+dy*13);
      if(model.marker !== '命中') label(aim.x,aim.y+27,model.marker,'#ffe5ba');
    }
  }
  destroy() { this.root.remove(); for (const label of this.labels) label.destroy(); this.labels=[]; }
}
