import { expect, it, vi } from 'vitest';
vi.mock('phaser', () => ({ default: { Utils: { String: { UUID: () => 'test' } } } }));
import { VisionOverlay } from '../../src/client/presentation/VisionOverlay';

it('reuses a static visibility texture but redraws for camera movement, observer movement, death and viewport changes', () => {
  const refresh=vi.fn(), context:Record<string,unknown>={};
  for(const name of ['setTransform','clearRect','fillRect','beginPath','lineTo','moveTo','closePath','stroke','fill'])context[name]=vi.fn();
  const image={setOrigin:vi.fn().mockReturnThis(),setScrollFactor:vi.fn().mockReturnThis(),setDepth:vi.fn().mockReturnThis(),setDisplaySize:vi.fn().mockReturnThis()};
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
