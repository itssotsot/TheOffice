import * as THREE from 'three';
import {Elevator,type Floor} from './elevator';
import {advanceEntryDoors,entryDoorColliders} from './entry-doors';
import type {OfficeNavigation,Rect} from './navigation';
import type {OfficeExplorer} from './explorer';
import type {JellyAudio} from './audio';
const S=7.2,UP=-5.34,DROP=3.35*S,X=-10.285,FRONT=13.6;
const rect=(name:string,x1:number,x2:number,y1:number,y2:number):Rect=>({name,minX:x1*S,maxX:x2*S,minZ:-y2*S,maxZ:-y1*S});
/** Owns the moving exported parts and collision interlocks, preserving the player's camera. */
export class Building {
  readonly lift=new Elevator();
  private floor:Floor=1;
  private riding=false;
  private cabin=new THREE.Group();
  private cabinDoors=[new THREE.Group(),new THREE.Group()];
  private landingDoors=[[new THREE.Group(),new THREE.Group()],[new THREE.Group(),new THREE.Group()]];
  private landings=[new THREE.Group(),new THREE.Group()];
  private entrance=[new THREE.Group(),new THREE.Group()];
  private entranceOpen=0;
  private entranceHold=0;
  private baseColliders:Rect[][];
  private actions:THREE.Object3D[]=[];
  private displays:{mesh:THREE.Mesh;canvas:HTMLCanvasElement;texture:THREE.CanvasTexture}[]=[];
  private screenText='';
  private cabinLight=new THREE.PointLight('#fff3db',18,3.5*S,1.7);
  constructor(private scene:THREE.Scene,private camera:THREE.PerspectiveCamera,private explorer:OfficeExplorer,
    private office:THREE.Object3D,private workstation:THREE.Object3D,private ground:THREE.Object3D,
    asset:THREE.Object3D,private navs:[OfficeNavigation,OfficeNavigation],private audio:JellyAudio){
    this.baseColliders=navs.map(n=>n.colliders.filter(c=>c.name!=='Elevator enclosed shaft'));
    this.cabin.add(...this.cabinDoors);
    for(const object of [...asset.children]){
      if(object.name.startsWith('EntryDoor')){const side=object.name.startsWith('EntryDoorLeft')?0:1;this.entrance[side].add(object);}
      else if(object.name.startsWith('CabinDoor')){const side=object.name.startsWith('CabinDoorLeft')?0:1;this.cabinDoors[side].add(object);}
      else this.cabin.add(object);
    }
    for(const floor of [0,1] as const){
      for(const side of [0,1]){for(const part of this.cabinDoors[side].children)this.landingDoors[floor][side].add(part.clone());this.landings[floor].add(this.landingDoors[floor][side]);}
      this.landings[floor].position.set(0,-(1-floor)*DROP,-.086*S);scene.add(this.landings[floor]);
      // Call buttons are at the existing wall station and available from either landing.
      this.button(this.landings[floor],floor===1?'↓':'↑',-11.355,6.255,1.17,Math.PI,()=>this.lift.request(floor),()=>this.floor===floor&&!this.inside());
      this.display(this.landings[floor],X,6.255,2.475,Math.PI,.29,.15);
    }
    this.button(this.cabin,'G',-9.292,6.035,1.18,0,()=>this.lift.request(0),()=>this.inside());
    this.button(this.cabin,'2',-9.292,6.035,1.49,0,()=>this.lift.request(1),()=>this.inside());
    this.button(this.cabin,'◀ ▶',-9.292,6.035,.91,0,()=>this.lift.open(),()=>this.inside());
    this.display(this.cabin,X,6.042,2.19,0,.38,.17);
    this.cabinLight.position.set(X*S,UP+2.21*S,-5.10*S);this.cabin.add(this.cabinLight);scene.add(this.cabin);
    for(let i=0;i<2;i++){this.entrance[i].position.set((X+(i===0?-.95:.95))*S,UP-DROP,-FRONT*S);this.ground.add(this.entrance[i]);}
    // Diffuse practical light in the downstairs set, independent of outdoor sunlight.
    for(const [x,y] of [[-11.5,8.54],[-7.23,8.54],[-11.5,11.59],[-7.23,11.59]]){
      const light=new THREE.PointLight('#fff5df',25,7*S,1.7);light.position.set(x*S,UP-DROP+2.9*S,-y*S);this.ground.add(light);
    }
    const requested=new URLSearchParams(location.search).get('visit');
    if(requested==='ground-lobby'||requested==='parking'){
      this.floor=0;this.lift.floor=0;this.lift.destination=0;this.lift.level=0;
      const spawn=navs[0].landmarks.find(l=>l.id===requested)!;
      explorer.setNavigation(navs[0]);explorer.spawnAt(spawn);
    }
    this.setFloor(this.floor);this.step(0);
  }
  private inside(){const p=this.camera.position;return Math.abs(p.x/S-X)<1.0&&-p.z/S>4.20&&-p.z/S<5.89;}
  private beam(){const p=this.camera.position;return Math.abs(p.x/S-X)<1.08&&Math.abs(-p.z/S-6.16)<.36;}
  private button(parent:THREE.Object3D,label:string,x:number,y:number,z:number,rotation:number,action:()=>boolean,available:()=>boolean){
    const g=new THREE.Group();g.position.set(x*S,UP+z*S,-y*S);g.rotation.y=rotation;
    const bezel=new THREE.Mesh(new THREE.CylinderGeometry(.086*S,.086*S,.021*S,32),new THREE.MeshStandardMaterial({color:'#9b9c94',metalness:.8,roughness:.26}));bezel.rotation.x=Math.PI/2;g.add(bezel);
    const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d')!;
    ctx.fillStyle='#242925';ctx.beginPath();ctx.arc(128,128,123,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#d8d3b1';ctx.lineWidth=5;ctx.stroke();
    ctx.fillStyle='#f6e9bc';ctx.font=`600 ${label.length>1?60:135}px Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,128,136);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const face=new THREE.Mesh(new THREE.PlaneGeometry(.157*S,.157*S),new THREE.MeshBasicMaterial({map:texture,transparent:true}));face.position.z=.015*S;g.add(face);
    const target=new THREE.Mesh(new THREE.BoxGeometry(.25*S,.255*S,.07*S),new THREE.MeshBasicMaterial({visible:false}));
    target.userData.buildingAction=()=>{if(!available())return false;const ok=action();if(ok)this.audio.liftChime(true);return ok;};
    target.userData.actionLabel=label;target.userData.available=available;g.add(target);this.actions.push(target);parent.add(g);
  }
  private display(parent:THREE.Object3D,x:number,y:number,z:number,rotation:number,width:number,height:number){
    const canvas=document.createElement('canvas');canvas.width=384;canvas.height=128;const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width*S,height*S),new THREE.MeshBasicMaterial({map:texture}));mesh.position.set(x*S,UP+z*S,-y*S);mesh.rotation.y=rotation;parent.add(mesh);this.displays.push({mesh,canvas,texture});
  }
  /** Buttons cannot be clicked through walls, closed doors, or from a different floor. */
  interact(ray:THREE.Raycaster){
    const targets=ray.intersectObjects(this.actions,false);
    for(const target of targets){
      if(target.distance>2.2*S||!target.object.userData.available())continue;
      let ancestor:THREE.Object3D|null=target.object;let visible=true;while(ancestor){if(!ancestor.visible)visible=false;ancestor=ancestor.parent;}if(!visible)continue;
      const solids=ray.intersectObjects([this.office,this.ground,this.cabin,...this.landings],true).filter(h=>{
        if(h.object===target.object||h.distance>=target.distance-.13*S)return false;
        let a:THREE.Object3D|null=h.object;while(a){if(!a.visible)return false;a=a.parent;}
        return h.object instanceof THREE.Mesh && !(Array.isArray(h.object.material)?h.object.material.some(m=>!m.visible):!h.object.material.visible);
      });
      if(solids.length)continue;
      return Boolean(target.object.userData.buildingAction());
    }
    return false;
  }
  private setFloor(floor:Floor){
    this.floor=floor;
    this.explorer.setNavigation(this.navs[floor]);
    this.scene.background=new THREE.Color(floor===0?'#bdcdd5':'#d8d8d5');this.scene.fog=new THREE.Fog(floor===0?'#bdcdd5':'#d8d8d5',floor===0?350:260,floor===0?650:420);this.camera.far=750;this.camera.updateProjectionMatrix();
  }
  private updateFloorVisibility(){
    // The exported room slabs extend across the shaft. A passenger travels in
    // the opaque, closed cabin; keep stationary floors, ceilings and landing
    // doors out of it until arrival. Unattended calls leave the player's room visible.
    const inTransit=this.riding&&this.lift.phase==='travelling';
    this.office.visible=this.workstation.visible=!inTransit&&this.floor===1;
    this.ground.visible=!inTransit&&this.floor===0;
    this.landings[0].visible=!inTransit&&this.floor===0;
    this.landings[1].visible=!inTransit&&this.floor===1;
  }
  step(dt:number){
    const before=this.lift.phase,oldFloor=this.lift.floor;
    this.lift.step(dt,this.beam());
    if(before!=='travelling'&&this.lift.phase==='travelling')this.riding=this.inside();
    if(oldFloor!==this.lift.floor){if(this.riding)this.setFloor(this.lift.floor);this.audio.liftChime();}
    const offset=-(1-this.lift.level)*DROP;this.cabin.position.y=offset;
    if(this.riding){this.explorer.floorHeight=UP+offset;this.camera.position.y=UP+offset+this.explorer.nav.eyeHeight;
      if(this.lift.phase!=='travelling'){this.riding=false;this.explorer.floorHeight=undefined;}
    }
    this.updateFloorVisibility();
    const opening=this.lift.door,smoothed=opening*opening*(3-2*opening);
    for(let i=0;i<2;i++){
      this.cabinDoors[i].position.x=(i===0?-1:1)*.85*S*smoothed;
      for(const f of [0,1] as const)this.landingDoors[f][i].position.x=(i===0?-1:1)*.85*S*(this.lift.floor===f&&this.lift.phase!=='travelling'?smoothed:0);
    }
    const gap=this.lift.floor===this.floor&&this.lift.phase!=='travelling'?smoothed*.85:0;
    const collisions=[...this.baseColliders[this.floor],
      rect('Cabin left lining',-11.53,-11.34,4,6.2),rect('Cabin right lining',-9.23,-9.04,4,6.2),rect('Cabin back lining',-11.53,-9.04,4,4.22),
      rect('Lift left door',X-1.74,X-gap,6.04,6.29),rect('Lift right door',X+gap,X+1.74,6.04,6.29)];
    if(this.floor===0){
      const p=this.camera.position,near=Math.abs(p.x/S-X)<2.1&&Math.abs(-p.z/S-FRONT)<2.6;
      if(near)this.entranceHold=2;else this.entranceHold=Math.max(0,this.entranceHold-dt);
      const target=this.entranceHold>0?1:0;this.entranceOpen=advanceEntryDoors(this.entranceOpen,target,dt,{x:p.x,z:p.z,radius:this.explorer.nav.playerRadius});
      for(let i=0;i<2;i++){
        const side=i===0?-1:1,angle=-side*this.entranceOpen*Math.PI*.49;this.entrance[i].rotation.y=angle;
      }
      collisions.push(...entryDoorColliders(this.entranceOpen));
    }
    this.navs[this.floor].colliders=collisions;
    const screen=this.lift.phase==='travelling'?(this.lift.destination===0?'↓  G':'↑  2'):(this.lift.floor===0?'G':'2');
    if(screen!==this.screenText){this.screenText=screen;for(const d of this.displays){const ctx=d.canvas.getContext('2d')!;ctx.fillStyle='#111b18';ctx.fillRect(0,0,384,128);ctx.fillStyle='#f4ca80';ctx.font='82px monospace';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(screen,192,68);d.texture.needsUpdate=true;}}
  }
  stats(){return {floor:this.floor===1?'office':'ground',riding:this.riding,phase:this.lift.phase,door:this.lift.door,level:this.lift.level,destination:this.lift.destination,trips:this.lift.trips,entranceOpen:this.entranceOpen,
    visibleFloor:this.office.visible?'office':this.ground.visible?'ground':null,cabinFloorHeight:UP+this.cabin.position.y};}
  targets(){this.scene.updateMatrixWorld(true);return this.actions.filter(a=>a.userData.available()).map(a=>{
    const world=a.getWorldPosition(new THREE.Vector3()),v=world.clone().project(this.camera);
    return {label:a.userData.actionLabel,x:(v.x*.5+.5)*innerWidth,y:(-.5*v.y+.5)*innerHeight,distance:this.camera.position.distanceTo(world)/S,visible:v.z<1&&v.z>-1};
  });}
}
