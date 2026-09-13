import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Matrix4,Quaternion,Vector3,Box3} from 'three';
import {isWalkable,walkStep,overlaps, type OfficeNavigation} from '../src/navigation';
const nav=JSON.parse(fs.readFileSync(new URL('../public/assets/blender/scranton-navigation.json',import.meta.url),'utf8')) as OfficeNavigation;

test('every named destination and the desk return point have standing clearance',()=>{
  for(const spot of [...nav.landmarks,{id:'desk return',...nav.deskReturn}])assert.ok(isWalkable(spot.position[0],spot.position[2],nav),spot.id);
});
test('the entire office is connected through traversable doorways',()=>{
  const cell=nav.unitsPerMeter*.10,r=nav.playerRadius,b=nav.bounds;
  const width=Math.ceil((b.maxX-b.minX)/cell),height=Math.ceil((b.maxZ-b.minZ)/cell);
  const coords=(x:number,z:number)=>[Math.round((x-b.minX)/cell),Math.round((z-b.minZ)/cell)];
  const start=nav.landmarks.find(l=>l.id==='reception')!.position;
  const queue=[coords(start[0],start[2])],seen=new Set<number>();
  for(let i=0;i<queue.length;i++){
    const [cx,cz]=queue[i],key=cz*width+cx;if(seen.has(key))continue;
    if(cx<0||cz<0||cx>=width||cz>=height||!isWalkable(b.minX+cx*cell,b.minZ+cz*cell,nav))continue;
    seen.add(key);
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])queue.push([cx+dx,cz+dz]);
  }
  const missing:string[]=[];
  for(const spot of [...nav.landmarks,{id:'jelly desk',...nav.deskReturn}]){
    const [cx,cz]=coords(spot.position[0],spot.position[2]);let reached=false;
    for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++)if(seen.has((cz+dz)*width+cx+dx))reached=true;
    if(!reached)missing.push(spot.id);
  }
  assert.deepEqual(missing,[],`All rooms must connect to reception with radius ${r}`);
});
test('a fast movement cannot tunnel through the exterior wall',()=>{
  const start=nav.landmarks.find(l=>l.id==='michael')!.position;
  const p=walkStep(start[0],start[2],0,-nav.unitsPerMeter*20,nav);
  assert.ok(isWalkable(p.x,p.z,nav));assert.ok(p.z>nav.bounds.minZ+nav.playerRadius);
});
test('diagonal movement slides along a wall without penetrating it',()=>{
  const fixture={...nav,bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},colliders:[{minX:4,maxX:5,minZ:-80,maxZ:80}],playerRadius:1};
  const next=walkStep(0,0,10,8,fixture);
  assert.ok(next.x<=3.001);assert.ok(next.z>7.9);assert.ok(!overlaps(next.x,next.z,1,fixture.colliders[0]));
});

test('the rotated jelly workstation and its walking obstacle share the same footprint',()=>{
  const data=fs.readFileSync(new URL('../public/assets/blender/desk.glb',import.meta.url));
  const gltf=JSON.parse(data.subarray(20,20+data.readUInt32LE(12)).toString());
  const placement=nav.workstation!,scale=placement.scale??1;
  const parent=new Matrix4().compose(new Vector3(...placement.position),new Quaternion().setFromAxisAngle(new Vector3(0,1,0),placement.rotation),new Vector3(scale,scale,scale));
  const bounds=new Box3();
  function visit(index:number,parentMatrix:Matrix4){
    const node=gltf.nodes[index];
    const local=node.matrix?new Matrix4().fromArray(node.matrix):new Matrix4().compose(new Vector3(...(node.translation??[0,0,0])),new Quaternion(...(node.rotation??[0,0,0,1])),new Vector3(...(node.scale??[1,1,1])));
    const world=parentMatrix.clone().multiply(local);
    if(node.mesh!==undefined)for(const primitive of gltf.meshes[node.mesh].primitives){
      const accessor=gltf.accessors[primitive.attributes.POSITION];
      for(const x of [accessor.min[0],accessor.max[0]])for(const y of [accessor.min[1],accessor.max[1]])for(const z of [accessor.min[2],accessor.max[2]])bounds.expandByPoint(new Vector3(x,y,z).applyMatrix4(world));
    }
    for(const child of node.children??[])visit(child,world);
  }
  for(const node of gltf.scenes[gltf.scene??0].nodes)visit(node,parent);
  const obstacle=nav.colliders.find(c=>c.name==='Dwight jelly desk')!;
  assert.ok(obstacle,'The playable desk must block walking');
  for(const [key,value] of Object.entries({minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z}))assert.ok(Math.abs(obstacle[key as 'minX']-value)<.003,`${key} matches the actual exported desk, including parent scale and rotation`);
});
