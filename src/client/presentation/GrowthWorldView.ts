import type { StateMessage } from '../../shared/protocol/State';

/** Common world primitives for Phaser and the local range canvas. */
export interface GrowthGraphics {
  fillStyle(color: number, alpha?: number): this;
  lineStyle(width: number, color: number, alpha?: number): this;
  fillRect(x: number, y: number, width: number, height: number): this;
  strokeRect(x: number, y: number, width: number, height: number): this;
  fillCircle(x: number, y: number, radius: number): this;
  strokeCircle(x: number, y: number, radius: number): this;
  strokeEllipse(x: number, y: number, width: number, height: number): this;
  lineBetween(x1: number, y1: number, x2: number, y2: number): this;
  beginPath(): this;
  arc(x: number, y: number, radius: number, start: number, end: number, anticlockwise?: boolean): this;
  strokePath(): this;
}

/** Draw only the recipient-filtered snapshot; never recover hidden entity positions. */
export function drawGrowthWorld(graphics: GrowthGraphics, state: StateMessage['state']) {
  const world = state.growthWorld;
  if (!world) return;
  for (const smoke of world.smoke) {
    const alpha = Math.min(1, Math.max(0, (smoke.expiresTick - state.frame) / 30));
    graphics.fillStyle(0x899caa, .28 * alpha).fillCircle(smoke.x, smoke.y, smoke.radius);
    graphics.fillStyle(0xb7c8ce, .18 * alpha).fillCircle(smoke.x, smoke.y, smoke.radius * .8);
    graphics.lineStyle(2, 0xc8d9df, .45 * alpha).strokeCircle(smoke.x, smoke.y, smoke.radius);
  }
  for (const entity of world.entities) {
    const color = entity.stopped ? 0x9b9ba7 : entity.team === 1 ? 0x58c6ff : 0xff9748;
    const x = entity.x - entity.width / 2, y = entity.y - entity.height / 2;
    graphics.fillStyle(0x172c39, .85).fillRect(x, y, entity.width, entity.height);
    graphics.lineStyle(entity.armed ? 2 : 1, color, entity.armed ? 1 : .5).strokeRect(x, y, entity.width, entity.height);
    graphics.fillStyle(color, .9).fillRect(x, y - 6, entity.width * Math.max(0, Math.min(1, entity.health / entity.maxHealth)), 3);
    graphics.lineStyle(2, entity.stopped ? 0x777c88 : 0xe3f1ef, .9);
    switch(entity.gadgetId) {
      case 'tk_cover':
        graphics.fillStyle(color,.35).fillRect(x+3,y+4,entity.width-6,10);
        for(let row=18;row<entity.height-3;row+=10)graphics.lineBetween(x+3,y+row,x+entity.width-3,y+row);
        graphics.lineBetween(x-3,y+entity.height,x+entity.width+3,y+entity.height);break;
      case 'tk_interceptor':
        graphics.strokeCircle(entity.x,entity.y-3,6).lineBetween(entity.x,entity.y-9,entity.x,entity.y+6)
          .lineBetween(entity.x-6,entity.y+6,entity.x+6,entity.y+6);break;
      case 'sn_beacon':
        graphics.lineBetween(entity.x,entity.y+8,entity.x,entity.y-8).strokeCircle(entity.x,entity.y-6,3)
          .lineBetween(entity.x-5,entity.y+8,entity.x+5,entity.y+8);break;
      case 'md_station':
        graphics.lineStyle(3, entity.stopped ? 0x777c88 : 0x7fffc0).lineBetween(entity.x-6,entity.y,entity.x+6,entity.y)
          .lineBetween(entity.x,entity.y-6,entity.x,entity.y+6);break;
      case 'md_ammo':
        for(const offset of [-7,0,7])graphics.lineBetween(entity.x+offset,entity.y+5,entity.x+offset,entity.y-4)
          .lineBetween(entity.x+offset-2,entity.y-2,entity.x+offset,entity.y-5);break;
      case 'as_charge':
        graphics.lineStyle(1,entity.armed?0xffc078:0x778b93).lineBetween(x+3,y,x+3,y+entity.height)
          .lineBetween(x+entity.width-3,y,x+entity.width-3,y+entity.height);
        graphics.fillStyle(entity.armed?0xff6a56:0x6c7883).fillCircle(entity.x,entity.y,2);break;
      case 'sn_decoy':
        graphics.strokeCircle(entity.x,entity.y,3).lineBetween(x+2,y+2,x+entity.width-2,y+2);break;
    }
    if(entity.stopped)graphics.lineStyle(2,0xb6a7df).lineBetween(x-2,y-2,x+entity.width+2,y+entity.height+2);
  }
  for (const flying of world.flying) {
    const color = flying.team === 1 ? 0x58c6ff : 0xff9748;
    graphics.lineStyle(2, color, .5).lineBetween(flying.x - flying.vx, flying.y - flying.vy, flying.x, flying.y);
    graphics.fillStyle(color).fillCircle(flying.x, flying.y, 4);
  }
}

export function drawGrowthAbilities(graphics: GrowthGraphics, message: StateMessage, positions: ReadonlyMap<string, { x: number; y: number }>) {
  for (const actor of message.state.actors) {
    if (!actor.life.alive || !actor.growthV3) continue;
    if (actor.growthV3.perkPower) {
      const point = positions.get(actor.id) ?? actor;
      const color = actor.growthV3.classId === 'medic' ? 0x80ffc0 : actor.growthV3.classId === 'tank' ? 0x8bdeff : 0xffd477;
      graphics.lineStyle(3, color, .75).strokeCircle(point.x, point.y - 33, 30 + Math.sin(message.state.frame / 4) * 3);
    }
    if (!actor.growthV3.activeAbility) continue;
    const point = positions.get(actor.id) ?? actor, y = point.y - (actor.crouching ? 22 : 33);
    if (actor.growthV3.activeAbility === 'tk_shield') {
      const aim = message.poses.find(p => p.id === actor.id)?.aim;
      if (!aim) continue;
      const angle = Math.atan2(aim.y - y, aim.x - point.x);
      graphics.lineStyle(4, 0x8bdeff, .9).beginPath();
      graphics.arc(point.x, y, 35, angle - Math.PI / 3, angle + Math.PI / 3, false).strokePath();
    } else if (actor.growthV3.activeAbility === 'tk_barrier') {
      graphics.lineStyle(2, 0x8bdeff, .7).strokeEllipse(point.x, y, 42, 72);
    } else if (actor.growthV3.activeAbility === 'md_link') {
      const target = message.state.actors.find(a => a.id === actor.growthV3!.linkTargetId && a.life.alive);
      if (!target) continue;
      const end = positions.get(target.id) ?? target, targetY = end.y - (target.crouching ? 22 : 33);
      graphics.lineStyle(5, 0x59efab, .2).lineBetween(point.x, y, end.x, targetY);
      graphics.lineStyle(2, 0xa4ffd2, .8).lineBetween(point.x, y, end.x, targetY);
      graphics.lineStyle(2, 0xa4ffd2, .6).strokeCircle(end.x, targetY, 16);
    }
  }
}
