import * as THREE from 'three';
import {areaAt,walkStep,type OfficeNavigation,type Landmark} from './navigation';

export class OfficeExplorer {
  readonly walking=true;
  sensitivity=1;
  floorHeight:number|undefined;
  setNavigation(nav:OfficeNavigation){this.nav=nav;this.updateHUD();}
  spawnAt(mark:Landmark){this.camera.position.fromArray(mark.position);this.yaw=mark.yaw;this.orient();this.updateHUD();}
  pauseInput(){this.releaseInput();}
  private yaw=0;
  private pitch=-.10;
  private keys=new Set<string>();
  private looking:{pointer:number;x:number;y:number}|null=null;
  private mousePosition:{x:number;y:number}|null=null;
  private distance=0;
  private visited=new Set<string>();
  private nearDesk=false;
  private ui:HTMLElement;
  private location:HTMLElement;
  constructor(private camera:THREE.PerspectiveCamera,private canvas:HTMLCanvasElement,public nav:OfficeNavigation,private interacting:()=>boolean){
    const params=new URLSearchParams(location.search);
    const spawn=nav.landmarks.find(l=>l.id===params.get('visit'))??nav.landmarks.find(l=>l.id===nav.spawn)!;
    this.camera.position.fromArray(spawn.position);this.yaw=spawn.yaw;
    this.ui=document.createElement('aside');this.ui.className='explorer-ui';this.ui.innerHTML=`
      <div class="branch-heading"><span>DUNDER MIFFLIN · SCRANTON</span><h1 id="office-location">Reception</h1><p>A perfectly ordinary place to get lost.</p></div>
      <div class="walk-reticle" aria-hidden="true"></div>
`;
    document.querySelector('.experience')!.appendChild(this.ui);
    this.location=this.ui.querySelector('#office-location')!;
    window.addEventListener('keydown',e=>{
      if(e.ctrlKey||e.metaKey||e.altKey||e.target instanceof HTMLInputElement||document.querySelector('dialog[open]'))return;
      const key=e.key.toLowerCase();
      if(key==='escape'){this.keys.clear();return;}
      if(key===' '&&(e.target instanceof HTMLButtonElement||e.target instanceof HTMLAnchorElement))return;
      if(['w','a','s','d',' ','shift','arrowup','arrowdown','arrowleft','arrowright'].includes(key)){
        if(e.target instanceof HTMLButtonElement && ['arrowup','arrowdown'].includes(key))return;
        e.preventDefault();this.keys.add(key);
      }
    });
    window.addEventListener('keyup',e=>this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur',()=>this.releaseInput());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.releaseInput();});
    canvas.addEventListener('pointerdown',e=>{
      if(this.interacting()||e.button!==0)return;
      canvas.focus({preventScroll:true});
      if(e.pointerType!=='mouse'){this.looking={pointer:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);}
    });
    window.addEventListener('pointermove',e=>{
      if(this.interacting()||document.querySelector('dialog[open]')){this.mousePosition=null;this.looking=null;return;}
      if(e.pointerType==='mouse'){
        if(e.target!==canvas){this.mousePosition=null;return;}
        // Re-entering the scene or releasing an item starts a fresh mouse sample.
        if(this.mousePosition)this.look(e.clientX-this.mousePosition.x,e.clientY-this.mousePosition.y);
        this.mousePosition={x:e.clientX,y:e.clientY};
        return;
      }
      if(this.looking?.pointer===e.pointerId){this.look(e.clientX-this.looking.x,e.clientY-this.looking.y);this.looking.x=e.clientX;this.looking.y=e.clientY;}
    });
    canvas.addEventListener('pointerleave',()=>{this.mousePosition=null;});
    const endLook=(e:PointerEvent)=>{if(this.looking?.pointer===e.pointerId){this.looking=null;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);}};
    window.addEventListener('pointerup',endLook);window.addEventListener('pointercancel',endLook);
    document.body.classList.add('walking');
    this.camera.fov=68;this.camera.updateProjectionMatrix();
    this.canvas.setAttribute('aria-label','Walkable Scranton office. WASD to move, Space to move forward, mouse to look, drag nearby jelly items to lift and throw.');
    this.orient();this.updateHUD();
  }
  private releaseInput(){this.keys.clear();this.looking=null;this.mousePosition=null;}
  private look(dx:number,dy:number){this.yaw-=dx*.006*this.sensitivity;this.pitch=THREE.MathUtils.clamp(this.pitch-dy*.006*this.sensitivity,-1.20,1.05);this.orient();}
  private orient(){this.camera.rotation.order='YXZ';this.camera.rotation.set(this.pitch,this.yaw,0);}
  canReach(point:THREE.Vector3){return this.camera.position.distanceTo(point)<=this.nav.unitsPerMeter*2.5;}
  step(dt:number){
    if(this.interacting()){this.updateHUD();return;}
    if(!document.querySelector('dialog[open]')){
      const key=(k:string)=>Number(this.keys.has(k));
      this.yaw+=(key('arrowleft')-key('arrowright'))*dt*1.7;
      const forward=Math.max(key('w'),key('arrowup'),key(' '))-Math.max(key('s'),key('arrowdown'));
      const strafe=key('d')-key('a'),length=Math.hypot(forward,strafe)||1;
      const speed=this.nav.unitsPerMeter*(this.keys.has('shift')?3.0:1.8)*dt/length;
      const dx=(-Math.sin(this.yaw)*forward+Math.cos(this.yaw)*strafe)*speed;
      const dz=(-Math.cos(this.yaw)*forward-Math.sin(this.yaw)*strafe)*speed;
      const before=this.camera.position;
      const next=walkStep(before.x,before.z,dx,dz,this.nav);
      this.distance+=Math.hypot(next.x-before.x,next.z-before.z);
      this.camera.position.set(next.x,(this.floorHeight??this.nav.ground)+this.nav.eyeHeight,next.z);
      this.orient();
    }
    this.updateHUD();
  }
  private updateHUD(){
    const {x,z}=this.camera.position,d=this.nav.deskInteraction;
    this.nearDesk=Math.hypot(x-d.x,z-d.z)<d.radius;
    const area=areaAt(x,z,this.nav);this.location.textContent=area;this.visited.add(area);
  }
  stats(){return {walking:this.walking,position:this.camera.position.toArray(),yaw:this.yaw,pitch:this.pitch,area:areaAt(this.camera.position.x,this.camera.position.z,this.nav),distanceMeters:this.distance/this.nav.unitsPerMeter,nearDesk:this.nearDesk,visited:[...this.visited]};}
}
