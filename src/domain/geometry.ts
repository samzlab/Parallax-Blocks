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
  const { forward, right, up } = cameraBasis(camera);
  const rays = new Float64Array(width * height * 3);
  const tanY = Math.tan(camera.verticalFov * Math.PI / 360);
  const tanX = tanY * width / height;
  for (let y=0;y<height;y++) for (let x=0;x<width;x++) {
    const sx = (2*(x+0.5)/width-1)*tanX;
    const sy = (1-2*(y+0.5)/height)*tanY;
    const ray = normalize([
      forward[0]+right[0]*sx+up[0]*sy,
      forward[1]+right[1]*sx+up[1]*sy,
      forward[2]+right[2]*sx+up[2]*sy,
    ]);
    const at=(y*width+x)*3; rays[at]=ray[0];rays[at+1]=ray[1];rays[at+2]=ray[2];
  }
  return rays;
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
