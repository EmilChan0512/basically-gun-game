import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GROWTH_CLASSES, GROWTH_UPGRADES } from '../src/shared/content/GrowthCatalog';
import { GROWTH_V3_CARDS, GROWTH_V3_EVOLUTIONS } from '../src/shared/content/growth-v3/Cards';
import { MAPS } from '../src/shared/content/Maps';

type Player = { classId?: string; level: number; xp: number; choices: { id: string; latency: number }[] };
type Sample = { roomId: string; round: number; time?: string; contentVersion?: string; mapId?:string; mode?:string; growthPreset?:string; trainingBots: number; players: Player[] };
const nonnegative = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
const valid = (row: Sample) => typeof row.roomId === 'string' && nonnegative(row.round) && nonnegative(row.trainingBots)
  && (row.mapId===undefined||MAPS.some(map=>map.id===row.mapId))
  && (row.mode===undefined||row.mode==='tdm'||row.mode==='dom')
  && (row.growthPreset===undefined||row.growthPreset==='standard'||row.growthPreset==='short')
  && (row.contentVersion === undefined || typeof row.contentVersion === 'string' && /^[a-f0-9]{16}$/.test(row.contentVersion))
  && Array.isArray(row.players) && row.players.length > 0 && row.players.length <= 8
  && row.players.every(player => player && typeof player === 'object' && nonnegative(player.level) && player.level >= 1 && player.level <= 5 && nonnegative(player.xp)
    && Array.isArray(player.choices) && player.choices.length <= 4
    && player.choices.every(choice => choice && typeof choice === 'object' && typeof choice.id === 'string'
      && [GROWTH_UPGRADES,GROWTH_V3_CARDS,GROWTH_V3_EVOLUTIONS].some(catalog=>Object.hasOwn(catalog,choice.id)) && nonnegative(choice.latency)));

/** Explicit allowlist: never copy raw logs, identities, authentication fields or arbitrary objects into the report. */
export function growthPlaytestReport(lines: string[]) {
  const rows: Sample[] = [], seen = new Set<string>(); let malformed = 0, duplicates = 0;
  for (const line of lines) {
    if (!line.trim()) continue;
    let value;
    try { value = JSON.parse(line); } catch { malformed++; continue; }
    if (!value || value.event !== 'growth.playtest_result') continue;
    // Current server roomFields emits content; preserve the historical contentVersion alias.
    if(value.content!==undefined&&value.contentVersion!==undefined&&value.content!==value.contentVersion){malformed++;continue;}
    value={...value,contentVersion:value.contentVersion??value.content};
    if (!valid(value)) { malformed++; continue; }
    const sample:Sample=value;
    const key = JSON.stringify([sample.contentVersion, sample.roomId, sample.round, sample.time,
      sample.mapId,sample.mode,sample.growthPreset,sample.trainingBots,
      sample.players.map(player=>[player.classId,player.level,player.xp,player.choices.map(choice=>[choice.id,choice.latency])])]);
    if (seen.has(key)) { duplicates++; continue; } seen.add(key); rows.push(value);
  }
  const summarize = (samples: Sample[]) => {
    const classes = new Map<string, { seats: number; xp: number; choices: Map<string, number>; delays: number[] }>();
    const gaps: number[] = [];
    for (const row of samples) {
      const levels = row.players.map(p => p.level); gaps.push(Math.max(...levels) - Math.min(...levels));
      for (const player of row.players) {
        const id = typeof player.classId === 'string' && Object.hasOwn(GROWTH_CLASSES, player.classId) ? player.classId : 'unknown';
        const stats = classes.get(id) ?? { seats: 0, xp: 0, choices: new Map<string, number>(), delays: [] };
        stats.seats++; stats.xp += player.xp;
        for (const choice of player.choices) { stats.choices.set(choice.id, (stats.choices.get(choice.id) ?? 0) + 1); stats.delays.push(choice.latency / 30); }
        classes.set(id, stats);
      }
    }
    return { matches: samples.length, seats: samples.reduce((sum, sample) => sum + sample.players.length, 0),
      averageEndLevelGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
      maximumEndLevelGap: gaps.length ? Math.max(...gaps) : null,
      classes: [...classes].sort(([a], [b]) => a.localeCompare(b)).map(([classId, stats]) => {
        const delays = stats.delays.sort((a, b) => a - b);
        return { classId, seats: stats.seats, averageMatchXp: stats.xp / stats.seats, choices: delays.length,
          meanChoiceSeconds: delays.length ? delays.reduce((a, b) => a + b, 0) / delays.length : null,
          p95ChoiceSeconds: delays.length ? delays[Math.ceil(delays.length * .95) - 1] : null,
          selectionFrequency: [...stats.choices].sort((a, b) => b[1] - a[1]).map(([upgrade, count]) => ({ upgrade, count, perSeat: count / stats.seats })) };
      }) };
  };
  const versions = [...new Set(rows.map(row => row.contentVersion ?? 'unknown'))].sort();
  return { version: 2, acceptedResults: rows.length, malformed, duplicates,
    byVersion: versions.map(contentVersion => {
      const matching = rows.filter(row => (row.contentVersion ?? 'unknown') === contentVersion);
      const scenarios=[...new Set(matching.map(row=>JSON.stringify([row.mapId??'unknown',row.mode??'unknown',row.growthPreset??'unknown'])))].sort();
      return { contentVersion, training: summarize(matching.filter(row => row.trainingBots > 0)), multiplayerSeats: summarize(matching.filter(row => row.trainingBots === 0)),
        byScenario:scenarios.map(key=>{
          const [mapId,mode,growthPreset]=JSON.parse(key) as string[];
          const samples=matching.filter(row=>(row.mapId??'unknown')===mapId&&(row.mode??'unknown')===mode&&(row.growthPreset??'unknown')===growthPreset);
          return {mapId,mode,growthPreset,training:summarize(samples.filter(row=>row.trainingBots>0)),multiplayerSeats:summarize(samples.filter(row=>row.trainingBots===0))};
        }) };
    }),
    limitations: ['Multiplayer seats may be scripted clients; logs do not establish human participation or the required two playtest rounds.',
      'Selection frequency is selections divided by class seats, not offer-adjusted pick probability; unchosen offers are not logged.',
      'End-level gaps include retained departed participants. They are not time-weighted level differences.',
      'Skill level, attachment selections and cast outcomes are not present in these result logs; record them separately rather than inferring them.',
      'Do not combine different content versions to declare balance complete. Player feedback must be recorded separately.'] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [input, output = 'artifacts/qa/growth-playtest-report.json'] = process.argv.slice(2);
  if (!input) throw Error('Usage: npx tsx tools/growth-playtest-report.ts <server-jsonl-log> [output-json]');
  const report = growthPlaytestReport(readFileSync(input, 'utf8').split(/\r?\n/));
  mkdirSync(dirname(resolve(output)), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ acceptedResults: report.acceptedResults, malformed: report.malformed, duplicates: report.duplicates, output: resolve(output) }));
}
