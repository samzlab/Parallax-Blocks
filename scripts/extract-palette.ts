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

for(const block of BLOCK_PALETTE){
  const id=block.id.replace('minecraft:','');
  const candidates=[id,`${id}_side`,id==='quartz_block'?'quartz_block_side':''];
  const entry=candidates.filter(Boolean).map(name=>archive[`assets/minecraft/textures/block/${name}.png`]).find(Boolean);
  if(!entry){missing.push(id);continue;}
  const png=PNG.sync.read(Buffer.from(entry));let r=0,g=0,b=0,count=0;
  for(let at=0;at<png.data.length;at+=4){const alpha=png.data[at+3]!/255;if(alpha===0)continue;r+=png.data[at]!*alpha;g+=png.data[at+1]!*alpha;b+=png.data[at+2]!*alpha;count+=alpha;}
  const rgb=[Math.round(r/count),Math.round(g/count),Math.round(b/count)];
  const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp(`(\\['${escaped}','[^']+','[^']+',)\\d+,\\d+,\\d+(\\])`);
  if(!pattern.test(source)){missing.push(id);continue;}
  source=source.replace(pattern,`$1${rgb.join(',')}$2`);
}
await writeFile(palettePath,source);
console.log(`Updated ${BLOCK_PALETTE.length-missing.length} palette colors from ${jarPath}.`);
if(missing.length)console.warn(`No simple full-cube texture found for: ${missing.join(', ')}`);
