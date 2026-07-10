import { gunzipSync,strFromU8 } from 'fflate';
import { describe,expect,it } from 'vitest';
import { BLOCK_PALETTE } from '../src/data/palette';
import type { VoxelSculpture } from '../src/domain/types';
import { createLitematic,packBlockStates } from '../src/export/litematic';

describe('litematic export',()=>{
  it('packs values across signed 64-bit boundaries',()=>{const values=Uint16Array.from({length:40},(_,i)=>i%8);const packed=packBlockStates(values,8);expect(packed).toHaveLength(2);expect(typeof packed[0]).toBe('bigint');});
  it('writes gzip-compressed NBT with required root fields',()=>{
    const sculpture:VoxelSculpture={coordinates:Int32Array.from([0,0,0,1,0,0]),paletteIndices:Uint16Array.from([0,1]),dimensions:[2,1,1],min:[0,0,0],camera:{position:[0,0,2],direction:[0,0,-1],worldUp:[0,1,0],verticalFov:50,aspect:2},diagnostics:{verified:true,blockCount:2,volume:2,meanDeltaE:0,maxDeltaE:0,disguiseScores:[],elapsedMs:1,effectiveOffset:2}};
    const data=createLitematic(sculpture,BLOCK_PALETTE,{name:'Test',author:'Vitest',description:'fixture',createdAt:0});const raw=gunzipSync(data);
    expect(raw[0]).toBe(10);const text=strFromU8(raw);expect(text).toContain('MinecraftDataVersion');expect(text).toContain('BlockStatePalette');expect(text).toContain('minecraft:air');expect(text).toContain(BLOCK_PALETTE[0]!.id);
  });
});
