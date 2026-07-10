import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BlockDefinition, CameraSpec, Vec3, VoxelSculpture } from '../domain/types';

interface CameraSnapshot { position:THREE.Vector3; target:THREE.Vector3; fov:number }

export class SculptureViewer {
  private scene=new THREE.Scene();
  private camera=new THREE.PerspectiveCamera(50,1,0.05,20_000);
  private renderer:THREE.WebGLRenderer;
  private controls:OrbitControls;
  private content=new THREE.Group();
  private observer:ResizeObserver;
  private frame=0;
  private freeCamera:CameraSnapshot|null=null;
  private sculpture:VoxelSculpture|null=null;

  constructor(private readonly host:HTMLElement){
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));this.renderer.setClearColor(0x11130f);host.append(this.renderer.domElement);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.enableDamping=true;this.controls.dampingFactor=0.08;
    this.camera.position.set(6,5,8);this.controls.target.set(0,0,0);
    this.scene.add(this.content,new THREE.AmbientLight(0xffffff,2),new THREE.AxesHelper(3));
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(host);this.resize();this.animate();
  }
  private animate=()=>{this.frame=requestAnimationFrame(this.animate);this.controls.update();this.renderer.render(this.scene,this.camera);};
  private resize(){const width=Math.max(1,this.host.clientWidth),height=Math.max(1,this.host.clientHeight);this.renderer.setSize(width,height,false);this.camera.aspect=width/height;this.camera.updateProjectionMatrix();}
  setSculpture(sculpture:VoxelSculpture,palette:readonly BlockDefinition[]){
    this.clear();this.sculpture=sculpture;
    const geometry=new THREE.BoxGeometry(1,1,1),groups=new Map<number,number[]>();
    sculpture.paletteIndices.forEach((value,index)=>{const group=groups.get(value)??[];group.push(index);groups.set(value,group);});
    const matrix=new THREE.Matrix4();
    for(const [paletteIndex,indices] of groups){
      const rgb=palette[paletteIndex]!.rgb,material=new THREE.MeshBasicMaterial({color:new THREE.Color(rgb[0]/255,rgb[1]/255,rgb[2]/255)});
      const mesh=new THREE.InstancedMesh(geometry,material,indices.length);
      indices.forEach((block,instance)=>{const at=block*3;matrix.makeTranslation(sculpture.coordinates[at]!+0.5,sculpture.coordinates[at+1]!+0.5,sculpture.coordinates[at+2]!+0.5);mesh.setMatrixAt(instance,matrix);});
      mesh.instanceMatrix.needsUpdate=true;this.content.add(mesh);
    }
    const [x,y,z]=sculpture.dimensions;const box=new THREE.Box3(new THREE.Vector3(0,0,0),new THREE.Vector3(x,y,z));
    this.content.add(new THREE.Box3Helper(box,0x9eb38a));
    this.controls.target.set(x/2,y/2,z/2);this.camera.position.set(x*1.3,y*1.1,z*1.5);this.camera.far=Math.max(20_000,Math.hypot(x,y,z)*20);this.camera.updateProjectionMatrix();this.controls.update();
  }
  viewCorrectPosition(){
    if(!this.sculpture)return;
    this.freeCamera={position:this.camera.position.clone(),target:this.controls.target.clone(),fov:this.camera.fov};
    const spec=this.sculpture.camera;this.camera.position.fromArray(spec.position);this.camera.fov=spec.verticalFov;
    this.controls.target.set(spec.position[0]+spec.direction[0],spec.position[1]+spec.direction[1],spec.position[2]+spec.direction[2]);this.camera.updateProjectionMatrix();this.controls.update();
  }
  restoreFreePosition(){if(!this.freeCamera)return;this.camera.position.copy(this.freeCamera.position);this.controls.target.copy(this.freeCamera.target);this.camera.fov=this.freeCamera.fov;this.camera.updateProjectionMatrix();this.controls.update();}
  captureCamera():CameraSpec{
    const direction=this.controls.target.clone().sub(this.camera.position).normalize();
    return {position:this.camera.position.toArray() as unknown as Vec3,direction:direction.toArray() as unknown as Vec3,worldUp:[0,1,0],verticalFov:this.camera.fov,aspect:this.camera.aspect};
  }
  private clear(){for(const child of [...this.content.children]){this.content.remove(child);if(child instanceof THREE.Mesh){child.geometry.dispose();const materials=Array.isArray(child.material)?child.material:[child.material];materials.forEach(item=>item.dispose());}}}
  dispose(){cancelAnimationFrame(this.frame);this.observer.disconnect();this.clear();this.controls.dispose();this.renderer.dispose();this.renderer.domElement.remove();}
}
