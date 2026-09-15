import type Phaser from 'phaser';
import { ATRIUM_FLOORS, ATRIUM_ROOMS, ATRIUM_STAIRS, ATRIUM_SHAFTS, ATRIUM_COVERS, ATRIUM_TERRAIN } from '../../shared/content/maps/Atrium';
import type { MapGeometry } from '../../shared/content/MapTypes';

export function preloadAtrium(scene:Phaser.Scene) {
  for(const id of ['office-wall','service-wall'])scene.load.image(id,`/assets/architecture/v3/${id}.png`);
}
export function drawAtrium(scene:Phaser.Scene,map:MapGeometry) {
  const back=scene.add.graphics();back.fillStyle(0x0b1723).fillRect(0,0,3600,1536);
  const names=[['接待室','档案室','供电间','物资库','设备间','货运室'],['休息室','会议室','控制室','通讯室','安保室','办公室'],
    ['办公室','服务器房','调度室','资料室','会议室','值班室'],['观察室','机房','监控室','总控室','配电间','通风室']];
  for(const [level,floor] of ATRIUM_FLOORS.entries()) {
    const ceiling=floor-312;
    for(const [room,[left,right]] of ATRIUM_ROOMS.entries()) {
      scene.add.image(left+12,ceiling+10,(level+room)%3===0?'service-wall':'office-wall').setOrigin(0).setDisplaySize(right-left-24,292).setTint(0x879ead);
      back.fillStyle(0x162631).fillRect(left,ceiling,right-left,10);
      const detail=scene.add.graphics();
      detail.fillStyle(0x0a141c,.6).fillRect(left+12,floor-48,right-left-24,48);
      detail.lineStyle(2,0x43616e,.6).strokeRect(left+12,ceiling+10,right-left-24,292);
      // Suspended lamps, room identification and recessed floor service ducts.
      detail.fillStyle(0xbededc,.8).fillRect(left+90,ceiling+24,120,4);
      detail.fillStyle(0x5c8291).fillRect(left+40,floor-26,right-left-80,3);
      scene.add.text(left+30,ceiling+44,`${level+1}F / ${names[level][room]}`,{fontFamily:'sans-serif',fontSize:'18px',color:'#a9c7d2'}).setAlpha(.8);
    }
    for(const x of ATRIUM_SHAFTS) {
      const g=scene.add.graphics();g.fillStyle(0x15222b).fillRect(x,ceiling,420,312);
      for(let y=ceiling+24;y<floor;y+=48)g.lineStyle(1,0x34434c).lineBetween(x+12,y,x+408,y);
      scene.add.text(x+140,ceiling+24,x===2220?'斜坡 / RAMP':'楼梯 / STAIRS',{fontFamily:'sans-serif',fontSize:'16px',color:'#b5a97c'});
    }
  }
  const solid=scene.add.graphics();
  for(const t of ATRIUM_TERRAIN) {
    solid.fillStyle(0x111e27).fillRect(t.x+4,t.y+6,t.width,t.height);
    solid.fillStyle(0x344b59).fillRect(t.x,t.y,t.width,t.height);
    solid.fillStyle(0x829ca8).fillRect(t.x,t.y,t.width,3);
    solid.fillStyle(0x20323e).fillRect(t.x,t.y+t.height-6,t.width,6);
  }
  for(const floor of ATRIUM_FLOORS) {
    for(const cover of ATRIUM_COVERS) {
      const y=floor-cover.height;
      solid.fillStyle(0x58665c).fillRect(cover.x+3,y+4,cover.width-6,cover.height-8);
      solid.lineStyle(2,0x1c2a27).strokeRect(cover.x+7,y+8,cover.width-14,cover.height-16);
      solid.lineBetween(cover.x+7,y+8,cover.x+cover.width-7,floor-8);
      solid.fillStyle(0xc4a566).fillRect(cover.x+10,y+5,18,4);
    }
    for(const x of [500,1800,3080]) {
      // Visible door jambs frame the collision-free opening below each lintel.
      solid.lineStyle(3,0x9fc4c7,.7).lineBetween(x-14,floor-110,x-14,floor).lineBetween(x+14,floor-110,x+14,floor);
      solid.fillStyle(0x70d3b5).fillRect(x-10,floor-108,20,4);
    }
  }
  for(const stair of ATRIUM_STAIRS) {
    const start=stair.x+(stair.right?0:420),end=stair.x+(stair.right?420:0);
    solid.lineStyle(3,0x7795a3,.6).lineBetween(start,stair.floor-64,end,stair.floor-400);
    for(let step=1;step<=14;step+=2){const x=stair.x+(stair.right?step-.5:14.5-step)*30,y=stair.floor-step*24;
      solid.lineStyle(2,0x7795a3,.55).lineBetween(x,y-4,x,y-64);}
  }
}
