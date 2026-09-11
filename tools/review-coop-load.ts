import { readFileSync, writeFileSync } from 'node:fs';
const path = process.argv[2];
if (!path) throw Error('Pass a coop-load report JSON path');
const report = JSON.parse(readFileSync(path, 'utf8'));
const samples = report.samples as { seconds: number; memory: { rss: number; heapUsed: number; external: number }; ackLag: number[] }[];
if (!Array.isArray(samples) || !samples.length) throw Error('Missing memory samples');
const mb = (bytes: number) => Math.round(bytes / 1048576 * 100) / 100;
const windows = Array.from({ length: Math.ceil(report.duration / 300) }, (_, i) => {
  const rows = samples.filter(s => s.seconds >= Math.max(120, i * 300)
    && (s.seconds < (i + 1) * 300 || i === Math.ceil(report.duration / 300) - 1));
  if (!rows.length) return null;
  return { fromSeconds: Math.max(120, i * 300), toSeconds: (i + 1) * 300, count: rows.length,
    heapMinMB: mb(Math.min(...rows.map(s => s.memory.heapUsed))), heapMaxMB: mb(Math.max(...rows.map(s => s.memory.heapUsed))),
    rssMinMB: mb(Math.min(...rows.map(s => s.memory.rss))), rssMaxMB: mb(Math.max(...rows.map(s => s.memory.rss))),
    externalMinMB: mb(Math.min(...rows.map(s => s.memory.external))), externalMaxMB: mb(Math.max(...rows.map(s => s.memory.external))) };
}).filter(w => w !== null);
const gates = {
  sampleCoverage: samples.length >= Math.floor(report.duration / 15)
    && samples[0].seconds < 20 && samples.at(-1)!.seconds >= report.duration - 20
    && samples.every((s, i) => Number.isFinite(s.seconds) && s.seconds >= 0
      && (!i || s.seconds > samples[i - 1].seconds && s.seconds - samples[i - 1].seconds <= 30)
      && [s.memory.heapUsed, s.memory.rss, s.memory.external].every(n => Number.isFinite(n) && n >= 0)),
  tenMinutes: report.duration >= 600 && report.seconds >= 600,
  saturated: report.fixtureFrames > 0 && report.fixtureFrames === report.saturatedFrames,
  allAcknowledged: report.sent > 0 && report.finalAcks.length === 8 && report.finalAcks.every((ack: number) => ack === report.sent - 1),
  combatActive: report.shotEventsByTeam?.length === 2 && report.shotEventsByTeam.every((n: number) => Number.isFinite(n) && n > 0) && report.damageEvents > 0,
  simulationBudget: report.simulationHz >= 29 && report.simulationHz <= 31 && report.tickMs.count >= report.seconds * 29
    && report.tickMs.p95 >= 0 && report.tickMs.p95 < 10 && report.tickMs.p99 >= report.tickMs.p95 && report.tickMs.p99 < 33.3,
  noNetworkErrors: report.errors.length === 0,
  belowBufferCutoff: report.maxBuffered < 512000,
  compressedBandwidth: report.wireKbPerSecond.length === 8 && report.wireKbPerSecond.every((n: number) => Number.isFinite(n) && n > 0 && n < 100),
};
const review = { source: path, content: report.content, gates, windows, peakAckLag: report.maxAckLag,
  memoryTrendStatus: 'manual-review-required',
  interpretation: 'Memory windows exclude first 120s. Review minima/envelopes, not just endpoint deltas. RSS growth alone is not proof of a leak; flat samples are not proof of leak absence.',
  limits: 'Synthetic health/ammo/fall maintenance; process memory includes all 8 script clients and measurement arrays. Consult the run log for concurrent host activity. Passing numeric gates does not certify memory trends, browser FPS or reference hardware.' };
writeFileSync(path.replace(/\.json$/, '-review.json'), JSON.stringify(review, null, 2));
console.log(JSON.stringify(review, null, 2));
if (Object.values(gates).some(value => value !== true)) process.exitCode = 1;
