import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function packageContentVersion() {
  return execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    "import { CONTENT_VERSION } from './src/shared/protocol/ContentVersion.ts'; process.stdout.write(CONTENT_VERSION);"],
  { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', windowsHide: true }).trim();
}
