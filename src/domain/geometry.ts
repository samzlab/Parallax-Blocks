import type { CameraSpec, Vec3 } from './types';

export interface CameraBasis { forward: Vec3; right: Vec3; up: Vec3 }
const dot = (a: Vec3, b: Vec3) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
export const normalize = (v: Vec3): Vec3 => {
  const length = Math.hypot(...v);
  if (!Number.isFinite(length) || length < 1e-9) throw new Error('Camera direction must be a non-zero finite vector.');
  return [v[0]/length,v[1]/length,v[2]/length];
};

export function cameraBasis(camera: CameraSpec): CameraBasis {
  const forward = normalize(camera.direction);
  let reference = normalize(camera.worldUp);
  if (Math.abs(dot(forward, reference)) > 0.999) reference = Math.abs(forward[0]) < 0.9 ? [1,0,0] : [0,0,1];
  const right = normalize(cross(forward, reference));
  return { forward, right, up: normalize(cross(right, forward)) };
}

export function pixelRays(camera: CameraSpec, width: number, height: number): Float64Array {
  const rays = new Float64Array(width * height * 3),basis=cameraBasis(camera);
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    const ray = screenRayFromBasis(camera,basis,width,height,x,y);
    const at=(y*width+x)*3; rays[at]=ray[0];rays[at+1]=ray[1];rays[at+2]=ray[2];
  }
  return rays;
}

export function screenRay(camera:CameraSpec,width:number,height:number,x:number,y:number):Vec3{
  return screenRayFromBasis(camera,cameraBasis(camera),width,height,x,y);
}

export function screenRayFromBasis(camera:CameraSpec,basis:CameraBasis,width:number,height:number,x:number,y:number):Vec3{
  const {forward,right,up}=basis,tanY=Math.tan(camera.verticalFov*Math.PI/360),tanX=tanY*width/height;
  const sx=(2*(x+.5)/width-1)*tanX,sy=(1-2*(y+.5)/height)*tanY;
  return normalize([forward[0]+right[0]*sx+up[0]*sy,forward[1]+right[1]*sx+up[1]*sy,forward[2]+right[2]*sx+up[2]*sy]);
}

type Vec2=readonly [number,number];
const cross2=(a:Vec2,b:Vec2,c:Vec2)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);

function convexHull(points:Vec2[]):Vec2[]{
  const sorted=[...points].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  if(sorted.length<=2)return sorted;
  const lower:Vec2[]=[],upper:Vec2[]=[];
  for(const point of sorted){while(lower.length>=2&&cross2(lower[lower.length-2]!,lower[lower.length-1]!,point)<=0)lower.pop();lower.push(point);}
  for(let index=sorted.length-1;index>=0;index--){const point=sorted[index]!;while(upper.length>=2&&cross2(upper[upper.length-2]!,upper[upper.length-1]!,point)<=0)upper.pop();upper.push(point);}
  lower.pop();upper.pop();return [...lower,...upper];
}

function pointInConvex(point:Vec2,polygon:readonly Vec2[]):boolean{
  let sign=0;
  for(let index=0;index<polygon.length;index++){
    const value=cross2(polygon[index]!,polygon[(index+1)%polygon.length]!,point);
    if(Math.abs(value)<1e-9)continue;
    const next=Math.sign(value);if(sign&&next!==sign)return false;sign=next;
  }
  return true;
}

function orientation(a:Vec2,b:Vec2,c:Vec2):number{const value=cross2(a,b,c);return Math.abs(value)<1e-9?0:Math.sign(value);}
function onSegment(a:Vec2,b:Vec2,point:Vec2):boolean{return point[0]>=Math.min(a[0],b[0])-1e-9&&point[0]<=Math.max(a[0],b[0])+1e-9&&point[1]>=Math.min(a[1],b[1])-1e-9&&point[1]<=Math.max(a[1],b[1])+1e-9;}
function segmentsIntersect(a:Vec2,b:Vec2,c:Vec2,d:Vec2):boolean{
  const o1=orientation(a,b,c),o2=orientation(a,b,d),o3=orientation(c,d,a),o4=orientation(c,d,b);
  if(o1===0&&onSegment(a,b,c)||o2===0&&onSegment(a,b,d)||o3===0&&onSegment(c,d,a)||o4===0&&onSegment(c,d,b))return true;
  return o1!==o2&&o3!==o4;
}

function polygonIntersectsCell(polygon:readonly Vec2[],x:number,y:number):boolean{
  const corners:Vec2[]=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]];
  if(polygon.some(([px,py])=>px>=x&&px<=x+1&&py>=y&&py<=y+1))return true;
  if(corners.some(point=>pointInConvex(point,polygon)))return true;
  for(let p=0;p<polygon.length;p++)for(let c=0;c<4;c++)if(segmentsIntersect(polygon[p]!,polygon[(p+1)%polygon.length]!,corners[c]!,corners[(c+1)%4]!))return true;
  return false;
}

export function projectedBoxCells(camera:CameraSpec,basis:CameraBasis,x:number,y:number,z:number,width:number,height:number):Array<readonly [number,number]>{
  const tanY=Math.tan(camera.verticalFov*Math.PI/360),tanX=tanY*width/height,points:Vec2[]=[];
  for(let dz=0;dz<=1;dz++)for(let dy=0;dy<=1;dy++)for(let dx=0;dx<=1;dx++){
    const v:Vec3=[x+dx-camera.position[0],y+dy-camera.position[1],z+dz-camera.position[2]],forward=dot(v,basis.forward);
    if(forward<=1e-6)return [];
    points.push([(dot(v,basis.right)/(forward*tanX)+1)*width/2,(1-dot(v,basis.up)/(forward*tanY))*height/2]);
  }
  const polygon=convexHull(points);if(polygon.length<3)return [];
  const minX=Math.floor(Math.min(...polygon.map(point=>point[0]))),maxX=Math.ceil(Math.max(...polygon.map(point=>point[0])))-1;
  const minY=Math.floor(Math.min(...polygon.map(point=>point[1]))),maxY=Math.ceil(Math.max(...polygon.map(point=>point[1])))-1;
  const cells:Array<readonly [number,number]>=[];
  for(let cellY=minY;cellY<=maxY;cellY++)for(let cellX=minX;cellX<=maxX;cellX++)if(polygonIntersectsCell(polygon,cellX,cellY))cells.push([cellX,cellY]);
  return cells;
}

export function dilateProjectedCells(cells:Iterable<readonly [number,number]>,padding:number):Array<readonly [number,number]>{
  const result=new Set<string>();
  for(const [x,y] of cells)for(let dy=-padding;dy<=padding;dy++)for(let dx=-padding;dx<=padding;dx++)result.add(`${x+dx},${y+dy}`);
  return [...result].map(key=>key.split(',').map(Number) as [number,number]).sort((a,b)=>a[1]-b[1]||a[0]-b[0]);
}

export function cubeDepthRange(origin:Vec3,forward:Vec3,x:number,y:number,z:number):readonly [number,number]{
  let near=Infinity,far=-Infinity;
  for(let dz=0;dz<=1;dz++)for(let dy=0;dy<=1;dy++)for(let dx=0;dx<=1;dx++){
    const depth=(x+dx-origin[0])*forward[0]+(y+dy-origin[1])*forward[1]+(z+dz-origin[2])*forward[2];near=Math.min(near,depth);far=Math.max(far,depth);
  }
  return [near,far];
}

export function rayBoxDistance(origin: Vec3, ray: Vec3, x: number, y: number, z: number): number {
  let near = -Infinity, far = Infinity;
  for (let axis=0;axis<3;axis++) {
    const o=origin[axis]!, d=ray[axis]!, min=[x,y,z][axis]!, max=min+1;
    if (Math.abs(d)<1e-12) { if (o<min||o>max) return Infinity; continue; }
    let a=(min-o)/d,b=(max-o)/d;if(a>b)[a,b]=[b,a];near=Math.max(near,a);far=Math.min(far,b);
    if(near>far) return Infinity;
  }
  return far>=Math.max(near,0)?Math.max(near,0):Infinity;
}

export function projectBox(
  camera: CameraSpec, basis: CameraBasis, x:number,y:number,z:number,width:number,height:number,
): [number,number,number,number] | null {
  const tanY=Math.tan(camera.verticalFov*Math.PI/360),tanX=tanY*width/height;
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(let dz=0;dz<=1;dz++)for(let dy=0;dy<=1;dy++)for(let dx=0;dx<=1;dx++){
    const v:Vec3=[x+dx-camera.position[0],y+dy-camera.position[1],z+dz-camera.position[2]];
    const forward=dot(v,basis.forward);if(forward<=1e-6)continue;
    const nx=dot(v,basis.right)/(forward*tanX),ny=dot(v,basis.up)/(forward*tanY);
    const px=(nx+1)*width/2,py=(1-ny)*height/2;
    minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
  }
  if(!Number.isFinite(minX)||maxX<0||maxY<0||minX>=width||minY>=height)return null;
  return [Math.max(0,Math.floor(minX)),Math.max(0,Math.floor(minY)),Math.min(width-1,Math.floor(maxX)),Math.min(height-1,Math.floor(maxY))];
}
