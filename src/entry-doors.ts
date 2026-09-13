import {overlaps,type Rect} from './navigation';
const S=7.2,X=-10.285,FRONT=13.6;
/** Short collision segments follow the same hinges and angle as the exported glass leaves. */
export function entryDoorColliders(open:number):Rect[]{
  const colliders:Rect[]=[];
  for(const side of [-1,1]){
    const angle=-side*open*Math.PI*.49,hx=X+side*.95;
    for(let n=0;n<8;n++){
      const t=(n+.5)/8,px=hx-side*.95*t*Math.cos(angle),py=FRONT-side*.95*t*Math.sin(angle);
      colliders.push({name:'Moving glass door',minX:(px-.072)*S,maxX:(px+.072)*S,minZ:-(py+.065)*S,maxZ:-(py-.065)*S});
    }
  }
  return colliders;
}
/** Stop either leaf before its swept arc reaches the person, including on slow frames. */
export function advanceEntryDoors(current:number,target:number,dt:number,person:{x:number;z:number;radius:number}){
  const next=target+(current-target)*Math.exp(-3.5*Math.max(0,dt));
  const steps=Math.max(1,Math.ceil(Math.abs(next-current)*.95*Math.PI*.49/.02));
  let clear=current;
  for(let n=1;n<=steps;n++){
    const candidate=current+(next-current)*n/steps;
    if(entryDoorColliders(candidate).some(c=>overlaps(person.x,person.z,person.radius+.035*S,c)))break;
    clear=candidate;
  }
  return clear;
}
