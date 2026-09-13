import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const browser = await chromium.launch({headless:true});
try { const page = await browser.newPage();
mkdirSync('artifacts/gunsmith-v2/references',{recursive:true});
for (const id of ['m4','famas','mp5','shotgun','scout','saw']) {
 const svg=readFileSync(`public/assets/characters/${id}.svg`,'utf8');
 const data=await page.evaluate(async svg=>{const im=new Image();im.src='data:image/svg+xml;base64,'+btoa(svg);await im.decode();const c=document.createElement('canvas');c.width=1024;c.height=Math.round(1024*im.naturalHeight/im.naturalWidth);c.getContext('2d').drawImage(im,0,0,c.width,c.height);return c.toDataURL().split(',')[1];},svg);
 writeFileSync(`artifacts/gunsmith-v2/references/${id}.png`,Buffer.from(data,'base64'));
}
}finally{await browser.close();}
