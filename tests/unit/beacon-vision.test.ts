import { expect, it } from 'vitest';
import { beaconCircles, inBeaconVision } from '../../src/shared/simulation/BeaconVision';
const beacon = { id:'beacon', team:1 as const, gadgetId:'sn_beacon', x:100, y:100, radius:880,
  armed:true, stopped:false, health:35, expiresTick:2400 };
it('uses the circular boundary equally in every direction',()=>{
  const circles=beaconCircles([beacon],1,100);
  for(let i=0;i<16;i++) {
    const a=i*Math.PI/8;
    expect(inBeaconVision({x:100+879.99*Math.cos(a),y:100+879.99*Math.sin(a)},circles)).toBe(true);
    expect(inBeaconVision({x:100+880.01*Math.cos(a),y:100+880.01*Math.sin(a)},circles)).toBe(false);
  }
  expect(inBeaconVision({x:900,y:900},circles)).toBe(false);
});
it('shares only active friendly beacons and ends exactly at expiry',()=>{
  expect(beaconCircles([beacon],1,2399)).toHaveLength(1);
  expect(beaconCircles([beacon],1,2400)).toEqual([]);
  expect(beaconCircles([beacon],2,100)).toEqual([]);
  for(const patch of [{armed:false},{stopped:true},{health:0},{gadgetId:'sn_decoy'}])
    expect(beaconCircles([{...beacon,...patch}],1,100)).toEqual([]);
});
