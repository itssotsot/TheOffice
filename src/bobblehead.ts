import * as THREE from 'three';

/** A separate rigid head on a damped neck spring. The display base stays on the desk. */
export class Bobblehead {
  readonly group=new THREE.Group();
  readonly hitMeshes:THREE.Mesh[]=[];
  private head?:THREE.Object3D;
  private angle=new THREE.Vector2();
  private velocity=new THREE.Vector2();
  pokes=0;
  maxAngle=0;
  constructor(){this.group.position.set(-2.75,.015,-2.65);this.group.rotation.y=.08;}
  setModel(model:THREE.Object3D){
    this.group.add(model);
    model.traverse(o=>{
      if(o.name.startsWith('DwightHeadPivot'))this.head=o;
      if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;o.userData.bobblehead=true;this.hitMeshes.push(o);}
    });
    if(!this.head)throw new Error('Dwight bobblehead is missing its head pivot');
  }
  poke(side=1,strength=1){this.velocity.x+=1.8*strength;this.velocity.y+=Math.sign(side||1)*1.25*strength;this.pokes++;}
  step(dt:number){
    if(!this.head)return;
    // Small bounded substeps keep a quick series of clicks stable.
    const steps=Math.ceil(dt/(1/120)),h=dt/Math.max(1,steps);
    for(let i=0;i<steps;i++){
      this.velocity.addScaledVector(this.angle,-62*h).multiplyScalar(Math.exp(-3.4*h));
      this.angle.addScaledVector(this.velocity,h);
      if(this.angle.length()>.35){this.angle.setLength(.35);this.velocity.multiplyScalar(.65);}
    }
    this.head.rotation.x=this.angle.x;
    this.head.rotation.z=this.angle.y;
    this.maxAngle=Math.max(this.maxAngle,this.angle.length());
  }
  reset(){this.angle.set(0,0);this.velocity.set(0,0);this.pokes=0;this.maxAngle=0;if(this.head)this.head.rotation.set(0,0,0);}
  stats(){return {loaded:!!this.head,pokes:this.pokes,angle:this.angle.toArray(),maxAngle:this.maxAngle};}
}
