/** Fixed-step XPBD tetrahedral soft body. Surface vertices embed in the solid cage. */
export type JellyShape = 'fluted' | 'cushion' | 'loaf' | 'dome' | 'pudding';
export type Vec3 = [number, number, number];
export interface BodyOptions { width: number; height: number; depth: number; shape: JellyShape; firmness: number }
export interface Binding { ids: number[]; weights: number[] }
const N = 4;
const idx = (x: number, y: number, z: number) => x + (N + 1) * (y + (N + 1) * z);
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** A single continuous mapping is shared by the solid and its render surface. */
export function mold(u: number, v: number, w: number, o: BodyOptions): Vec3 {
  const rounding = o.shape === 'cushion' || o.shape === 'loaf' ? .38 : 1;
  let x = u * (1 - rounding + rounding * Math.sqrt(1 - w * w * .5));
  let z = w * (1 - rounding + rounding * Math.sqrt(1 - u * u * .5));
  const edgeRound = .88 + .12 * Math.pow(Math.max(0, Math.sin(v * Math.PI)), .5);
  const taper = o.shape === 'dome' ? 1 - .20 * v * v : o.shape === 'pudding' ? 1 - .20 * v : o.shape === 'loaf' ? 1 - .08 * v : 1 - .10 * v;
  const angle = Math.atan2(z, x);
  const flutes = o.shape === 'fluted' ? 1 + .045 * Math.cos(angle * 14) * Math.pow(Math.max(Math.abs(u), Math.abs(w)), 2) : o.shape === 'pudding' ? 1 + .025 * Math.cos(angle * 12) : 1;
  x *= edgeRound * taper * flutes; z *= edgeRound * taper * flutes;
  return [x * o.width / 2, v * o.height, z * o.depth / 2];
}

export class SoftBody {
  readonly rest: Float64Array;
  readonly positions: Float64Array;
  readonly velocity: Float64Array;
  private previous: Float64Array;
  private inverseMass: Float64Array;
  private edges: { a: number; b: number; length: number; lambda: number }[] = [];
  private tets: { ids: number[]; volume: number; lambda: number }[] = [];
  grab: { binding: Binding; target: Vec3 } | null = null;
  firmness: number;
  energy = 0;
  constructor(readonly options: BodyOptions) {
    this.firmness = options.firmness;
    const count = (N + 1) ** 3;
    this.rest = new Float64Array(count * 3);
    this.inverseMass = new Float64Array(count);
    for (let z = 0; z <= N; z++) for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
      const i = idx(x,y,z); this.rest.set(mold(x/N*2-1,y/N,z/N*2-1,options), i*3);
      // Gelatin adheres to its contact patch; the rest of the body is free.
      this.inverseMass[i] = y === 0 ? 0 : 1;
    }
    this.positions = this.rest.slice(); this.previous = this.rest.slice(); this.velocity = new Float64Array(count*3);
    const edgeKeys = new Set<string>();
    for(let z=0;z<N;z++) for(let y=0;y<N;y++) for(let x=0;x<N;x++) {
      const c = [idx(x,y,z),idx(x+1,y,z),idx(x,y+1,z),idx(x+1,y+1,z),idx(x,y,z+1),idx(x+1,y,z+1),idx(x,y+1,z+1),idx(x+1,y+1,z+1)];
      for(const order of [[0,1,3,7],[0,3,2,7],[0,2,6,7],[0,6,4,7],[0,4,5,7],[0,5,1,7]]) {
        const ids = order.map(i=>c[i]);
        this.tets.push({ ids, volume: this.volume(ids,this.rest), lambda:0 });
        for(let a=0;a<4;a++) for(let b=a+1;b<4;b++) {
          const ia=Math.min(ids[a],ids[b]),ib=Math.max(ids[a],ids[b]),key=`${ia}:${ib}`;
          if(edgeKeys.has(key))continue;edgeKeys.add(key);
          this.edges.push({a:ia,b:ib,length:Math.hypot(this.rest[ia*3]-this.rest[ib*3],this.rest[ia*3+1]-this.rest[ib*3+1],this.rest[ia*3+2]-this.rest[ib*3+2]),lambda:0});
        }
      }
    }
  }
  private volume(ids:number[],p:Float64Array) {
    const [a,b,c,d]=ids.map(i=>i*3);
    const bx=p[b]-p[a],by=p[b+1]-p[a+1],bz=p[b+2]-p[a+2];
    const cx=p[c]-p[a],cy=p[c+1]-p[a+1],cz=p[c+2]-p[a+2];
    const dx=p[d]-p[a],dy=p[d+1]-p[a+1],dz=p[d+2]-p[a+2];
    return (bx*(cy*dz-cz*dy)+by*(cz*dx-cx*dz)+bz*(cx*dy-cy*dx))/6;
  }
  bind(u:number,v:number,w:number):Binding {
    const x=clamp((u+1)/2*N,0,N-1e-7),y=clamp(v*N,0,N-1e-7),z=clamp((w+1)/2*N,0,N-1e-7);
    const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fx=x-ix,fy=y-iy,fz=z-iz;
    const ids:number[]=[],weights:number[]=[];
    for(let k=0;k<2;k++)for(let j=0;j<2;j++)for(let i=0;i<2;i++) {ids.push(idx(ix+i,iy+j,iz+k));weights.push((i?fx:1-fx)*(j?fy:1-fy)*(k?fz:1-fz));}
    return {ids,weights};
  }
  sample(b:Binding):Vec3 {
    let x=0,y=0,z=0;
    for(let k=0;k<b.ids.length;k++){const i=b.ids[k]*3,w=b.weights[k];x+=this.positions[i]*w;y+=this.positions[i+1]*w;z+=this.positions[i+2]*w;}
    return [x,y,z];
  }
  displacement(b:Binding):Vec3 {
    const result=this.sample(b);
    for(let k=0;k<b.ids.length;k++)for(let a=0;a<3;a++)result[a]-=this.rest[b.ids[k]*3+a]*b.weights[k];
    return result;
  }
  poke(point:Vec3,strength=1) {
    for(let i=0;i<this.inverseMass.length;i++) {
      if(!this.inverseMass[i])continue;const k=i*3;
      const distance=Math.hypot(this.positions[k]-point[0],this.positions[k+1]-point[1],this.positions[k+2]-point[2]);
      const influence=Math.exp(-distance*distance/ .55)*strength;
      this.velocity[k]+=(this.positions[k]-point[0])*.7*influence;
      this.velocity[k+1]-=3.8*influence;
      this.velocity[k+2]+=(this.positions[k+2]-point[2])*.7*influence;
    }
  }
  wobble(strength=1) {
    for(let i=0;i<this.inverseMass.length;i++)if(this.inverseMass[i]) {
      const h=this.rest[i*3+1]/this.options.height;
      this.velocity[i*3]+=2.5*h*strength;this.velocity[i*3+1]+=.45*h*strength;this.velocity[i*3+2]+=1.3*h*strength;
    }
  }
  kick(impulse:Vec3) {
    for(let i=0;i<this.inverseMass.length;i++)if(this.inverseMass[i]) {
      const weight=this.rest[i*3+1]/this.options.height;
      for(let axis=0;axis<3;axis++)this.velocity[i*3+axis]+=impulse[axis]*weight;
    }
  }
  landing(speed:number) {
    const force=Math.min(speed*.58,4.5);
    for(let i=0;i<this.inverseMass.length;i++)if(this.inverseMass[i]) {
      const weight=this.rest[i*3+1]/this.options.height;
      this.velocity[i*3]+=(this.rest[i*3]/this.options.width)*force*.5*weight;
      this.velocity[i*3+1]-=force*weight;
      this.velocity[i*3+2]+=(this.rest[i*3+2]/this.options.depth)*force*.5*weight;
    }
  }
  reset(){this.positions.set(this.rest);this.previous.set(this.rest);this.velocity.fill(0);this.grab=null;this.energy=0;}
  step(dt:number) {
    const p=this.positions,vel=this.velocity,m=this.inverseMass;
    this.previous.set(p);
    for(let i=0;i<m.length;i++)if(m[i]) {
      vel[i*3+1]-=1.4*dt;
      for(let a=0;a<3;a++){vel[i*3+a]*=Math.exp(-2.4*dt);p[i*3+a]+=vel[i*3+a]*dt;}
    }
    for(const e of this.edges)e.lambda=0;
    for(const t of this.tets)t.lambda=0;
    const alpha= .0028/(this.firmness*dt*dt), volumeAlpha=.000000025/(this.firmness*dt*dt);
    const g=new Float64Array(12);
    for(let iteration=0;iteration<5;iteration++) {
      for(const e of this.edges) {
        const a=e.a*3,b=e.b*3,dx=p[a]-p[b],dy=p[a+1]-p[b+1],dz=p[a+2]-p[b+2];
        const len=Math.hypot(dx,dy,dz);if(len<1e-9)continue;
        const dl=(-(len-e.length)-alpha*e.lambda)/(m[e.a]+m[e.b]+alpha);e.lambda+=dl;
        const wa=dl*m[e.a]/len,wb=dl*m[e.b]/len;
        p[a]+=dx*wa;p[a+1]+=dy*wa;p[a+2]+=dz*wa;p[b]-=dx*wb;p[b+1]-=dy*wb;p[b+2]-=dz*wb;
      }
      for(const t of this.tets) {
        const [a,b,c,d]=t.ids;const ai=a*3,bi=b*3,ci=c*3,di=d*3;
        const bx=p[bi]-p[ai],by=p[bi+1]-p[ai+1],bz=p[bi+2]-p[ai+2];
        const cx=p[ci]-p[ai],cy=p[ci+1]-p[ai+1],cz=p[ci+2]-p[ai+2];
        const dx=p[di]-p[ai],dy=p[di+1]-p[ai+1],dz=p[di+2]-p[ai+2];
        g[3]=(cy*dz-cz*dy)/6;g[4]=(cz*dx-cx*dz)/6;g[5]=(cx*dy-cy*dx)/6;
        g[6]=(dy*bz-dz*by)/6;g[7]=(dz*bx-dx*bz)/6;g[8]=(dx*by-dy*bx)/6;
        g[9]=(by*cz-bz*cy)/6;g[10]=(bz*cx-bx*cz)/6;g[11]=(bx*cy-by*cx)/6;
        for(let j=0;j<3;j++)g[j]=-g[3+j]-g[6+j]-g[9+j];
        const volume=bx*g[3]+by*g[4]+bz*g[5];let denom=volumeAlpha;
        for(let k=0;k<4;k++)denom+=m[t.ids[k]]*(g[k*3]**2+g[k*3+1]**2+g[k*3+2]**2);
        const dl=(-(volume-t.volume)-volumeAlpha*t.lambda)/denom;t.lambda+=dl;
        for(let k=0;k<4;k++)for(let j=0;j<3;j++)p[t.ids[k]*3+j]+=m[t.ids[k]]*g[k*3+j]*dl;
      }
      if(this.grab) {
        const {binding,target}=this.grab;const current=this.sample(binding);let denom=.000001/(dt*dt);
        for(let k=0;k<binding.ids.length;k++)denom+=m[binding.ids[k]]*binding.weights[k]**2;
        for(let k=0;k<binding.ids.length;k++)for(let a=0;a<3;a++)p[binding.ids[k]*3+a]+=(target[a]-current[a])*binding.weights[k]*m[binding.ids[k]]/denom;
      }
      for(let i=0;i<m.length;i++)if(p[i*3+1]<0)p[i*3+1]=0;
    }
    let energy=0;
    for(let i=0;i<p.length;i++){vel[i]=(p[i]-this.previous[i])/dt;energy+=vel[i]*vel[i];}
    this.energy=Math.sqrt(energy/m.length);
  }
  stats(){
    const restVolume=this.tets.reduce((s,t)=>s+Math.abs(t.volume),0);
    const currentVolume=this.tets.reduce((s,t)=>s+Math.abs(this.volume(t.ids,this.positions)),0);
    return {nodes:this.inverseMass.length,tetrahedra:this.tets.length,volumeRatio:currentVolume/restVolume,energy:this.energy,finite:this.positions.every(Number.isFinite),inverted:this.tets.filter(t=>this.volume(t.ids,this.positions)*t.volume<0).length};
  }
}
