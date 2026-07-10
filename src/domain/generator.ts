import { cameraBasis, pixelRays, projectBox, rayBoxDistance } from './geometry';
import type { GenerationPhase, GenerationRequest, Vec3, VoxelSculpture } from './types';

export type ProgressCallback = (phase: GenerationPhase, progress: number, message: string) => void;

interface PlacementCandidate {
  coordinates:Int32Array;
  offset:number;
  adjacency:number;
  depthSpan:number;
  coverage:number;
}

const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

function placementMetrics(request:GenerationRequest,coordinates:Int32Array):{adjacency:number;depthSpan:number}{
  const {width,height}=request.image,forward=cameraBasis(request.camera).forward;
  let adjacent=0,pairs=0,minDepth=Infinity,maxDepth=-Infinity;
  for(let pixel=0;pixel<width*height;pixel++){
    const at=pixel*3,center:Vec3=[coordinates[at]!+.5-request.camera.position[0],coordinates[at+1]!+.5-request.camera.position[1],coordinates[at+2]!+.5-request.camera.position[2]];
    const depth=dot(center,forward);minDepth=Math.min(minDepth,depth);maxDepth=Math.max(maxDepth,depth);
    const x=pixel%width,y=Math.floor(pixel/width);
    if(x+1<width){const other=at+3;adjacent+=Math.abs(coordinates[at]!-coordinates[other]!)+Math.abs(coordinates[at+1]!-coordinates[other+1]!)+Math.abs(coordinates[at+2]!-coordinates[other+2]!)===1?1:0;pairs++;}
    if(y+1<height){const other=at+width*3;adjacent+=Math.abs(coordinates[at]!-coordinates[other]!)+Math.abs(coordinates[at+1]!-coordinates[other+1]!)+Math.abs(coordinates[at+2]!-coordinates[other+2]!)===1?1:0;pairs++;}
  }
  return {adjacency:adjacent/Math.max(1,pairs),depthSpan:maxDepth-minDepth};
}

function assignProjectionPlane(request:GenerationRequest,rays:Float64Array,offset:number,phase:Vec3):PlacementCandidate|null{
  const count=request.image.width*request.image.height,coordinates=new Int32Array(count*3),seen=new Set<string>(),forward=cameraBasis(request.camera).forward;
  for(let pixel=0;pixel<count;pixel++){
    const at=pixel*3,ray:Vec3=[rays[at]!,rays[at+1]!,rays[at+2]!],denominator=dot(ray,forward);
    if(denominator<=1e-9)return null;
    const t=offset/denominator;
    const x=Math.floor(request.camera.position[0]+ray[0]*t+phase[0]),y=Math.floor(request.camera.position[1]+ray[1]*t+phase[1]),z=Math.floor(request.camera.position[2]+ray[2]*t+phase[2]);
    const key=`${x},${y},${z}`;if(seen.has(key))return null;seen.add(key);coordinates[at]=x;coordinates[at+1]=y;coordinates[at+2]=z;
  }
  return {coordinates,offset,...placementMetrics(request,coordinates),coverage:0};
}

function assignWithConflictDepth(request:GenerationRequest,rays:Float64Array,offset:number):PlacementCandidate|null{
  const {width,height}=request.image,{maxDepth,layerSpacing,blockDensity}=request.options,count=width*height,coordinates=new Int32Array(count*3),seen=new Set<string>(),forward=cameraBasis(request.camera).forward;
  const levels=Math.floor((maxDepth-1)/layerSpacing)+1,activeLevels=Math.max(1,Math.round(1+(levels-1)*(1-blockDensity/100)));
  for(let pixel=0;pixel<count;pixel++){
    const at=pixel*3,ray:Vec3=[rays[at]!,rays[at+1]!,rays[at+2]!],denominator=dot(ray,forward);let placed=false;
    for(let layer=0;layer<activeLevels;layer++){
      const t=(offset+layer*layerSpacing)/denominator,x=Math.floor(request.camera.position[0]+ray[0]*t),y=Math.floor(request.camera.position[1]+ray[1]*t),z=Math.floor(request.camera.position[2]+ray[2]*t),key=`${x},${y},${z}`;
      if(seen.has(key))continue;seen.add(key);coordinates[at]=x;coordinates[at+1]=y;coordinates[at+2]=z;placed=true;break;
    }
    if(!placed)return null;
  }
  return {coordinates,offset,...placementMetrics(request,coordinates),coverage:0};
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

export function measureFrontCoverage(request:GenerationRequest,coordinates:Int32Array,scale=2):number{
  const width=request.image.width*scale,height=request.image.height*scale,rays=pixelRays(request.camera,width,height),basis=cameraBasis(request.camera),nearest=new Float64Array(width*height).fill(Infinity),origin=request.camera.position;
  for(let block=0;block<coordinates.length/3;block++){
    const at=block*3,x=coordinates[at]!,y=coordinates[at+1]!,z=coordinates[at+2]!,bounds=projectBox(request.camera,basis,x,y,z,width,height);
    if(!bounds)continue;
    const [minX,minY,maxX,maxY]=bounds;
    for(let py=minY;py<=maxY;py++)for(let px=minX;px<=maxX;px++){
      const pixel=py*width+px,rayAt=pixel*3,ray:Vec3=[rays[rayAt]!,rays[rayAt+1]!,rays[rayAt+2]!],distance=rayBoxDistance(origin,ray,x,y,z);
      if(distance<nearest[pixel]!)nearest[pixel]=distance;
    }
  }
  let covered=0;for(const distance of nearest)if(Number.isFinite(distance))covered++;
  return covered/nearest.length;
}

function normalized(request:GenerationRequest,candidate:PlacementCandidate,elapsedMs:number):VoxelSculpture{
  const coordinates=candidate.coordinates;
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(let at=0;at<coordinates.length;at+=3){minX=Math.min(minX,coordinates[at]!);minY=Math.min(minY,coordinates[at+1]!);minZ=Math.min(minZ,coordinates[at+2]!);maxX=Math.max(maxX,coordinates[at]!);maxY=Math.max(maxY,coordinates[at+1]!);maxZ=Math.max(maxZ,coordinates[at+2]!);}
  for(let at=0;at<coordinates.length;at+=3){coordinates[at]=coordinates[at]!-minX;coordinates[at+1]=coordinates[at+1]!-minY;coordinates[at+2]=coordinates[at+2]!-minZ;}
  const dimensions:Vec3=[maxX-minX+1,maxY-minY+1,maxZ-minZ+1];
  const camera={...request.camera,position:[request.camera.position[0]-minX,request.camera.position[1]-minY,request.camera.position[2]-minZ] as Vec3};
  const w=request.image.width,h=request.image.height;
  const disguiseScores=offAxisScores(coordinates,request.image.paletteIndices,camera,dimensions,w,h);
  return {coordinates,paletteIndices:request.image.paletteIndices.slice(),dimensions,min:[0,0,0],camera,diagnostics:{verified:true,blockCount:w*h,volume:dimensions[0]*dimensions[1]*dimensions[2],frontCoverage:candidate.coverage,adjacentPixelRatio:candidate.adjacency,depthSpan:candidate.depthSpan,meanDeltaE:request.image.meanDeltaE,maxDeltaE:request.image.maxDeltaE,disguiseScores,elapsedMs,effectiveOffset:candidate.offset}};
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
  const tangent=Math.tan(request.camera.verticalFov*Math.PI/360),ideal=Math.max(1,height/(2*tangent));
  const start=Math.max(1,Math.floor(ideal*.72)),end=Math.min(request.options.maxOffset,Math.ceil(ideal*1.4+request.options.layerSpacing));
  const step=Math.max(1,Math.floor((end-start)/40)),phases:Vec3[]=[[0,0,0],[.5,0,0],[0,.5,0],[0,0,.5],[.5,.5,0],[.5,0,.5],[0,.5,.5],[.5,.5,.5],[.25,.25,.25],[.75,.75,.75]];
  const preliminary:PlacementCandidate[]=[];
  const estimatedCoverage=(candidate:PlacementCandidate)=>Math.min(1,(ideal/candidate.offset)**2);
  const preliminaryOrder=(a:PlacementCandidate,b:PlacementCandidate)=>estimatedCoverage(b)-estimatedCoverage(a)||b.adjacency-a.adjacency||a.depthSpan-b.depthSpan||a.offset-b.offset;
  let scan=0;
  for(let offset=start;offset<=end;offset+=step){
    if(isCancelled())throw new DOMException('Generation cancelled','AbortError');
    onProgress('feasibility-search',.1+.32*(offset-start)/Math.max(1,end-start),`Fitting adjacent blocks on projection plane ${offset}`);
    for(const phase of phases){const candidate=assignProjectionPlane(request,rays,offset,phase);if(candidate)preliminary.push(candidate);}
    const relaxed=assignWithConflictDepth(request,rays,offset);if(relaxed)preliminary.push(relaxed);
    if(preliminary.length>72){preliminary.sort(preliminaryOrder);preliminary.length=48;}
    if(++scan%8===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  preliminary.sort(preliminaryOrder);preliminary.length=Math.min(preliminary.length,48);
  let best:PlacementCandidate|null=null,checked=0;
  for(const candidate of preliminary){
    if(isCancelled())throw new DOMException('Generation cancelled','AbortError');
    onProgress('visibility-verification',.45+.25*checked/Math.max(1,preliminary.length),'Verifying coverage and first-hit visibility');checked++;
    if(!verifyFirstHits(request,rays,candidate.coordinates))continue;
    candidate.coverage=measureFrontCoverage(request,candidate.coordinates);
    if(!best||candidate.coverage>best.coverage+1e-6||Math.abs(candidate.coverage-best.coverage)<=1e-6&&(candidate.depthSpan<best.depthSpan-1e-6||Math.abs(candidate.depthSpan-best.depthSpan)<=1e-6&&(candidate.coordinates.length<best.coordinates.length||candidate.coordinates.length===best.coordinates.length&&(candidate.adjacency>best.adjacency+1e-6||Math.abs(candidate.adjacency-best.adjacency)<=1e-6&&candidate.offset<best.offset))))best=candidate;
    if(best.coverage>=.999&&best.depthSpan<1)break;
    if(checked%4===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  let fallbackOffset=Math.max(end+1,Math.ceil(ideal));
  while(!best&&fallbackOffset<=request.options.maxOffset){
    if(isCancelled())throw new DOMException('Generation cancelled','AbortError');
    onProgress('feasibility-search',.7,`Resolving remaining conflicts at projection plane ${fallbackOffset}`);
    const candidate=assignWithConflictDepth(request,rays,fallbackOffset)??assignProjectionPlane(request,rays,fallbackOffset,[0,0,0]);
    if(candidate&&verifyFirstHits(request,rays,candidate.coordinates)){candidate.coverage=measureFrontCoverage(request,candidate.coordinates);best=candidate;break;}
    fallbackOffset=Math.max(fallbackOffset+1,Math.ceil(fallbackOffset*1.18));await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(!best)throw new Error(`No collision-free voxel assignment was found before the ${request.options.maxOffset}-block offset cap. Increase FOV or reduce output resolution.`);
  onProgress('disguise-analysis',0.82,'Scoring off-axis depth variation');
  await new Promise(resolve=>setTimeout(resolve,0));
  if(isCancelled())throw new DOMException('Generation cancelled','AbortError');
  onProgress('preview-preparation',0.94,'Preparing compact preview buffers');
  return normalized(request,best,performance.now()-started);
}
