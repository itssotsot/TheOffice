import test,{type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PerspectiveCamera,Vector3} from 'three';
import {OfficeExplorer} from '../src/explorer';
import type {OfficeNavigation} from '../src/navigation';

const nav=JSON.parse(readFileSync(new URL('../public/assets/blender/scranton-navigation.json',import.meta.url),'utf8')) as OfficeNavigation;

function fixture(t:TestContext){
  class Element extends EventTarget {
    innerHTML='';textContent='';className='';
    classList={add:()=>{}};
    appendChild(){} setAttribute(){} focus(){}
    setPointerCapture(){} hasPointerCapture(){return false;} releasePointerCapture(){}
    querySelector(){return new Element();}
  }
  const canvas=new Element(),win=new EventTarget(),doc=new EventTarget(),container=new Element();
  Object.assign(doc,{body:new Element(),hidden:false,createElement:()=>new Element(),querySelector:(s:string)=>s==='.experience'?container:null});
  const globals={window:win,document:doc,location:new URL('http://localhost/?visit=bullpen'),HTMLInputElement:class extends Element{},HTMLButtonElement:class extends Element{}};
  for(const [key,value] of Object.entries(globals)){
    const previous=Object.getOwnPropertyDescriptor(globalThis,key);
    Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});
    t.after(()=>{if(previous)Object.defineProperty(globalThis,key,previous);else Reflect.deleteProperty(globalThis,key);});
  }
  let held=false;
  const camera=new PerspectiveCamera(37,1,.1,500);
  const explorer=new OfficeExplorer(camera,canvas as unknown as HTMLCanvasElement,nav,()=>held);
  const send=(type:string,props:Record<string,unknown>={},surface:EventTarget=win)=>{
    const event=new Event(type,{cancelable:true});
    for(const [key,value] of Object.entries({target:canvas,...props}))Object.defineProperty(event,key,{value});
    surface.dispatchEvent(event);
  };
  const move=(x:number,y:number)=>send('pointermove',{pointerType:'mouse',pointerId:1,buttons:0,clientX:x,clientY:y});
  return {camera,explorer,move,send,canvas,setHeld:(value:boolean)=>{held=value;}};
}

test('Mouse movement looks around with no pointer-down or held button',t=>{
  const {camera,explorer,move,send,canvas}=fixture(t),start=explorer.stats(),position=camera.position.clone();
  move(100,100);move(200,130);
  assert.ok(Math.abs(explorer.stats().yaw-(start.yaw-.6))<1e-9);
  assert.ok(Math.abs(explorer.stats().pitch-(start.pitch-.18))<1e-9);
  assert.deepEqual(camera.position.toArray(),position.toArray());
  const yaw=explorer.stats().yaw;
  send('pointerleave',{},canvas);move(600,300);
  assert.equal(explorer.stats().yaw,yaw,'Re-entering the canvas must not jump the view');
});

test('Nearby item interaction holds the standing camera and resumes mouse-look on release',t=>{
  const {camera,explorer,move,send,setHeld}=fixture(t);
  assert.equal(explorer.canReach(new Vector3(0,1,0)),true);
  assert.equal(explorer.canReach(new Vector3(90,1,0)),false);
  const position=camera.position.toArray(),rotation=camera.quaternion.toArray(),fov=camera.fov;
  move(100,100);setHeld(true);move(350,200);
  send('keydown',{key:'w'});explorer.step(.1);send('keyup',{key:'w'});
  assert.deepEqual(camera.position.toArray(),position);
  assert.deepEqual(camera.quaternion.toArray(),rotation);
  assert.equal(camera.fov,fov);
  setHeld(false);move(350,200);
  assert.deepEqual(camera.quaternion.toArray(),rotation,'Release keeps the same view');
  move(400,200);
  assert.notDeepEqual(camera.quaternion.toArray(),rotation);
  send('keydown',{key:'w'});explorer.step(.1);send('keyup',{key:'w'});
  assert.ok(explorer.stats().distanceMeters>0,'Walking remains available');
  const afterWalk=camera.position.toArray();send('keydown',{key:'e'});
  assert.deepEqual(camera.position.toArray(),afterWalk,'E no longer enters a fixed desk camera');
});
