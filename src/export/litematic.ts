import { gzipSync } from 'fflate';
import type { BlockDefinition, LitematicMetadata, VoxelSculpture } from '../domain/types';
import { nbt, Tag, writeNbt, type NbtCompound } from './nbt';

export const MINECRAFT_DATA_VERSION=3465;
export const LITEMATIC_VERSION=6;
export const LITEMATIC_SUB_VERSION=1;

export function packBlockStates(values:Uint16Array,paletteSize:number):bigint[]{
  const bits=Math.max(2,Math.ceil(Math.log2(paletteSize)));
  const length=Math.ceil(values.length*bits/64),result=Array<bigint>(length).fill(0n),mask=(1n<<BigInt(bits))-1n;
  for(let index=0;index<values.length;index++){
    const bitIndex=index*bits,longIndex=Math.floor(bitIndex/64),start=bitIndex%64,value=BigInt(values[index]!)&mask;
    result[longIndex]=result[longIndex]!|(value<<BigInt(start));
    const spill=start+bits-64;if(spill>0)result[longIndex+1]=result[longIndex+1]!|(value>>BigInt(bits-spill));
  }
  return result.map(value=>value>=(1n<<63n)?value-(1n<<64n):value);
}

export function createLitematic(sculpture:VoxelSculpture,palette:readonly BlockDefinition[],metadata:LitematicMetadata):Uint8Array{
  const [sizeX,sizeY,sizeZ]=sculpture.dimensions.map(Math.round) as [number,number,number];
  const used=[...new Set(sculpture.paletteIndices)].sort((a,b)=>a-b);
  const remap=new Map<number,number>(used.map((value,index)=>[value,index+1]));
  const states=new Uint16Array(sizeX*sizeY*sizeZ);
  for(let block=0;block<sculpture.paletteIndices.length;block++){
    const at=block*3,x=sculpture.coordinates[at]!,y=sculpture.coordinates[at+1]!,z=sculpture.coordinates[at+2]!;
    states[x+z*sizeX+y*sizeX*sizeZ]=remap.get(sculpture.paletteIndices[block]!)!;
  }
  const paletteTags:NbtCompound[]=[{Name:nbt.string('minecraft:air')},...used.map(index=>({Name:nbt.string(palette[index]!.id)}))];
  const vector=(x:number,y:number,z:number):NbtCompound=>({x:nbt.int(x),y:nbt.int(y),z:nbt.int(z)});
  const emptyCompounds=()=>nbt.list(Tag.Compound,[]);
  const region:NbtCompound={
    BlockStatePalette:nbt.list(Tag.Compound,paletteTags),BlockStates:nbt.longArray(packBlockStates(states,paletteTags.length)),
    Entities:emptyCompounds(),PendingBlockTicks:emptyCompounds(),PendingFluidTicks:emptyCompounds(),
    Position:nbt.compound(vector(0,0,0)),Size:nbt.compound(vector(sizeX,sizeY,sizeZ)),TileEntities:emptyCompounds(),
  };
  const now=BigInt(metadata.createdAt);
  const root:NbtCompound={
    Version:nbt.int(LITEMATIC_VERSION),SubVersion:nbt.int(LITEMATIC_SUB_VERSION),MinecraftDataVersion:nbt.int(MINECRAFT_DATA_VERSION),
    Metadata:nbt.compound({Name:nbt.string(metadata.name),Author:nbt.string(metadata.author),Description:nbt.string(metadata.description),
      RegionCount:nbt.int(1),TimeCreated:nbt.long(now),TimeModified:nbt.long(now),TotalBlocks:nbt.int(sculpture.diagnostics.blockCount),
      TotalVolume:nbt.int(sizeX*sizeY*sizeZ),EnclosingSize:nbt.compound(vector(sizeX,sizeY,sizeZ))}),
    Regions:nbt.compound({'Anamorphic Art':nbt.compound(region)}),
  };
  return gzipSync(writeNbt(root),{level:9});
}

export function downloadLitematic(data:Uint8Array,name:string):void{
  const safe=(name.trim()||'anamorphic-art').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-|-$/g,'');
  const blob=new Blob([data as BlobPart],{type:'application/octet-stream'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`${safe}.litematic`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
