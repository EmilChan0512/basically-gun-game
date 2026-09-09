import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const tracked = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const unsafe = tracked.filter(file => /\.(swf|fla|as)$/i.test(file) || (/^(archaeology\/(swf|exported|local)|reference_assets)\//.test(file) && !file.endsWith('/.gitkeep')));
if (unsafe.length) { console.error('Research artifacts must not be versioned:\n' + unsafe.join('\n')); process.exitCode = 1; }
else console.log(`Copyright hygiene passed: ${tracked.length} versionable files checked.`);
