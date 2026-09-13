import { verifyUIArt } from './verify-ui-art.mjs';
console.log(JSON.stringify(verifyUIArt(process.argv[2] ?? 'public/assets/gunsmith/v1', ['none', 'heavy', 'short', 'quickmag'])));
