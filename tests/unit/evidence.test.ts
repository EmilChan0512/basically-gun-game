import { expect, it } from 'vitest';
import Ajv from 'ajv';
import schema from '../../archaeology/evidence.schema.json';
import db from '../../archaeology/reverse_engineering_db.json';
import { defaults } from '../../src/game/config/movement';

it('all current movement tunables have matching traceable evidence, not invented extraction', () => {
  for (const [key, value] of Object.entries(defaults)) {
    const record = db.records.find(r => r.id === `movement.${key}.initial`);
    expect(record).toMatchObject({ domain: 'movement', key, value, evidenceType: 'TUNED', source: { file: 'src/game/config/movement.ts', locator: `defaults.${key}` } });
  }
});
it('validates schema and rejects missing source/confidence/out-of-range confidence', () => {
  const validate = new Ajv({ strict: false }).compile(schema);
  expect(validate(db)).toBe(true);
  const bad = structuredClone(db);
  bad.records[0].confidence = 2;
  expect(validate(bad)).toBe(false);
  expect(validate({ schemaVersion: 1, records: [{ id: 'fake', value: 100 }] })).toBe(false);
});
