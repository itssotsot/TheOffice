import type { JellyShape } from './physics';
export interface ItemSpec {
  id:string; name:string; subtitle:string; flavor:string; note:string; color:string; shape:JellyShape;
  size:[number,number,number]; position:[number,number]; rotation:number; scale:number; firmness:number;
}
export const ITEMS:ItemSpec[] = [
  {id:'stapler',name:'The classic',subtitle:'One very unavailable stapler.',flavor:'Lemon',note:'A workplace tradition. Now with extra wobble.',color:'#ecae25',shape:'fluted',size:[2.45,1.08,1.8],position:[-4.7,1.1],rotation:-.12,scale:1.02,firmness:1.05},
  {id:'monitor',name:'Out of office',subtitle:'Your spreadsheet has become a soft skill.',flavor:'Pineapple',note:'Productivity is suspended until further notice.',color:'#e6b34b',shape:'cushion',size:[4.3,3.55,2.10],position:[.25,-2.3],rotation:0,scale:1,firmness:1.3},
  {id:'keyboard',name:'Sticky keys',subtitle:'Please do not submit a support ticket.',flavor:'Vanilla lemon',note:'Every shortcut leads to gelatin.',color:'#e2c966',shape:'loaf',size:[5.0,1.15,2.25],position:[-.10,.65],rotation:0,scale:1,firmness:.85},
  {id:'mouse',name:'Point & jiggle',subtitle:'A slight delay in workplace efficiency.',flavor:'Blue raspberry',note:'Click. Lift. Give it a little shake.',color:'#72aec8',shape:'dome',size:[1.48,.95,1.68],position:[3.35,.75],rotation:-.09,scale:1,firmness:.8},
  {id:'pc-tower',name:'System jelly',subtitle:'Have you tried turning it upside down?',flavor:'Blueberry',note:'All your files are safely suspended.',color:'#75a5d5',shape:'loaf',size:[1.95,3.65,2.45],position:[5.1,-2.3],rotation:-.06,scale:1,firmness:1.45},
  {id:'telephone',name:'On hold',subtitle:'Your call is very important to us.',flavor:'Lime',note:'Please enjoy this gelatin while you wait.',color:'#93be62',shape:'cushion',size:[2.50,1.25,2.35],position:[-4.8,-2.25],rotation:.08,scale:.94,firmness:.82},
  {id:'mug',name:'Coffee break',subtitle:'World’s Best Assistant Regional Manager.',flavor:'Grape',note:'World’s Best Assistant Regional Manager.',color:'#ad8cc6',shape:'pudding',size:[1.92,1.4,1.86],position:[5.55,1.40],rotation:.14,scale:1.1,firmness:1.12},
];
