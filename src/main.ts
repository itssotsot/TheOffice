import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import '@fontsource/dm-sans/latin-400.css';
import '@fontsource/dm-sans/latin-500.css';
import '@fontsource/dm-sans/latin-600.css';
import '@fontsource/dm-sans/latin-700.css';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import './style.css';
import { ITEMS } from './content';
import { Bobblehead } from './bobblehead';
import { Jelly } from './jelly';
import { makeOffice, prepareOfficeMaterials } from './office';
import {OfficeExplorer} from './explorer';
import {Building} from './building';
import type {OfficeNavigation} from './navigation';
import { JellyAudio } from './audio';
import type { Vec3 } from './physics';
import { resolveContacts, MAX_LIFT } from './motion';
const icon=(name:string,size=20)=>{
  const paths:Record<string,string>={
    settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="currentColor"/><circle cx="15" cy="17" r="3" fill="currentColor"/>',
    sound:'<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
    mute:'<path d="m11 5-6 4H2v6h3l6 4V5Z"/><path d="m16 9 5 6m0-6-5 6"/>',
    reset:'<path d="M3 11a9 9 0 1 1 2.5 7M3 4v7h7"/>',
    wave:'<path d="M2 12c3-12 5 12 8 0s5 12 8 0 4 0 4 0"/>',
    arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    hand:'<path d="M8 13V6a2 2 0 0 1 4 0v5-7a2 2 0 0 1 4 0v7-4a2 2 0 0 1 4 0v9c0 4-3 6-7 6-3 0-5-2-7-5l-3-5a2 2 0 0 1 3-2l2 3Z"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v1"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
  };return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.info}</svg>`;
};
document.querySelector<HTMLDivElement>('#app')!.innerHTML=`
  <main class="experience">
    <div id="scene" aria-label="An office desk with ${ITEMS.length} interactive jellos"></div>
    <div class="vignette"></div>
    <header class="header">
      <a class="brand" href="/" aria-label="Desk Jelly home"><span class="brand-mark"><svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M11 12c0-5 18-5 18 0l4 15c0 7-26 7-26 0l4-15Z" fill="currentColor"/><path d="M15 14c-1 3-2 7-2 11m7-12v13m5-12 2 11" stroke="#f5f5eb" stroke-width="1.5" stroke-linecap="round"/></svg></span>desk jelly<span class="brand-dot">®</span></a>
      <div class="office-status"><span class="status-dot"></span> BUSINESS AS UNUSUAL <span class="status-line"></span> 5:01 PM</div>
      <div class="header-actions"><button id="settings" class="icon-button" aria-label="Settings" title="Settings" aria-haspopup="dialog">${icon('settings')}</button></div>
    </header>
    <dialog id="settings-dialog" aria-labelledby="settings-title">
      <div class="settings-heading"><h2 id="settings-title">Settings</h2><button id="settings-close" class="icon-button" aria-label="Close settings">${icon('close')}</button></div>
      <label class="setting-row" for="audio-volume"><span>Audio volume</span><output id="volume-value" for="audio-volume">100%</output></label>
      <input id="audio-volume" type="range" min="0" max="100" step="1" value="100" />
      <label class="setting-row" for="mouse-sensitivity"><span>Mouse sensitivity</span><output id="sensitivity-value" for="mouse-sensitivity">1×</output></label>
      <input id="mouse-sensitivity" type="range" min="0.25" max="3" step="0.05" value="1" />
    </dialog>
    <section class="intro"><div class="eyebrow">THE OFFICE CAN WAIT.</div><h1>A little office<br><em>mischief.</em></h1><p>Everything you need to do nothing.</p></section>
    <div class="progress"><span class="progress-label">DESK DISRUPTION</span><div class="progress-items">${ITEMS.map((s,i)=>`<span class="progress-dot" data-dot="${i}" style="--item-color:${s.color}" title="${s.id}"></span>`).join('')}<span id="progress-count">0 / ${ITEMS.length}</span></div><span id="progress-caption">Perfectly productive. For now.</span></div>
    <div class="loading" id="loading"><div class="loading-jelly"></div><span>Opening the Scranton branch…</span></div>
    <section class="selected-card" aria-label="Selected jello"><div class="selected-top"><span id="flavor-dot"></span><span id="flavor">LEMON JELLO</span><span class="selected-number" id="selected-number">01 / ${String(ITEMS.length).padStart(2,'0')}</span></div><h2 id="item-name">The classic</h2><p id="item-subtitle">One very unavailable stapler.</p><div class="item-picker" aria-label="Choose an office item">${ITEMS.map((s,i)=>`<button class="item-chip ${i===0?'active':''}" data-item="${i}" aria-label="Select ${s.id}" aria-pressed="${i===0}" style="--item-color:${s.color}"><span></span><span class="chip-number">0${i+1}</span></button>`).join('')}</div></section>
    <footer class="toolbar"><div class="firmness-control"><label for="firmness">JIGGLE LEVEL</label><div class="range-row"><span>Soft</span><input id="firmness" type="range" min="0.45" max="1.8" step="0.05" value="1" aria-label="Jello firmness"/><span>Firm</span></div></div><div class="toolbar-divider"></div><button id="wobble" class="wobble-button">${icon('wave')}<span>Wobble everything</span></button><button id="reset" class="reset-button" aria-label="Reset the desk" title="Reset the desk">${icon('reset')}</button></footer>
    <div class="corner-note">AN ODDLY SATISFYING WASTE OF TIME.</div>
    <div id="toast" role="status" aria-live="polite"></div>
  </main>`;
const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const scene=new THREE.Scene();scene.background=new THREE.Color('#d8d8d5');scene.fog=new THREE.Fog('#d8d8d5',260,420);
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.65));renderer.setSize(window.innerWidth,window.innerHeight);
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;
$('#scene').appendChild(renderer.domElement);renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('aria-label','Walkable Scranton office with interactive jelly items.');
const camera=new THREE.PerspectiveCamera(37,window.innerWidth/window.innerHeight,.1,500);
let explorer:OfficeExplorer|undefined;
let building:Building|undefined;
const pmrem=new THREE.PMREMGenerator(renderer),environment=new RoomEnvironment();const env=pmrem.fromScene(environment,.04);scene.environment=env.texture;scene.environmentIntensity=.42;environment.dispose();pmrem.dispose();
const workstation=new THREE.Group();scene.add(workstation);
makeOffice(scene,workstation);
const dwight=new Bobblehead();workstation.add(dwight.group);
const jellies=ITEMS.map(s=>new Jelly(s));jellies.forEach(j=>workstation.add(j.group,j.shadow));
const audio=new JellyAudio();
let lastImpactSound=0;
for(const j of jellies){const deform=j.motion.onImpact;j.motion.onImpact=(speed,direction)=>{deform?.(speed,direction);if(performance.now()-lastImpactSound>120){audio.plop(Math.min(1.5,speed*.16),.85);lastImpactSound=performance.now();}};}
let selected=0,pokes=0,loaded=false,toastTimer=0;
const disturbed=new Set<number>();
function select(i:number){
  selected=i;const s=ITEMS[i];$('#flavor').textContent=`${s.flavor} jello`.toUpperCase();$('#flavor-dot').style.background=s.color;$('#selected-number').textContent=`${String(i+1).padStart(2,'0')} / ${String(ITEMS.length).padStart(2,'0')}`;$('#item-name').textContent=s.name;$('#item-subtitle').textContent=s.subtitle;
  document.querySelectorAll<HTMLButtonElement>('.item-chip').forEach((button,k)=>{button.classList.toggle('active',k===i);button.setAttribute('aria-pressed',String(k===i));});
}
function announce(text:string){$('#toast').textContent=text;$('#toast').classList.add('show');window.clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>$('#toast').classList.remove('show'),2800);}
function record(i:number){pokes++;disturbed.add(i);$(`[data-dot="${i}"]`).classList.add('done');$('#progress-count').textContent=`${disturbed.size} / ${ITEMS.length}`;$('#progress-caption').textContent=disturbed.size===ITEMS.length?'Perfectly unproductive. Well done.':disturbed.size>2?'HR would like a word.':'Productivity is wobbling.';if(disturbed.size===ITEMS.length&&!document.body.classList.contains('complete')){document.body.classList.add('complete');announce('Every item disturbed. Employee of the month.');}}
const loader=new GLTFLoader();
async function loadAssets(){
  let navigation:OfficeNavigation|undefined,groundNav:OfficeNavigation|undefined;
  let officeRoot:THREE.Object3D,groundRoot:THREE.Object3D,elevatorAsset:THREE.Object3D;
  const results=await Promise.allSettled([...jellies.map(async j=>{const gltf=await loader.loadAsync(`/assets/blender/${j.spec.id}.glb`);j.setProp(gltf.scene);}),
    loader.loadAsync('/assets/blender/desk.glb').then(gltf=>{gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});workstation.add(gltf.scene);}),
    loader.loadAsync('/assets/blender/scranton-office.glb').then(gltf=>{prepareOfficeMaterials(gltf.scene,renderer);gltf.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=!o.name.startsWith('Ceiling')&&!o.name.includes('glazing');o.receiveShadow=true;}});officeRoot=gltf.scene;scene.add(gltf.scene);}),
    loader.loadAsync('/assets/blender/scranton-ground-floor.glb').then(gltf=>{groundRoot=gltf.scene;prepareOfficeMaterials(groundRoot,renderer);groundRoot.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=!o.name.includes('glazing')&&!o.name.startsWith('Ground_ceiling');o.receiveShadow=true;}});scene.add(groundRoot);groundRoot.visible=false;}),
    loader.loadAsync('/assets/blender/scranton-elevator.glb').then(gltf=>{elevatorAsset=gltf.scene;prepareOfficeMaterials(elevatorAsset,renderer);}),
    fetch('/assets/blender/ground-navigation.json').then(async r=>{if(!r.ok)throw new Error('Ground navigation unavailable');groundNav=await r.json();}),
    fetch('/assets/blender/scranton-navigation.json').then(async r=>{if(!r.ok)throw new Error('Office navigation unavailable');navigation=await r.json();}),
    loader.loadAsync('/assets/blender/dwight-bobblehead.glb').then(gltf=>dwight.setModel(gltf.scene)),
  ]);
  const failed=results.filter(r=>r.status==='rejected');
  if(failed.length){console.error('Office asset loading failed',failed);$('#loading').innerHTML='<span>Some office supplies did not arrive.</span><button id="retry-assets">Reload the desk</button>';$('#retry-assets').onclick=()=>location.reload();return;}
  if(navigation?.workstation){
    const placement=navigation.workstation,scale=placement.scale??1;
    workstation.position.fromArray(placement.position);workstation.rotation.y=placement.rotation;workstation.scale.setScalar(scale);workstation.updateMatrixWorld(true);
    for(const jelly of jellies){jelly.motion.floorY=(navigation.ground-placement.position[1])/scale-.045;jelly.motion.deskHalfDepth=placement.deskHalfDepth??jelly.motion.deskHalfDepth;}
  }
  explorer=new OfficeExplorer(camera,renderer.domElement,navigation!,()=>!!drag);explorer.sensitivity=preferences.sensitivity;
  building=new Building(scene,camera,explorer,officeRoot!,workstation,groundRoot!,elevatorAsset!,[groundNav!,navigation!],audio);
  $('#scene').setAttribute('aria-label','Walkable Dunder Mifflin Scranton office with interactive jelly items');
  $('.brand').setAttribute('aria-label','Dunder Mifflin home');document.title='Scranton — a day at Dunder Mifflin';
  loaded=true;$('#loading').classList.add('loaded');document.body.classList.add('ready');
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches)jellies[0].body.wobble(.34);
}
void loadAssets();
function resize(){
  const w=window.innerWidth,h=window.innerHeight;camera.aspect=w/h;
  camera.updateProjectionMatrix();
  renderer.setSize(w,h);
}
resize();window.addEventListener('resize',resize);
const raycaster=new THREE.Raycaster(),ndc=new THREE.Vector2(),horizontal=new THREE.Plane(new THREE.Vector3(0,1,0),0),hitPlane=new THREE.Vector3();
type Drag={jelly:Jelly;offset:THREE.Vector3;origin:Vec3;pointer:number;sx:number;sy:number;px:number;py:number;moved:boolean;height:number;timer:number;time:number;startedAt:number};
let drag:Drag|null=null;
let lastInteraction='none',maxGripError=0;
function rayAt(x:number,y:number){const rect=renderer.domElement.getBoundingClientRect();ndc.set((x-rect.left)/rect.width*2-1,-(y-rect.top)/rect.height*2+1);raycaster.setFromCamera(ndc,camera);}
function pick(event:PointerEvent){rayAt(event.clientX,event.clientY);const hit=raycaster.intersectObjects([...jellies.map(j=>j.mesh),...dwight.hitMeshes],false)[0];return hit&&explorer?.canReach(hit.point)?hit:undefined;}
function setLiftPlane(d:Drag){hitPlane.set(0,.045+d.height+d.offset.y,0);workstation.localToWorld(hitPlane);horizontal.constant=-hitPlane.y;}
function moveLift(d:Drag){
  rayAt(d.px,d.py);setLiftPlane(d);
  if(!raycaster.ray.intersectPlane(horizontal,hitPlane))return;
  workstation.worldToLocal(hitPlane);
  const target:Vec3=[hitPlane.x-d.offset.x,d.height,hitPlane.z-d.offset.z];
  if(!d.jelly.motion.held)d.jelly.motion.lift(target,d.time);else d.jelly.motion.move(target,d.time);
}
function beginLift(d:Drag){
  if(drag!==d)return;clearTimeout(d.timer);d.moved=true;d.jelly.body.grab=null;
  // Seed at the original cursor position so even a single fast move has a direction.
  rayAt(d.sx,d.sy);setLiftPlane(d);
  if(raycaster.ray.intersectPlane(horizontal,hitPlane)){workstation.worldToLocal(hitPlane);d.jelly.motion.lift([hitPlane.x-d.offset.x,d.height,hitPlane.z-d.offset.z],d.startedAt);}
  moveLift(d);
  document.body.classList.add('lifting');
}
renderer.domElement.addEventListener('pointerdown',(event)=>{
  if(!loaded||event.button!==0||drag)return;rayAt(event.clientX,event.clientY);if(building?.interact(raycaster)){event.preventDefault();renderer.domElement.focus({preventScroll:true});return;}const hit=workstation.visible?pick(event):undefined;if(!hit)return;event.preventDefault();
  if(hit.object.userData.bobblehead){dwight.poke(workstation.worldToLocal(hit.point.clone()).x-dwight.group.position.x);audio.plop(.22,.6);lastInteraction='bobblehead';return;}
  const jelly=hit.object.userData.jelly as Jelly;select(jellies.indexOf(jelly));const local=jelly.group.worldToLocal(hit.point.clone()),binding=jelly.bindingAt(local);
  horizontal.constant=-hit.point.y;
  drag={jelly,offset:workstation.worldToLocal(hit.point.clone()).sub(jelly.group.position),origin:jelly.body.sample(binding),pointer:event.pointerId,sx:event.clientX,sy:event.clientY,px:event.clientX,py:event.clientY,moved:false,height:Math.min(MAX_LIFT,Math.max(1.4,jelly.motion.position[1]+.55)),timer:0,time:event.timeStamp/1000,startedAt:event.timeStamp/1000};
  jelly.startGrip(local,drag.offset,hit.face);maxGripError=0;
  const current=drag;drag.timer=window.setTimeout(()=>beginLift(current),140);
  jelly.body.poke([local.x,local.y,local.z],.35);renderer.domElement.setPointerCapture(event.pointerId);renderer.domElement.focus({preventScroll:true});document.body.classList.add('grabbing');
  audio.plop(.35,1+selected*.075);
});
window.addEventListener('pointermove',(event)=>{
  if(drag&&drag.pointer===event.pointerId){
    if(event.buttons===0&&event.pointerType!=='touch'){endDrag(false,'button-release',event.timeStamp/1000);return;}
    const d=drag;d.px=event.clientX;d.py=event.clientY;d.time=event.timeStamp/1000;
    const distance=Math.hypot(d.px-d.sx,d.py-d.sy);
    if(distance>2&&!d.moved)beginLift(d);else if(d.moved)moveLift(d);return;
  }
  if(event.target!==renderer.domElement){document.body.classList.remove('hovering-jelly');return;}
  const hit=workstation.visible?pick(event):undefined;document.body.classList.toggle('hovering-jelly',!!hit);

});
function endDrag(cancel=false,reason='release',time=performance.now()/1000){
  if(drag)lastInteraction=reason;
  if(!drag)return;const d=drag;clearTimeout(d.timer);d.jelly.body.grab=null;
  d.jelly.releaseGrip(cancel,time);
  if(!cancel){if(!d.moved)d.jelly.body.poke(d.origin,1.1);record(jellies.indexOf(d.jelly));audio.plop(d.moved?.85:1,1+jellies.indexOf(d.jelly)*.075);}
  drag=null;document.body.classList.remove('grabbing','lifting');
  if(renderer.domElement.hasPointerCapture(d.pointer))renderer.domElement.releasePointerCapture(d.pointer);
}
window.addEventListener('pointerup',e=>{
  if(drag?.pointer!==e.pointerId)return;
  drag.px=e.clientX;drag.py=e.clientY;drag.time=e.timeStamp/1000;
  if(drag.moved)moveLift(drag);
  endDrag(false,'release',e.timeStamp/1000);
});
window.addEventListener('pointercancel',e=>{if(drag?.pointer===e.pointerId)endDrag(true,'pointercancel');});
renderer.domElement.addEventListener('lostpointercapture',event=>{
  if(drag?.pointer!==event.pointerId)return;
  // Some browser hosts report normal button-up as capture loss. It is still a toss.
  // While the button remains down, window listeners keep the drag alive.
  if(event.buttons===0)endDrag(false,'capture-release',event.timeStamp/1000);
});
renderer.domElement.addEventListener('pointerleave',()=>{if(!drag){document.body.classList.remove('hovering-jelly');}});
renderer.domElement.addEventListener('wheel',event=>{
  if(!drag||!drag.moved)return;event.preventDefault();
  drag.height=Math.max(.4,Math.min(MAX_LIFT,drag.height-event.deltaY*.005));drag.time=event.timeStamp/1000;moveLift(drag);
},{passive:false});
function wobble(){if(!loaded)return;dwight.poke(1,.7);jellies.forEach((j,i)=>{j.body.wobble(.9);record(i);});audio.plop(1.2);$('#wobble').classList.remove('wiggling');void $('#wobble').offsetWidth;$('#wobble').classList.add('wiggling');}
function reset(){endDrag(true);dwight.reset();jellies.forEach(j=>j.reset());disturbed.clear();pokes=0;document.querySelectorAll('.progress-dot').forEach(d=>d.classList.remove('done'));document.body.classList.remove('complete','grabbing');$('#progress-count').textContent=`0 / ${ITEMS.length}`;$('#progress-caption').textContent='Perfectly productive. For now.';select(0);announce('Back to business. Allegedly.');}
$('#wobble').onclick=wobble;$('#reset').onclick=reset;
const settingsDialog=$<HTMLDialogElement>('#settings-dialog');
const volumeInput=$<HTMLInputElement>('#audio-volume'),sensitivityInput=$<HTMLInputElement>('#mouse-sensitivity');
const preferences={volume:1,sensitivity:1};
try{const saved=JSON.parse(localStorage.getItem('desk-jelly-settings')??'null');if(saved&&typeof saved.volume==='number'&&Number.isFinite(saved.volume))preferences.volume=THREE.MathUtils.clamp(saved.volume,0,1);if(saved&&typeof saved.sensitivity==='number'&&Number.isFinite(saved.sensitivity))preferences.sensitivity=THREE.MathUtils.clamp(saved.sensitivity,.25,3);}catch{/* Storage may be unavailable. */}
function applySettings(){
 audio.setVolume(preferences.volume);if(explorer)explorer.sensitivity=preferences.sensitivity;
 volumeInput.value=String(Math.round(preferences.volume*100));sensitivityInput.value=String(preferences.sensitivity);
 $('#volume-value').textContent=preferences.volume===0?'Muted':`${Math.round(preferences.volume*100)}%`;
 $('#sensitivity-value').textContent=`${Number(preferences.sensitivity.toFixed(2))}×`;
 volumeInput.setAttribute('aria-valuetext',$('#volume-value').textContent!);sensitivityInput.setAttribute('aria-valuetext',$('#sensitivity-value').textContent!);
}
function saveSettings(){applySettings();try{localStorage.setItem('desk-jelly-settings',JSON.stringify(preferences));}catch{/* Settings still work without storage. */}}
applySettings();
volumeInput.oninput=()=>{preferences.volume=Number(volumeInput.value)/100;saveSettings();};
volumeInput.onchange=()=>audio.plop(.45);
sensitivityInput.oninput=()=>{preferences.sensitivity=Number(sensitivityInput.value);saveSettings();};
$('#settings').onclick=()=>{explorer?.pauseInput();settingsDialog.showModal();};
$('#settings-close').onclick=()=>settingsDialog.close();
settingsDialog.addEventListener('close',()=>explorer?.pauseInput());
settingsDialog.addEventListener('click',e=>{if(e.target!==settingsDialog)return;const r=settingsDialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)settingsDialog.close();});
$('#firmness').addEventListener('input',e=>{const value=Number((e.target as HTMLInputElement).value);jellies.forEach(j=>{j.body.firmness=j.spec.firmness*value;});});
document.querySelectorAll<HTMLButtonElement>('[data-item]').forEach(button=>button.onclick=()=>select(Number(button.dataset.item)));
window.addEventListener('keydown',event=>{
  if(!loaded||settingsDialog.open||event.target instanceof HTMLInputElement||event.ctrlKey||event.metaKey||event.altKey)return;
  if(event.repeat)return;
  if(event.key.toLowerCase()==='r'){reset();return;}
  if(/^[1-9]$/.test(event.key)&&Number(event.key)<=ITEMS.length){select(Number(event.key)-1);renderer.domElement.focus({preventScroll:true});event.preventDefault();}
});
select(0);
let last=performance.now(),accumulator=0,frames=0,frameTime=16;
const qaState=document.createElement("output");qaState.id="qa-state";qaState.hidden=true;document.body.appendChild(qaState);
const fixed=1/120;
function animate(now:number){
  requestAnimationFrame(animate);const delta=Math.min((now-last)/1000,.04);last=now;
  if(document.hidden)return;
  frameTime=frameTime*.95+delta*1000*.05;accumulator+=delta;
  let steps=0;while(accumulator>=fixed&&steps<4){jellies.forEach(j=>j.step(fixed));resolveContacts(jellies.map(j=>j.motion));accumulator-=fixed;steps++;}
  jellies.forEach(j=>j.sync());dwight.step(delta);building?.step(delta);explorer?.step(delta);renderer.render(scene,camera);frames++;
  if(drag?.moved){const grip=drag.jelly.gripWorldPoint();if(grip){grip.project(camera);const error=Math.hypot((grip.x*.5+.5)*innerWidth-drag.px,(-grip.y*.5+.5)*innerHeight-drag.py);maxGripError=Math.max(maxGripError,error);}}
  if(frames%30===0)qaState.textContent=JSON.stringify({loaded,building:building?.stats(),explorer:explorer?.stats(),bobblehead:dwight.stats(),selected,pokes,disturbed:disturbed.size,dragging:!!drag,lastInteraction,maxGripError,frames,frameTime,targets:jellies.map(j=>{const v=new THREE.Vector3(0,j.spec.size[1]*.8,0);j.group.localToWorld(v).project(camera);return {id:j.spec.id,x:(v.x*.5+.5)*innerWidth,y:(-.5*v.y+.5)*innerHeight};}),drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,jellies:jellies.map(j=>({id:j.spec.id,...j.body.stats(),motion:j.motion.stats()}))});
}
requestAnimationFrame(animate);
document.addEventListener('visibilitychange',()=>{last=performance.now();accumulator=0;if(document.hidden)endDrag(true);});
// Read-only runtime evidence for QA, plus screen positions for repeatable real input.
Object.assign(window,{__deskJelly:{status:()=>({loaded,building:building?.stats(),explorer:explorer?.stats(),bobblehead:dwight.stats(),selected,pokes,disturbed:disturbed.size,dragging:!!drag,lastInteraction,maxGripError,frames,frameTime,renderer:renderer.info.render,jellies:jellies.map(j=>({id:j.spec.id,...j.body.stats(),motion:j.motion.stats()}))}),buildingTargets:()=>building?.targets(),targets:()=>jellies.map(j=>{const v=new THREE.Vector3(0,j.spec.size[1]*.9,0);j.group.localToWorld(v).project(camera);return {id:j.spec.id,x:(v.x*.5+.5)*window.innerWidth,y:(-.5*v.y+.5)*window.innerHeight};})}});
