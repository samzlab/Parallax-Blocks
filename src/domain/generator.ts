import { cameraBasis, cubeDepthRange, dilateProjectedCells, pixelRays, projectBox, projectedBoxCells, rayBoxDistance, screenRayFromBasis, type CameraBasis } from './geometry';
import type { BackdropLayer, GenerationPhase, GenerationRequest, Vec3, VoxelSculpture } from './types';

export type ProgressCallback = (phase: GenerationPhase, progress: number, message: string) => void;
const mix = (value:number) => { value=Math.imul(value^(value>>>16),0x45d9f3b);value=Math.imul(value^(value>>>16),0x45d9f3b);return (value^(value>>>16))>>>0; };

function assign(request:GenerationRequest,rays:Float64Array,offset:number):Int32Array|null{
  const {width,height}=request.image,{maxDepth,layerSpacing,blockDensity}=request.options;
  const coordinates=new Int32Array(width*height*3),basis=cameraBasis(request.camera);
  const levels=Math.floor((maxDepth-1)/layerSpacing)+1;
  const activeLevels=Math.max(1,Math.round(1+(levels-1)*(1-blockDensity/100)));
  for(let pixel=0;pixel<width*height;pixel++){
    const at=pixel*3,firstLevel=mix(request.seed^pixel)%activeLevels;
    let assigned=false;
    for(let step=0;step<activeLevels*2-1;step++){
      const delta=Math.ceil(step/2),level=firstLevel+(step%2===1?-delta:delta);
      if(level<0||level>=activeLevels)continue;
      const depth=level*layerSpacing,t=offset+depth;
      const x=Math.floor(request.camera.position[0]+rays[at]!*t);
      const y=Math.floor(request.camera.position[1]+rays[at+1]!*t);
      const z=Math.floor(request.camera.position[2]+rays[at+2]!*t);
      const bounds=projectBox(request.camera,basis,x,y,z,width,height);
      if(!bounds)continue;
      const [minX,minY,maxX,maxY]=bounds;
      let exclusive=true;
      for(let screenY=minY;screenY<=maxY&&exclusive;screenY++)for(let screenX=minX;screenX<=maxX;screenX++){
        const other=screenY*width+screenX;if(other===pixel)continue;
        const rayAt=other*3,ray:Vec3=[rays[rayAt]!,rays[rayAt+1]!,rays[rayAt+2]!];
        if(rayBoxDistance(request.camera.position,ray,x,y,z)<Infinity){exclusive=false;break;}
      }
      if(!exclusive)continue;
      coordinates[at]=x;coordinates[at+1]=y;coordinates[at+2]=z;assigned=true;break;
    }
    if(!assigned)return null;
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

interface RawBackdrop {coordinates:Int32Array;blockId:string;offset:number;edgePadding:number}
const coordinateKey=(x:number,y:number,z:number)=>`${x},${y},${z}`;
const cellKey=(x:number,y:number)=>`${x},${y}`;

function backdropCandidate(request:GenerationRequest,basis:CameraBasis,x:number,y:number,minimumDepth:number):Vec3|null{
  const ray=screenRayFromBasis(request.camera,basis,request.image.width,request.image.height,x,y);
  const rayForward=ray[0]*basis.forward[0]+ray[1]*basis.forward[1]+ray[2]*basis.forward[2];
  for(let extra=0;extra<=4;extra+=.125){
    const distance=(minimumDepth+extra)/rayForward,block:Vec3=[Math.floor(request.camera.position[0]+ray[0]*distance),Math.floor(request.camera.position[1]+ray[1]*distance),Math.floor(request.camera.position[2]+ray[2]*distance)];
    if(cubeDepthRange(request.camera.position,basis.forward,...block)[0]>=minimumDepth-1e-8)return block;
  }
  return null;
}

function verifyBackdrop(request:GenerationRequest,rays:Float64Array,art:Int32Array,backdrop:Int32Array,minimumDepth:number):boolean{
  const {width,height}=request.image,basis=cameraBasis(request.camera),bins:Array<number[]>=Array.from({length:width*height},()=>[]);
  const artCoordinates=new Set<string>();
  for(let at=0;at<art.length;at+=3)artCoordinates.add(coordinateKey(art[at]!,art[at+1]!,art[at+2]!));
  for(let block=0;block<backdrop.length/3;block++){
    const at=block*3,x=backdrop[at]!,y=backdrop[at+1]!,z=backdrop[at+2]!;
    if(artCoordinates.has(coordinateKey(x,y,z))||cubeDepthRange(request.camera.position,basis.forward,x,y,z)[0]<minimumDepth-1e-8)return false;
    for(const [cellX,cellY] of projectedBoxCells(request.camera,basis,x,y,z,width,height))if(cellX>=0&&cellX<width&&cellY>=0&&cellY<height)bins[cellY*width+cellX]!.push(block);
  }
  for(let pixel=0;pixel<width*height;pixel++){
    const rayAt=pixel*3,ray:Vec3=[rays[rayAt]!,rays[rayAt+1]!,rays[rayAt+2]!],artAt=pixel*3;
    const artDistance=rayBoxDistance(request.camera.position,ray,art[artAt]!,art[artAt+1]!,art[artAt+2]!);
    for(const block of bins[pixel]!){const at=block*3;if(rayBoxDistance(request.camera.position,ray,backdrop[at]!,backdrop[at+1]!,backdrop[at+2]!)<artDistance-1e-8)return false;}
  }
  return true;
}

function generateBackdrop(request:GenerationRequest,rays:Float64Array,art:Int32Array,isCancelled:()=>boolean):RawBackdrop{
  const options=request.options.backdrop;
  if(!Number.isInteger(options.offset)||options.offset<1||options.offset>20)throw new Error('Backdrop offset must be an integer from 1 to 20 blocks.');
  if(!Number.isInteger(options.edgePadding)||options.edgePadding<0||options.edgePadding>20)throw new Error('Backdrop edge padding must be an integer from 0 to 20 blocks.');
  const basis=cameraBasis(request.camera),silhouette=new Map<string,readonly [number,number]>();
  let rearDepth=-Infinity;
  for(let at=0;at<art.length;at+=3){
    if(isCancelled())throw new DOMException('Generation cancelled','AbortError');
    const x=art[at]!,y=art[at+1]!,z=art[at+2]!;rearDepth=Math.max(rearDepth,cubeDepthRange(request.camera.position,basis.forward,x,y,z)[1]);
    for(const cell of projectedBoxCells(request.camera,basis,x,y,z,request.image.width,request.image.height))silhouette.set(cellKey(...cell),cell);
  }
  const mask=dilateProjectedCells(silhouette.values(),options.edgePadding),maskKeys=new Set(mask.map(cell=>cellKey(...cell))),covered=new Set<string>(),coordinates=new Map<string,Vec3>();
  const minimumDepth=rearDepth+options.offset;
  let pending=mask,pass=0;
  while(pending.length&&pass<16){
    const before=covered.size;
    for(const [cellX,cellY] of pending){
      if(isCancelled())throw new DOMException('Generation cancelled','AbortError');
      const candidate=backdropCandidate(request,basis,cellX,cellY,minimumDepth+pass*.25);if(!candidate)continue;
      const key=coordinateKey(...candidate);if(!coordinates.has(key))coordinates.set(key,candidate);
      for(const cell of projectedBoxCells(request.camera,basis,...candidate,request.image.width,request.image.height)){const projectedKey=cellKey(...cell);if(maskKeys.has(projectedKey))covered.add(projectedKey);}
    }
    pending=mask.filter(cell=>!covered.has(cellKey(...cell)));
    if(covered.size===before&&pending.length)break;pass++;
  }
  if(pending.length)throw new Error(`Backdrop generation could not cover ${pending.length} projected silhouette cells.`);
  const flat=Int32Array.from([...coordinates.values()].flat());
  if(!verifyBackdrop(request,rays,art,flat,minimumDepth))throw new Error('Backdrop verification failed because a backdrop block could appear ahead of the image.');
  return {coordinates:flat,blockId:options.blockId,offset:options.offset,edgePadding:options.edgePadding};
}

function normalized(request:GenerationRequest,coordinates:Int32Array,rawBackdrop:RawBackdrop|null,offset:number,elapsedMs:number):VoxelSculpture{
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(let at=0;at<coordinates.length;at+=3){minX=Math.min(minX,coordinates[at]!);minY=Math.min(minY,coordinates[at+1]!);minZ=Math.min(minZ,coordinates[at+2]!);maxX=Math.max(maxX,coordinates[at]!);maxY=Math.max(maxY,coordinates[at+1]!);maxZ=Math.max(maxZ,coordinates[at+2]!);}
  for(let at=0;at<coordinates.length;at+=3){coordinates[at]=coordinates[at]!-minX;coordinates[at+1]=coordinates[at+1]!-minY;coordinates[at+2]=coordinates[at+2]!-minZ;}
  let backdrop:BackdropLayer|null=null;
  if(rawBackdrop){
    const shifted=rawBackdrop.coordinates;let backMinX=Infinity,backMinY=Infinity,backMinZ=Infinity,backMaxX=-Infinity,backMaxY=-Infinity,backMaxZ=-Infinity;
    for(let at=0;at<shifted.length;at+=3){shifted[at]=shifted[at]!-minX;shifted[at+1]=shifted[at+1]!-minY;shifted[at+2]=shifted[at+2]!-minZ;backMinX=Math.min(backMinX,shifted[at]!);backMinY=Math.min(backMinY,shifted[at+1]!);backMinZ=Math.min(backMinZ,shifted[at+2]!);backMaxX=Math.max(backMaxX,shifted[at]!);backMaxY=Math.max(backMaxY,shifted[at+1]!);backMaxZ=Math.max(backMaxZ,shifted[at+2]!);}
    backdrop={coordinates:shifted,min:[backMinX,backMinY,backMinZ],dimensions:[backMaxX-backMinX+1,backMaxY-backMinY+1,backMaxZ-backMinZ+1],blockId:rawBackdrop.blockId,offset:rawBackdrop.offset,edgePadding:rawBackdrop.edgePadding};
  }
  const dimensions:Vec3=[maxX-minX+1,maxY-minY+1,maxZ-minZ+1];
  const camera={...request.camera,position:[request.camera.position[0]-minX,request.camera.position[1]-minY,request.camera.position[2]-minZ] as Vec3};
  const w=request.image.width,h=request.image.height;
  const disguiseScores=offAxisScores(coordinates,request.image.paletteIndices,camera,dimensions,w,h);
  return {coordinates,paletteIndices:request.image.paletteIndices.slice(),dimensions,min:[0,0,0],camera,backdrop,diagnostics:{verified:true,blockCount:w*h,volume:dimensions[0]*dimensions[1]*dimensions[2],meanDeltaE:request.image.meanDeltaE,maxDeltaE:request.image.maxDeltaE,disguiseScores,elapsedMs,effectiveOffset:offset,backdropBlockCount:backdrop?backdrop.coordinates.length/3:0}};
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
  // At this distance a one-block face spans roughly one output pixel. Candidate
  // filtering keeps neighboring pixel-center rays out while retaining seeded
  // depth variation, so the verified view can be packed much more tightly.
  const minimum=Math.max(1,Math.ceil(0.5*height/Math.tan(request.camera.verticalFov*Math.PI/360)));
  let offset=minimum,coordinates:Int32Array|null=null,attempt=0;
  while(offset<=request.options.maxOffset){
    if(isCancelled())throw new DOMException('Generation cancelled','AbortError');
    onProgress('feasibility-search',Math.min(0.55,0.1+attempt*0.06),`Testing sculpture offset ${offset}`);
    const candidate=assign(request,rays,offset);
    if(candidate){onProgress('visibility-verification',0.6,'Checking every pixel’s first intersection');if(verifyFirstHits(request,rays,candidate)){coordinates=candidate;break;}}
    offset=Math.max(offset+1,Math.ceil(offset*1.1));attempt++;
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(!coordinates)throw new Error(`No collision-free voxel assignment was found before the ${request.options.maxOffset}-block offset cap. Increase FOV or reduce output resolution.`);
  let backdrop:RawBackdrop|null=null;
  if(request.options.backdrop.enabled){onProgress('backdrop-generation',0.76,'Building the silhouette-shaped rear plane');backdrop=generateBackdrop(request,rays,coordinates,isCancelled);}
  onProgress('disguise-analysis',0.86,'Scoring off-axis depth variation');
  await new Promise(resolve=>setTimeout(resolve,0));
  if(isCancelled())throw new DOMException('Generation cancelled','AbortError');
  onProgress('preview-preparation',0.96,'Preparing compact preview buffers');
  return normalized(request,coordinates,backdrop,offset,performance.now()-started);
}
