import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Battle, seededRandom } from '../src/game/campaign/Battle';
import { customMatch } from '../src/shared/content/Maps';
import { idleInput } from '../src/game/campaign/Battle';
import { defaultGrowthLoadout, GROWTH_CLASSES, GROWTH_WEAPONS, type GrowthClassId, type GrowthLoadout } from '../src/shared/content/GrowthCatalog';
import { freshGrowthCareer, ownedGrowthLoadout } from '../src/shared/content/GrowthCareer';
import { GROWTH_ATTACHMENTS } from '../src/shared/content/GrowthRecords';
import { growthSpeed } from '../src/shared/simulation/GrowthCombat';
import { CONTENT_VERSION } from '../src/shared/protocol/ContentVersion';

const fresh = freshGrowthCareer(), veteran = freshGrowthCareer();
veteran.xp = 100000;
for (const id of Object.keys(GROWTH_CLASSES) as GrowthClassId[]) veteran.mastery[id] = 100000;
for (const id of Object.keys(GROWTH_WEAPONS) as (keyof typeof GROWTH_WEAPONS)[]) veteran.weaponXp[id] = 100000;
const start = (loadout: GrowthLoadout) => {
  // Retained v2 regression audit. Current v3 authority evidence uses tools/qa/growth-v3-battle.ts.
  const battle = new Battle({ ...customMatch('signal', 'tdm'), allies: 0, enemies: 1, seconds: 900 }, 'normal', 'm4', seededRandom(17), null, 'legacy-growth-audit');
  battle.actors.forEach(a => { a.human = true; battle.equipGrowth(a, a.id === 'player' ? loadout : defaultGrowthLoadout()); });
  return battle;
};
const comparisons: { classId: string; primary: string; identicalTicks: number; health: number; damage: number }[] = [];
const attachments: { classId: string; primary: string; attachment: string; benefits: string[]; costs: string[] }[] = [];
for (const classId of Object.keys(GROWTH_CLASSES) as GrowthClassId[]) {
  for (const primary of GROWTH_CLASSES[classId].weapons) {
    const build = { ...defaultGrowthLoadout(classId), primary };
    const novice = start(ownedGrowthLoadout(fresh, build)), experienced = start(ownedGrowthLoadout(veteran, build));
    assert.deepEqual(novice.checkpoint(), experienced.checkpoint(), `${classId}/${primary}: initial level advantage`);
    for (let tick = 0; tick < 600; tick++) {
      const input = { ...idleInput(), right: tick % 120 < 60, left: tick % 120 >= 60, jump: tick % 60 < 5, fire: tick % 4 < 2 };
      if (tick % 150 === 0) { novice.useSkill(); experienced.useSkill(); }
      if (tick % 80 === 0) { novice.reload(); experienced.reload(); }
      if (tick === 200) { novice.damage(novice.player, 10000); experienced.damage(experienced.player, 10000); }
      novice.tick(input); experienced.tick(input);
      assert.deepEqual(novice.checkpoint(), experienced.checkpoint(), `${classId}/${primary}: level advantage at tick ${tick}`);
    }
    assert.equal(novice.player.kit, null, 'Legacy kit must not enter growth combat');
    assert.equal(novice.player.life.maxHealth, GROWTH_CLASSES[classId].health);
    comparisons.push({ classId, primary, identicalTicks: 600, health: novice.player.life.maxHealth, damage: novice.player.arsenal.gun.weapon.damage });
    const baseline = start(build), baseGun = baseline.player.arsenal.gun.weapon, baseSpeed = growthSpeed(baseline.player, 0);
    for (const attachment of Object.keys(GROWTH_ATTACHMENTS) as (keyof typeof GROWTH_ATTACHMENTS)[]) {
      if (attachment === 'none') continue;
      const variant = start(ownedGrowthLoadout(veteran, { ...build, attachment })), actor = variant.player, gun = actor.arsenal.gun.weapon;
      assert.equal(gun.damage, baseGun.damage, 'Attachments must not raise base damage');
      assert.equal(actor.life.maxHealth, baseline.player.life.maxHealth, 'Attachments must not raise health');
      const dimensions = [
        ['spread', -baseGun.recoil, -gun.recoil], ['range', baseGun.rangeUnits, gun.rangeUnits],
        ['magazine', baseGun.magazineSize, gun.magazineSize], ['reload speed', -baseGun.reloadFrames, -gun.reloadFrames],
        ['movement', baseSpeed, growthSpeed(actor, 0)],
      ] as const;
      const benefits = dimensions.filter(([, before, after]) => after > before).map(([label]) => label);
      const costs = dimensions.filter(([, before, after]) => after < before).map(([label]) => label);
      assert(benefits.length && costs.length, `${classId}/${primary}/${attachment}: no meaningful tradeoff`);
      attachments.push({ classId, primary, attachment, benefits, costs });
    }
  }
}
const report = { contentVersion: CONTENT_VERSION, date: new Date().toISOString(), passed: true, comparisons, attachments,
  scope: 'Deterministic mechanical audit: fresh versus fully unlocked career, identical builds and 600 ticks including firing, skills, movement, reload and respawn. Every legal primary/class and attachment is checked. A benefit and a cost prove a mechanical tradeoff, not equal match win rates or human-perceived value. Slot opportunity costs, evolved builds and live balance still require separate assessment.' };
mkdirSync('artifacts/qa', { recursive: true });
writeFileSync('artifacts/qa/growth-balance-audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ passed: true, contentVersion: CONTENT_VERSION, careerComparisons: comparisons.length,
  simulatedComparisonTicks: comparisons.length * 600, attachmentTradeoffs: attachments.length, report: 'artifacts/qa/growth-balance-audit.json' }));
