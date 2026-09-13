import { Quaternion, Vector3 } from 'three';
import { mold, type JellyShape, type Vec3 } from './physics';
import { GestureVelocity } from './gesture';

const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));
export const DESK_HALF_WIDTH=7.08;
export const DESK_HALF_DEPTH=4.08;
export const MAX_LIFT=3.1;
export const OFFICE_FLOOR=-5.385;
const THROW_STRENGTH=.8;

/** Whole-mold motion, separate from its deformable interior. Units match the desk. */
export class DeskMotion {
  floorY=OFFICE_FLOOR;
  deskHalfDepth=DESK_HALF_DEPTH;
  position:Vec3;
  velocity:Vec3=[0,0,0];
  acceleration:Vec3=[0,0,0];
  target:Vec3|null=null;
  lifts=0;
  impacts=0;
  maxAltitude=0;
  maxSpeed=0;
  lastThrowSpeed=0;
  readonly orientation=new Quaternion();
  angularVelocity:Vec3=[0,0,0];
  lastThrowSpin=0;
  rotationTravel=0;
  maxSpin=0;
  private hull:Vector3[]=[];
  private inverseInertia:Vector3;
  private quietTime=0;
  private sleeping=false;
  private home:Vec3;
  private gesture=new GestureVelocity();
  private elapsed=0;
  private lastInputTime=0;
  private sinceInput=0;
  private drivenVelocity:Vec3=[0,0,0];
  private pendingImpulse:Vec3=[0,0,0];
  onImpact:((speed:number,direction:Vec3)=>void)|null=null;
  constructor(x:number,z:number,readonly size:Vec3,readonly rotation=0,shape?:JellyShape){
    this.home=[x,0,z];this.position=[...this.home];
    this.orientation.setFromAxisAngle(new Vector3(0,1,0),rotation);
    const [w,h,d]=size;
    // Unit-mass box inertia; the contact hull follows the individual mold profile.
    this.inverseInertia=new Vector3(12/(h*h+d*d),12/(w*w+d*d),12/(w*w+h*h));
    if(shape){
      for(const v of [0,.15,.35,.6,.85,1])for(let edge=0;edge<4;edge++)for(let i=0;i<12;i++){
        const t=i/6-1,[u,w]=edge===0?[t,-1]:edge===1?[1,t]:edge===2?[-t,1]:[-1,-t];
        const p=mold(u,v,w,{width:size[0],height:h,depth:d,shape,firmness:1});
        this.hull.push(new Vector3(p[0],p[1]-h/2,p[2]));
      }
    }else{
      for(const x of [-w*.48,w*.48])for(const y of [-h/2,h/2])for(const z of [-d*.48,d*.48])this.hull.push(new Vector3(x,y,z));
    }
  }
  get held(){return this.target!==null;}
  /** The render origin remains the local base. Free flight is integrated about the center. */
  get center(){return new Vector3(0,this.size[1]/2,0).applyQuaternion(this.orientation).add(new Vector3(...this.position));}
  private setCenter(center:Vector3){this.position=center.sub(new Vector3(0,this.size[1]/2,0).applyQuaternion(this.orientation)).toArray() as Vec3;}
  private extent(direction:Vector3){
    const local=direction.clone().applyQuaternion(this.orientation.clone().invert());
    let extent=-Infinity;for(const p of this.hull)extent=Math.max(extent,p.dot(local));return extent;
  }
  get bottom(){return this.center.y-this.extent(new Vector3(0,-1,0));}
  get top(){return this.center.y+this.extent(new Vector3(0,1,0));}
  radius(nx:number,nz:number){
    return this.extent(new Vector3(nx,0,nz));
  }
  /** Average a small contact patch instead of arbitrarily choosing one face corner. */
  contactPoint(direction:Vector3){
    const local=direction.clone().applyQuaternion(this.orientation.clone().invert());
    const limit=this.extent(direction)-.025,patch=new Vector3();let count=0;
    for(const p of this.hull)if(p.dot(local)>=limit){patch.add(p);count++;}
    return patch.multiplyScalar(1/count).applyQuaternion(this.orientation).add(this.center);
  }
  private inertiaImpulse(torque:Vector3){
    return torque.applyQuaternion(this.orientation.clone().invert()).multiply(this.inverseInertia).applyQuaternion(this.orientation);
  }
  contactVelocity(point:Vector3){return new Vector3(...this.angularVelocity).cross(point.clone().sub(this.center)).add(new Vector3(...this.velocity));}
  impulseMass(point:Vector3,normal:Vector3){
    const r=point.clone().sub(this.center);
    return 1+this.inertiaImpulse(r.clone().cross(normal)).cross(r).dot(normal);
  }
  applyImpulse(point:Vector3,impulse:Vector3){
    if(this.held)return;
    const torque=this.inertiaImpulse(point.clone().sub(this.center).cross(impulse));
    for(let a=0;a<3;a++){this.velocity[a]+=impulse.getComponent(a);this.angularVelocity[a]+=torque.getComponent(a);}
    this.limitSpin();this.sleeping=false;
  }
  private limitSpin(){
    const speed=Math.hypot(...this.angularVelocity);if(speed>18)for(let a=0;a<3;a++)this.angularVelocity[a]*=18/speed;
  }
  separate(offset:Vector3){
    if(this.held||offset.lengthSq()<1e-14)return;
    for(let a=0;a<3;a++)this.position[a]+=offset.getComponent(a);
    this.sleeping=false;this.quietTime=0;
  }
  clampTarget(target:Vec3):Vec3 {
    // A held object follows the pointer even beyond the desk edge.
    return [target[0],clamp(target[1],.35,MAX_LIFT),target[2]];
  }
  lift(target:Vec3,time=this.elapsed){
    if(!this.held)this.lifts++;
    this.target=this.clampTarget(target);this.position=[...this.target];this.velocity.fill(0);
    this.angularVelocity.fill(0);this.sleeping=false;this.quietTime=0;
    this.gesture.reset(this.target,time);this.lastInputTime=time;this.sinceInput=0;
    this.drivenVelocity.fill(0);this.pendingImpulse.fill(0);
    this.maxAltitude=Math.max(this.maxAltitude,this.position[1]);
  }
  move(target:Vec3,time=this.elapsed){
    if(!this.held)return;this.target=this.clampTarget(target);this.position=[...this.target];
    this.gesture.add(this.target,time);this.lastInputTime=time;this.sinceInput=0;
    this.velocity=this.gesture.velocity(time);
    this.maxSpeed=Math.max(this.maxSpeed,Math.hypot(...this.velocity));
  }
  release(cancel=false,time=this.elapsed,grip:Vec3=[0,this.size[1],0]){
    // Soften the launch only; direct hand tracking and held wobble retain full input.
    this.velocity=cancel?[0,0,0]:this.gesture.releaseVelocity(time).map(v=>v*THROW_STRENGTH) as Vec3;
    // Throwing through an off-center grip supplies torque. A top grip gives a
    // forward tumble; a side grip also gives yaw. No torque is added in free fall.
    const lever=new Vector3(grip[0],grip[1]-this.size[1]/2,grip[2]).applyQuaternion(this.orientation);
    this.angularVelocity=this.inertiaImpulse(lever.cross(new Vector3(...this.velocity)).multiplyScalar(.9)).toArray() as Vec3;
    this.limitSpin();this.lastThrowSpin=Math.hypot(...this.angularVelocity);
    this.sleeping=false;this.quietTime=0;
    this.target=null;this.lastThrowSpeed=Math.hypot(...this.velocity);
  }
  deformationImpulse(_dt:number):Vec3 {
    const impulse=this.pendingImpulse;this.pendingImpulse=[0,0,0];return impulse;
  }
  impact(speed:number,direction:Vec3){if(speed>1.15){this.impacts++;this.onImpact?.(Math.min(speed,9),direction);}}
  step(dt:number){
    this.elapsed+=dt;
    if(this.target){
      this.sinceInput+=dt;
      this.velocity=this.gesture.velocity(this.lastInputTime+this.sinceInput);
      this.position=[...this.target];
      for(let a=0;a<3;a++){
        const change=this.velocity[a]-this.drivenVelocity[a];
        this.acceleration[a]=change/dt;
        // Strong directional inertia goes into the gel, never into cursor tracking.
        this.pendingImpulse[a]+=Math.max(-3.2,Math.min(3.2,-change*.65-this.velocity[a]*2.8*dt));
      }
      const impulseLength=Math.hypot(...this.pendingImpulse);
      if(impulseLength>3.8)for(let a=0;a<3;a++)this.pendingImpulse[a]*=3.8/impulseLength;
      this.drivenVelocity=[...this.velocity];
    }else if(!this.sleeping){
      const previousBottom=this.bottom,center=this.center;
      this.velocity[1]-=12*dt;
      const support=this.supportHeight(),grounded=previousBottom<=support+.025;
      const friction=grounded?6.5:.16;
      this.velocity[0]*=Math.exp(-friction*dt);this.velocity[2]*=Math.exp(-friction*dt);
      center.addScaledVector(new Vector3(...this.velocity),dt);
      // World-space angular velocity premultiplies orientation, about the center of mass.
      const spin=new Vector3(...this.angularVelocity),speed=spin.length();
      if(speed>1e-8){
        this.orientation.premultiply(new Quaternion().setFromAxisAngle(spin.multiplyScalar(1/speed),speed*dt)).normalize();
        this.rotationTravel+=speed*dt;
      }
      this.setCenter(center);this.constrain(previousBottom);
      const angularDamping=Math.exp(-(grounded?2.8:.12)*dt);
      for(let a=0;a<3;a++)this.angularVelocity[a]*=angularDamping;
      if(this.bottom<=this.supportHeight()+.005&&Math.hypot(...this.velocity)<.08&&Math.hypot(...this.angularVelocity)<.08){
        this.quietTime+=dt;
        if(this.quietTime>.45){this.sleeping=true;this.velocity.fill(0);this.angularVelocity.fill(0);}
      }else this.quietTime=0;
    }
    this.maxAltitude=Math.max(this.maxAltitude,this.position[1]);this.maxSpeed=Math.max(this.maxSpeed,Math.hypot(...this.velocity));
    this.maxSpin=Math.max(this.maxSpin,Math.hypot(...this.angularVelocity));
  }
  supportHeight(){
    const center=this.center;
    return Math.abs(center.x)<DESK_HALF_WIDTH&&Math.abs(center.z)<this.deskHalfDepth&&this.bottom>=-.04?0:this.floorY;
  }
  constrain(previousBottom?:number){
    if(this.held)return;
    const center=this.center,bottom=this.bottom;
    const overDesk=Math.abs(center.x)<DESK_HALF_WIDTH&&Math.abs(center.z)<this.deskHalfDepth;
    const support=overDesk&&(bottom>=-.04||(previousBottom!==undefined&&previousBottom>=-.04))?0:this.floorY;
    if(bottom<=support+.002){
      this.position[1]+=Math.max(0,support-bottom);
      const point=this.contactPoint(new Vector3(0,-1,0)),normal=new Vector3(0,1,0);
      const speed=-this.contactVelocity(point).y;
      if(speed>0){
        const impulse=speed*(speed>1.4?1.28:1)/this.impulseMass(point,normal);
        this.applyImpulse(point,normal.multiplyScalar(impulse));
        const tangent=this.contactVelocity(point);tangent.y=0;const slip=tangent.length();
        if(slip>1e-6){
          tangent.multiplyScalar(-1/slip);
          this.applyImpulse(point,tangent.multiplyScalar(Math.min(slip/this.impulseMass(point,tangent),impulse*.65)));
        }
        this.impact(speed,[0,-1,0]);
      }
    }
  }
  reset(){this.position=[...this.home];this.velocity.fill(0);this.acceleration.fill(0);this.target=null;this.lifts=0;this.impacts=0;this.maxAltitude=0;this.maxSpeed=0;this.lastThrowSpeed=0;this.drivenVelocity.fill(0);this.pendingImpulse.fill(0);this.sinceInput=0;this.orientation.setFromAxisAngle(new Vector3(0,1,0),this.rotation);this.angularVelocity.fill(0);this.lastThrowSpin=0;this.rotationTravel=0;this.maxSpin=0;this.sleeping=false;this.quietTime=0;}
  stats(){return {position:[...this.position],velocity:[...this.velocity],orientation:this.orientation.toArray(),angularVelocity:[...this.angularVelocity],lastThrowSpin:this.lastThrowSpin,rotationTravel:this.rotationTravel,maxSpin:this.maxSpin,bottom:this.bottom,top:this.top,sleeping:this.sleeping,held:this.held,lifts:this.lifts,impacts:this.impacts,maxAltitude:this.maxAltitude,maxSpeed:this.maxSpeed,lastThrowSpeed:this.lastThrowSpeed};}
}

/** Orientation-aware mold bounds keep neighboring jellos apart and permit stacking. */
export function resolveContacts(bodies:DeskMotion[]){
  for(let iteration=0;iteration<4;iteration++){
    for(let i=0;i<bodies.length;i++)for(let j=i+1;j<bodies.length;j++){
      const a=bodies[i],b=bodies[j];
      const vertical=Math.min(a.top,b.top)-Math.max(a.bottom,b.bottom);if(vertical<=0)continue;
      const ca=a.center,cb=b.center,dx=cb.x-ca.x,dz=cb.z-ca.z;
      const distance=Math.hypot(dx,dz),nx=distance>1e-6?dx/distance:1,nz=distance>1e-6?dz/distance:0;
      const overlap=a.radius(nx,nz)+b.radius(-nx,-nz)-distance;if(overlap<=0)continue;
      let normal:Vec3,depth:number;
      if(vertical<overlap){normal=[0,cb.y>ca.y?1:-1,0];depth=vertical;}
      else {normal=[nx,0,nz];depth=overlap;}
      let wa=a.held?0:1,wb=b.held?0:1;
      // A lower item resting on the desk is a stable support for a stacked item.
      if(normal[1]>0&&a.bottom<=a.supportHeight()+.005)wa=0;
      if(normal[1]<0&&b.bottom<=b.supportHeight()+.005)wb=0;
      const total=wa+wb;if(total===0)continue;
      a.separate(new Vector3(...normal).multiplyScalar(-depth*wa/total));
      b.separate(new Vector3(...normal).multiplyScalar(depth*wb/total));
      const n=new Vector3(...normal),point=a.contactPoint(n).add(b.contactPoint(n.clone().negate())).multiplyScalar(.5);
      const relative=b.contactVelocity(point).sub(a.contactVelocity(point)).dot(n);
      if(relative<0){
        const mass=wa*a.impulseMass(point,n)+wb*b.impulseMass(point,n);
        const impulse=-(1+(relative<-1.4?.16:0))*relative/mass;
        if(wa)a.applyImpulse(point,n.clone().multiplyScalar(-impulse));
        if(wb)b.applyImpulse(point,n.clone().multiplyScalar(impulse));
        if(iteration===0){a.impact(-relative,normal.map(v=>-v) as Vec3);b.impact(-relative,normal);}
        if(normal[1]!==0){for(const body of [a,b])if(!body.held){body.velocity[0]*=.95;body.velocity[2]*=.95;}}
      }
      a.constrain();b.constrain();
    }
  }
}
