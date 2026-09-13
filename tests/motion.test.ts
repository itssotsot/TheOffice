import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DeskMotion,resolveContacts,DESK_HALF_WIDTH,OFFICE_FLOOR} from '../src/motion.ts';
import {SoftBody,type Vec3} from '../src/physics.ts';
import {ITEMS} from '../src/content.ts';
const dt=1/120;
function advance(bodies:DeskMotion[],seconds:number){for(let i=0;i<seconds/dt;i++){bodies.forEach(b=>b.step(dt));resolveContacts(bodies);}}

test('A held jello lifts, follows the hand, and carries release momentum',()=>{
  const b=new DeskMotion(-2,0,[2,1.2,2]);
  b.lift([0,1.4,1]);advance([b],1);
  assert.ok(b.position[1]>1.3);assert.ok(Math.abs(b.position[0])<.03);assert.ok(b.held);
  for(let n=1;n<=12;n++){b.move([n*.15,1.4,1]);advance([b],dt);}
  assert.ok(b.velocity[0]>2);
  const {x,y}=b.center;b.release();advance([b],.08);
  assert.equal(b.held,false);assert.ok(b.center.x>x+.2,'Release preserves the throw');assert.ok(b.center.y<y,'Gravity pulls the center of mass down');
});

test('Drops bounce, then settle on the desk; reset restores original placement',()=>{
  const b=new DeskMotion(-2,1,[2,1.2,2]);b.position=[1,2.5,0];let landed=false,bounced=false;
  b.onImpact=()=>{landed=true;};
  for(let i=0;i<360;i++){b.step(dt);if(landed&&b.position[1]>.05&&b.velocity[1]>0)bounced=true;assert.ok(b.position[1]>=0);}
  assert.ok(landed);assert.ok(bounced);assert.equal(b.position[1],0);assert.ok(Math.hypot(...b.velocity)<.01);
  b.reset();assert.deepEqual(b.position,[-2,0,1]);assert.deepEqual(b.velocity,[0,0,0]);assert.equal(b.impacts,0);
});

test('Thrown jellos collide instead of passing through each other',()=>{
  const a=new DeskMotion(-1.6,0,[2,1.2,2]),b=new DeskMotion(1.6,0,[2,1.2,2]);
  a.position[1]=b.position[1]=.3;a.velocity[0]=6;b.velocity[0]=-6;
  advance([a,b],1.5);
  assert.ok(a.position[0]<b.position[0]);assert.ok(b.position[0]-a.position[0]>=1.91);assert.ok(a.impacts+b.impacts>0);
});

test('A dropped jello can rest on another, then be picked up again',()=>{
  const lower=new DeskMotion(0,0,[2.7,1.3,2.7]),upper=new DeskMotion(0,0,[2,1,2]);upper.position[1]=2.5;
  advance([lower,upper],4);
  assert.ok(Math.abs(upper.position[1]-1.3)<.015,`Resting altitude ${upper.position[1]}`);
  assert.equal(lower.position[1],0);assert.ok(Math.abs(upper.velocity[1])<.05);
  upper.lift([2,2.4,0]);advance([lower,upper],1);assert.ok(upper.position[0]>1.9);assert.ok(upper.position[1]>2.3);
});

test('A hard flick can leave the desk, land on the office floor, and be reset',()=>{
  const b=new DeskMotion(0,0,[2,1.3,2],.4);b.lift([0,1.4,0],0);
  for(let n=1;n<=5;n++)b.move([n*.25,1.4,0],n*.01);
  b.release(false,.05);assert.ok(b.velocity[0]>15);
  advance([b],6);
  assert.ok(b.position[0]>DESK_HALF_WIDTH,'No invisible desk-edge wall reverses the throw');
  assert.ok(Math.abs(b.bottom-OFFICE_FLOOR)<.002);assert.ok(Math.hypot(...b.velocity)<.08);
  b.reset();assert.deepEqual(b.position,[0,0,0]);
});

test('Held position follows each pointer target immediately and collisions cannot displace it',()=>{
  const held=new DeskMotion(0,0,[2,1.3,2]),other=new DeskMotion(1,0,[2,1.3,2]);
  held.lift([0,1.4,0],0);
  const target:Vec3=[1.5,.8,.4];held.move(target,.01);
  assert.deepEqual(held.position,target,'No spring or frame delay');
  advance([held,other],.2);assert.deepEqual(held.position,target,'The hand stays in control through contact');
});

test('A last-moment direction reversal determines the throw, not earlier travel',()=>{
  const b=new DeskMotion(0,0,[2,1.3,2]);b.lift([0,1.4,0],0);
  for(let i=1;i<=5;i++)b.move([i*.2,1.4,0],i*.01);
  for(let i=1;i<=5;i++)b.move([1-i*.3,1.4,-i*.1],.05+i*.01);
  b.release(false,.10);
  assert.ok(b.velocity[0]<-8&&b.velocity[2]<-3);
  const [x,,z]=b.position;advance([b],.03);assert.ok(b.position[0]<x&&b.position[2]<z);
});

test('Pausing before release drops the jello without stale throw momentum',()=>{
  const b=new DeskMotion(0,0,[2,1.3,2]);b.lift([0,1.4,0],0);b.move([1,1.4,0],.04);
  b.release(false,.45);assert.deepEqual(b.velocity,[0,0,0]);assert.deepEqual(b.angularVelocity,[0,0,0]);
  b.lift([1,1.4,0],.3);b.move([2,1.4,0],.34);b.release(true,.34);assert.deepEqual(b.velocity,[0,0,0]);
});

for(const spec of ITEMS)test(`${spec.id}: landing deforms the gel and recovers its volume`,()=>{
  const [width,height,depth]=spec.size;
  const body=new SoftBody({width,height,depth,shape:spec.shape,firmness:spec.firmness});
  const motion=new DeskMotion(...spec.position,spec.size,spec.rotation);let impacts=0,peakMotion=0;
  motion.onImpact=(speed,direction)=>{impacts++;if(Math.abs(direction[1])>.5)body.landing(speed);else body.kick(direction.map(v=>v*speed*.26) as Vec3);};
  motion.lift([spec.position[0]+1,2.5,spec.position[1]]);
  for(let n=0;n<120;n++){motion.step(dt);body.kick(motion.deformationImpulse(dt));body.step(dt);}
  motion.release();
  for(let n=0;n<720;n++){motion.step(dt);body.step(dt);if(impacts)peakMotion=Math.max(peakMotion,body.energy);assert.equal(body.stats().inverted,0);}
  assert.ok(impacts>0);assert.ok(peakMotion>.3,'Landing visibly jiggles the gel');assert.equal(body.stats().finite,true);assert.ok(Math.abs(body.stats().volumeRatio-1)<.08);assert.ok(body.energy<.12);assert.equal(motion.position[1],0);
});

test('The same hand movement performed faster produces stronger wobble and a faster throw',()=>{
  function gesture(duration:number){
    const m=new DeskMotion(0,0,[2.4,1.3,2.4]);
    const b=new SoftBody({width:2.4,height:1.3,depth:2.4,shape:'fluted',firmness:1});
    const step=()=>{m.step(dt);b.kick(m.deformationImpulse(dt));b.step(dt);};
    m.lift([0,1.4,0]);for(let n=0;n<240;n++)step();
    let peakEnergy=0;
    for(let n=1;n<=duration/dt;n++){m.move([2*n*dt/duration,1.4,0]);step();peakEnergy=Math.max(peakEnergy,b.energy);}
    m.release();return {energy:peakEnergy,speed:m.lastThrowSpeed};
  }
  const slow=gesture(1.5),fast=gesture(.25);
  assert.ok(fast.speed>slow.speed*2,`Throw speed: fast ${fast.speed}, slow ${slow.speed}`);
  assert.ok(fast.energy>slow.energy*2,`Gel motion: fast ${fast.energy}, slow ${slow.energy}`);
});

test('Rapid repeated direction changes remain stable even with soft gelatin',()=>{
  for(const spec of ITEMS){
    const [width,height,depth]=spec.size;
    const body=new SoftBody({width,height,depth,shape:spec.shape,firmness:spec.firmness*.45});
    const motion=new DeskMotion(0,0,spec.size);motion.lift([0,1.4,0]);
    let peak=0;
    for(let n=1;n<=240;n++){
      const t=n*dt;motion.move([2*Math.sin(t*18),1.4,1.5*Math.sin(t*23)]);motion.step(dt);
      body.kick(motion.deformationImpulse(dt));body.step(dt);peak=Math.max(peak,body.energy);
      assert.equal(body.stats().inverted,0,`${spec.id}: no inverted tetrahedra during shaking`);
    }
    assert.ok(peak>.5);motion.release(true);
    for(let n=0;n<600;n++)body.step(dt);
    assert.ok(body.stats().finite);assert.ok(body.energy<.12);assert.ok(Math.abs(body.stats().volumeRatio-1)<.08);
  }
});

test('The resized workstation drops thrown objects onto the actual office floor',()=>{
  const scale=.82,ground=-5.34,renderBase=.045;
  const b=new DeskMotion(0,0,[2,1.3,2]);
  b.floorY=ground/scale-renderBase;b.deskHalfDepth=3.68;
  b.lift([0,1.5,0],0);
  for(let i=1;i<=6;i++)b.move([i*.3,1.5,i*.15],i*.012);
  b.release(false,.072);
  assert.ok(b.lastThrowSpeed>8&&b.lastThrowSpin>1);
  advance([b],8);
  assert.ok(Math.abs((b.bottom+renderBase)*scale-ground)<.002,'Rendered contact reaches the world floor after parent scaling');
  assert.ok(b.rotationTravel>1,'The reduced-size station retains tumbling throws');
});

test('The shallower replacement desk has no invisible support beyond its edge',()=>{
  const b=new DeskMotion(0,0,[.5,.6,.5]);b.deskHalfDepth=3.68;b.floorY=-6.55;
  b.position=[0,.4,3.90];advance([b],5);
  assert.ok(Math.abs(b.bottom-b.floorY)<.002,'A drop beyond the new edge reaches the floor instead of floating at desk height');
});
