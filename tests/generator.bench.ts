import { bench,describe } from 'vitest';
import { generateSculpture } from '../src/domain/generator';
import type { GenerationRequest,OutputImage } from '../src/domain/types';

const width=256,height=256;
const image:OutputImage={width,height,rgb:new Uint8ClampedArray(width*height*3),matchedRgb:new Uint8ClampedArray(width*height*3),paletteIndices:new Uint16Array(width*height),meanDeltaE:0,maxDeltaE:0};
const request:GenerationRequest={image,camera:{position:[0,0,0],direction:[0,0,-1],worldUp:[0,1,0],verticalFov:50,aspect:1},options:{maxDepth:64,layerSpacing:1,blockDensity:50,maxOffset:8192,backdrop:{enabled:false,blockId:'minecraft:black_concrete',offset:4,edgePadding:2}},seed:0x12345678};
const backdropRequest:GenerationRequest={...request,options:{...request.options,backdrop:{...request.options.backdrop,enabled:true}}};

describe('256×256 generation',()=>{
  bench('generate and verify',async()=>{await generateSculpture(request);},{iterations:1,warmupIterations:0,time:0});
  bench('generate and verify with backdrop',async()=>{await generateSculpture(backdropRequest);},{iterations:1,warmupIterations:0,time:0});
});
