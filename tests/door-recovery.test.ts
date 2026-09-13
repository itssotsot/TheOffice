import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {advanceEntryDoors,entryDoorColliders} from '../src/entry-doors';
import {isWalkable,overlaps,recoverStandingPosition,walkStep,type OfficeNavigation} from '../src/navigation';
const ground=JSON.parse(readFileSync(new URL('../public/assets/blender/ground-navigation.json',import.meta.url),'utf8')) as OfficeNavigation;
const fixture=(open:number):OfficeNavigation=>({...ground,colliders:[...ground.colliders,...entryDoorColliders(open)]});
// Captured from the user's stuck live tab, beside the fully open right-hand leaf.
const stuck={x:-66.0875824461176,z:-105.11554035004902};
test('the reported parking entrance position is freed locally, even with no movement key',()=>{
 const nav=fixture(1);assert.equal(isWalkable(stuck.x,stuck.z,nav),false,'The actual reported position overlaps the swinging leaf');
 const recovered=walkStep(stuck.x,stuck.z,0,0,nav);assert.ok(isWalkable(recovered.x,recovered.z,nav));
 assert.ok(Math.hypot(recovered.x-stuck.x,recovered.z-stuck.z)<.20*7.2,'Recovery is a small separation, not a room reset');
 const next=walkStep(recovered.x,recovered.z,7.2,0,nav);assert.ok(next.x-recovered.x>.9*7.2,'Can walk away from the door');
 assert.deepEqual(walkStep(recovered.x,recovered.z,0,0,nav),recovered,'No jitter once separated');
});
test('a person standing outside in the opening arc stops both leaves before contact',()=>{
 const person={...stuck,radius:ground.playerRadius};let open=0;
 for(let i=0;i<240;i++){
  open=advanceEntryDoors(open,1,1/60,person);
  assert.equal(entryDoorColliders(open).some(c=>overlaps(person.x,person.z,person.radius,c)),false);
 }
 assert.ok(open>.2&&open<.99,'The door waits before swinging into the person');
 for(let i=0;i<240;i++)open=advanceEntryDoors(open,1,1/60,{x:-10.285*7.2,z:-12*7.2,radius:ground.playerRadius});
 assert.ok(open>.999,'Opening resumes once the arc is clear');
});
test('door safety checks the sweep on a long frame, not only the destination pose',()=>{
 const person={x:-9.80*7.2,z:-14.12*7.2,radius:ground.playerRadius};
 const open=advanceEntryDoors(0,1,2,person);
 assert.ok(open<.95);assert.equal(entryDoorColliders(open).some(c=>overlaps(person.x,person.z,person.radius,c)),false);
});
test('recovering at an intersecting corner clears both walls without crossing them',()=>{
 const nav={...ground,bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},playerRadius:1,colliders:[
  {minX:0,maxX:10,minZ:0,maxZ:1},{minX:0,maxX:1,minZ:0,maxZ:10}]};
 const p=recoverStandingPosition(1.6,1.6,nav);assert.ok(isWalkable(p.x,p.z,nav));assert.ok(p.x>=2&&p.z>=2);assert.ok(Math.hypot(p.x-1.6,p.z-1.6)<1);
});
test('normal doorway travel and wall collision behavior are unchanged',()=>{
 const nav=fixture(1),p={x:-10.285*7.2,z:-12*7.2};assert.deepEqual(recoverStandingPosition(p.x,p.z,nav),p);
 const through=walkStep(p.x,p.z,0,-5*7.2,nav);assert.ok(Math.abs(through.z+17*7.2)<.01);
 const intoWall=walkStep(-12.8*7.2,-9*7.2,-12*7.2,0,nav);assert.ok(intoWall.x>-13.9*7.2);assert.ok(isWalkable(intoWall.x,intoWall.z,nav));
});
