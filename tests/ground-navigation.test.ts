import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {isWalkable,walkStep,type OfficeNavigation} from '../src/navigation';
const nav=JSON.parse(readFileSync(new URL('../public/assets/blender/ground-navigation.json',import.meta.url),'utf8')) as OfficeNavigation;
test('The ground-floor lift, lobby and parking are connected at normal walking width',()=>{
 const checkpoints=[[-10.285,5.28],[-10.285,7.3],[-10.285,10.1],[-10.285,12.6],[-10.285,14.9],[-10.285,23],[-10.285,25],[.3,25]];
 let p={x:checkpoints[0][0]*7.2,z:-checkpoints[0][1]*7.2};
 for(const [x,y] of checkpoints.slice(1)){const target={x:x*7.2,z:-y*7.2};p=walkStep(p.x,p.z,target.x-p.x,target.z-p.z,nav);assert.ok(Math.hypot(p.x-target.x,p.z-target.z)<.01,`Blocked at ${x},${y}`);}
 for(const mark of nav.landmarks)assert.ok(isWalkable(mark.position[0],mark.position[2],nav),mark.name);
});
test('Cars and solid storefront glazing remain collision boundaries',()=>{
 assert.equal(isWalkable(-6.3*7.2,-18*7.2,nav),false);
 assert.equal(isWalkable((-10.285+1.35)*7.2,-13.6*7.2,nav),false);
 assert.equal(isWalkable(-10.285*7.2,-13.6*7.2,nav),true);
});
