import {test} from 'node:test';
import assert from 'node:assert/strict';
import {GestureVelocity} from '../src/gesture.ts';

test('One quick mouse movement provides the correct release direction',()=>{
  const gesture=new GestureVelocity();gesture.reset([0,1.4,0],0);gesture.add([.4,1.4,-.2],.02);
  const velocity=gesture.velocity(.02);
  assert.ok(velocity[0]>0&&velocity[2]<0);assert.ok(Math.abs(velocity[0]/velocity[2]+2)<1e-8);
});

test('Release speed is consistent across different pointer polling rates',()=>{
  const read=(hz:number)=>{const gesture=new GestureVelocity();gesture.reset([0,1,0],0);for(let n=1;n<=hz*.2;n++)gesture.add([n/hz*8,1,n/hz*3],n/hz);return gesture.velocity(.2);};
  const slow=read(60),fast=read(240);
  assert.ok(Math.abs(slow[0]-fast[0])<.1);assert.ok(Math.abs(slow[2]-fast[2])<.1);
});

test('The brief pause while raising the mouse button preserves flick momentum',()=>{
  const gesture=new GestureVelocity();gesture.reset([0,1.4,0],0);
  gesture.add([.2,1.4,0],.01);gesture.add([.4,1.4,0],.02);
  gesture.add([.4,1.4,0],.09); // Button-up has the same coordinates, 70 ms later.
  assert.ok(gesture.releaseVelocity(.09)[0]>15);
  assert.deepEqual(gesture.releaseVelocity(.40),[0,0,0]);
});
