import { describe,expect,it } from 'vitest';
import { cameraBasis,dilateProjectedCells,pixelRays,projectedBoxCells,rayBoxDistance,screenRay } from '../src/domain/geometry';
import type { CameraSpec } from '../src/domain/types';
const camera:CameraSpec={position:[0,0,0],direction:[0,0,-1],worldUp:[0,1,0],verticalFov:50,aspect:1};
describe('camera geometry',()=>{
  it('makes a stable basis for a vertical view',()=>{const basis=cameraBasis({...camera,direction:[0,1,0]});expect(Math.hypot(...basis.right)).toBeCloseTo(1);expect(Math.hypot(...basis.up)).toBeCloseTo(1);});
  it('points the center pixel along camera direction',()=>{const ray=pixelRays(camera,1,1);expect([...ray]).toEqual([0,0,-1]);});
  it('finds the nearest cube intersection',()=>{expect(rayBoxDistance([0,0,0],[0,0,-1],0,0,-3)).toBe(2);expect(rayBoxDistance([0,0,0],[1,0,0],0,0,-3)).toBe(Infinity);});
  it('constructs rays for projected cells outside the image bounds',()=>{const left=screenRay(camera,4,4,-1,1),right=screenRay(camera,4,4,4,1);expect(left[0]).toBeLessThan(0);expect(right[0]).toBeGreaterThan(0);expect(Math.hypot(...left)).toBeCloseTo(1);});
  it('rasterizes cube silhouettes without filling their bounding rectangle',()=>{const angled:CameraSpec={...camera,position:[3,3,3],direction:[-1,-1,-1]},cells=projectedBoxCells(angled,cameraBasis(angled),0,0,0,64,64),xs=cells.map(cell=>cell[0]),ys=cells.map(cell=>cell[1]),area=(Math.max(...xs)-Math.min(...xs)+1)*(Math.max(...ys)-Math.min(...ys)+1);expect(cells.length).toBeGreaterThan(0);expect(cells.length).toBeLessThan(area);});
  it('expands projected silhouettes with eight-neighbor padding',()=>{expect(dilateProjectedCells([[0,0]],1)).toHaveLength(9);expect(dilateProjectedCells([[0,0]],0)).toEqual([[0,0]]);});
});
