(function(root){
 const core=()=>root.PlanCore||(typeof require==='function'?require('./core.js'):null);
 const kind=f=>f.photoRecipe?.kind||f.recipe?.kind||f.type||'';
 function isMounted(f){return f.photoRecipe?.mounting==='wall'||f.recipe?.mounting==='wall'||/^art_/.test(f.type||'')||/^art_/.test(kind(f))||['tv','wall_cubby_shelf'].includes(kind(f))||f.type==='tv';}
 function defaultElevation(f){return kind(f)==='tv'||f.type==='tv'?1000:1350;}
 const height=f=>f.h||((kind(f)==='tv'||f.type==='tv')?f.w*.5625:800);
 const frame=w=>core().frame(w),point=(w,t,n)=>core().point(w,t,n),norm=a=>(a%360+360)%360;
 function intervals(s,w,f,bottom){
  const half=f.w/2,edge=w.thickness/2+3,l=core().length(w);let spans=[[half+edge,l-half-edge]];if(spans[0][1]<spans[0][0])return [];
  const holes=[...s.structure.openings.filter(o=>o.wallId===w.id).map(o=>({a:o.offset,b:o.offset+o.width,bottom:o.sill,top:o.sill+o.height})),...(s.structure.wallRegions||[]).filter(r=>r.wallId===w.id&&r.mode!=='finish').map(r=>({a:r.offset,b:r.offset+r.width,bottom:r.bottom,top:r.bottom+r.height}))];
  for(const h of holes){if(bottom>=h.top||bottom+height(f)<=h.bottom)continue;const a=h.a-half-3,b=h.b+half+3;spans=spans.flatMap(([lo,hi])=>b<=lo||a>=hi?[[lo,hi]]:[[lo,Math.min(hi,a)],[Math.max(lo,b),hi]].filter(([x,y])=>y>=x));}return spans;
 }
 function placement(s,f,p=[f.cx,f.cy],preferred=null){
  if(!isMounted(f))return null;const C=core(),bottom=Number.isFinite(f.elevation)&&(f.elevation>0||f.wallAttachment)?f.elevation:defaultElevation(f);let best=null;
  for(const [index,w]of s.structure.walls.entries()){
   if((s.demolished||[]).includes('w'+index)||(s.demolished||[]).includes(w.id)||bottom+height(f)>w.height+.01)continue;
   const a=frame(w),n=-(p[0]-w.a[0])*a.uy+(p[1]-w.a[1])*a.ux,desired=(p[0]-w.a[0])*a.ux+(p[1]-w.a[1])*a.uy;
   let side=Math.sign(n)||f.wallAttachment?.side||1;
   if(Math.abs(n)<.001){const t=C.project(w,p),roomSide=[1,-1].find(v=>s.structure.rooms.some(r=>C.inside(point(w,t,v*(w.thickness/2+150)),r.poly)));side=roomSide||side;}
   if(preferred?.wallId===w.id)side=preferred.side;
   for(const [lo,hi]of intervals(s,w,f,bottom)){
    const t=Math.max(lo,Math.min(hi,preferred?.wallId===w.id?preferred.offset:desired)),q=point(w,t,side*(w.thickness/2+f.d/2+2)),distance=Math.hypot(q[0]-p[0],q[1]-p[1]);
    const score=distance+(preferred&&preferred.wallId!==w.id?1e8:0);
    if(!best||score<best.score)best={cx:q[0],cy:q[1],rot:norm(Math.atan2(a.uy,a.ux)*180/Math.PI+(side===-1?180:0)),elevation:bottom,wallAttachment:{wallId:w.id,side,offset:t},score};
   }
  }return best;
 }
 function attach(s,f,p,preferred){const next=placement(s,f,p,preferred);if(!next)throw Error('没有可安装的完整墙面，请调整家具尺寸、离地高度或墙体。');const {score,...values}=next;Object.assign(f,{h:height(f)},values);return f;}
 function baseline(s){return {structure:s.structure,demolished:s.demolished,furniture:s.furniture.map(f=>({...f,wallAttachment:f.wallAttachment&&{...f.wallAttachment}}))};}
 function reconcile(s,before){const old=new Map(before.furniture.map(f=>[f.id,f]));for(const f of s.furniture){if(!isMounted(f))continue;const prior=old.get(f.id),moved=!prior||['cx','cy','rot','w','d','h','elevation'].some(k=>f[k]!==prior[k]);if(moved)attach(s,f);else if(f.wallAttachment)attach(s,f,[f.cx,f.cy],f.wallAttachment);}}
 root.WallMountedCore={isMounted,placement,attach,reconcile,baseline,intervals};if(typeof module!=='undefined')module.exports=root.WallMountedCore;
})(globalThis);
