import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OnlineAccounts } from './OnlineAccounts';

// Run with exclusive access to the database, after stopping the service. No network endpoint.
const [command, file, flag] = process.argv.slice(2);
if (command !== 'provision-tests' || !file || flag !== '--service-stopped') throw Error('Usage: node admin.cjs provision-tests /absolute/accounts.json --service-stopped < batch.json');
if (resolve(file) !== file) throw Error('An absolute database path is required');
const input = JSON.parse(readFileSync(0, 'utf8'));
const accounts = new OnlineAccounts(file);
const profiles = accounts.provisionTests(input.batch, input.accounts);
console.log(JSON.stringify(profiles.map(p => ({ name: p.name, selected: p.selected, credits: p.credits, classes: Object.fromEntries(Object.entries(p.classes).map(([id, c]) => [id, c.xp])), weapons: p.weapons.length })), null, 2));
