export interface PvEScenario {
  id: string; version: number; maps: string[]; seconds: number;
  warmupTicks: number; intermissionTicks: number; revivesPerPlayer: number;
  playerSafeRadius: number; actorSafeRadius: number;
  waves: { budgets: [number, number, number]; activeCap: number; activeCaps?: [number, number, number]; spawnIntervalTicks: number }[];
}
export const PVE_SCENARIOS: PvEScenario[] = [{
  id: 'airborne-survival', version: 2, maps: ['hijack'], seconds: 600,
  warmupTicks: 90, intermissionTicks: 150, revivesPerPlayer: 2,
  playerSafeRadius: 200, actorSafeRadius: 50,
  waves: [0, 1, 2].map(i => ({ budgets: [4 + i * 2, 8 + i * 2, 12 + i * 2], activeCap: 16, activeCaps: [2, 8, 16], spawnIntervalTicks: 24 })),
}];
export function validateScenario(scenario: PvEScenario) {
  const integer = (value: number, min: number, max: number) => Number.isSafeInteger(value) && value >= min && value <= max;
  if (!scenario.id || !integer(scenario.version, 1, 100000) || !scenario.maps.length
    || !integer(scenario.seconds, 1, 3600) || !integer(scenario.warmupTicks, 0, 1800)
    || !integer(scenario.intermissionTicks, 0, 1800) || !integer(scenario.revivesPerPlayer, 0, 10)
    || !integer(scenario.playerSafeRadius, 0, 1000) || !integer(scenario.actorSafeRadius, 1, 300)
    || !scenario.waves.length || scenario.waves.length > 100
    || scenario.waves.some(w => w.budgets.length !== 3 || w.budgets.some(n => !integer(n, 1, 128))
      || !integer(w.activeCap, 1, 16) || (w.activeCaps !== undefined && (w.activeCaps.length !== 3 || w.activeCaps.some(n => !integer(n, 1, w.activeCap))))
      || !integer(w.spawnIntervalTicks, 1, 1800))) throw Error('Invalid PvE scenario');
  return scenario;
}
PVE_SCENARIOS.forEach(validateScenario);
export function scenarioFor(mapId: string) {
  const scenario = PVE_SCENARIOS.find(s => s.maps.includes(mapId));
  if (!scenario) throw Error('Map has no PvE scenario');
  return structuredClone(scenario);
}
