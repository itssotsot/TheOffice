import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion,Vector3} from 'three';
import {DeskMotion,OFFICE_FLOOR,resolveContacts} from '../src/motion.ts';
import {ITEMS} from '../src/content.ts';
import {SoftBody,type Vec3} from '../src/physics.ts';
const dt=1/120;
function toss(speed:number,grip:Vec3=[0,1.3,0]){
  const b=new DeskMotion(0,0,[2.4,1.3,2.2]);
  // Start toward the desk edge at full lift height so all prop proportions can tumble onto the floor.
  b.lift([0,3,0],0);b.move([speed*.04,3,0],.04);b.release(false,.04,grip);return b;
}

test('Faster flicks tumble faster, and off-center grips determine the spin axis',()=>{
  const slow=toss(3),fast=toss(15),left=toss(-15);
  assert.ok(fast.lastThrowSpin>slow.lastThrowSpin*4);
  assert.ok(fast.angularVelocity[2]<-5);assert.ok(left.angularVelocity[2]>5);
  assert.ok(toss(15,[0,.65,.8]).angularVelocity[1]>5,'A side grip twists about the vertical axis');
  assert.ok(toss(15,[0,.65,-.8]).angularVelocity[1]<-5);
  assert.equal(toss(15,[0,.65,0]).lastThrowSpin,0,'A throw through the center does not invent torque');
});

test('Airborne spin persists and rotates around a falling center of mass',()=>{
  const b=toss(15),start=b.center,orientation=b.orientation.clone(),spin=b.lastThrowSpin;
  let expectedY=start.y,vy=b.velocity[1];
  for(let n=0;n<30;n++){vy-=12*dt;expectedY+=vy*dt;b.step(dt);}
  assert.ok(b.orientation.angleTo(orientation)>1.2,'Visible tumbling in the first quarter second');
  assert.ok(Math.abs(b.center.y-expectedY)<1e-10,'Rotation cannot change the ballistic center trajectory');
  assert.ok(Math.hypot(...b.angularVelocity)>spin*.96,'Air resistance only gently reduces spin');
  assert.ok(Math.abs(b.orientation.length()-1)<1e-12);
});

test('Regrabbing a rotating mold preserves its orientation and exact target; reset clears spin',()=>{
  const b=toss(15);for(let n=0;n<20;n++)b.step(dt);
  const orientation=b.orientation.clone();b.lift([1,2,1],1);
  for(let n=0;n<20;n++){b.step(dt);resolveContacts([b,new DeskMotion(1,1,[2,1,2])]);}
  assert.deepEqual(b.position,[1,2,1]);assert.ok(b.orientation.angleTo(orientation)<1e-7);assert.deepEqual(b.angularVelocity,[0,0,0]);
  b.move([2,2,1],1.05);b.release(true,1.05);assert.equal(b.lastThrowSpin,0);
  b.reset();assert.deepEqual(b.position,[0,0,0]);assert.deepEqual(b.angularVelocity,[0,0,0]);assert.ok(b.orientation.angleTo(new Quaternion())<1e-7);assert.equal(b.rotationTravel,0);
});

test('An upside-down jello lands on its actual rotated top and stays inverted',()=>{
  const b=new DeskMotion(0,0,[2,1.3,2]);b.orientation.setFromAxisAngle(new Vector3(1,0,0),Math.PI);b.position[1]=3;
  for(let n=0;n<480;n++){b.step(dt);assert.ok(b.bottom>=-1e-8);}
  assert.ok(Math.abs(b.bottom)<.002);assert.ok(Math.abs(b.position[1]-1.3)<.002);
  assert.ok(new Vector3(0,1,0).applyQuaternion(b.orientation).y<-.99,'Landing does not snap upright');
});

test('A resting jello wakes and rotates when another hits it off-center',()=>{
  const resting=new DeskMotion(0,0,[2,1.3,2]);for(let n=0;n<120;n++)resting.step(dt);
  assert.equal(resting.stats().sleeping,true);
  const incoming=new DeskMotion(-3,.7,[2,1.3,2]);incoming.position[1]=.3;incoming.velocity[0]=8;
  for(let n=0;n<30;n++){incoming.step(dt);resting.step(dt);resolveContacts([incoming,resting]);}
  assert.equal(resting.stats().sleeping,false);assert.ok(resting.center.x>.05);
  assert.ok(resting.rotationTravel>.02,'Off-center contact transfers angular motion');
});

for(const spec of ITEMS)test(`${spec.id}: a spinning throw lands without clipping and settles with intact gel`,()=>{
  const b=new DeskMotion(0,0,spec.size,spec.rotation,spec.shape),[width,height,depth]=spec.size;
  const gel=new SoftBody({width,height,depth,shape:spec.shape,firmness:spec.firmness});
  b.onImpact=(speed,direction)=>{
    const local=new Vector3(...direction).applyQuaternion(b.orientation.clone().invert());
    if(local.y<-.75)gel.landing(speed);else gel.kick(local.multiplyScalar(speed*.4).toArray() as Vec3);
  };
  // Start toward the desk edge at full lift height so all prop proportions can tumble onto the floor.
  b.lift([2,3,0],0);b.move([2.65,3,-.15],.05);b.release(false,.05,[.35,height,.15]);
  const initial=b.orientation.clone();let peakTilt=0;
  for(let n=0;n<1440;n++){
    b.step(dt);gel.step(dt);peakTilt=Math.max(peakTilt,initial.angleTo(b.orientation));
    assert.ok(b.bottom>=b.supportHeight()-1e-8,`Rotated hull above support at step ${n}`);
    assert.ok(Math.abs(b.orientation.length()-1)<1e-10);assert.equal(gel.stats().inverted,0);
  }
  assert.ok(peakTilt>Math.PI/2,'Mold rolls beyond an upright lean');assert.ok(b.impacts>0);
  assert.ok(Math.abs(b.bottom-OFFICE_FLOOR)<.003,'Hard toss leaves desk and rests on floor');
  assert.ok(Math.hypot(...b.velocity)<.08,`Linear speed ${Math.hypot(...b.velocity)}`);
  assert.ok(Math.hypot(...b.angularVelocity)<.08,`Angular speed ${Math.hypot(...b.angularVelocity)}`);
  assert.ok(gel.stats().finite);assert.ok(Math.abs(gel.stats().volumeRatio-1)<.08);assert.ok(gel.energy<.12);
});
