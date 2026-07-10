import { describe,expect,it } from 'vitest';
import { generateSculpture,verifyFirstHits } from '../src/domain/generator';
import { pixelRays } from '../src/domain/geometry';
import type { GenerationRequest, OutputImage } from '../src/domain/types';

function request(width=4,height=3):GenerationRequest{
  const image:OutputImage={width,height,rgb:new Uint8ClampedArray(width*height*3),matchedRgb:new Uint8ClampedArray(width*height*3),paletteIndices:new Uint16Array(width*height),meanDeltaE:0,maxDeltaE:0};
  return {image,camera:{position:[0,0,0],direction:[0,0,-1],worldUp:[0,1,0],verticalFov:50,aspect:width/height},options:{maxDepth:8,layerSpacing:1,blockDensity:50,maxOffset:8192},seed:42};
}
describe('anamorphic generator',()=>{
  it('assigns one unique, verified block per pixel',async()=>{const input=request();const sculpture=await generateSculpture(input);expect(sculpture.paletteIndices).toHaveLength(12);const keys=new Set(Array.from({length:12},(_,i)=>`${sculpture.coordinates[i*3]},${sculpture.coordinates[i*3+1]},${sculpture.coordinates[i*3+2]}`));expect(keys.size).toBe(12);expect(sculpture.diagnostics.verified).toBe(true);});
  it('is deterministic',async()=>{const a=await generateSculpture(request()),b=await generateSculpture(request());expect([...a.coordinates]).toEqual([...b.coordinates]);expect(a.diagnostics.effectiveOffset).toBe(b.diagnostics.effectiveOffset);});
  it('uses density to compact the occupied depth range',async()=>{const spread=request(8,6),compact=request(8,6);spread.options.blockDensity=10;compact.options.blockDensity=100;const a=await generateSculpture(spread),b=await generateSculpture(compact);const span=(values:Int32Array)=>{const z=Array.from({length:values.length/3},(_,index)=>values[index*3+2]!);return Math.max(...z)-Math.min(...z);};expect(span(b.coordinates)).toBeLessThanOrEqual(span(a.coordinates));expect(b.paletteIndices.length).toBe(a.paletteIndices.length);});
  it('detects an occluding duplicate',()=>{const input=request(2,1),rays=pixelRays(input.camera,2,1);expect(verifyFirstHits(input,rays,Int32Array.from([0,0,-5,0,0,-5]))).toBe(false);});
});
