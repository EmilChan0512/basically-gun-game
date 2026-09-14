import {test,expect} from '@playwright/test';
test('flash suppressor halves rendered muzzle-light contribution without moving or resizing it',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?rules=original');await page.waitForFunction(()=>!!window.__originalStrike);
  const result=await page.evaluate(async()=>{
    const path='/src/game/campaign/ReferenceArt.ts';const {ReferenceArt}=await import(path);
    const scene=window.__originalStrike!;scene.scene.pause();scene.children.removeAll(true);
    scene.scale.resize(400,300);scene.cameras.main.setScroll(0,0).setZoom(1).setBackgroundColor('#172126');
    const rig=new ReferenceArt(scene);
    const draw=(flash:boolean,scale:number)=>{rig.begin();rig.soldier(180,200,false,0,false,0,{x:300,y:160},'m4',0xffffff,true,0,flash,undefined,'commando','target',false,0,scale);};
    const snapshot=()=>new Promise<number[]>(resolve=>scene.game.renderer.snapshot(image=>{
      const canvas=document.createElement('canvas');canvas.width=400;canvas.height=300;
      const ctx=canvas.getContext('2d')!;ctx.drawImage(image as HTMLImageElement,0,0);resolve(Array.from(ctx.getImageData(0,0,400,300).data));
    }));
    // Keep the firing pose identical: flash=false also changes weapon recoil.
    draw(true,0);const base=await snapshot();draw(true,1);const full=await snapshot();
    const geometry=()=>{const image=scene.children.list.find((item:any)=>item.visible&&item.texture?.key==='ref-flash') as any;return {x:image.x,y:image.y,width:image.displayWidth,height:image.displayHeight,rotation:image.rotation};};
    const before=geometry();draw(true,.5);const half=await snapshot(),after=geometry();
    let fullEnergy=0,halfEnergy=0,unrelatedChanges=0;
    for(let i=0;i<base.length;i++){if(i%4===3)continue;fullEnergy+=Math.abs(full[i]-base[i]);halfEnergy+=Math.abs(half[i]-base[i]);if(full[i]===base[i]&&Math.abs(half[i]-base[i])>1)unrelatedChanges++;}
    draw(true,1);const restored=await snapshot();
    return {fullEnergy,ratio:halfEnergy/fullEnergy,unrelatedChanges,before,after,restored:full.every((v,i)=>v===restored[i])};
  });
  expect(result.fullEnergy).toBeGreaterThan(100);expect(result.ratio).toBeCloseTo(.5,1);
  expect(result.unrelatedChanges).toBe(0);expect(result.after).toEqual(result.before);expect(result.restored).toBe(true);expect(errors).toEqual([]);
});
