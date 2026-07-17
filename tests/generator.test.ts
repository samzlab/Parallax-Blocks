import { describe,expect,it } from 'vitest';
import { generateSculpture,verifyFirstHits } from '../src/domain/generator';
import { cameraBasis,cubeDepthRange,pixelRays,rayBoxDistance } from '../src/domain/geometry';
import type { GenerationRequest, OutputImage } from '../src/domain/types';

function request(width=4,height=3):GenerationRequest{
  const image:OutputImage={width,height,rgb:new Uint8ClampedArray(width*height*3),matchedRgb:new Uint8ClampedArray(width*height*3),paletteIndices:new Uint16Array(width*height),meanDeltaE:0,maxDeltaE:0};
  return {image,camera:{position:[0,0,0],direction:[0,0,-1],worldUp:[0,1,0],verticalFov:50,aspect:width/height},options:{maxDepth:8,layerSpacing:1,blockDensity:50,maxOffset:8192,backdrop:{enabled:false,blockId:'minecraft:black_concrete',offset:4,edgePadding:2}},seed:42};
}
describe('anamorphic generator',()=>{
  it('assigns one unique, verified block per pixel',async()=>{const input=request();const sculpture=await generateSculpture(input);expect(sculpture.paletteIndices).toHaveLength(12);const keys=new Set(Array.from({length:12},(_,i)=>`${sculpture.coordinates[i*3]},${sculpture.coordinates[i*3+1]},${sculpture.coordinates[i*3+2]}`));expect(keys.size).toBe(12);expect(sculpture.diagnostics.verified).toBe(true);});
  it('is deterministic',async()=>{const a=await generateSculpture(request()),b=await generateSculpture(request());expect([...a.coordinates]).toEqual([...b.coordinates]);expect(a.diagnostics.effectiveOffset).toBe(b.diagnostics.effectiveOffset);});
  it('uses density to compact the occupied depth range',async()=>{const spread=request(8,6),compact=request(8,6);spread.options.blockDensity=10;compact.options.blockDensity=100;const a=await generateSculpture(spread),b=await generateSculpture(compact);const span=(values:Int32Array)=>{const z=Array.from({length:values.length/3},(_,index)=>values[index*3+2]!);return Math.max(...z)-Math.min(...z);};expect(span(b.coordinates)).toBeLessThanOrEqual(span(a.coordinates));expect(b.paletteIndices.length).toBe(a.paletteIndices.length);});
  it('densely covers the correct view while retaining randomized depth',async()=>{
    const input=request(24,24),sculpture=await generateSculpture(input),scale=4;
    const rays=pixelRays(sculpture.camera,input.image.width*scale,input.image.height*scale);
    let covered=0;
    for(let pixel=0;pixel<rays.length/3;pixel++){
      const rayAt=pixel*3,ray:[number,number,number]=[rays[rayAt]!,rays[rayAt+1]!,rays[rayAt+2]!];
      for(let block=0;block<sculpture.coordinates.length/3;block++){
        const at=block*3;
        if(rayBoxDistance(sculpture.camera.position,ray,sculpture.coordinates[at]!,sculpture.coordinates[at+1]!,sculpture.coordinates[at+2]!)<Infinity){covered++;break;}
      }
    }
    const depths=new Set(Array.from({length:sculpture.coordinates.length/3},(_,index)=>sculpture.coordinates[index*3+2]));
    expect(covered/(input.image.width*input.image.height*scale*scale)).toBeGreaterThan(0.7);
    expect(depths.size).toBeGreaterThan(8);
    const alternate=request(24,24);alternate.seed=input.seed+1;
    const alternateSculpture=await generateSculpture(alternate);
    const changedDepths=Array.from({length:sculpture.coordinates.length/3},(_,index)=>sculpture.coordinates[index*3+2]!==alternateSculpture.coordinates[index*3+2]).filter(Boolean).length;
    expect(changedDepths).toBeGreaterThan(sculpture.coordinates.length/6);
  });
  it('detects an occluding duplicate',()=>{const input=request(2,1),rays=pixelRays(input.camera,2,1);expect(verifyFirstHits(input,rays,Int32Array.from([0,0,-5,0,0,-5]))).toBe(false);});
  it('omits the backdrop when disabled',async()=>{const sculpture=await generateSculpture(request());expect(sculpture.backdrop).toBeNull();expect(sculpture.diagnostics.backdropBlockCount).toBe(0);});
  it('builds a deterministic padded backdrop behind every image block',async()=>{
    const input=request(6,4);input.options.backdrop={enabled:true,blockId:'minecraft:black_concrete',offset:4,edgePadding:2};
    const a=await generateSculpture(input),b=await generateSculpture(input),unpadded=request(6,4);unpadded.options.backdrop={...input.options.backdrop,edgePadding:0};const compact=await generateSculpture(unpadded);expect(a.backdrop).not.toBeNull();expect([...a.backdrop!.coordinates]).toEqual([...b.backdrop!.coordinates]);
    expect(a.backdrop!.blockId).toBe('minecraft:black_concrete');expect(a.diagnostics.backdropBlockCount).toBe(a.backdrop!.coordinates.length/3);expect(a.diagnostics.backdropBlockCount).toBeGreaterThan(compact.diagnostics.backdropBlockCount);
    const forward=cameraBasis(a.camera).forward;let artRear=-Infinity,backdropNear=Infinity;
    for(let at=0;at<a.coordinates.length;at+=3)artRear=Math.max(artRear,cubeDepthRange(a.camera.position,forward,a.coordinates[at]!,a.coordinates[at+1]!,a.coordinates[at+2]!)[1]);
    for(let at=0;at<a.backdrop!.coordinates.length;at+=3)backdropNear=Math.min(backdropNear,cubeDepthRange(a.camera.position,forward,a.backdrop!.coordinates[at]!,a.backdrop!.coordinates[at+1]!,a.backdrop!.coordinates[at+2]!)[0]);
    const normalizedInput={...input,camera:a.camera};expect(backdropNear).toBeGreaterThanOrEqual(artRear+4-1e-8);expect(verifyFirstHits(normalizedInput,pixelRays(a.camera,input.image.width,input.image.height),a.coordinates)).toBe(true);
  });
  it('supports a global rear plane for an angled camera',async()=>{const input=request(3,3);input.camera={...input.camera,direction:[-.25,.1,-1]};input.options.backdrop={enabled:true,blockId:'minecraft:stone',offset:1,edgePadding:0};const sculpture=await generateSculpture(input);expect(sculpture.backdrop?.blockId).toBe('minecraft:stone');expect(new Set(Array.from({length:sculpture.backdrop!.coordinates.length/3},(_,index)=>`${sculpture.backdrop!.coordinates[index*3]},${sculpture.backdrop!.coordinates[index*3+1]},${sculpture.backdrop!.coordinates[index*3+2]}`)).size).toBe(sculpture.backdrop!.coordinates.length/3);});
});
