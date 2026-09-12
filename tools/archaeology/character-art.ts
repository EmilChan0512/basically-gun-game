import weapons from '../../src/shared/content/weapon-catalog.json' with { type: 'json' };
import { SPECIAL_OFFHANDS } from '../../src/shared/content/Offhands';
/** Recover vector body parts and authored joint transforms; never execute SWF scripts. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { inspectTimeline, displayListAt } from './timeline';

const swf = readFileSync('archaeology/swf/sfh1_reference.swf');
const output = 'public/assets/characters'; mkdirSync(output, { recursive: true });
const symbols = { forearm: 266, upperarm: 298, hand: 385, boot: 538, shin: 568, thigh: 598, torso: 631, head: 666 };
const guns = Object.fromEntries(Object.entries(weapons).map(([id, weapon]) => [id, weapon.artFrameId]));
const gunTimeline = inspectTimeline(swf, 'MBFZ_fla.Guns_290');
for (const [id, item] of Object.entries(SPECIAL_OFFHANDS)) if (item.kind === 'melee') {
  guns[id] = gunTimeline.labels.find(label => label.name === item.source)!.frame;
}
const art: Record<string, { x: number; y: number; w: number; h: number }> = {};
const evidence: object[] = [];
const browser = await chromium.launch(); const page = await browser.newPage();
try {
  const entries = Object.entries({ assassin: 1, medic: 51, tank: 101, commando: 151 }).flatMap(([role, frame]) =>
    Object.entries(symbols).map(([part, symbol]) => ({ id: `${role}-${part}`, frame, symbol, part, directory: `DefineSprite_${symbol}` })));
  entries.push(...Object.entries(guns).map(([id, frame]) => ({ id, frame, symbol: 375, part: 'weapon', directory: 'DefineSprite_375_MBFZ_fla.Guns_290' })));
  for (const entry of entries) {
    const source = readFileSync(`archaeology/local/anatomy-export/${entry.directory}/${entry.frame}.svg`, 'utf8');
    const normalized = await page.evaluate(({ source, part }) => {
      const documentSvg = new DOMParser().parseFromString(source, 'image/svg+xml');
      const svg = document.importNode(documentSvg.documentElement, true) as unknown as SVGSVGElement;
      const group = svg.querySelector('g')!;
      group.removeAttribute('transform');
      // UnitMC.setSkin hides the rear thigh's gun. Keep holstered weapons out
      // of both thigh textures; equipment is rendered by its own attachment.
      if (part === 'thigh') group.querySelector('#gun')?.remove();
      document.body.replaceChildren(svg);
      const box = group.getBBox(), pad = .5;
      const bounds = { x: box.x - pad, y: box.y - pad, w: box.width + pad * 2, h: box.height + pad * 2 };
      svg.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`);
      svg.setAttribute('width', String(bounds.w)); svg.setAttribute('height', String(bounds.h));
      return { bounds, svg: new XMLSerializer().serializeToString(svg) };
    }, { source, part: entry.part });
    writeFileSync(`${output}/${entry.id}.svg`, normalized.svg);
    art[entry.id] = normalized.bounds;
    evidence.push({ id: entry.id, symbol: entry.symbol, frame: entry.frame, sha256: createHash('sha256').update(normalized.svg).digest('hex') });
  }
} finally { await browser.close(); }
const body = inspectTimeline(swf, 'UnitMC');
const rear = inspectTimeline(swf, 'MBFZ_fla.arm_gun_316'), front = inspectTimeline(swf, 'MBFZ_fla.arm_front_328');
const bodyParts: Record<string, string> = { foot1: 'boot', foot2: 'boot', leglow1: 'shin', leglow2: 'shin', legup1: 'thigh', legup2: 'thigh', body: 'torso', headhold: 'head', arm1hold: 'shoulder' };
const armParts: Record<string, string> = { arm1up: 'upperarm', arm2up: 'upperarm', arm1low: 'forearm', arm2low: 'forearm', hand1: 'hand', hand2: 'hand', gun: 'weapon' };
function pose(timeline: typeof body, frame: number, mapping: Record<string, string>) {
  return displayListAt(timeline, frame).filter(p => p.name && mapping[p.name]).map(p => ({
    part: mapping[p.name!], name: p.name!, matrix: (p.matrix ?? [1, 0, 0, 1, 0, 0]).map(n => +n.toFixed(6)),
  }));
}
function clip(timeline: typeof body, name: string, mapping: Record<string, string>) {
  const i = timeline.labels.findIndex(label => label.name === name);
  if (i < 0) throw Error(`Missing animation ${name}`);
  const from = timeline.labels[i].frame, to = timeline.labels[i + 1]?.frame ?? timeline.frames + 1;
  return Array.from({ length: to - from }, (_, n) => pose(timeline, from + n, mapping));
}
const locomotion = Object.fromEntries(['idle', 'run1', 'runback1', 'run2', 'runback2', 'jump', 'fallloop', 'duckloop', 'duckrun', 'duckrunback'].map(name => [name, clip(body, name, bodyParts)]));
const arms = Object.fromEntries(['pistol', 'mpistol', 'rifle', 'shotgun', 'heavy', 'sniper', 'magnum', 'bullpup', 'rocket', 'launcher'].flatMap(name => [name, `${name}_fire`, `${name}_reload`]).map(name => [name, { rear: clip(rear, name, armParts), front: clip(front, name, armParts) }]));
for (const name of ['knife', 'knife_fire', 'sword', 'sword_fire']) arms[name] = { rear: clip(rear, name, armParts), front: clip(front, name, armParts) };
writeFileSync('src/client/presentation/character-poses.json', JSON.stringify({ art, locomotion, arms, restingArm: pose(front, 1, armParts) }));
writeFileSync(`${output}/manifest.json`, JSON.stringify({ source: 'SFH1 v1.2.1', swfSha256: createHash('sha256').update(swf).digest('hex'),
  method: 'Static FFDec SVG export; original limb identities and placement matrices; normalized viewBox; thigh gun attachment hidden; no original scripts executed', assets: evidence }, null, 2));
console.log(`Recovered ${evidence.length} vector assets, ${Object.keys(locomotion).length} movement clips and ${Object.keys(arms).length} hand/weapon clips.`);
