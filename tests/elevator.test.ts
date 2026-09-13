import test from 'node:test';import assert from 'node:assert/strict';
import {Elevator} from '../src/elevator';
function run(l:Elevator,seconds:number,beam=false){for(let t=0;t<seconds;t+=1/120)l.step(1/120,beam);}
test('Calling, boarding, descending and returning uses closed-door travel',()=>{
 const l=new Elevator();l.request(1);run(l,1.5);assert.equal(l.phase,'open');assert.equal(l.door,1);
 l.request(0);run(l,1);assert.equal(l.floor,1);assert.equal(l.level,1);assert.ok(l.door>0);
 run(l,1);assert.equal(l.phase,'travelling');assert.equal(l.door,0);assert.ok(l.level<1&&l.level>0);
 assert.equal(l.request(1),false);run(l,6);assert.equal(l.floor,0);assert.equal(l.phase,'open');
 l.request(1);run(l,8);assert.equal(l.floor,1);assert.equal(l.phase,'open');assert.equal(l.trips,2);
});
test('Doorway obstruction reopens doors and prevents departure',()=>{
 const l=new Elevator();l.request(1);run(l,2);l.request(0);run(l,.8);const gap=l.door;
 run(l,.2,true);assert.equal(l.level,1);assert.ok(l.door>gap);run(l,20,true);assert.equal(l.door,1);assert.equal(l.floor,1);
 run(l,16,false);assert.equal(l.floor,0);
});
test('Unattended cabin can be called back from the other floor',()=>{
 const l=new Elevator();l.request(0);run(l,17);assert.equal(l.floor,0);assert.equal(l.phase,'closed');
 l.request(1);run(l,7);assert.equal(l.floor,1);assert.equal(l.phase,'open');
});
test('A long frame cannot skip a blocked door or overshoot either landing',()=>{
 const l=new Elevator();l.request(0);for(let i=0;i<20;i++)l.step(10,true);assert.equal(l.level,1);
 for(let i=0;i<20;i++)l.step(10,false);assert.equal(l.level,0);assert.ok(l.door>=0&&l.door<=1);
});
