import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Group,Object3D} from 'three';
import {Bobblehead} from '../src/bobblehead.ts';

test('Dwight bobbles only at the neck and settles after repeated clicks',()=>{
  const dwight=new Bobblehead(),model=new Group(),head=new Object3D();
  head.name='DwightHeadPivot';head.position.y=1.12;model.add(head);dwight.setModel(model);
  const base=dwight.group.position.clone(),neck=head.position.clone();
  for(let i=0;i<20;i++){dwight.poke(i%2?1:-1);dwight.step(1/30);}
  assert.ok(dwight.maxAngle>.05);assert.ok(dwight.maxAngle<=.350001);
  assert.deepEqual(dwight.group.position,base);assert.deepEqual(head.position,neck);
  for(let i=0;i<8*60;i++)dwight.step(1/60);
  assert.ok(Math.hypot(...dwight.stats().angle)<.0001,'The head returns to rest without moving its base');
  dwight.poke();dwight.step(.03);dwight.reset();
  assert.deepEqual(dwight.stats().angle,[0,0]);assert.equal(dwight.pokes,0);
});
