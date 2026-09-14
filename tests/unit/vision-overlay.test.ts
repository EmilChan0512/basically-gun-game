import { expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { Utils: { String: { UUID: () => 'test' } } } }));
import { VisionOverlay } from '../../src/client/presentation/VisionOverlay';

it('reuses a static visibility texture but redraws for camera movement, observer movement, death and viewport changes', () => {
  const refresh=vi.fn(), context:Record<string,unknown>={};
  for(const name of ['setTransform','clearRect','fillRect','beginPath','lineTo','moveTo','closePath','stroke','fill','drawImage','putImageData'])context[name]=vi.fn();
  context.getImageData=()=>({data:new Uint8ClampedArray(4)});
  const image={setPosition:vi.fn().mockReturnThis(),setOrigin:vi.fn().mockReturnThis(),setScrollFactor:vi.fn().mockReturnThis(),setDepth:vi.fn().mockReturnThis(),setDisplaySize:vi.fn().mockReturnThis()};
  const scene={textures:{createCanvas:()=>({context,refresh})},add:{image:()=>image},events:{once:vi.fn()},
    cameras:{main:{scrollX:0,scrollY:0,zoom:1}},scale:{width:1120,height:620}};
  const overlay=new VisionOverlay(scene as unknown as ConstructorParameters<typeof VisionOverlay>[0],()=>false);
  overlay.draw([{id:'ally',x:300,y:400}]);expect(refresh).toHaveBeenCalledTimes(1);
  for(let i=0;i<60;i++)overlay.draw([{id:'ally',x:300,y:400}]);expect(refresh).toHaveBeenCalledTimes(1);
  scene.cameras.main.scrollX=1;overlay.draw([{id:'ally',x:300,y:400}]);expect(refresh).toHaveBeenCalledTimes(2);
  overlay.draw([{id:'ally',x:305,y:400}]);expect(refresh).toHaveBeenCalledTimes(3);
  overlay.draw([]);expect(refresh).toHaveBeenCalledTimes(4);
  overlay.draw([]);expect(refresh).toHaveBeenCalledTimes(4);
  scene.scale.width=900;overlay.draw([]);expect(refresh).toHaveBeenCalledTimes(5);
  scene.cameras.main.zoom=.5;overlay.draw([]);expect(refresh).toHaveBeenCalledTimes(6);
});


it('fades movement history in world space and returns to cached rendering after expiry',()=>{
  const refresh=vi.fn(),context:Record<string,any>={};
  for(const name of ['setTransform','clearRect','fillRect','beginPath','lineTo','moveTo','closePath','fill','drawImage','putImageData'])context[name]=vi.fn();
  context.getImageData=()=>({data:new Uint8ClampedArray(4)});
  const image:any={};for(const name of ['setPosition','setOrigin','setScrollFactor','setDepth','setDisplaySize'])image[name]=()=>image;
  const scene={textures:{createCanvas:()=>({context,refresh})},add:{image:()=>image},events:{once:vi.fn()},
    cameras:{main:{scrollX:0,scrollY:0,zoom:1}},scale:{width:1120,height:620}};
  const overlay=new VisionOverlay(scene as any,()=>false);
  overlay.draw([{id:'ally',x:300,y:400}],0);
  overlay.draw([{id:'ally',x:450,y:400}],60);
  const before=refresh.mock.calls.length;
  overlay.draw([{id:'ally',x:450,y:400}],120);expect(refresh).toHaveBeenCalledTimes(before+1);
  scene.cameras.main.scrollX=100;overlay.draw([{id:'ally',x:450,y:400}],180);
  expect(context.setTransform).toHaveBeenCalledWith(.5,0,0,.5,-50,-0);
  overlay.draw([{id:'ally',x:450,y:400}],421);
  const expired=refresh.mock.calls.length;
  overlay.draw([{id:'ally',x:450,y:400}],600);expect(refresh).toHaveBeenCalledTimes(expired);
  overlay.draw([],610);const removed=refresh.mock.calls.length;
  overlay.draw([],800);expect(refresh).toHaveBeenCalledTimes(removed);
});
