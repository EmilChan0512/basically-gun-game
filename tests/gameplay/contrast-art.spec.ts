import {test,expect} from '@playwright/test';
test('contrast modifies rendered soldier pixels without adding a frame and resets pooled effects',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?rules=original');await page.waitForFunction(()=>!!window.__originalStrike);
  const result=await page.evaluate(async()=>{
    const path='/src/game/campaign/ReferenceArt.ts';const {ReferenceArt}=await import(path);
    const scene=window.__originalStrike!;scene.scene.pause();scene.children.removeAll(true);
    scene.scale.resize(400,300);scene.cameras.main.setScroll(0,0).setZoom(1).setBackgroundColor('#172126');
    const rig=new ReferenceArt(scene);
    const draw=(contrast:boolean)=>{rig.begin();rig.soldier(180,200,false,0,false,0,{x:300,y:160},'m4',0xffffff,true,0,false,undefined,'commando','target',false,0,1,undefined,contrast);};
    const snapshot=()=>new Promise<number[]>(resolve=>scene.game.renderer.snapshot(image=>{
      const canvas=document.createElement('canvas');canvas.width=400;canvas.height=300;
      const ctx=canvas.getContext('2d')!;ctx.drawImage(image as HTMLImageElement,0,0);
      resolve(Array.from(ctx.getImageData(0,0,400,300).data));
    }));
    draw(false);const normal=await snapshot();draw(true);const enhanced=await snapshot();
    let changed=0,outsideChanged=0;
    const foreground=(x:number,y:number)=>{if(x<0||y<0||x>=400||y>=300)return false;const i=(y*400+x)*4;return normal[i]!==23||normal[i+1]!==33||normal[i+2]!==38;};
    for(let i=0;i<normal.length;i+=4){
      if(normal[i]!==enhanced[i]||normal[i+1]!==enhanced[i+1]||normal[i+2]!==enhanced[i+2]){
        changed++;
        const x=(i/4)%400,y=Math.floor(i/1600);
        // Offscreen FX can resample the one-pixel antialias fringe, but cannot
        // create pixels beyond the original sprite's immediate texture edge.
        if(![-1,0,1].some(dx=>[-1,0,1].some(dy=>foreground(x+dx,y+dy))))outsideChanged++;
      }
    }
    draw(false);const reset=await snapshot();rig.begin();
    const active=scene.children.list.filter((item:any)=>item.preFX?.list.some((fx:any)=>fx.active)).length;
    return {changed,outsideChanged,restored:normal.every((n,i)=>n===reset[i]),active,onlyImages:scene.children.list.every(item=>item.type==='Image')};
  });
  expect(result.changed).toBeGreaterThan(20);expect(result.outsideChanged).toBe(0);expect(result.onlyImages).toBe(true);
  expect(result.restored).toBe(true);expect(result.active).toBe(0);expect(errors).toEqual([]);
});
