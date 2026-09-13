export class JellyAudio {
  enabled=true;
  private volume=1;
  private master:GainNode|null=null;
  setVolume(value:number){this.volume=Math.max(0,Math.min(1,value));if(this.context&&this.master)this.master.gain.setTargetAtTime(this.volume,this.context.currentTime,.015);}
  private context:AudioContext|null=null;
  toggle(){this.enabled=!this.enabled;if(this.enabled){this.context??=new AudioContext();void this.context.resume();this.plop(.45);}return this.enabled;}
  liftChime(button=false){
    if(!this.enabled||this.volume===0)return;this.context??=new AudioContext();const c=this.context;if(c.state==='suspended')void c.resume();
    if(!this.master){this.master=c.createGain();this.master.gain.value=this.volume;this.master.connect(c.destination);}
    for(let i=0;i<(button?1:2);i++){const t=c.currentTime+i*.23,o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=button?740:(i?523:659);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(button?.035:.10,t+.008);g.gain.exponentialRampToValueAtTime(.001,t+(button?.14:.65));o.connect(g);g.connect(this.master);o.start(t);o.stop(t+.7);}
  }
  plop(strength=1,pitch=1){
    if(!this.enabled||this.volume===0)return;this.context??=new AudioContext();const c=this.context;if(c.state==='suspended')void c.resume();
    if(!this.master){this.master=c.createGain();this.master.gain.value=this.volume;this.master.connect(c.destination);}
    const t=c.currentTime,osc=c.createOscillator(),gain=c.createGain(),filter=c.createBiquadFilter();
    osc.type='sine';osc.frequency.setValueAtTime((260+strength*60)*pitch,t);osc.frequency.exponentialRampToValueAtTime(58*pitch,t+.16);osc.frequency.exponentialRampToValueAtTime(85*pitch,t+.28);
    gain.gain.setValueAtTime(0,t);gain.gain.linearRampToValueAtTime(.12*Math.min(1.4,strength),t+.012);gain.gain.exponentialRampToValueAtTime(.001,t+.36);
    filter.type='lowpass';filter.frequency.value=1100;osc.connect(filter);filter.connect(gain);gain.connect(this.master);osc.start(t);osc.stop(t+.38);
    const echo=c.createOscillator(),eg=c.createGain();echo.frequency.setValueAtTime(130*pitch,t+.13);echo.frequency.exponentialRampToValueAtTime(65*pitch,t+.44);eg.gain.setValueAtTime(0,t);eg.gain.setValueAtTime(.035*strength,t+.14);eg.gain.exponentialRampToValueAtTime(.001,t+.49);echo.connect(eg);eg.connect(this.master);echo.start(t+.13);echo.stop(t+.50);
  }
}
