import { expect, it } from 'vitest';
import { growthPlaytestReport } from '../../tools/growth-playtest-report';

it('separates bot practice, counts per-seat choices and latency, and deduplicates copied log rows', () => {
  const row = { event: 'growth.playtest_result', roomId: 'test', round: 1, time: '2026-09-13T00:00:00Z', contentVersion: '0000000000000001', trainingBots: 0,
    players: [{ classId: 'assault', level: 3, xp: 450, choices: [{ id: 'momentum', latency: 60 }, { id: 'quickHands', latency: 120 }] },
      { classId: 'assault', level: 1, xp: 0, choices: [] }] };
  const report = growthPlaytestReport([JSON.stringify(row), JSON.stringify(row), JSON.stringify({ ...row, round: 2, trainingBots: 1 })]);
  expect(report.acceptedResults).toBe(2); expect(report.duplicates).toBe(1);
  expect(report.byVersion[0].multiplayerSeats.matches).toBe(1); expect(report.byVersion[0].training.matches).toBe(1);
  expect(report.byVersion[0].multiplayerSeats.averageEndLevelGap).toBe(2);
  expect(report.byVersion[0].multiplayerSeats.classes[0]).toMatchObject({ seats: 2, meanChoiceSeconds: 3, p95ChoiceSeconds: 4,
    selectionFrequency: [{ upgrade: 'momentum', count: 1, perSeat: .5 }, { upgrade: 'quickHands', count: 1, perSeat: .5 }] });
});

it('rejects broken samples and excludes unrelated log payloads and account identities', () => {
  const report = growthPlaytestReport(['not-json', JSON.stringify({ event: 'auth', password: 'do-not-copy' }),
    JSON.stringify({ event: 'growth.playtest_result', roomId: 'broken', round: 1, trainingBots: 0, players: [{ level: 1, xp: -1, choices: [] }] })]);
  expect(report.acceptedResults).toBe(0); expect(report.malformed).toBe(2);
  expect(report.byVersion).toEqual([]); expect(JSON.stringify(report)).not.toContain('do-not-copy');
});
