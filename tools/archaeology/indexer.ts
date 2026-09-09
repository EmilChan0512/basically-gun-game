import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const concepts = ['movement', 'weapon', 'player', 'ai', 'damage', 'health', 'ammo', 'reload', 'spawn', 'score', 'team', 'gameMode'] as const;
const patterns: Record<string, RegExp> = {
  movement: /\b(?:move\w*|jump\w*|gravity|velocity\w*|speed\w*|acceleration\w*|ledge\w*)\b/gi,
  weapon: /\b(?:weapon\w*|rifle\w*|pistol\w*|gun\w*|shotgun\w*|sniper\w*)\b/gi,
  player: /\b(?:player\w*|soldier\w*|medic\w*|assassin\w*|commando\w*|tank\w*)\b/gi,
  ai: /\b(?:ai|bot\w*|target\w*|path\w*)\b/gi,
  damage: /\b(?:damage\w*|hit\w*|hurt\w*)\b/gi,
  health: /\b(?:health\w*|hp|armor\w*|armour\w*)\b/gi,
  ammo: /\b(?:ammo\w*|magazine\w*|bullet\w*)\b/gi,
  reload: /\b(?:reload\w*)\b/gi, spawn: /\b(?:spawn\w*|respawn\w*)\b/gi,
  score: /\b(?:score\w*|kill\w*|frag\w*)\b/gi, team: /\b(?:team\w*|ally\w*|enemy\w*)\b/gi,
  gameMode: /\b(?:gameMode\w*|deathmatch\w*|tdm|capture\w*|match\w*)\b/gi,
};
export async function filesUnder(root: string): Promise<string[]> {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  const nested = await Promise.all(entries.map(e => e.isDirectory() ? filesUnder(path.join(root, e.name)) : e.isFile() ? [path.join(root, e.name)] : []));
  return nested.flat().sort();
}
export function scanScript(text: string, file: string) {
  // Heuristic lexical index, not an ActionScript parser. Never auto-promote semantic guesses to evidence.
  const code = text.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, match => match.replace(/[^\n]/g, ' '));
  const line = (offset: number) => code.slice(0, offset).split('\n').length;
  const packages = [...code.matchAll(/\bpackage\s*([\w.]*)\s*\{/g)].map(m => m[1] || '(default)');
  const classes = [...code.matchAll(/\b(?:class|interface)\s+([\w.]+)/g)].map(m => ({ name: m[1], line: line(m.index!) }));
  const imports = [...code.matchAll(/\bimport\s+([\w.*]+)/g)].map(m => m[1]);
  const constants = [...code.matchAll(/\b(const|var)\s+(\w+)\s*(?::\s*[\w.<>]+)?\s*=\s*([^;\n]+)/g)]
    .map(m => ({ name: m[2], expression: m[3].trim(), declaration: m[1], line: line(m.index!), evidenceType: 'INFERRED', confidence: 0.35 }));
  const hits = Object.fromEntries(concepts.map(key => [key, [...code.matchAll(patterns[key])].map(m => ({ token: m[0], line: line(m.index!) }))]));
  const decompilerArtifactCount = (text.match(/§§/g) || []).length;
  return { file, sha256: createHash('sha256').update(text).digest('hex'), packages, classes, imports, constants, concepts: hits, likelyGameplay: Object.values(hits).some(v => v.length > 0), decompilerArtifactCount, requiresBytecodeReview: decompilerArtifactCount > 0 };
}
export async function buildInventory(root: string) {
  const scripts = await Promise.all((await filesUnder(root)).filter(f => f.toLowerCase().endsWith('.as')).map(async f => scanScript(await readFile(f, 'utf8'), path.relative(root, f).replaceAll('\\', '/'))));
  const references = scripts.flatMap(from => from.imports.flatMap(name => scripts.filter(to => to.classes.some(c => name === c.name || to.packages.some(p => name === `${p}.${c.name}` || name === `${p}.*`))).map(to => ({ from: from.file, to: to.file, via: name, confidence: 0.6 }))));
  return { schemaVersion: 1, generatedAt: new Date().toISOString(), status: scripts.length ? 'INDEXED_UNREVIEWED' : 'AWAITING_REFERENCE', scriptCount: scripts.length, packages: [...new Set(scripts.flatMap(s => s.packages))], scripts, references, warning: 'Lexical candidates only. AS2 timeline code may have no class/package. Review exact source before adding EXTRACTED records.' };
}
export function report(inventory: Awaited<ReturnType<typeof buildInventory>>) {
  return `# First-pass archaeology report\n\nStatus: ${inventory.status}\n\nScripts: ${inventory.scriptCount}; packages: ${inventory.packages.length}.\n\nNo semantic mapping is verified by this index. Empty output means no reference input, not proof of missing behavior.\n\n` + concepts.map(key => `## ${key}\n\n` + (inventory.scripts.filter(s => s.concepts[key].length).map(s => `- ${s.file}: ${s.concepts[key].length} token candidates (INFERRED, confidence 0.35)`).join('\n') || 'No candidates discovered.') + '\n').join('\n');
}
