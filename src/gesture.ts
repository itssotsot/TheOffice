import type {Vec3} from './physics';

/** Recent pointer travel, in world units and seconds. Never measures spring/body lag. */
export class GestureVelocity {
  private samples:{time:number;point:Vec3}[]=[];
  private lastMovement=-Infinity;
  private flick:Vec3=[0,0,0];
  reset(point:Vec3,time:number){this.samples=[{point:[...point],time}];this.lastMovement=-Infinity;this.flick=[0,0,0];}
  add(point:Vec3,time:number){
    const last=this.samples.at(-1);
    if(last&&time<=last.time+.0001){last.point=[...point];return;}
    this.samples.push({point:[...point],time});
    while(this.samples.length>2&&this.samples[1].time<time-.10)this.samples.shift();
    if(last&&Math.hypot(...point.map((v,i)=>v-last.point[i]))>.0001){
      this.lastMovement=time;this.flick=this.velocity(time);
    }
  }
  releaseVelocity(time:number):Vec3 {
    // A hand naturally stops briefly as its button rises. Keep the recent flick
    // through that transition, but allow a deliberate pause to become a drop.
    const age=Math.max(0,time-this.lastMovement);
    const retain=age<=.14?1:Math.max(0,1-(age-.14)/.20);
    return this.flick.map(v=>v*retain) as Vec3;
  }
  velocity(time:number):Vec3 {
    const last=this.samples.at(-1);if(!last||time-last.time>=.10)return [0,0,0];
    // A stationary endpoint makes a pause before release lose its throwing momentum.
    const samples=time-last.time>.006?[...this.samples,{time,point:last.point}]:this.samples;
    let weight=0;const velocity:Vec3=[0,0,0];
    for(let i=1;i<samples.length;i++){
      const a=samples[i-1],b=samples[i],dt=b.time-a.time;if(dt<.001||time-b.time>.08)continue;
      const w=Math.min(dt,.025)*Math.exp(-(time-(a.time+b.time)/2)/.018);
      weight+=w;for(let axis=0;axis<3;axis++)velocity[axis]+=(b.point[axis]-a.point[axis])/dt*w;
    }
    if(weight>0)for(let axis=0;axis<3;axis++)velocity[axis]/=weight;
    const speed=Math.hypot(...velocity);if(speed>24)for(let axis=0;axis<3;axis++)velocity[axis]*=24/speed;
    return velocity;
  }
}
