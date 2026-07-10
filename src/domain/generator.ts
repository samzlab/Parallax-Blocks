import { cameraBasis, pixelRays, projectBox, rayBoxDistance } from './geometry';
import type { GenerationPhase, GenerationRequest, Vec3, VoxelSculpture } from './types';

export type ProgressCallback = (phase: GenerationPhase, progress: number, message: string) => void;
const mix = (value:number) => { value=Math.imul(value^(value>>>16),0x45d9f3b);value=Math.imul(value^(value>>>16),0x45d9f3b);return (value^(value>>>16))>>>0; };

function assign(request:GenerationRequest,rays:Float64Array,offset:number):Int32Array|null{
  const {width,height}=request.image,{maxDepth,layerSpacing,blockDensity}=request.options;
  const coordinates=new Int32Array(width*height*3),seen=new Set<string>();
  const levels=Math.floor((maxDepth-1)/layerSpacing)+1;
  const activeLevels=Math.max(1,Math.round(1+(levels-1)*(1-blockDensity/100)));
  for(let pixel=0;pixel<width*height;pixel++){
    const depth=(mix(request.seed^pixel)%activeLevels)*layerSpacing;
    const t=offset+depth,at=pixel*3;
    const x=Math.floor(request.camera.position[0]+rays[at]!*t);
    const y=Math.floor(request.camera.position[1]+rays[at+1]!*t);
    const z=Math.floor(request.camera.position[2]+rays[at+2]!*t);
    const key=`${x},${y},${z}`;if(seen.has(key))return null;seen.add(key);
    coordinates[at]=x;coordinates[at+1]=y;coordinates[at+2]=z;
  }
  return coordinates;
}

export function verifyFirstHits(request:GenerationRequest,rays:Float64Array,coordinates:Int32Array):boolean{
  const {width,height}=request.image,count=width*height,bins:Array<number[]>=Array.from({length:count},()=>[]);
  const basis=cameraBasis(request.camera);
  for(let block=0;block<count;block++){
    const at=block*3,bounds=projectBox(request.camera,basis,coordinates[at]!,coordinates[at+1]!,coordinates[at+2]!,width,height);
    if(!bounds)return false;
    const [minX,minY,maxX,maxY]=bounds;
    if((maxX-minX+1)*(maxY-minY+1)>64)return false;
    for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)bins[y*width+x]!.push(block);
  }
  const origin=request.camera.position;
  for(let pixel=0;pixel<count;pixel++){
    const rayAt=pixel*3,ray:Vec3=[rays[rayAt]!,rays[rayAt+1]!,rays[rayAt+2]!];
    let first=-1,distance=Infinity;
    for(const block of bins[pixel]!) {
      const at=block*3,d=rayBoxDistance(origin,ray,coordinates[at]!,coordinates[at+1]!,coordinates[at+2]!);
      if(d<distance-1e-8){distance=d;first=block;}
    }
    if(first!==pixel)return false;
  }
  return true;
}

function normalized(request:GenerationRequest,coordinates:Int32Array,offset:number,elapsedMs:number):VoxelSculpture{
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(let at=0;at<coordinates.length;at+=3){minX=Math.min(minX,coordinates[at]!);minY=Math.min(minY,coordinates[at+1]!);minZ=Math.min(minZ,coordinates[at+2]!);maxX=Math.max(maxX,coordinates[at]!);maxY=Math.max(maxY,coordinates[at+1]!);maxZ=Math.max(maxZ,coordinates[at+2]!);}
  for(let at=0;at<coordinates.length;at+=3){coordinates[at]=coordinates[at]!-minX;coordinates[at+1]=coordinates[at+1]!-minY;coordinates[at+2]=coordinates[at+2]!-minZ;}
  const dimensions:Vec3=[maxX-minX+1,maxY-minY+1,maxZ-minZ+1];
  const camera={...request.camera,position:[request.camera.position[0]-minX,request.camera.position[1]-minY,request.camera.position[2]-minZ] as Vec3};
  const w=request.image.width,h=request.image.height;
  const disguiseScores=offAxisScores(coordinates,request.image.paletteIndices,camera,dimensions,w,h);
  return {coordinates,paletteIndices:request.image.paletteIndices.slice(),dimensions,min:[0,0,0],camera,diagnostics:{verified:true,blockCount:w*h,volume:dimensions[0]*dimensions[1]*dimensions[2],meanDeltaE:request.image.meanDeltaE,maxDeltaE:request.image.maxDeltaE,disguiseScores,elapsedMs,effectiveOffset:offset}};
}

function offAxisScores(coordinates:Int32Array,paletteIndices:Uint16Array,camera:GenerationRequest['camera'],dimensions:Vec3,width:number,height:number):number[]{
  const center:Vec3=[dimensions[0]/2,dimensions[1]/2,dimensions[2]/2],axis=cameraBasis(camera).up;
  return [-45,-30,-15,15,30,45].map(degrees=>{
    const angle=degrees*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),relative:Vec3=[camera.position[0]-center[0],camera.position[1]-center[1],camera.position[2]-center[2]];
    const axisDot=relative[0]*axis[0]+relative[1]*axis[1]+relative[2]*axis[2];
    const cross:Vec3=[axis[1]*relative[2]-axis[2]*relative[1],axis[2]*relative[0]-axis[0]*relative[2],axis[0]*relative[1]-axis[1]*relative[0]];
    const position:Vec3=[center[0]+relative[0]*c+cross[0]*s+axis[0]*axisDot*(1-c),center[1]+relative[1]*c+cross[1]*s+axis[1]*axisDot*(1-c),center[2]+relative[2]*c+cross[2]*s+axis[2]*axisDot*(1-c)];
    const direction:Vec3=[center[0]-position[0],center[1]-position[1],center[2]-position[2]],view={...camera,position,direction};
    const basis=cameraBasis(view),tanY=Math.tan(view.verticalFov*Math.PI/360),tanX=tanY*width/height,depth=new Float64Array(width*height).fill(Infinity),rendered=new Uint16Array(width*height).fill(65535);
    for(let block=0;block<paletteIndices.length;block++){
      const at=block*3,v:Vec3=[coordinates[at]!+.5-position[0],coordinates[at+1]!+.5-position[1],coordinates[at+2]!+.5-position[2]];
      const forward=v[0]*basis.forward[0]+v[1]*basis.forward[1]+v[2]*basis.forward[2];if(forward<=0)continue;
      const horizontal=v[0]*basis.right[0]+v[1]*basis.right[1]+v[2]*basis.right[2],vertical=v[0]*basis.up[0]+v[1]*basis.up[1]+v[2]*basis.up[2];
      const x=Math.floor((horizontal/(forward*tanX)+1)*width/2),y=Math.floor((1-vertical/(forward*tanY))*height/2);if(x<0||x>=width||y<0||y>=height)continue;
      const pixel=y*width+x;if(forward<depth[pixel]!){depth[pixel]=forward;rendered[pixel]=paletteIndices[block]!;}
    }
    let matches=0;for(let pixel=0;pixel<rendered.length;pixel++)if(rendered[pixel]===paletteIndices[pixel])matches++;
    return 1-matches/rendered.length;
  });
}

export async function generateSculpture(request:GenerationRequest,onProgress:ProgressCallback=()=>{},isCancelled=()=>false):Promise<VoxelSculpture>{
  const started=performance.now(),{width,height}=request.image;
  onProgress('ray-construction',0.05,'Constructing perspective rays');
  const rays=pixelRays(request.camera,width,height);
  const minimum=Math.max(1,Math.ceil(0.95*height/Math.tan(request.camera.verticalFov*Math.PI/360)));
  let offset=minimum,coordinates:Int32Array|null=null,attempt=0;
  while(offset<=request.options.maxOffset){
    if(isCancelled())throw new DOMException('Generation cancelled','AbortError');
    onProgress('feasibility-search',Math.min(0.55,0.1+attempt*0.06),`Testing sculpture offset ${offset}`);
    const candidate=assign(request,rays,offset);
    if(candidate){onProgress('visibility-verification',0.6,'Checking every pixel’s first intersection');if(verifyFirstHits(request,rays,candidate)){coordinates=candidate;break;}}
    offset=Math.max(offset+1,Math.ceil(offset*1.35));attempt++;
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(!coordinates)throw new Error(`No collision-free voxel assignment was found before the ${request.options.maxOffset}-block offset cap. Increase FOV or reduce output resolution.`);
  onProgress('disguise-analysis',0.82,'Scoring off-axis depth variation');
  await new Promise(resolve=>setTimeout(resolve,0));
  if(isCancelled())throw new DOMException('Generation cancelled','AbortError');
  onProgress('preview-preparation',0.94,'Preparing compact preview buffers');
  return normalized(request,coordinates,offset,performance.now()-started);
}
