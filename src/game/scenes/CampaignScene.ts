import { isConcealed } from '../../shared/simulation/Stealth';
import Phaser from 'phaser';
import { LocalSession } from '../../client/session/LocalSession';
import { Battle, idleInput } from '../campaign/Battle';
import type { Actor } from '../campaign/Battle';
import { MISSIONS, type Mission } from '../campaign/Missions';
import { CombatAudio } from '../campaign/Audio';
import { CLASSES } from '../campaign/Catalog';

import { ReferenceArt, preloadReferenceArt } from '../campaign/ReferenceArt';

/** Static reference textures over independent campaign simulation. */
export class CampaignScene extends Phaser.Scene {
  battle = new Battle(MISSIONS[0]);
  private session = new LocalSession(this.battle);
  activeBattle = false;
  readonly audio = new CombatAudio();
  onFrame?: () => void;
  onPause?: () => void;
  private keys = new Set<string>();
  private mouse = false;
  private jumpQueued = false;
  private background!: Phaser.GameObjects.Graphics;
  private art!: Phaser.GameObjects.Graphics;
  private rig!: ReferenceArt;
  private scenery: Phaser.GameObjects.Image[] = [];
  private labels: Phaser.GameObjects.Text[] = [];
  private hurtOverlay!: Phaser.GameObjects.Rectangle;
  private eventCursor = 0;
  constructor() { super('CampaignScene'); }
  preload() { preloadReferenceArt(this); }
  create() {
    this.rig = new ReferenceArt(this);
    this.background = this.add.graphics(); this.art = this.add.graphics().setDepth(3);
    this.hurtOverlay = this.add.rectangle(560, 310, 1120, 620, 0xd84b45, 0).setScrollFactor(0).setDepth(20);
    this.drawMap(this.battle.mission);
    const down = (event: KeyboardEvent) => {
      if ((event.target as HTMLElement)?.matches('input,select,textarea,button,a')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
      if (['Escape', 'KeyP'].includes(event.code) && !event.repeat) { this.onPause?.(); return; }
      if (!this.activeBattle) return;
      this.audio.unlock(); this.keys.add(event.code);
      if (!event.repeat && ['Space', 'KeyW', 'ArrowUp'].includes(event.code)) this.jumpQueued = true;
      if (!event.repeat && event.code === 'KeyQ') this.session.action('swap');
      if (!event.repeat && (event.code === 'KeyR' || event.code === 'KeyL')) this.session.action('reload');
      if (!event.repeat && event.code === 'KeyE') this.session.action('skill');
      if (!event.repeat && event.code === 'KeyG') this.session.action('item');
    };
    const up = (event: KeyboardEvent) => { this.keys.delete(event.code); };
    const blur = () => { this.clearInput(); if (this.activeBattle) this.onPause?.(); };
    const visibility = () => { if (document.hidden) blur(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { if (this.activeBattle && p.leftButtonDown()) { this.mouse = true; this.audio.unlock(); } });
    const release = () => { this.mouse = false; };
    this.input.on('pointerup', release); this.input.on('pointerupoutside', release);
    this.events.once('shutdown', () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', visibility); });
    if (import.meta.env.DEV || import.meta.env.MODE === 'test') window.__strikeCampaign = this;
    window.dispatchEvent(new CustomEvent('strike-campaign-ready', { detail: this }));
  }
  clearInput() { this.keys.clear(); this.mouse = false; this.jumpQueued = false; this.session.clearInput(); }
  loadBattle(battle: Battle) { this.clearInput(); this.battle = battle; this.session = new LocalSession(battle); this.eventCursor = 0; this.drawMap(battle.mission); }
  private drawMap(mission: Mission) {
    if (!this.background) return;
    this.cameras.main.setBounds(0, 0, mission.width, mission.height ?? 700);
    for (const image of this.scenery) image.destroy();
    this.scenery = [];
    const decor = (id: string, x: number, y: number, w: number, h: number, alpha = 1) => {
      const image = this.add.image(x, y, `ref-${id}`).setDisplaySize(w, h).setAlpha(alpha).setDepth(-1);
      this.scenery.push(image); return image;
    };
    const g = this.background; g.clear();
    this.cameras.main.setBackgroundColor(mission.palette.sky);
    for (let x = 450; x < mission.width + 900; x += 900) {
      decor('hills', x, 350, 1000, 230, 0.35);
      decor('clouds', x - 100, 150, 650, 110, 0.32);
    }
    decor('outpost', mission.width * 0.65, 385, 680, 230, 0.35);
    decor('aircraft', mission.width * 0.3, 205, 150, 75, 0.55);
    if (mission.artwork) {
      const a = mission.artwork; decor(a.id, a.x + a.width / 2, a.y + a.height / 2, a.width, a.height).setDepth(0);
    }
    // Layered distant silhouettes, windows and gantries establish each industrial arena.
    for (let i = 0; i < (mission.artwork ? 0 : 12); i++) {
      const x = i * 170, top = 200 + (i * 53 % 160);
      g.fillStyle(0x0c1722, 0.3).fillRect(x, top, 130, 400);
      g.lineStyle(1, mission.palette.trim, 0.12).strokeRect(x, top, 130, 400);
      for (let row = 0; row < 3; row++) g.fillStyle(mission.palette.trim, 0.12).fillRect(x + 15, top + 22 + row * 32, 70, 7);
    }
    for (const t of mission.terrain) {
      g.fillStyle(mission.palette.wall).fillRect(t.x, t.y, t.width, t.height);
      g.fillStyle(mission.palette.trim).fillRect(t.x, t.y, t.width, 3);
      for (let x = t.x + 12; x < t.x + t.width - 10; x += 45) g.fillStyle(0x111a21, 0.25).fillRect(x, t.y + 12, 27, 4);
    }
    for (const [index, nodes] of mission.spawns.entries()) {
      const p = nodes[0];
      g.fillStyle(index === 0 ? 0x58c4c1 : 0xe58c71, 0.16).fillRect(p.x - 65, p.y - 110, 130, 110);
      decor('supply', p.x, p.y - 18, 74, 56).setDepth(1);
    }
  }
  private label(index: number, text: string, x: number, y: number, color = '#e7edf0') {
    this.labels[index] ??= this.add.text(0, 0, '', { fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif', fontSize: '12px', color, backgroundColor: '#101c24bb', padding: { x: 4, y: 2 } }).setOrigin(0.5).setDepth(10);
    this.labels[index].setVisible(true).setPosition(x, y).setText(text).setColor(color);
  }
  private soldier(actor: Actor) {
    const g = this.art, m = actor.movement, x = m.x, y = m.y;
    const color = actor.kit ? CLASSES[actor.kit.classId].color : actor.team === 1 ? 0xb7e8de : 0xf1b0a0;
    this.rig.soldier(x, y, m.crouching, m.vx, m.jumping, this.battle.frame, actor.aim, actor.arsenal.selected, color, actor.life.alive,
      actor.arsenal.gun.reloadFrames, this.battle.effects.some(e => !e.reflected && e.actorId === actor.id && this.battle.frame - e.frame < 2), actor.offhand?.view(), actor.kit?.classId ?? 'medic', actor.id);
    if (!actor.life.alive) return;
    const h = m.crouching ? 44 : 66;
    g.fillStyle(0x09171d, 0.3).fillEllipse(x, y + 2, 36, 5);
    g.fillStyle(0x15212a).fillRect(x - 20, y - h - 12, 40, 4);
    g.fillStyle(color).fillRect(x - 20, y - h - 12, 40 * actor.life.health / actor.life.maxHealth, 4);
    if (actor.life.spawnProtectionFrames) g.lineStyle(1, 0xdceac4, 0.7).strokeEllipse(x, y - h / 2, 48, h + 20);
    if (actor.skillFrames && actor.kit) {
      g.lineStyle(3, CLASSES[actor.kit.classId].color, 0.8).strokeEllipse(x, y - h / 2, 57, h + 28);
      if (actor.kit.skill === 'cloak') g.fillStyle(0xc1a4f0, 0.35).fillEllipse(x, y - h / 2, 57, h + 28);
    }
    if (actor.human) g.fillStyle(0xe5f49a).fillTriangle(x, y - h - 19, x - 5, y - h - 26, x + 5, y - h - 26);
  }
  update(_time: number, delta: number) {
    const beforeHealth = this.battle.player.life.health;
    if (this.activeBattle) {
      const pointer = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      const has = (...keys: string[]) => keys.some(k => this.keys.has(k));
      this.session.advance(Math.min(delta, 100), () => ({ ...idleInput(), left: has('KeyA', 'ArrowLeft'), right: has('KeyD', 'ArrowRight'),
        crouch: has('KeyS', 'ArrowDown'), jump: this.jumpQueued || has('KeyW', 'ArrowUp', 'Space'), fire: has('KeyF') || this.mouse, aim: { x: pointer.x, y: pointer.y } }), () => { this.jumpQueued = false; });
    }
    const b = this.battle; this.cameras.main.centerOn(b.player.movement.x, b.mission.height ? b.player.movement.y - 150 : 355);
    this.rig.begin();
    this.art.clear(); for (const label of this.labels) label.setVisible(false);
    if (b.mission.mode === 'dom') {
      const p = b.mission.objective;
      const color = { neutral: 0xd8dcba, blue: 0x61bbb4, red: 0xdf806c, contested: 0xf6c25c }[b.objective];
      this.art.fillStyle(color, 0.15).fillRect(p.x - 85, p.y - 140, 170, 140);
      this.art.lineStyle(3, color).lineBetween(p.x, p.y, p.x, p.y - 125);
      this.art.fillStyle(color).fillTriangle(p.x, p.y - 125, p.x + 40, p.y - 110, p.x, p.y - 95);
    }
    b.actors.forEach((actor, i) => {
      if (actor.team !== b.player.team && actor.life.alive && isConcealed(actor)) return;
      this.soldier(actor); if (actor.life.alive) this.label(i, actor.name, actor.movement.x, actor.movement.y - (actor.movement.crouching ? 72 : 92), actor.team === 1 ? '#99e3d8' : '#f2b19b');
    });
    let label = b.actors.length;
    if (b.mission.mode === 'ctf') this.rig.delivery(b.snapshot().deliveryTargets, new Map(b.actors.map(a => [a.id, a.movement])), this.art);
    for (const effect of b.effects) {
      const age = b.frame - effect.frame;
      this.rig.tracer(this.art, effect.trace, effect.reflected ? undefined : effect.actorId, age, b.actors.find(a => a.id === effect.actorId)?.arsenal.selected);
      if (effect.damage > 0 && effect.team === 1) this.label(label++, effect.killed ? '击败' : `${Math.round(effect.damage)}`, effect.trace.end.x, effect.trace.end.y - 24 - age, effect.killed ? '#efff91' : '#ffffff');
    }
    for (const grenade of b.grenades) this.art.fillStyle(0xeec17a).fillCircle(grenade.x, grenade.y, 5);
    for (const p of b.projectiles) this.art.lineStyle(3, 0xffc56a, .9).lineBetween(p.x - p.vx * 2, p.y - p.vy * 2, p.x, p.y).fillStyle(0xffedbb).fillCircle(p.x, p.y, 3);
    for (const burst of b.bursts) {
      const fraction = (b.frame - burst.frame) / 18;
      this.art.lineStyle(3, burst.color, 1 - fraction).strokeCircle(burst.x, burst.y, burst.radius * (0.3 + fraction * 0.7));
      this.art.fillStyle(burst.color, (1 - fraction) * 0.1).fillCircle(burst.x, burst.y, burst.radius);
    }
    const events = b.journal.since(this.eventCursor);
    if (events.some(event => event.kind === 'shot')) this.audio.cue('shot');
    if (events.some(event => event.kind === 'damage' && b.actors.find(a => a.id === event.actorId)?.team === 1)) this.audio.cue('hit');
    this.eventCursor = b.journal.cursor;
    this.hurtOverlay.setAlpha(beforeHealth > b.player.life.health ? 0.16 : this.hurtOverlay.alpha * 0.85);
    if (this.activeBattle) {
      const p = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
      this.art.lineStyle(1, 0xe4f49a).strokeCircle(p.x, p.y, 5).lineBetween(p.x - 10, p.y, p.x - 6, p.y).lineBetween(p.x + 6, p.y, p.x + 10, p.y);
    }
    this.onFrame?.();
  }
}
declare global { interface Window { __strikeCampaign?: CampaignScene } }
