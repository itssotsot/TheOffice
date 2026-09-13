import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {Building} from '../src/building';
import type {OfficeExplorer} from '../src/explorer';
import type {JellyAudio} from '../src/audio';
import type {OfficeNavigation} from '../src/navigation';

const S=7.2,UP=-5.34,DROP=3.35*S;
function fixture(t:TestContext){
  const context={beginPath(){},arc(){},fill(){},stroke(){},fillRect(){},fillText(){}};
  const globals={document:{createElement:()=>({getContext:()=>context})},location:new URL('http://localhost/?visit=lobby')};
  for(const [key,value] of Object.entries(globals)){
    const previous=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    t.after(()=>{if(previous)Object.defineProperty(globalThis,key,previous);else Reflect.deleteProperty(globalThis,key);});
  }
  const navs=['ground-navigation.json','scranton-navigation.json'].map(file=>JSON.parse(readFileSync(new URL('../public/assets/blender/'+file,import.meta.url),'utf8'))) as [OfficeNavigation,OfficeNavigation];
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  camera.position.set(-10.285*S,UP+navs[1].eyeHeight,-5.28*S);
  const office=new THREE.Group(),ground=new THREE.Group(),workstation=new THREE.Group(),asset=new THREE.Group();
  const floor=new THREE.Object3D();floor.name='Cabin floor';floor.position.y=UP;asset.add(floor);
  scene.add(office,ground,workstation);
  // Keep the rendering/navigation integration real; only browser drawing and audio are stubbed.
  const explorer={nav:navs[1],floorHeight:undefined as number|undefined,setNavigation(nav:OfficeNavigation){this.nav=nav;}};
  const building=new Building(scene,camera,explorer as unknown as OfficeExplorer,office,workstation,ground,asset,navs,{liftChime(){}} as unknown as JellyAudio);
  const tick=()=>{building.step(1/60);scene.updateMatrixWorld(true);};
  const cabin=floor.parent!;
  const landings=scene.children.filter(o=>o!==office&&o!==ground&&o!==workstation&&o!==cabin);
  return {building,scene,camera,office,ground,workstation,explorer,floor,cabin,landings,tick};
}

test('occupied rides exclude stationary floor slabs and preserve eye height, down and up',t=>{
  const f=fixture(t),{building,office,ground,workstation,camera,explorer,floor,cabin,landings,tick}=f;
  for(const destination of [0,1] as const){
    building.lift.request(destination);let travellingFrames=0;
    for(let i=0;i<510;i++){
      tick();
      if(building.lift.phase==='travelling'){
        travellingFrames++;
        assert.equal(building.stats().riding,true);
        assert.equal(office.visible,false,'Upstairs floor must not pass through a descending passenger');
        assert.equal(ground.visible,false,'Ground floor/ceiling must not pass through an ascending passenger');
        assert.equal(workstation.visible,false);assert.ok(landings.every(l=>!l.visible));
        assert.equal(cabin.visible,true);assert.equal(building.lift.door,0);
        assert.ok(Math.abs(camera.position.y-floor.getWorldPosition(new THREE.Vector3()).y-explorer.nav.eyeHeight)<1e-9);
      }else if(building.lift.floor===destination){
        assert.equal(office.visible,destination===1);assert.equal(workstation.visible,destination===1);
        assert.equal(ground.visible,destination===0,'Destination is restored before the doors open');
        assert.equal(landings[destination].visible,true);assert.equal(landings[1-destination].visible,false);
        assert.equal(explorer.floorHeight,undefined);
      }
    }
    assert.ok(travellingFrames>200);assert.equal(building.lift.floor,destination);
    assert.ok(Math.abs(camera.position.y-(UP-(1-destination)*DROP+explorer.nav.eyeHeight))<1e-9);
  }
  assert.equal(building.lift.trips,2);
});

test('an unattended lift never hides or moves the room the player is standing in',t=>{
  const {building,camera,office,ground,workstation,landings,explorer,tick}=fixture(t);
  camera.position.set(-10.7*S,UP+explorer.nav.eyeHeight,-7.05*S);
  const position=camera.position.clone(),nav=explorer.nav;
  for(const destination of [0,1] as const){
    building.lift.request(destination);
    for(let i=0;i<510;i++){
      tick();assert.equal(building.stats().riding,false);
      assert.equal(office.visible,true);assert.equal(workstation.visible,true);assert.equal(ground.visible,false);
      assert.equal(landings[1].visible,true);assert.equal(landings[0].visible,false);
      assert.ok(camera.position.equals(position));assert.equal(explorer.nav,nav);
    }
  }
  assert.equal(building.lift.trips,2);
});

test('a blocked cabin threshold keeps the landing visible and prevents departure',t=>{
  const {building,camera,office,landings,tick}=fixture(t);
  building.lift.open();for(let i=0;i<90;i++)tick();
  camera.position.z=-6.17*S;building.lift.request(0);
  for(let i=0;i<720;i++){
    tick();assert.equal(building.stats().riding,false);assert.equal(building.lift.level,1);
    assert.equal(office.visible,true);assert.equal(landings[1].visible,true);
  }
});
