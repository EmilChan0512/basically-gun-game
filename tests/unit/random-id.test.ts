import { expect, it, vi } from 'vitest';
import { randomId } from '../../src/shared/simulation/RandomId';
it('creates valid unique IDs when HTTP exposes getRandomValues but no randomUUID', () => {
  const getRandomValues = crypto.getRandomValues.bind(crypto);
  vi.stubGlobal('crypto', { getRandomValues });
  try {
    const ids = Array.from({ length: 100 }, randomId);
    expect(new Set(ids).size).toBe(100);
    for (const id of ids) expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  } finally { vi.unstubAllGlobals(); }
});
