import { bench,describe } from 'vitest';
import { generateSculpture } from '../src/domain/generator';
import type { GenerationRequest,OutputImage } from '../src/domain/types';

const width=256,height=256;
const image:OutputImage={width,height,rgb:new Uint8ClampedArray(width*height*3),matchedRgb:new Uint8ClampedArray(width*height*3),paletteIndices:new Uint16Array(width*height),meanDeltaE:0,maxDeltaE:0};
const request:GenerationRequest={image,camera:{position:[0,0,0],direction:[0,0,-1],worldUp:[0,1,0],verticalFov:50,aspect:1},options:{maxDepth:64,layerSpacing:1,blockDensity:50,maxOffset:8192},seed:0x12345678};

describe('256×256 generation',()=>{bench('generate and verify',async()=>{await generateSculpture(request);},{iterations:1,warmupIterations:0,time:0});});
