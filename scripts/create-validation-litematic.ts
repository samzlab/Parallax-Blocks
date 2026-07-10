import { writeFile } from 'node:fs/promises';
import { BLOCK_PALETTE } from '../src/data/palette';
import type { VoxelSculpture } from '../src/domain/types';
import { createLitematic } from '../src/export/litematic';

const output=process.argv[2]??'/tmp/parallax-blocks-validation.litematic';
const sculpture:VoxelSculpture={
  coordinates:Int32Array.from([0,0,0,1,0,0,0,1,0,1,1,0]),paletteIndices:Uint16Array.from([0,1,2,3]),dimensions:[2,2,1],min:[0,0,0],
  camera:{position:[0,0,4],direction:[0,0,-1],worldUp:[0,1,0],verticalFov:50,aspect:1},
  diagnostics:{verified:true,blockCount:4,volume:4,frontCoverage:1,adjacentPixelRatio:1,depthSpan:0,meanDeltaE:0,maxDeltaE:0,disguiseScores:[1],elapsedMs:0,effectiveOffset:4},
};
await writeFile(output,createLitematic(sculpture,BLOCK_PALETTE,{name:'Parallax Blocks validation',author:'Parallax Blocks',description:'Independent parser fixture',createdAt:0}));
console.log(output);
