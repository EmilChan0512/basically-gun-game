import { describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { buildInventory, scanScript, report } from '../../tools/archaeology/indexer';

describe('ActionScript archaeology', () => {
  it('indexes source locations and candidates without claiming verified values', () => {
    const item = scanScript('// class False {}\npackage lab {\npublic class Soldier {\nconst speed:Number = 250;\nvar ammo:int = 12;\n} }', 'Soldier.as');
    expect(item.classes).toEqual([{ name: 'Soldier', line: 3 }]);
    expect(item.packages).toEqual(['lab']);
    expect(item.constants[0]).toMatchObject({ name: 'speed', expression: '250', line: 4, evidenceType: 'INFERRED' });
    expect(item.concepts.ammo).toHaveLength(1);
  });
  it('supports AS2 timeline exports with no classes', () => {
    const item = scanScript('_root.player.health = 100;\nfunction respawn() {}', 'frame1.as');
    expect(item.classes).toEqual([]);
    expect(item.likelyGameplay).toBe(true);
  });
  it('writes an honest empty-reference inventory', async () => {
    const inventory = await buildInventory(path.join(tmpdir(), 'strike-nonexistent-input'));
    expect(inventory.status).toBe('AWAITING_REFERENCE');
    expect(report(inventory)).toContain('No candidates discovered');
  });
  it('recurses and links imports between synthetic files', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'strike-index-'));
    try {
      await mkdir(path.join(dir, 'lab'));
      await writeFile(path.join(dir, 'lab/A.as'), 'package lab { import lab.B; public class A {} }');
      await writeFile(path.join(dir, 'lab/B.as'), 'package lab { public class B {} }');
      const inventory = await buildInventory(dir);
      expect(inventory.scriptCount).toBe(2);
      expect(inventory.references).toEqual([{ from: 'lab/A.as', to: 'lab/B.as', via: 'lab.B', confidence: 0.6 }]);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('runs the real CLI end to end on synthetic exports without fabricating reference facts', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'strike-cli-'));
    try {
      await writeFile(path.join(dir, 'Player.as'), 'package lab { public class Player { public var health:int = 100; } }');
      const reportDir = path.join(dir, 'reports');
      const output = execFileSync(process.execPath, ['--import', 'tsx', 'tools/archaeology/cli.ts', 'index', '--input', dir, '--output', reportDir], { encoding: 'utf8' });
      expect(output).toContain('Inventory: 1 scripts');
      const inventory = JSON.parse(await readFile(path.join(reportDir, 'inventory.json'), 'utf8'));
      expect(inventory.scripts[0].classes[0].name).toBe('Player');
      expect(inventory.status).toBe('INDEXED_UNREVIEWED');
      const strict = spawnSync(process.execPath, ['--import', 'tsx', 'tools/archaeology/cli.ts', 'pipeline', '--swf', path.join(dir, 'missing.swf'), '--input', path.join(dir, 'missing'), '--output', reportDir, '--require-reference'], { encoding: 'utf8' });
      expect(strict.status).toBe(1);
      expect(strict.stdout).toContain('Reference missing');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
