import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SoftBody } from '../src/physics.ts';
import { ITEMS } from '../src/content.ts';
const settle=(body:SoftBody,seconds:number)=>{for(let i=0;i<seconds*120;i++)body.step(1/120);};
for(const spec of ITEMS)test(`${spec.id}: volume, poke, stretch, recovery and reset`,()=>{
  const [width,height,depth]=spec.size;
  const body=new SoftBody({width,height,depth,shape:spec.shape,firmness:spec.firmness});
  settle(body,1.5);
  assert.equal(body.stats().finite,true);assert.ok(Math.abs(body.stats().volumeRatio-1)<.08);
  const before=body.positions.slice();body.poke([0,height,0],1.2);settle(body,.12);
  assert.ok(body.positions.some((v,i)=>Math.abs(v-before[i])>.025),'Poke visibly changes the solid');
  const binding=body.bind(.15,.90,.05),p=body.sample(binding);
  // Ramp a large pull, just as real pointer motion does, then let go.
  for(let frame=0;frame<90;frame++){
    const pull=Math.min(frame/60,1)*Math.min(width,depth)*.42;
    body.grab={binding,target:[p[0]+pull,p[1]+.20,p[2]+pull*.15]};body.step(1/120);
  }
  assert.equal(body.stats().finite,true);assert.equal(body.stats().inverted,0,'No inverted tetrahedra under a strong pull');
  assert.ok(body.sample(binding)[0]-p[0]>.3,'Dragging stretches the grab point');
  const stretched=body.stats().volumeRatio;assert.ok(Math.abs(stretched-1)<.2,`Volume under pull: ${stretched}`);
  body.grab=null;settle(body,4);const end=body.stats();
  assert.equal(end.finite,true);assert.ok(end.energy<.12,`Motion settles: ${end.energy}`);
  assert.ok(Math.abs(end.volumeRatio-1)<.08,`Volume recovers: ${end.volumeRatio}`);
  for(let i=1;i<body.positions.length;i+=3)assert.ok(body.positions[i]>=0,'Desk contact remains nonpenetrating');
  body.reset();assert.deepEqual(body.positions,body.rest);assert.equal(body.energy,0);
});
test('Firmness extremes remain stable during repeated clicks',()=>{
  for(const firmness of [.45,1.8]){
    const body=new SoftBody({width:2.4,height:1.1,depth:2,shape:'dome',firmness});
    for(let i=0;i<8;i++){body.poke([.1,1.05,.1],1.4);settle(body,.15);}
    settle(body,3);assert.equal(body.stats().finite,true);assert.equal(body.stats().inverted,0);assert.ok(body.stats().energy<.15);
  }
});

test('Every Blender prop is fully below the gelatin top with clearance',async()=>{
  const {readFile}=await import('node:fs/promises');
  const audit=JSON.parse(await readFile(new URL('../assets/blender/validation.json',import.meta.url),'utf8'));
  for(const spec of ITEMS){
    const asset=audit.reimported_exports.find((a:{id:string})=>a.id===spec.id);
    assert.ok(asset,`Reimported export evidence exists for ${spec.id}`);
    const [width,height,depth]=spec.size;
    // Reimported Blender coordinates are Z-up; the runtime glTF import is Y-up.
    const top=asset.bounds[2][1]*spec.scale+height*.24;
    const bottom=asset.bounds[2][0]*spec.scale+height*.24;
    assert.ok(top<height-.07,`${spec.id} top ${top} must be enclosed by mold height ${height}`);
    assert.ok(bottom>.07,`${spec.id} must have gelatin underneath`);
    assert.ok(Math.max(...asset.bounds[0].map(Math.abs))*spec.scale<width/2-.07);
    assert.ok(Math.max(...asset.bounds[1].map(Math.abs))*spec.scale<depth/2-.07);
  }
});
