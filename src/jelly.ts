import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { SoftBody, mold, type Binding, type Vec3 } from './physics';
import type { ItemSpec } from './content';
import { DeskMotion } from './motion';
export class Jelly {
  group = new THREE.Group();
  body:SoftBody;
  motion:DeskMotion;
  shadow:THREE.Mesh<THREE.PlaneGeometry,THREE.MeshBasicMaterial>;
  mesh:THREE.Mesh;
  prop=new THREE.Group();
  private bindings:Binding[]=[];
  private base:Float32Array;
  private restSample:Float32Array;
  private center:Binding;
  private right:Binding;
  private front:Binding;
  private bubbleBindings:{mesh:THREE.Mesh,b:Binding,rest:Vec3}[]=[];
  private grip:{binding:Binding;point:THREE.Vector3;sample:THREE.Vector3;offset:THREE.Vector3;vertices?:number[];weights?:number[]}|null=null;
  readonly rotation:number;
  constructor(readonly spec:ItemSpec) {
    const [width,height,depth]=spec.size;
    this.body=new SoftBody({width,height,depth,shape:spec.shape,firmness:spec.firmness});
    this.motion=new DeskMotion(spec.position[0],spec.position[1],spec.size,spec.rotation,spec.shape);
    this.motion.onImpact=(speed,direction)=>{
      const local=new THREE.Vector3(...direction).applyQuaternion(this.motion.orientation.clone().invert());
      if(local.y<-.75)this.body.landing(speed);
      else this.body.kick(local.multiplyScalar(speed*.4).toArray() as Vec3);
    };
    this.rotation=spec.rotation;
    this.group.position.set(spec.position[0],.045,spec.position[1]);this.group.rotation.y=spec.rotation;
    const geometry=mergeVertices(new THREE.BoxGeometry(2,1,2,24,12,24).translate(0,.5,0).deleteAttribute('normal').deleteAttribute('uv'));
    const positions=geometry.getAttribute('position') as THREE.BufferAttribute;
    this.base=new Float32Array(positions.count*3);this.restSample=new Float32Array(positions.count*3);
    for(let i=0;i<positions.count;i++) {
      const u=positions.getX(i),v=positions.getY(i),w=positions.getZ(i),p=mold(u,v,w,this.body.options),b=this.body.bind(u,v,w);
      this.bindings.push(b);this.base.set(p,i*3);this.restSample.set(this.body.sample(b),i*3);positions.setXYZ(i,...p);
    }
    geometry.computeVertexNormals();
    const material=new THREE.MeshPhysicalMaterial({
      color:new THREE.Color(spec.color).lerp(new THREE.Color('white'),.40), metalness:0, roughness:.105,
      transmission:1, thickness:height*.77, ior:1.35, attenuationColor:spec.color, attenuationDistance:2.5,
      clearcoat:1,clearcoatRoughness:.09,envMapIntensity:.82,side:THREE.FrontSide,
    });
    this.mesh=new THREE.Mesh(geometry,material);this.mesh.castShadow=false;this.mesh.receiveShadow=true;this.mesh.userData.jelly=this;
    this.group.add(this.mesh,this.prop);
    this.prop.position.y=height*.24;this.prop.scale.setScalar(spec.scale);
    this.center=this.body.bind(0,.53,0);this.right=this.body.bind(.5,.53,0);this.front=this.body.bind(0,.53,.5);
    // Small inclusions help communicate depth without obscuring the office prop.
    const random=seeded(spec.id.length*217+width*102);
    const bubbleGeo=new THREE.SphereGeometry(1,8,6);
    const bubbleMat=new THREE.MeshPhysicalMaterial({color:spec.color,metalness:0,roughness:.1,transparent:true,opacity:.18,depthWrite:false,side:THREE.BackSide});
    for(let i=0;i<30;i++) {
      const u=(random()-.5)*1.8,v=.12+random()*.72,w=(random()-.5)*1.8;
      if(Math.abs(u)<.65 && Math.abs(w)<.6)continue;
      const p=mold(u,v,w,this.body.options),b=this.body.bind(u,v,w);
      const bubble=new THREE.Mesh(bubbleGeo,bubbleMat);bubble.scale.setScalar(.009+random()*.024);bubble.position.set(...p);
      this.group.add(bubble);this.bubbleBindings.push({mesh:bubble,b,rest:p});
    }
    // The shadow stays on the desk while its jello is lifted above it.
    this.shadow=new THREE.Mesh(new THREE.PlaneGeometry(width*1.2,depth*1.25),new THREE.MeshBasicMaterial({color:spec.color,transparent:true,opacity:.20,map:contactTexture(),depthWrite:false}));
    this.shadow.rotation.set(-Math.PI/2,0,-spec.rotation);
  }
  step(dt:number){
    this.motion.step(dt);
    if(this.motion.held){
      // Acceleration bends the suspended gel; speed adds continuous drag while moving.
      const inertial=this.motion.deformationImpulse(dt);
      const local=new THREE.Vector3(...inertial).applyQuaternion(this.group.quaternion.clone().invert());
      this.body.kick([local.x,local.y,local.z]);
    }
    this.body.step(dt);
    this.updatePose();
  }
  startGrip(point:THREE.Vector3,offset:THREE.Vector3,face?:{a:number;b:number;c:number}|null){
    const binding=this.bindingAt(point);
    this.grip={binding,point:point.clone(),sample:new THREE.Vector3(...this.body.sample(binding)),offset:offset.clone()};
    if(face){
      const ids=[face.a,face.b,face.c],positions=this.mesh.geometry.getAttribute('position');
      const [a,b,c]=ids.map(i=>new THREE.Vector3().fromBufferAttribute(positions,i));
      const weights=THREE.Triangle.getBarycoord(point,a,b,c,new THREE.Vector3());
      if(weights){this.grip.vertices=ids;this.grip.weights=weights.toArray();}
    }
  }
  private gripPoint(){
    if(!this.grip)return null;
    if(this.grip.vertices&&this.grip.weights){
      const point=new THREE.Vector3();
      this.grip.vertices.forEach((i,k)=>{
        const sample=this.body.sample(this.bindings[i]),weight=this.grip!.weights![k];
        point.x+=(this.base[i*3]+sample[0]-this.restSample[i*3])*weight;
        point.y+=(this.base[i*3+1]+sample[1]-this.restSample[i*3+1])*weight;
        point.z+=(this.base[i*3+2]+sample[2]-this.restSample[i*3+2])*weight;
      });
      return point;
    }
    return new THREE.Vector3(...this.body.sample(this.grip.binding)).sub(this.grip.sample).add(this.grip.point);
  }
  gripWorldPoint(){return this.gripPoint()?.applyMatrix4(this.group.matrixWorld)??null;}
  releaseGrip(cancel:boolean,time:number){
    this.updatePose();
    const grip=this.gripPoint();
    if(this.motion.held)this.motion.release(cancel,time,grip?.toArray() as Vec3|undefined);
    this.grip=null;
  }
  private updatePose(){
    const [x,y,z]=this.motion.position;
    this.group.position.set(x,.045+y,z);
    this.group.quaternion.copy(this.motion.orientation);
    if(this.grip&&this.motion.target){
      const local=this.gripPoint()!.applyQuaternion(this.group.quaternion);
      const desired=new THREE.Vector3(...this.motion.target).add(this.grip.offset);desired.y+=.045;
      this.group.position.copy(desired.sub(local));
      this.motion.position=[this.group.position.x,this.group.position.y-.045,this.group.position.z];
    }
    this.group.updateMatrixWorld(true);
  }
  reset(){this.grip=null;this.motion.reset();this.body.reset();this.sync();}
  setProp(object:THREE.Object3D){
    object.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
    this.prop.add(object);
  }
  sync() {
    this.updatePose();
    const center=this.motion.center;
    const floor=this.motion.supportHeight(),altitude=Math.max(0,this.motion.bottom-floor);
    this.shadow.position.set(center.x+altitude*.22,.048+floor,center.z+altitude*.12);
    this.shadow.scale.setScalar(1+altitude*.16);this.shadow.material.opacity=.20/(1+altitude*.75);
    const pos=this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute,p=this.body.positions;
    for(let i=0;i<this.bindings.length;i++) {
      const b=this.bindings[i];let x=0,y=0,z=0;
      for(let k=0;k<8;k++){const id=b.ids[k]*3,wt=b.weights[k];x+=p[id]*wt;y+=p[id+1]*wt;z+=p[id+2]*wt;}
      pos.setXYZ(i,this.base[i*3]+x-this.restSample[i*3],this.base[i*3+1]+y-this.restSample[i*3+1],this.base[i*3+2]+z-this.restSample[i*3+2]);
    }
    pos.needsUpdate=true;this.mesh.geometry.computeVertexNormals();this.mesh.geometry.computeBoundingSphere();
    const c=this.body.displacement(this.center),r=this.body.displacement(this.right),f=this.body.displacement(this.front);
    this.prop.position.set(c[0]*.78,this.spec.size[1]*.24+c[1]*.6,c[2]*.78);
    this.prop.rotation.set((f[1]-c[1])*.7,(f[0]-c[0])*.5,-(r[1]-c[1])*.7);
    for(const b of this.bubbleBindings){const d=this.body.displacement(b.b);b.mesh.position.set(b.rest[0]+d[0],b.rest[1]+d[1],b.rest[2]+d[2]);}
  }
  bindingAt(point:THREE.Vector3):Binding {
    // Pick the actual deformed surface, then use its undeformed embedding.
    const pos=this.mesh.geometry.getAttribute('position');let nearest=0,distance=Infinity;
    for(let i=0;i<pos.count;i++){const d=(point.x-pos.getX(i))**2+(point.y-pos.getY(i))**2+(point.z-pos.getZ(i))**2;if(d<distance){distance=d;nearest=i;}}
    return this.bindings[nearest];
  }
}
let contact:THREE.CanvasTexture;
function contactTexture(){
  if(contact)return contact;const canvas=document.createElement('canvas');canvas.width=canvas.height=128;
  const c=canvas.getContext('2d')!;const g=c.createRadialGradient(64,64,15,64,64,63);g.addColorStop(0,'rgba(35,24,10,.8)');g.addColorStop(.58,'rgba(35,24,10,.4)');g.addColorStop(1,'rgba(35,24,10,0)');c.fillStyle=g;c.fillRect(0,0,128,128);contact=new THREE.CanvasTexture(canvas);return contact;
}
function seeded(s:number){return ()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
