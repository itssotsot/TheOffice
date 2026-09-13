/** A two-stop passenger lift. Door interlocks are independent of rendering/frame rate. */
export type Floor=0|1;
export type LiftPhase='closed'|'opening'|'open'|'closing'|'travelling';
export class Elevator {
  floor:Floor=1;
  destination:Floor=1;
  phase:LiftPhase='closed';
  door=0;
  level=1;
  private elapsed=0;
  private startLevel=1;
  private pending:Floor|null=null;
  trips=0;
  request(floor:Floor){
    if(this.phase==='travelling')return false;
    this.destination=floor;
    if(floor===this.floor){this.pending=null;this.phase='opening';this.elapsed=0;}
    else {this.pending=floor;this.phase='closing';this.elapsed=0;}
    return true;
  }
  open(){if(this.phase==='travelling')return false;this.pending=null;this.phase='opening';this.elapsed=0;return true;}
  step(seconds:number,doorwayOccupied:boolean){
    let remaining=Math.max(0,Math.min(seconds,1));
    // Fixed small slices make interlocks safe on a slow browser frame.
    while(remaining>0){const dt=Math.min(remaining,1/60);remaining-=dt;
      if(this.phase==='opening'){
        this.door=Math.min(1,this.door+dt/1.35);
        if(this.door===1){this.phase='open';this.elapsed=0;}
      }else if(this.phase==='open'){
        this.elapsed=doorwayOccupied?0:this.elapsed+dt;
        if(this.elapsed>8){this.phase='closing';this.elapsed=0;}
      }else if(this.phase==='closing'){
        if(doorwayOccupied){this.phase='opening';this.elapsed=0;continue;}
        this.door=Math.max(0,this.door-dt/1.65);
        if(this.door===0){
          if(this.pending!==null&&this.pending!==this.floor){this.destination=this.pending;this.pending=null;this.startLevel=this.level;this.phase='travelling';this.elapsed=0;}
          else this.phase='closed';
        }
      }else if(this.phase==='travelling'){
        this.elapsed+=dt;const t=Math.min(1,this.elapsed/4.8),smooth=t*t*t*(t*(t*6-15)+10);
        this.level=this.startLevel+(this.destination-this.startLevel)*smooth;
        if(t===1){this.floor=this.destination;this.level=this.floor;this.trips++;this.phase='opening';this.elapsed=0;}
      }
    }
  }
}
