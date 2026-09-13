export type Rect = {minX:number;maxX:number;minZ:number;maxZ:number;name?:string};
export type Landmark = {id:string;name:string;position:[number,number,number];yaw:number;area:Rect};
export type OfficeNavigation = {
  unitsPerMeter:number;ground:number;eyeHeight:number;playerRadius:number;bounds:Rect;
  colliders:Rect[];landmarks:Landmark[];spawn:string;
  deskReturn:{position:[number,number,number];yaw:number};
  deskInteraction:{x:number;z:number;radius:number};
  workstation?:{position:[number,number,number];rotation:number;scale?:number;deskHalfDepth?:number};
};

export function overlaps(x:number,z:number,radius:number,box:Rect){
  const cx=Math.max(box.minX,Math.min(x,box.maxX));
  const cz=Math.max(box.minZ,Math.min(z,box.maxZ));
  return (x-cx)**2+(z-cz)**2 < radius**2-1e-7;
}
export function isWalkable(x:number,z:number,nav:OfficeNavigation){
  const r=nav.playerRadius,b=nav.bounds;
  return x>=b.minX+r&&x<=b.maxX-r&&z>=b.minZ+r&&z<=b.maxZ-r&&!nav.colliders.some(c=>overlaps(x,z,r,c));
}
/** Moving geometry can invalidate a previously clear position. Resolve that overlap
 * before sweeping movement; otherwise every small step is rejected indefinitely. */
export function recoverStandingPosition(x:number,z:number,nav:OfficeNavigation){
  if(isWalkable(x,z,nav))return {x,z};
  const r=nav.playerRadius,epsilon=nav.unitsPerMeter*.001,b=nav.bounds;
  const start={x,z};
  const clamp=()=>{x=Math.max(b.minX+r,Math.min(x,b.maxX-r));z=Math.max(b.minZ+r,Math.min(z,b.maxZ-r));};
  clamp();
  for(let iteration=0;iteration<16;iteration++){
    let correction:{dx:number;dz:number;depth:number}|undefined;
    for(const box of nav.colliders){
      if(!overlaps(x,z,r,box))continue;
      const cx=Math.max(box.minX,Math.min(x,box.maxX)),cz=Math.max(box.minZ,Math.min(z,box.maxZ));
      const dx=x-cx,dz=z-cz,distance=Math.hypot(dx,dz);
      let push:{dx:number;dz:number;depth:number};
      if(distance>1e-8){
        const depth=r+epsilon-distance;push={dx:dx/distance*depth,dz:dz/distance*depth,depth};
      }else{
        const sides=[{dx:box.minX-r-epsilon-x,dz:0},{dx:box.maxX+r+epsilon-x,dz:0},
          {dx:0,dz:box.minZ-r-epsilon-z},{dx:0,dz:box.maxZ+r+epsilon-z}];
        const shortest=sides.reduce((a,v)=>Math.hypot(v.dx,v.dz)<Math.hypot(a.dx,a.dz)?v:a);
        push={...shortest,depth:Math.hypot(shortest.dx,shortest.dz)};
      }
      if(!correction||push.depth>correction.depth)correction=push;
    }
    if(!correction)return {x,z};
    x+=correction.dx;z+=correction.dz;clamp();
    if(isWalkable(x,z,nav))return {x,z};
  }
  // Adjacent leaves or intersecting corners can alternate projections. Check local
  // expanded corners, never a distant spawn point or a position across the room.
  const candidates:{x:number;z:number}[]=[];
  for(const box of nav.colliders){
    if(!overlaps(start.x,start.z,r*3,box))continue;
    for(const xx of [box.minX-r-epsilon,box.maxX+r+epsilon,start.x])
      for(const zz of [box.minZ-r-epsilon,box.maxZ+r+epsilon,start.z])
        if(Math.hypot(xx-start.x,zz-start.z)<=r*3&&isWalkable(xx,zz,nav))candidates.push({x:xx,z:zz});
  }
  candidates.sort((a,v)=>Math.hypot(a.x-start.x,a.z-start.z)-Math.hypot(v.x-start.x,v.z-start.z));
  return candidates[0]??start;
}
/** Small swept steps prevent tunneling; axis separation lets players slide along walls. */
export function walkStep(x:number,z:number,dx:number,dz:number,nav:OfficeNavigation){
  ({x,z}=recoverStandingPosition(x,z,nav));
  const count=Math.max(1,Math.ceil(Math.hypot(dx,dz)/(nav.playerRadius*.4)));
  const sx=dx/count,sz=dz/count;
  for(let i=0;i<count;i++){
    if(isWalkable(x+sx,z+sz,nav)){x+=sx;z+=sz;continue;}
    if(isWalkable(x+sx,z,nav))x+=sx;
    if(isWalkable(x,z+sz,nav))z+=sz;
  }
  return {x,z};
}
export function areaAt(x:number,z:number,nav:OfficeNavigation){
  return nav.landmarks.find(l=>x>=l.area.minX&&x<=l.area.maxX&&z>=l.area.minZ&&z<=l.area.maxZ)?.name??'Scranton branch';
}
