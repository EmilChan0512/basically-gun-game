import { GROWTH_V3_ATTACHMENTS, resolveGrowthWeapon } from '../../shared/content/growth-v3/Attachments';
import { GrowthRangeSession, type RangeTarget } from '../session/GrowthRangeSession';
import type { GrowthLoadoutV3 } from '../../shared/content/growth-v3/Loadout';
import { GROWTH_V3_WEAPONS } from '../../shared/content/growth-v3/Weapons';
import { drawGrowthWorld, drawGrowthAbilities } from './GrowthWorldView';
import { CanvasGrowthGraphics } from './CanvasGrowthGraphics';
import { combatMotion } from './CombatMotion';

export function growthRangeView(loadout: GrowthLoadoutV3, slot: 'primary'|'secondary', back:()=>void) {
  const root=document.createElement('section');root.className='growth-range';root.setAttribute('aria-label','成长实弹靶场');
  root.innerHTML='<header><h2>实弹靶场</h2><button data-range-back>返回改装台</button></header><p>使用当前草稿试枪。鼠标按住射击，半自动需逐次点击；R换弹，Q切枪，S蹲伏，E技能，G专属道具。不会产生账号经验。</p><div class="growth-range-controls"><label>距离 <input data-range-distance type="number" min="60" max="1800" step="10" value="180"> px</label><label>靶标生命 <select data-range-health><option>90</option><option>95</option><option selected>100</option><option>115</option></select></label><label>护甲 <select data-range-armor><option selected>0</option><option>15</option><option>25</option></select></label><label>自动测试瞄点 <select data-range-aim><option value="body">胸部</option><option value="head">头部</option></select></label><button data-range-reset>重置靶标与弹药</button><button data-range-auto>自动连续测试</button></div><canvas width="1000" height="360" tabindex="0" aria-label="实弹射击区域"></canvas><output data-range-result aria-live="off"></output><p>TTK从首发到击杀计时，含未命中和换弹；单次固定种子测试不代表平均命中率。改变条件后会重置本次测试。</p>';
  const equipped=document.createElement('p');equipped.dataset.rangeLoadout=loadout[slot];
  const weapon=GROWTH_V3_WEAPONS[loadout[slot]],parts=loadout.attachments[slot],stats=resolveGrowthWeapon(loadout[slot],parts);
  equipped.textContent=`当前试射：${weapon.name} · ${parts.length?parts.map(id=>GROWTH_V3_ATTACHMENTS[id].name).join(' / '):'原装无配件'} · 弹匣${stats.magazine}发。返回后保留所有改装，可继续调整或保存。`;
  root.querySelector('header')!.after(equipped);
  const canvas=root.querySelector('canvas')!,ctx=canvas.getContext('2d')!,output=root.querySelector('output')!;
  const graphics=new CanvasGrowthGraphics(ctx);
  const distance=root.querySelector<HTMLInputElement>('[data-range-distance]')!,health=root.querySelector<HTMLSelectElement>('[data-range-health]')!,armor=root.querySelector<HTMLSelectElement>('[data-range-armor]')!,aimSelect=root.querySelector<HTMLSelectElement>('[data-range-aim]')!;
  let session:GrowthRangeSession, held=false,auto=false,lastFire=false,accumulator=0,last=performance.now(),handle=0;
  const keys=new Set<string>();let mouse:{x:number;y:number}|null=null;
  const gunImages=new Map<string,HTMLImageElement>();
  const autoButton=root.querySelector<HTMLButtonElement>('[data-range-auto]')!;
  const reset=()=>{
    const value=Math.max(60,Math.min(1800,Number(distance.value)||180));distance.value=String(value);
    session=new GrowthRangeSession(loadout,{distance:value,health:Number(health.value) as RangeTarget['health'],armor:Number(armor.value) as RangeTarget['armor']},slot);
    held=false;auto=false;lastFire=false;keys.clear();mouse=null;autoButton.textContent='自动连续测试';
  };
  const scale=()=>Math.min(1.65,900/(session.target.distance+220));
  const project=(x:number,y:number)=>({x:50+(x-80)*scale(),y:300+(y-500)*scale()});
  const pointer=(event:PointerEvent)=>{const box=canvas.getBoundingClientRect();mouse={x:80+((event.clientX-box.left)*1000/box.width-50)/scale(),y:500+((event.clientY-box.top)*360/box.height-300)/scale()};};
  canvas.onpointermove=pointer;canvas.onpointerdown=e=>{pointer(e);canvas.focus();held=true;canvas.setPointerCapture(e.pointerId);};
  canvas.onpointerup=()=>{held=false;};canvas.onpointercancel=()=>{held=false;};canvas.onblur=()=>{held=false;keys.clear();};
  canvas.onkeydown=e=>{if(e.repeat)return;keys.add(e.code);const b=session.battle;
    if(e.code==='KeyR')b.reload();if(e.code==='KeyQ')b.swap();if(e.code==='KeyE')b.useSkill();if(e.code==='KeyG')b.useItem(mouse??session.aim);
    if(['KeyR','KeyQ','KeyE','KeyG','KeyS','Space'].includes(e.code))e.preventDefault();};
  canvas.onkeyup=e=>{keys.delete(e.code);};
  root.querySelector<HTMLButtonElement>('[data-range-back]')!.onclick=()=>{cancelAnimationFrame(handle);back();};
  root.querySelector<HTMLButtonElement>('[data-range-reset]')!.onclick=reset;
  for(const input of [distance,health,armor,aimSelect])input.onchange=reset;
  autoButton.onclick=()=>{if(session.killTick!==null)reset();auto=!auto;autoButton.textContent=auto?'停止自动测试':'自动连续测试';};
  const render=()=>{
    ctx.fillStyle='#0c1c29';ctx.fillRect(0,0,1000,360);ctx.fillStyle='#26424f';ctx.fillRect(0,300,1000,60);
    const b=session.battle,message=session.presentation(),target=message.state.actors.find(a=>a.id==='enemy-0'),gun=b.growthV3!.weapons.get('player')!;
    ctx.save();ctx.translate(50-80*scale(),300-500*scale());ctx.scale(scale(),scale());
    drawGrowthWorld(graphics,message.state);ctx.restore();
    const shooter=project(b.player.movement.x,b.player.movement.y);
    const shooterHeight=b.player.movement.crouching?44:66;
    ctx.fillStyle='#6ee3d0';ctx.fillRect(shooter.x-10*scale(),shooter.y-shooterHeight*scale(),20*scale(),shooterHeight*scale());
    const artId=GROWTH_V3_WEAPONS[gun.selectedId].artId;
    if(!gunImages.has(artId)){const image=new Image();image.src=`/assets/characters/${artId}.svg`;gunImages.set(artId,image);}
    const image=gunImages.get(artId)!;
    if(image.complete&&image.naturalWidth){const aim=mouse??session.aim;ctx.save();ctx.translate(shooter.x,shooter.y-38*scale());ctx.rotate(Math.atan2(aim.y-(b.player.movement.y-38),aim.x-b.player.movement.x)-b.growthV3!.actorView('player').recoilDegrees*combatMotion.scale*Math.PI/180);ctx.drawImage(image,0,-9*scale(),50*scale(),18*scale());ctx.restore();}
    if(target){
    const p=project(target.x,target.y);
    ctx.fillStyle=target.life.alive?'#f4b387':'#5c6672';ctx.fillRect(p.x-13*scale(),p.y-50*scale(),26*scale(),50*scale());ctx.beginPath();ctx.arc(p.x,p.y-58*scale(),8*scale(),0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#eef4f0';ctx.font='14px sans-serif';ctx.fillText(`${target.life.health.toFixed(1)} HP · ${b.growthV3!.participant(target.id).armor.remaining/1000} 护甲`,Math.min(800,p.x-45),p.y-80*scale());
    }else{ctx.fillStyle='#c8d9df';ctx.font='14px sans-serif';ctx.fillText('靶标在视野外或被遮挡，可按已知靶位试射',20,25);}
    ctx.save();ctx.translate(50-80*scale(),300-500*scale());ctx.scale(scale(),scale());
    drawGrowthAbilities(graphics,message,new Map(message.state.actors.map(a=>[a.id,{x:a.x,y:a.y}])));
    for(const burst of message.bursts){const fraction=(message.state.frame-burst.frame)/18;if(fraction>=0&&fraction<1)graphics.lineStyle(3,burst.color,1-fraction).strokeCircle(burst.x,burst.y,burst.radius*(.3+fraction*.7));}
    ctx.restore();
    for(const hit of session.impacts){const q=project(hit.x,hit.y);ctx.fillStyle=hit.damage?'#fb806c':'#809fb7';ctx.fillRect(q.x-2,q.y-2,4,4);}
    for(const effect of message.effects)if(b.frame-effect.frame<3){const a=project(effect.trace.origin.x,effect.trace.origin.y),z=project(effect.trace.end.x,effect.trace.end.y);ctx.strokeStyle='#f4de8970';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(z.x,z.y);ctx.stroke();}
    if(mouse){const q=project(mouse.x,mouse.y);ctx.strokeStyle='#e5eb9a';ctx.beginPath();ctx.arc(q.x,q.y,6,0,Math.PI*2);ctx.stroke();}
    output.textContent=`${GROWTH_V3_WEAPONS[gun.selectedId].name} · ${gun.current.ammo}/${gun.current.reserve} 发 · 已开火 ${session.shots} 次 · 命中弹丸 ${session.hits} 颗 · 生命伤害 ${session.damage.toFixed(2)} · TTK ${session.ttk===null?'未击杀':session.ttk.toFixed(2)+' 秒'} · E冷却 ${(b.player.skillCooldown/30).toFixed(1)}秒 · G剩余 ${b.player.itemCharges}`;
    output.dataset.shots=String(session.shots);output.dataset.killed=String(session.killTick!==null);
    output.dataset.targetVisible=String(!!target);output.dataset.smoke=String(message.state.growthWorld?.smoke.length??0);
    output.dataset.deployments=String(message.state.growthWorld?.entities.length??0);
  };
  reset();
  const frame=(now:number)=>{
    if(!root.isConnected)return;
    const active=!document.hidden&&!root.closest('[hidden]');
    accumulator+=active?Math.min(100,now-last):0;last=now;
    while(accumulator>=1000/30){accumulator-=1000/30;const gun=session.battle.growthV3!.weapons.get('player')!;
      const fire=auto?(GROWTH_V3_WEAPONS[gun.selectedId].mode==='auto'||!lastFire&&gun.readyTick<=session.battle.frame+1):held;
      const aim=auto?{...session.aim,y:session.aim.y-(aimSelect.value==='head'?25:0)}:mouse??session.aim;
      session.step({fire,aim,crouch:keys.has('KeyS'),jump:keys.has('Space')});lastFire=fire;
      if(session.killTick!==null&&auto){auto=false;autoButton.textContent='再次自动测试';}
      if(auto&&gun.current.ammo===0&&!gun.current.reloadUntil)session.battle.reload();
    }
    if(active)render();handle=requestAnimationFrame(frame);
  };
  handle=requestAnimationFrame(frame);return root;
}
