import { describe, it, expect } from 'vitest';
import { characterPose, CHARACTER_ART } from '../../src/client/presentation/CharacterPose';
import { CLASSES, WEAPONS } from '../../src/game/campaign/Catalog';
import type { WeaponId } from '../../src/game/combat/Combat';
import manifest from '../../public/assets/characters/manifest.json';
import { SPECIAL_OFFHANDS, type SpecialOffhandId } from '../../src/shared/content/Offhands';

describe('recovered character anatomy', () => {
  it('raises and lowers the head around its neck across stances and facing directions', () => {
    for (const role of Object.keys(CLASSES) as (keyof typeof CLASSES)[]) for (const stance of [{}, {crouch:true}, {vx:5,frame:8}, {jumping:true}]) {
      const head=(x:number,y:number,flip=false)=>characterPose(role,'m4',{...stance,...('vx' in stance ? {vx:flip?-stance.vx!:stance.vx}:{}),aim:{x,y},flip}).parts.find(p=>p.id.endsWith('-head'))!.matrix;
      const up=head(200,-400),down=head(200,300),level=head(200,-42),left=head(-200,-400,true);
      expect(Math.atan2(up[1],up[0])).toBeLessThan(Math.atan2(down[1],down[0]));
      for(const m of [up,down]) {expect(m[4]).toBe(level[4]);expect(m[5]).toBe(level[5]);}
      expect(left[0]).toBeCloseTo(-up[0]);expect(left[1]).toBeCloseTo(up[1]);
      expect(left[4]).toBeCloseTo(-up[4]);expect(left[5]).toBeCloseTo(up[5]);
    }
  });
  it('rotates only firearm joints for growth recoil while keeping the source aim and body intact', () => {
    const aim={x:200,y:-35};
    const base=characterPose('commando','m4',{aim,recoilDegrees:0});
    const kicked=characterPose('commando','m4',{aim,recoilDegrees:8});
    expect(aim).toEqual({x:200,y:-35});
    const body=(pose:typeof base)=>pose.parts.filter(p=>p.id.endsWith('-boot')||p.id.endsWith('-torso')||p.id.endsWith('-head'));
    expect(body(kicked)).toEqual(body(base));
    expect(kicked.parts.find(p=>p.id==='m4')!.matrix).not.toEqual(base.parts.find(p=>p.id==='m4')!.matrix);
    expect(kicked.muzzle!.y).toBeLessThan(base.muzzle!.y);
  });
  it('breathes with anchored feet and loops without a pose discontinuity', () => {
    const first = characterPose('assassin', 'm4', { frame: 0 });
    const middle = characterPose('assassin', 'm4', { frame: 30 });
    expect(middle.parts).not.toEqual(first.parts);
    expect(characterPose('assassin', 'm4', { frame: 60 })).toEqual(first);
    const feet = (pose: typeof first) => pose.parts.filter(p => p.id.endsWith('-boot'));
    feet(middle).forEach((part, i) => {
      expect(Math.abs(part.matrix[4] - feet(first)[i].matrix[4])).toBeLessThan(.2);
      expect(Math.abs(part.matrix[5] - feet(first)[i].matrix[5])).toBeLessThan(.2);
    });
  });
  it('uses original melee grips with a single weapon and mirrors all authored attack frames', () => {
    for (const [id, item] of Object.entries(SPECIAL_OFFHANDS)) if (item.kind === 'melee') {
      const poses = [];
      for (let age = -1; age <= item.windup + item.active + item.recovery; age++) {
        const melee = { id: id as SpecialOffhandId, age };
        const right = characterPose('assassin', 'm4', { melee, aim: { x: 100, y: -42 } });
        const left = characterPose('assassin', 'm4', { melee, flip: true, aim: { x: -100, y: -42 } });
        expect(right.parts.filter(p => p.id === id)).toHaveLength(1);
        expect(right.parts.filter(p => p.id.endsWith('-hand'))).toHaveLength(2);
        right.parts.forEach((part, i) => {
          expect(CHARACTER_ART[part.id]).toBeDefined();
          expect(part.matrix.every(Number.isFinite)).toBe(true);
          expect(left.parts[i].matrix[4]).toBeCloseTo(-part.matrix[4]);
          expect(left.parts[i].matrix[5]).toBeCloseTo(part.matrix[5]);
        });
        poses.push(right.parts);
      }
      expect(new Set(poses.map(pose => JSON.stringify(pose))).size).toBeGreaterThan(5);
    }
  });
  it('uses upper arms and hands, never the thigh symbol as an arm', () => {
    for (const role of Object.keys(CLASSES)) {
      const symbol = (part: string) => manifest.assets.find(asset => asset.id === `${role}-${part}`)?.symbol;
      expect(symbol('thigh')).toBe(598); expect(symbol('shin')).toBe(568);
      expect(symbol('upperarm')).toBe(298); expect(symbol('forearm')).toBe(266); expect(symbol('hand')).toBe(385);
    }
  });
  it('mirrors the whole grip and muzzle together when facing left', () => {
    for (const weapon of Object.keys(WEAPONS) as WeaponId[]) {
      const right = characterPose('assassin', weapon, { aim: { x: 100, y: -90 } });
      const left = characterPose('assassin', weapon, { flip: true, aim: { x: -100, y: -90 } });
      expect(left.muzzle!.x).toBeCloseTo(-right.muzzle!.x); expect(left.muzzle!.y).toBeCloseTo(right.muzzle!.y);
      for (let i = 0; i < right.parts.length; i++) {
        expect(left.parts[i].matrix[4]).toBeCloseTo(-right.parts[i].matrix[4]);
        expect(left.parts[i].matrix[5]).toBeCloseTo(right.parts[i].matrix[5]);
      }
    }
  });
});
