import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { PNG } from 'pngjs';
import { BLOCK_PALETTE } from '../src/data/palette';

const jarPath=process.argv[2];
if(!jarPath)throw new Error('Usage: pnpm palette:extract /path/to/minecraft-1.20.1-client.jar');
const archive=unzipSync(new Uint8Array(await readFile(resolve(jarPath))));
const palettePath=resolve('src/data/palette.ts');
let source=await readFile(palettePath,'utf8');
const missing:string[]=[];
const decoder=new TextDecoder(),textureCache=new Map<string,readonly [number,number,number]|null>();

interface BlockModel {parent?:string;textures?:Record<string,string>}
function readModel(name:string):BlockModel|null{
  const entry=archive[`assets/minecraft/models/${name.replace('minecraft:','')}.json`];
  return entry?JSON.parse(decoder.decode(entry)) as BlockModel:null;
}
function faceTextures(id:string):string[]{
  const chain:BlockModel[]=[];let name:string|undefined=`minecraft:block/${id}`;
  while(name){const model=readModel(name);if(!model)break;chain.push(model);name=model.parent;}
  const textures=Object.assign({},...chain.reverse().map(model=>model.textures??{}));
  const resolveReference=(value:string):string=>{let resolved=value,guard=0;while(resolved.startsWith('#')&&guard++<10)resolved=textures[resolved.slice(1)]??resolved;return resolved.replace('minecraft:','');};
  if(textures.all)return Array(6).fill(resolveReference(textures.all));
  if(textures.side){const end=textures.end?resolveReference(textures.end):'',top=textures.top?resolveReference(textures.top):end,bottom=textures.bottom?resolveReference(textures.bottom):end;return [...Array(4).fill(resolveReference(textures.side)),top,bottom].filter(Boolean);}
  if(textures.end)return Array(6).fill(resolveReference(textures.end));
  return [];
}
function textureRgb(path:string):readonly [number,number,number]|null{
  if(textureCache.has(path))return textureCache.get(path)!;
  const entry=archive[`assets/minecraft/textures/${path}.png`];if(!entry){textureCache.set(path,null);return null;}
  const png=PNG.sync.read(Buffer.from(entry));let r=0,g=0,b=0,count=0;
  for(let at=0;at<png.data.length;at+=4){const alpha=png.data[at+3]!/255;if(alpha===0)continue;r+=png.data[at]!*alpha;g+=png.data[at+1]!*alpha;b+=png.data[at+2]!*alpha;count+=alpha;}
  const value=count?[Math.round(r/count),Math.round(g/count),Math.round(b/count)] as const:null;textureCache.set(path,value);return value;
}

for(const block of BLOCK_PALETTE){
  const id=block.id.replace('minecraft:','');
  let colors=faceTextures(id).map(textureRgb).filter((color):color is readonly [number,number,number]=>color!==null);
  if(!colors.length){const candidates=[`block/${id}`,`block/${id}_side`,id==='quartz_block'?'block/quartz_block_side':''];colors=candidates.filter(Boolean).map(textureRgb).filter((color):color is readonly [number,number,number]=>color!==null);}
  if(!colors.length){missing.push(id);continue;}
  const rgb=[0,1,2].map(channel=>Math.round(colors.reduce((sum,color)=>sum+color[channel]!,0)/colors.length));
  const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp(`(\\['${escaped}','[^']+','[^']+',)\\d+,\\d+,\\d+(\\])`);
  if(!pattern.test(source)){missing.push(id);continue;}
  source=source.replace(pattern,`$1${rgb.join(',')}$2`);
}
await writeFile(palettePath,source);
console.log(`Updated ${BLOCK_PALETTE.length-missing.length} palette colors from ${jarPath}.`);
if(missing.length)console.warn(`No simple full-cube texture found for: ${missing.join(', ')}`);
