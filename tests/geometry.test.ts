import { describe,expect,it } from 'vitest';
import { cameraBasis,pixelRays,rayBoxDistance } from '../src/domain/geometry';
import type { CameraSpec } from '../src/domain/types';
const camera:CameraSpec={position:[0,0,0],direction:[0,0,-1],worldUp:[0,1,0],verticalFov:50,aspect:1};
describe('camera geometry',()=>{
  it('makes a stable basis for a vertical view',()=>{const basis=cameraBasis({...camera,direction:[0,1,0]});expect(Math.hypot(...basis.right)).toBeCloseTo(1);expect(Math.hypot(...basis.up)).toBeCloseTo(1);});
  it('points the center pixel along camera direction',()=>{const ray=pixelRays(camera,1,1);expect([...ray]).toEqual([0,0,-1]);});
  it('finds the nearest cube intersection',()=>{expect(rayBoxDistance([0,0,0],[0,0,-1],0,0,-3)).toBe(2);expect(rayBoxDistance([0,0,0],[1,0,0],0,0,-3)).toBe(Infinity);});
});
