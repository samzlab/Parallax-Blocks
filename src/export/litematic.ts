import { gzipSync } from 'fflate';
import type { BlockDefinition, LitematicMetadata, Vec3, VoxelSculpture } from '../domain/types';
import { nbt, Tag, writeNbt, type NbtCompound } from './nbt';

export const MINECRAFT_DATA_VERSION=3465;
export const LITEMATIC_VERSION=6;
export const LITEMATIC_SUB_VERSION=1;
export const CAMERA_MARKER_BLOCK='minecraft:black_concrete';

export function cameraMarkerPosition(sculpture:VoxelSculpture):Vec3{
  return sculpture.camera.position.map(value=>Math.floor(value)) as unknown as Vec3;
}

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
  const [markerX,markerY,markerZ]=cameraMarkerPosition(sculpture);
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
  const artRegion:NbtCompound={
    BlockStatePalette:nbt.list(Tag.Compound,paletteTags),BlockStates:nbt.longArray(packBlockStates(states,paletteTags.length)),
    Entities:emptyCompounds(),PendingBlockTicks:emptyCompounds(),PendingFluidTicks:emptyCompounds(),
    Position:nbt.compound(vector(0,0,0)),Size:nbt.compound(vector(sizeX,sizeY,sizeZ)),TileEntities:emptyCompounds(),
  };
  const markerPalette:NbtCompound[]=[{Name:nbt.string('minecraft:air')},{Name:nbt.string(CAMERA_MARKER_BLOCK)}];
  const markerRegion:NbtCompound={
    BlockStatePalette:nbt.list(Tag.Compound,markerPalette),BlockStates:nbt.longArray(packBlockStates(Uint16Array.of(1),markerPalette.length)),
    Entities:emptyCompounds(),PendingBlockTicks:emptyCompounds(),PendingFluidTicks:emptyCompounds(),
    Position:nbt.compound(vector(markerX,markerY,markerZ)),Size:nbt.compound(vector(1,1,1)),TileEntities:emptyCompounds(),
  };
  const regions:NbtCompound={'Anamorphic Art':nbt.compound(artRegion),'Camera Position':nbt.compound(markerRegion)},regionBounds:Array<{position:Vec3;size:Vec3;volume:number}>=[{position:[0,0,0],size:[sizeX,sizeY,sizeZ],volume:sizeX*sizeY*sizeZ},{position:[markerX,markerY,markerZ],size:[1,1,1],volume:1}];
  if(sculpture.backdrop){
    const backdrop=sculpture.backdrop,[backdropSizeX,backdropSizeY,backdropSizeZ]=backdrop.dimensions,[backdropMinX,backdropMinY,backdropMinZ]=backdrop.min,backdropStates=new Uint16Array(backdropSizeX*backdropSizeY*backdropSizeZ);
    for(let at=0;at<backdrop.coordinates.length;at+=3){const x=backdrop.coordinates[at]!-backdropMinX,y=backdrop.coordinates[at+1]!-backdropMinY,z=backdrop.coordinates[at+2]!-backdropMinZ;backdropStates[x+z*backdropSizeX+y*backdropSizeX*backdropSizeZ]=1;}
    const backdropPalette:NbtCompound[]=[{Name:nbt.string('minecraft:air')},{Name:nbt.string(backdrop.blockId)}],backdropRegion:NbtCompound={
      BlockStatePalette:nbt.list(Tag.Compound,backdropPalette),BlockStates:nbt.longArray(packBlockStates(backdropStates,backdropPalette.length)),
      Entities:emptyCompounds(),PendingBlockTicks:emptyCompounds(),PendingFluidTicks:emptyCompounds(),Position:nbt.compound(vector(...backdrop.min)),Size:nbt.compound(vector(...backdrop.dimensions)),TileEntities:emptyCompounds(),
    };
    regions.Backdrop=nbt.compound(backdropRegion);regionBounds.push({position:backdrop.min,size:backdrop.dimensions,volume:backdropSizeX*backdropSizeY*backdropSizeZ});
  }
  const enclosingMin:Vec3=[Math.min(...regionBounds.map(region=>region.position[0])),Math.min(...regionBounds.map(region=>region.position[1])),Math.min(...regionBounds.map(region=>region.position[2]))];
  const enclosingMax:Vec3=[Math.max(...regionBounds.map(region=>region.position[0]+region.size[0])),Math.max(...regionBounds.map(region=>region.position[1]+region.size[1])),Math.max(...regionBounds.map(region=>region.position[2]+region.size[2]))];
  const enclosingSize:Vec3=[enclosingMax[0]-enclosingMin[0],enclosingMax[1]-enclosingMin[1],enclosingMax[2]-enclosingMin[2]],totalVolume=regionBounds.reduce((sum,region)=>sum+region.volume,0),totalBlocks=sculpture.diagnostics.blockCount+(sculpture.backdrop?.coordinates.length??0)/3+1;
  const now=BigInt(metadata.createdAt);
  const root:NbtCompound={
    Version:nbt.int(LITEMATIC_VERSION),SubVersion:nbt.int(LITEMATIC_SUB_VERSION),MinecraftDataVersion:nbt.int(MINECRAFT_DATA_VERSION),
    Metadata:nbt.compound({Name:nbt.string(metadata.name),Author:nbt.string(metadata.author),Description:nbt.string(metadata.description),
      RegionCount:nbt.int(regionBounds.length),TimeCreated:nbt.long(now),TimeModified:nbt.long(now),TotalBlocks:nbt.int(totalBlocks),
      TotalVolume:nbt.int(totalVolume),EnclosingSize:nbt.compound(vector(...enclosingSize))}),
    Regions:nbt.compound(regions),
  };
  return gzipSync(writeNbt(root),{level:9});
}

export function downloadLitematic(data:Uint8Array,name:string):void{
  const safe=(name.trim()||'anamorphic-art').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-|-$/g,'');
  const blob=new Blob([data as BlobPart],{type:'application/octet-stream'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`${safe}.litematic`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
