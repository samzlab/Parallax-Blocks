import { gunzipSync,strFromU8 } from 'fflate';
import { describe,expect,it } from 'vitest';
import { BLOCK_PALETTE } from '../src/data/palette';
import type { VoxelSculpture } from '../src/domain/types';
import { CAMERA_MARKER_BLOCK,cameraMarkerPosition,createLitematic,packBlockStates } from '../src/export/litematic';

function readIntTag(raw:Uint8Array,name:string):number{
  const encoded=new TextEncoder().encode(name);let at=-1;
  outer:for(let index=0;index<=raw.length-encoded.length;index++){for(let offset=0;offset<encoded.length;offset++)if(raw[index+offset]!==encoded[offset])continue outer;at=index+encoded.length;break;}
  if(at<0)throw new Error(`Missing NBT int tag ${name}`);return new DataView(raw.buffer,raw.byteOffset+at,4).getInt32(0);
}

describe('litematic export',()=>{
  it('packs values across signed 64-bit boundaries',()=>{const values=Uint16Array.from({length:40},(_,i)=>i%8);const packed=packBlockStates(values,8);expect(packed).toHaveLength(2);expect(typeof packed[0]).toBe('bigint');});
  it('writes gzip-compressed NBT with required root fields',()=>{
    const sculpture:VoxelSculpture={coordinates:Int32Array.from([0,0,0,1,0,0]),paletteIndices:Uint16Array.from([0,1]),dimensions:[2,1,1],min:[0,0,0],camera:{position:[0,0,2],direction:[0,0,-1],worldUp:[0,1,0],verticalFov:50,aspect:2},backdrop:null,diagnostics:{verified:true,blockCount:2,volume:2,meanDeltaE:0,maxDeltaE:0,disguiseScores:[],elapsedMs:1,effectiveOffset:2,backdropBlockCount:0}};
    const data=createLitematic(sculpture,BLOCK_PALETTE,{name:'Test',author:'Vitest',description:'fixture',createdAt:0});const raw=gunzipSync(data);
    expect(raw[0]).toBe(10);const text=strFromU8(raw);expect(text).toContain('MinecraftDataVersion');expect(text).toContain('BlockStatePalette');expect(text).toContain('minecraft:air');expect(text).toContain(BLOCK_PALETTE[0]!.id);
    expect(cameraMarkerPosition(sculpture)).toEqual([0,0,2]);expect(text).toContain('Camera Position');expect(text).toContain(CAMERA_MARKER_BLOCK);expect(text).not.toContain('Backdrop');expect(readIntTag(raw,'RegionCount')).toBe(2);expect(readIntTag(raw,'TotalBlocks')).toBe(3);
  });
  it('writes an enabled backdrop as a separate named region',()=>{
    const sculpture:VoxelSculpture={coordinates:Int32Array.from([0,0,0]),paletteIndices:Uint16Array.of(0),dimensions:[1,1,1],min:[0,0,0],camera:{position:[0,0,2],direction:[0,0,-1],worldUp:[0,1,0],verticalFov:50,aspect:1},backdrop:{coordinates:Int32Array.from([-1,-1,-3,0,-1,-3]),min:[-1,-1,-3],dimensions:[2,1,1],blockId:'minecraft:stone',offset:4,edgePadding:1},diagnostics:{verified:true,blockCount:1,volume:1,meanDeltaE:0,maxDeltaE:0,disguiseScores:[],elapsedMs:1,effectiveOffset:2,backdropBlockCount:2}};
    const raw=gunzipSync(createLitematic(sculpture,BLOCK_PALETTE,{name:'Backdrop fixture',author:'Vitest',description:'fixture',createdAt:0})),text=strFromU8(raw);expect(text).toContain('Backdrop');expect(text).toContain('minecraft:stone');expect(text).toContain('Anamorphic Art');expect(text).toContain('Camera Position');expect(readIntTag(raw,'RegionCount')).toBe(3);expect(readIntTag(raw,'TotalBlocks')).toBe(4);
  });
});
