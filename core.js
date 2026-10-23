/* Plan schema v2. All dimensions are mm; all structure is editable data. */
(function(root){
  const floorMaterials={
    wood:{name:'蜜色橡木',family:'wood',price:320,sw:'#cdb18a',size:[1800,360],roughness:.65},
    whiteoak:{name:'白橡木',family:'wood',price:340,sw:'#dfd8bb',size:[1800,360],roughness:.7},
    walnut:{name:'胡桃木',family:'wood',price:380,sw:'#98704e',size:[1800,360],roughness:.65},
    smokedoak:{name:'烟熏橡木',family:'wood',price:390,sw:'#776047',size:[1800,360],roughness:.72},
    blackash:{name:'黑梣木',family:'wood',price:420,sw:'#474741',size:[1800,360],roughness:.75},
    tile800:{name:'800 地砖',family:'stone',price:220,sw:'#e1ddd3',size:[800,800],roughness:.3},
    tile600:{name:'600 地砖',family:'stone',price:160,sw:'#dddeda',size:[600,600],roughness:.35},
    marble:{name:'大理石',family:'stone',price:650,sw:'#e9e5dd',size:[1200,1200],roughness:.25},
    antislip:{name:'300 防滑砖',family:'stone',price:140,sw:'#d5d8d2',size:[300,300],roughness:.8},
    terrazzo:{name:'水磨石',family:'stone',price:280,sw:'#e2ddd3',size:[800,800],roughness:.5},
    acgmarblewhite:{name:'云纹白大理石',family:'stone',price:650,sw:'#dddeda',size:[1200,600],roughness:.3,source:'Marble012'},
    acgmarbledark:{name:'墨灰大理石',family:'stone',price:680,sw:'#555552',size:[1200,600],roughness:.35,source:'Marble006'},
    acgtravertine:{name:'米白洞石',family:'stone',price:460,sw:'#d5cbbb',size:[1200,600],roughness:.65,source:'Travertine009'},
    acgtravertinegray:{name:'灰褐洞石',family:'stone',price:480,sw:'#b1a99d',size:[1200,600],roughness:.7,source:'Travertine004'},
    acggranitewarm:{name:'暖砂花岗岩',family:'stone',price:320,sw:'#b7a89a',size:[600,600],roughness:.55,source:'Granite001A'},
    acggranitegray:{name:'灰粒花岗岩',family:'stone',price:340,sw:'#b8b8b3',size:[600,600],roughness:.55,source:'Granite002B'},
    acgterrazzo:{name:'彩粒水磨石',family:'stone',price:290,sw:'#d6d0c3',size:[800,800],roughness:.55,source:'Terrazzo013'},
    acgconcrete:{name:'细腻混凝土',family:'stone',price:240,sw:'#b4b4ad',size:[1100,550],roughness:.9,source:'Concrete034',layout:{pattern:'seamless',jointMm:0}},
    acgplaster:{name:'白色灰泥',family:'wall',price:90,sw:'#e7e4da',size:[2000,2000],roughness:1,source:'Plaster001',layout:{pattern:'seamless',jointMm:0}},
    acgpaintplaster:{name:'细纹涂料墙',family:'wall',price:100,sw:'#e4e2dc',size:[2000,2000],roughness:.95,source:'PaintedPlaster017',layout:{pattern:'seamless',jointMm:0}},
    carpet:{name:'羊毛地毯',family:'fabric',price:200,sw:'#d2cbbd',size:[500,500],roughness:1}
  };
  const id = prefix => prefix+'-'+(globalThis.crypto?.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2));
  const clone = x => JSON.parse(JSON.stringify(x));
  const bearingType=w=>w.bearing!=='unknown'?w.bearing:(w.bearingHint||'unknown');
  const isLocked=w=>!!w&&bearingType(w)==='bearing';
  function regionOnWall(s,r,w){const owner=s.structure.walls.find(v=>v.id===r.wallId);if(!owner)return null;const a=frame(owner),b=frame(w);if(Math.abs(a.ux*b.uy-a.uy*b.ux)>1e-5||Math.abs((owner.a[0]-w.a[0])*-b.uy+(owner.a[1]-w.a[1])*b.ux)>.01||Math.abs(owner.thickness-w.thickness)>.01)return null;const x=project(w,point(owner,r.offset)),y=project(w,point(owner,r.offset+r.width));if(Math.min(Math.max(x,y),b.l)-Math.max(Math.min(x,y),0)<=.1)return null;return {...r,offset:Math.min(x,y),width:Math.abs(x-y),side:r.side*(a.ux*b.ux+a.uy*b.uy>=0?1:-1)};}
  function assertLockedEdits(before,after){
    for(const w of before.structure.walls.filter(isLocked)){
      const next=after.structure.walls.find(x=>x.id===w.id),index=before.structure.walls.indexOf(w);
      if(!next||JSON.stringify([w.a,w.b,w.thickness,w.height])!==JSON.stringify([next.a,next.b,next.thickness,next.height])||after.demolished.includes('w'+index)&&!before.demolished.includes('w'+index))throw Error('承重墙已锁定，不能移动、改尺寸或拆除。误判时请先单独校正承重属性。');
      const openings=s=>s.structure.openings.filter(o=>o.wallId===w.id).map(o=>[o.id,o.wallId,o.type,o.offset,o.width,o.height,o.sill,o.style,o.hinge,o.swing]);
      if(JSON.stringify(openings(before))!==JSON.stringify(openings(after)))throw Error('承重墙上的洞口已锁定；请先核对墙体属性。');
      const regions=s=>(s.structure.wallRegions||[]).filter(r=>r.mode!=='finish'&&regionOnWall(s,r,w));if(JSON.stringify(regions(before))!==JSON.stringify(regions(after)))throw Error('承重墙上的挖空和替换区域已锁定；仅可修改饰面。');
    }
  }
  function blank(){return {version:2,title:'我的家',structure:{walls:[],openings:[],columns:[],rooms:[],height:2800},rooms:{},furniture:[],assets:{},catalogue:[],demolished:[],measures:[],source:null,calibration:{confirmed:false,method:'estimate'},workflow:'structure',recognition:{method:'manual',message:'上传户型图片，或从空白画布开始描绘。'}};}
  const length=w=>Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]);
  function frame(w){const l=length(w);return {l,ux:(w.b[0]-w.a[0])/l,uy:(w.b[1]-w.a[1])/l};}
  // Screen-space hysteresis keeps endpoint resizing steady at every zoom level.
  function dragWallEnd(w,index,delta,screenScale,locked=true,forceLock=false){
    const f=frame(w),end=index===0?w.a:w.b;
    const along=delta[0]*f.ux+delta[1]*f.uy;
    const sideways=Math.abs(-delta[0]*f.uy+delta[1]*f.ux)*screenScale;
    const nextLocked=forceLock||sideways<=(locked?24:12);
    return {locked:nextLocked,point:nextLocked?[end[0]+along*f.ux,end[1]+along*f.uy]:[end[0]+delta[0],end[1]+delta[1]]};
  }
  // Drawing starts orthogonally; Alt deliberately enables an arbitrary angle.
  function drawWallEnd(anchor,cursor,freeAngle=false,forceLock=false){
    const q=cursor.map(v=>Math.round(v/10)*10),locked=!freeAngle||forceLock;
    if(locked){if(Math.abs(q[0]-anchor[0])>=Math.abs(q[1]-anchor[1]))q[1]=anchor[1];else q[0]=anchor[0];}
    return {point:q,locked};
  }
  function point(w,t,n=0){const f=frame(w);return [w.a[0]+f.ux*t-f.uy*n,w.a[1]+f.uy*t+f.ux*n];}
  function polygon(w){const l=length(w),t=w.thickness/2;return [point(w,0,-t),point(w,l,-t),point(w,l,t),point(w,0,t)];}
  const cross2=(a,b)=>a[0]*b[1]-a[1]*b[0];
  function lineCross(a,u,b,v){const den=cross2(u,v);if(Math.abs(den)<1e-7)return null;const t=cross2([b[0]-a[0],b[1]-a[1]],v)/den;return [a[0]+u[0]*t,a[1]+u[1]*t];}
  // Snap actual editable centerlines, leaving all wall IDs and hosted openings intact.
  function snapWall(s,id,mode,screenScale,axisLock=false){
    const w=s.structure.walls.find(w=>w.id===id);if(!w||isLocked(w))return null;
    const f=frame(w),u=[f.ux,f.uy],candidates=[],active=s.structure.walls.filter((o,i)=>o.id!==id&&!s.demolished.includes('w'+i));
    const offer=(q,index,target,targetIndex=null)=>{const p=index===0?w.a:w.b,d=Math.hypot(q[0]-p[0],q[1]-p[1]),tol=Math.min(14/screenScale,Math.max(150,(w.thickness+target.thickness)/2+80));if(d>tol||axisLock&&Math.abs(cross2([q[0]-p[0],q[1]-p[1]],u))>.5)return;
      const t=project(target,q);if(s.structure.openings.some(o=>o.wallId===target.id&&t>o.offset-w.thickness/2&&t<o.offset+o.width+w.thickness/2))return;
      const endConnection=targetIndex!==null||[target.a,target.b].some(p=>Math.hypot(q[0]-p[0],q[1]-p[1])<.5);candidates.push({q,index,target,targetIndex,d,endConnection});};
    for(const o of active){const g=frame(o),v=[g.ux,g.uy];for(const index of mode==='move'?[0,1]:[mode]){
      const p=index===0?w.a:w.b;for(const k of [0,1])offer(k===0?o.a:o.b,index,o);
      const q=axisLock?lineCross(w.a,u,o.a,v):point(o,project(o,p));if(!q)continue;
      const t=(q[0]-o.a[0])*v[0]+(q[1]-o.a[1])*v[1],tol=Math.min(14/screenScale,Math.max(150,(w.thickness+o.thickness)/2+80));
      if(mode!=='move')for(const k of [0,1]){const end=k===0?o.a:o.b;if(Math.hypot(q[0]-end[0],q[1]-end[1])<=tol&&!isLocked(o))offer(q,index,o,k);}
      if(t>=0&&t<=g.l)offer(q,index,o);
    }}
    candidates.sort((a,b)=>Number(b.endConnection)-Number(a.endConnection)||a.d-b.d);
    for(const c of candidates){const trial={...s,rooms:{...s.rooms},structure:{...s.structure,walls:clone(s.structure.walls),openings:clone(s.structure.openings)}},a=trial.structure.walls.find(o=>o.id===id),b=trial.structure.walls.find(o=>o.id===c.target.id),p=c.index===0?a.a:a.b;
      if(mode==='move'){const d=[c.q[0]-p[0],c.q[1]-p[1]];a.a=a.a.map((v,i)=>v+d[i]);a.b=a.b.map((v,i)=>v+d[i]);}else a[c.index===0?'a':'b']=[...c.q];
      if(c.targetIndex!==null){const key=c.targetIndex===0?'a':'b',old=b[key];if(key==='a'){const g=frame(b),shift=(c.q[0]-old[0])*g.ux+(c.q[1]-old[1])*g.uy;for(const o of trial.structure.openings.filter(o=>o.wallId===b.id))o.offset-=shift;for(const r of trial.structure.wallRegions||[])if(r.wallId===b.id)r.offset-=shift;}b[key]=[...c.q];b.reviewed=false;}
      a.reviewed=false;try{validate(trial);assertLockedEdits(s,trial);}catch{continue;}
      s.structure.walls=trial.structure.walls;s.structure.openings=trial.structure.openings;return {point:[...c.q],wallId:b.id};
    }
    return null;
  }
  // The missing outer quadrant is real geometry, shared by 2D, 3D and collision.
  function wallJoins(s,cut=Infinity){
    const walls=s.structure.walls.filter((w,i)=>!s.demolished.includes('w'+i)),out=[];
    for(let i=0;i<walls.length;i++)for(let j=i+1;j<walls.length;j++){const a=walls[i],b=walls[j];for(const ai of [0,1])for(const bi of [0,1]){
      const p=ai===0?a.a:a.b,q=bi===0?b.a:b.b;if(Math.hypot(p[0]-q[0],p[1]-q[1])>.5)continue;
      const fa=frame(a),fb=frame(b),u=[fa.ux*(ai===0?1:-1),fa.uy*(ai===0?1:-1)],v=[fb.ux*(bi===0?1:-1),fb.uy*(bi===0?1:-1)],turn=cross2(u,v);if(Math.abs(turn)<.2)continue;
      if(walls.some(w=>w!==a&&w!==b&&Math.hypot(...point(w,project(w,p)).map((x,k)=>x-p[k]))<=.5))continue;
      const sign=Math.sign(turn),pa=[p[0]+u[1]*a.thickness/2*sign,p[1]-u[0]*a.thickness/2*sign],pb=[p[0]-v[1]*b.thickness/2*sign,p[1]+v[0]*b.thickness/2*sign],outer=lineCross(pa,u,pb,v);
      if(!outer||Math.hypot(outer[0]-p[0],outer[1]-p[1])>Math.max(a.thickness,b.thickness)*2)continue;
      const bands=(w,index)=>solids(w,s.structure.openings,cut).filter(o=>index===0?o.a<.01:o.b>length(w)-.01);
      const vertical=[];for(const x of bands(a,ai))for(const y of bands(b,bi)){const bottom=Math.max(x.bottom,y.bottom),top=Math.min(x.top,y.top);if(top>bottom)vertical.push({bottom,top});}
      if(vertical.length)out.push({id:'join-'+a.id+'-'+b.id,wallIds:[a.id,b.id],poly:[p,pa,outer,pb],vertical});
    }}return out;
  }
  // Clip wall/patch outlines against the other filled convex polygons: no cap seams.
  function exteriorEdges(poly,others){
    const result=[];
    for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],d=[b[0]-a[0],b[1]-a[1]],ts=[0,1];
      for(const q of others)for(let j=0;j<q.length;j++){const c=q[j],e=q[(j+1)%q.length],v=[e[0]-c[0],e[1]-c[1]],den=cross2(d,v);if(Math.abs(den)<1e-9)continue;const ac=[c[0]-a[0],c[1]-a[1]],t=cross2(ac,v)/den,u=cross2(ac,d)/den;if(t>0&&t<1&&u>=0&&u<=1)ts.push(t);}
      ts.sort((x,y)=>x-y);for(let j=1;j<ts.length;j++){const lo=ts[j-1],hi=ts[j];if(hi-lo<1e-7)continue;const mid=[a[0]+d[0]*(lo+hi)/2,a[1]+d[1]*(lo+hi)/2],n=Math.hypot(...d),left=[mid[0]-d[1]/n*.01,mid[1]+d[0]/n*.01],right=[mid[0]+d[1]/n*.01,mid[1]-d[0]/n*.01],all=[poly,...others];if(all.some(q=>inside(left,q))&&all.some(q=>inside(right,q)))continue;result.push([[a[0]+d[0]*lo,a[1]+d[1]*lo],[a[0]+d[0]*hi,a[1]+d[1]*hi]]);}
    }return result;
  }
  function touchesPolygon(p,poly,r=0){if(inside(p,poly))return true;return poly.some((a,i)=>{const b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/l)):0;return Math.hypot(p[0]-a[0]-dx*t,p[1]-a[1]-dy*t)<=r;});}
  function rect(w){const p=polygon(w);return [Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];}
  function bounds(s,padding=true){const p=s.structure.walls.flatMap(polygon).concat(s.structure.rooms.flatMap(r=>r.poly),s.structure.columns.flatMap(c=>[[c.x-c.w/2,c.y-c.d/2],[c.x+c.w/2,c.y+c.d/2]]));if(s.source)p.push([0,0],[s.source.width*s.source.mmPerPixel,s.source.height*s.source.mmPerPixel]);if(!p.length)p.push([0,0],[10000,8000]);const x=Math.min(...p.map(v=>v[0])),y=Math.min(...p.map(v=>v[1])),r=Math.max(...p.map(v=>v[0])),b=Math.max(...p.map(v=>v[1]));const m=padding?Math.max(600,Math.max(r-x,b-y)*.10):0;return {x:x-m,y:y-m,w:Math.max(1000,r-x)+m*2,h:Math.max(1000,b-y)+m*2};}
  function inside(p,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
  function center(poly){const b={x:0,y:0};poly.forEach(p=>{b.x+=p[0]/poly.length;b.y+=p[1]/poly.length;});if(inside([b.x,b.y],poly))return [b.x,b.y];const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]);for(let i=1;i<20;i++)for(let j=1;j<20;j++){const p=[Math.min(...xs)+(Math.max(...xs)-Math.min(...xs))*i/20,Math.min(...ys)+(Math.max(...ys)-Math.min(...ys))*j/20];if(inside(p,poly))return p;}return poly[0];}
  function project(w,p){const f=frame(w);return Math.max(0,Math.min(f.l,(p[0]-w.a[0])*f.ux+(p[1]-w.a[1])*f.uy));}
  function nearest(s,p){let best=null;for(const w of s.structure.walls){const t=project(w,p),q=point(w,t),d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(!best||d<best.distance)best={wall:w,t,distance:d};}return best;}
  // Horizontal subdivision plus vertical solid bands creates actual door/window voids.
  function solids(w,openings,cut=Infinity){const h=Math.min(w.height,cut),os=openings.filter(o=>o.wallId===w.id),xs=[0,length(w),...os.flatMap(o=>[o.offset,o.offset+o.width])].sort((a,b)=>a-b),out=[];for(let i=0;i<xs.length-1;i++){const a=xs[i],b=xs[i+1];if(b-a<.01)continue;const o=os.find(o=>(a+b)/2>o.offset&&(a+b)/2<o.offset+o.width);if(!o)out.push({a,b,bottom:0,top:h});else{if(o.sill>0)out.push({a,b,bottom:0,top:Math.min(h,o.sill)});if(o.sill+o.height<h)out.push({a,b,bottom:o.sill+o.height,top:h});}}return out.filter(p=>p.top>p.bottom);}
  function validate(s){
    if(!s||s.version!==2||!s.structure||!Array.isArray(s.furniture))throw Error('不是完整的 v2 户型方案');
    const st=s.structure,all=[];const n=(v,min=-1e7,max=1e7)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
    st.wallRegions=st.wallRegions||[];if(!Array.isArray(st.wallRegions)||st.wallRegions.length>500)throw Error('墙面区域列表无效');
    const pt=p=>Array.isArray(p)&&p.length===2&&p.every(v=>n(v));
    for(const k of ['walls','openings','rooms','columns'])if(!Array.isArray(st[k])||st[k].length>3000)throw Error('结构列表缺失或超过数量限制');
    for(const w of st.walls){if(!pt(w.a)||!pt(w.b)||length(w)<10||!n(w.thickness,10,3000)||!n(w.height,100,20000))throw Error('墙体尺寸无效');if(!['unknown','bearing','nonbearing'].includes(w.bearing)||w.bearingHint!==undefined&&!['unknown','bearing','nonbearing'].includes(w.bearingHint))throw Error('承重属性无效');all.push(w.id);}
    for(const o of st.openings){const w=st.walls.find(w=>w.id===o.wallId);if(!w||!['door','window'].includes(o.type)||!n(o.width,10)||!n(o.height,10)||!n(o.sill,0)||!n(o.offset,0)||o.offset+o.width>length(w)+.1||o.sill+o.height>w.height+.1)throw Error('门窗必须位于墙内，且不能超过墙体尺寸');if(o.style!==undefined&&!['sliding','swing'].includes(o.style)||o.hinge!==undefined&&!['start','end'].includes(o.hinge)||o.swing!==undefined&&![-1,1].includes(o.swing))throw Error('门的开启方式无效');if(o.entryRole!==undefined&&!['auto','entry','exclude'].includes(o.entryRole)||o.entryInsideSide!==undefined&&!['auto','1','-1'].includes(o.entryInsideSide))throw Error('入户门设置无效');if(o.type==='window')(root.WindowCore||(typeof require==='function'?require('./window-core.js'):null))?.validate(o);all.push(o.id);}
    for(const w of st.walls)if(w.wallFinishes!==undefined){const v=w.wallFinishes;if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!['1','-1'].includes(k))||Object.values(v).some(f=>!f||typeof f!=='object'||!(f.material==='paint'||floorMaterials[f.material]&&f.material!=='carpet')||!/^#[0-9a-f]{6}$/i.test(f.color)))throw Error('墙面材质或颜色无效');}
    const layoutValid=v=>!!v&&typeof v==='object'&&['tileW','tileH'].every(k=>n(v[k],50,6000))&&n(v.jointMm,0,20)&&v.jointMm<Math.min(v.tileW,v.tileH)/4&&/^#[0-9a-f]{6}$/i.test(v.jointColor)&&['grid','brick','seamless'].includes(v.pattern)&&[0,90,180,270].includes(v.rotation);
    for(const w of st.walls)for(const f of Object.values(w.wallFinishes||{}))if(f.layout!==undefined&&!layoutValid(f.layout))throw Error('墙面铺贴参数无效');
    const regionOverlap=(a,b)=>Math.min(a.offset+a.width,b.offset+b.width)-Math.max(a.offset,b.offset)>.1&&Math.min(a.bottom+a.height,b.bottom+b.height)-Math.max(a.bottom,b.bottom)>.1;
    for(const r of st.wallRegions){const w=st.walls.find(w=>w.id===r.wallId);if(!w||!['cut','insert','finish'].includes(r.mode)||!['rect','rounded','arch'].includes(r.shape)||!['fluted_glass','frosted_glass','clear_glass','wood','stone','paint'].includes(r.material)||!n(r.offset,0)||!n(r.bottom,0)||!n(r.width,50)||!n(r.height,50)||r.offset+r.width>length(w)+.1||r.bottom+r.height>w.height+.1||!n(r.radius,0,Math.min(r.width/2,r.shape==='arch'?r.height:r.height/2))||![1,-1].includes(r.side)||!/^#[0-9a-f]{6}$/i.test(r.color))throw Error('墙面区域必须位于墙内，尺寸、圆角或材质无效');if(r.mode!=='finish'&&st.openings.some(o=>o.wallId===r.wallId&&regionOverlap(r,{...o,bottom:o.sill})))throw Error('挖空或替换区域与已有门窗重叠；请贴边绘制或先调整门窗。');all.push(r.id);}
    for(let i=0;i<st.wallRegions.length;i++)for(let j=i+1;j<st.wallRegions.length;j++){const a=st.wallRegions[i],b=st.wallRegions[j];if(a.wallId===b.wallId&&!(a.mode==='finish'&&b.mode==='finish'&&a.side!==b.side)&&regionOverlap(a,b))throw Error('同侧墙面区域不能重叠，请调整范围或编辑已有区域。');}
    for(const r of st.wallRegions)for(const w of st.walls){if(w.id===r.wallId)continue;const q=regionOnWall(s,r,w);if(!q)continue;if(r.mode!=='finish'&&st.openings.some(o=>o.wallId===w.id&&regionOverlap(q,{...o,bottom:o.sill})))throw Error('区域与重叠墙上的门窗冲突，请先核对结构。');for(const other of st.wallRegions.filter(a=>a.wallId===w.id))if(!(r.mode==='finish'&&other.mode==='finish'&&q.side!==other.side)&&regionOverlap(q,other))throw Error('重叠墙上已有相同位置的区域，请编辑原区域。');}
    for(let i=0;i<st.openings.length;i++)for(let j=i+1;j<st.openings.length;j++){const a=st.openings[i],b=st.openings[j];if(a.wallId===b.wallId&&Math.min(a.offset+a.width,b.offset+b.width)>Math.max(a.offset,b.offset)&&Math.min(a.sill+a.height,b.sill+b.height)>Math.max(a.sill,b.sill))throw Error('门窗洞口不能互相重叠');}
    for(const c of st.columns){if(!n(c.x)||!n(c.y)||!n(c.w,10,10000)||!n(c.d,10,10000)||!n(c.height,100,20000))throw Error('柱子尺寸无效');all.push(c.id);}
    for(const r of st.rooms){if(r.kind!==undefined&&!['room','balcony','bay_window'].includes(r.kind))throw Error('空间类型无效');if(!Array.isArray(r.poly)||r.poly.length<3||r.poly.length>2000||!r.poly.every(pt))throw Error('房间至少需要三个有效顶点');let sum=0;for(let i=0;i<r.poly.length;i++){const a=r.poly[i],b=r.poly[(i+1)%r.poly.length];sum+=a[0]*b[1]-b[0]*a[1];}if(Math.abs(sum)<100)throw Error('房间边界面积不能为零');const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);for(let i=0;i<r.poly.length;i++)for(let j=i+2;j<r.poly.length;j++){if(i===0&&j===r.poly.length-1)continue;const a=r.poly[i],b=r.poly[(i+1)%r.poly.length],c=r.poly[j],d=r.poly[(j+1)%r.poly.length];if(cross(a,b,c)*cross(a,b,d)<0&&cross(c,d,a)*cross(c,d,b)<0)throw Error('房间边界不能交叉');}if(r.elevation!==undefined&&!n(r.elevation,0,3000))throw Error('空间台面高度无效');all.push(r.id);}
    const safeId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
    if(all.some(v=>!safeId(v))||new Set(all).size!==all.length)throw Error('结构 ID 缺失、无效或重复');
    for(const r of st.rooms)if(r.kind==='bay_window'){r.counted=false;if(r.elevation===undefined)r.elevation=700;}
    if(s.furniture.length>3000)throw Error('家具数量过多');for(const f of s.furniture)if(!safeId(f.id)||!n(f.cx)||!n(f.cy)||!n(f.w,10,50000)||!n(f.d,10,50000)||!n(f.rot)||!/^#[0-9a-f]{6}$/i.test(f.color)||!/^\w+$/.test(f.type)||f.h!==undefined&&!n(f.h,10,50000)||f.reference&&!/^data:image\/(png|jpeg|webp);base64,/.test(f.reference))throw Error('家具数据无效');
    for(const f of s.furniture)if(f.elevation!==undefined&&!n(f.elevation,0,10000))throw Error('家具离地高度无效');
    for(const f of s.furniture)if(f.wallAttachment!==undefined){const a=f.wallAttachment,w=st.walls.find(w=>w.id===a?.wallId);if(!w||![1,-1].includes(a.side)||!n(a.offset,0,length(w)))throw Error('壁挂家具的墙面关联无效');}
    for(const f of s.furniture)if(f.rugPattern!==undefined&&!['woven','stripe','checker','geometry','border','dots'].includes(f.rugPattern))throw Error('地毯图案无效');
    s.rooms=s.rooms||{};s.assets=s.assets||{};s.demolished=s.demolished||[];s.measures=s.measures||[];s.calibration=s.calibration||{confirmed:false,method:'estimate'};
    if(typeof s.assets!=='object'||Array.isArray(s.assets))throw Error('模型资源列表无效');
    for(const [key,a] of Object.entries(s.assets)){if(!safeId(key)||a.id!==key||!['glb','gltf'].includes(a.kind)||typeof a.data!=='string')throw Error('模型资源无效');if(a.kind==='glb'&&!/^data:[\w/+.-]*;base64,/.test(a.data))throw Error('GLB 资源必须完整内嵌');if(a.kind==='gltf'){const g=JSON.parse(a.data);for(const r of [...g.buffers||[],...g.images||[]])if(r.uri&&!/^data:[\w/+.;=-]*,/.test(r.uri))throw Error('GLTF 资源必须完整内嵌，请一起导入贴图和 bin 文件');}}
    for(const f of s.furniture)if(f.assetId&&!s.assets[f.assetId])throw Error('家具引用的模型资源缺失');
    s.catalogue=s.catalogue||[];if(!Array.isArray(s.catalogue)||s.catalogue.length>500)throw Error('个人家具库无效');for(const item of s.catalogue)if(!safeId(item.id)||!s.assets[item.assetId]||!n(item.w,10,50000)||!n(item.d,10,50000)||!n(item.h,10,50000)||!/^#[0-9a-f]{6}$/i.test(item.color)||!/^\w+$/.test(item.type))throw Error('个人家具库条目无效');
    if(s.source&&(!n(s.source.width,1,20000)||!n(s.source.height,1,20000)||!n(s.source.mmPerPixel,.001,10000)||!/^data:image\/(png|jpeg|webp);base64,/.test(s.source.data)))throw Error('原图数据无效');
    for(const r of st.rooms){const m=s.rooms[r.id]||{},mats=Object.keys(floorMaterials);s.rooms[r.id]={name:String(m.name||r.name||'未命名房间').slice(0,120),mat:mats.includes(m.mat)?m.mat:(mats.includes(r.mat)?r.mat:'tile800'),wallColor:/^#[0-9a-f]{6}$/i.test(m.wallColor)?m.wallColor:'#f4f1eb',...(m.surfaceLayout!==undefined?{surfaceLayout:m.surfaceLayout}:{})};if(m.surfaceLayout!==undefined&&!layoutValid(m.surfaceLayout))throw Error('地面铺贴参数无效');}
    if(s.planGeneration){const p=s.planGeneration;
      if(!s.source)throw Error('分步生成方案缺少户型原图');
      if(p.version!==1||!Number.isInteger(p.stage)||p.stage<1||p.stage>4||!Array.isArray(p.items)||p.items.length>160)throw Error('分步生成状态无效');
      if(p.uiMode!==undefined&&!['structure','layout','ai'].includes(p.uiMode))throw Error('家具流程界面状态无效');
      const seen=new Set();for(const i of p.items){if(!safeId(i.id)||seen.has(i.id)||typeof i.name!=='string'||i.name.length>160||!/^\w+$/.test(i.type)||typeof i.roomId!=='string'||typeof i.selected!=='boolean'||typeof i.reviewed!=='boolean'||!['cx','cy','rot'].every(k=>n(i[k],-1e7,1e7))||!['w','d','h'].every(k=>n(i[k],10,50000)))throw Error('家具识别清单数据无效');seen.add(i.id);if(i.model&&(!s.assets[i.model.assetId]||typeof i.model.accepted!=='boolean'))throw Error('待确认模型资源缺失');}
    }
    return s;
  }
  function scale(s,k){if(!Number.isFinite(k)||k<=0)throw Error('校准比例无效');for(const w of s.structure.walls){w.a=w.a.map(v=>v*k);w.b=w.b.map(v=>v*k);w.thickness*=k;}for(const o of s.structure.openings){o.offset*=k;o.width*=k;}for(const r of s.structure.wallRegions||[]){r.offset*=k;r.width*=k;r.radius=Math.min(r.radius*k,r.width/2,r.shape==='arch'?r.height:r.height/2);}for(const c of s.structure.columns){c.x*=k;c.y*=k;c.w*=k;c.d*=k;}for(const r of s.structure.rooms){r.poly=r.poly.map(p=>p.map(v=>v*k));if(r.at)r.at=r.at.map(v=>v*k);}for(const f of s.furniture){f.cx*=k;f.cy*=k;if(f.wallAttachment)f.wallAttachment.offset*=k;if(!f.dimensionSource){f.w*=k;f.d*=k;}}for(const m of s.measures){m.a.x*=k;m.a.y*=k;m.b.x*=k;m.b.y*=k;}if(s.planGeneration)for(const i of s.planGeneration.items){i.cx*=k;i.cy*=k;if(i.dimensionSource==='plan-proportion-estimate'){i.w*=k;i.d*=k;}}if(s.source){s.source.mmPerPixel*=k;const m=s.source.mmPerPixel;s.source.pixelToMm=[m,0,0,m,0,0];s.source.mmToPixel=[1/m,0,0,1/m,0,0];}}
  function wall(a,b,extra={}){return {id:id('wall'),a,b,thickness:200,height:2800,bearing:'unknown',reviewed:false,...extra};}
  function fromLegacy(walls,wins,doors,slides,rooms,furniture=[]){const s=blank();s.title='原项目示例 · 三室两厅';s.workflow='furniture';s.calibration={confirmed:true,method:'original'};s.structure.rooms=clone(rooms);s.furniture=clone(furniture);for(const r of rooms)s.rooms[r.id]={name:r.name,mat:r.mat,wallColor:'#f4f1eb'};const add=r=>{const hz=r[2]-r[0]>=r[3]-r[1];const w=wall(hz?[r[0],(r[1]+r[3])/2]:[(r[0]+r[2])/2,r[1]],hz?[r[2],(r[1]+r[3])/2]:[(r[0]+r[2])/2,r[3]],{thickness:hz?r[3]-r[1]:r[2]-r[0],height:r[4]==='low'?1000:2800,reviewed:true});s.structure.walls.push(w);return w;};walls.forEach(add);for(const [r,type,extra] of [...wins.map(r=>[r,'window',{sill:900,height:1500}]),...doors.map(d=>[d.rect,'door',{sill:0,height:2100,name:d.name,entry:!!d.entry}]),...slides.map(d=>[d.rect,'door',{sill:0,height:2400}])]){const w=add(r);s.structure.openings.push({id:id(type),type,wallId:w.id,offset:0,width:length(w),reviewed:true,...extra});}return s;}
  const sceneStyle=s=>['soft','su'].includes(s.presentation?.sceneStyle)?s.presentation.sceneStyle:'standard';
  const suEdges=s=>s.presentation?.suEdges!==false;
  root.PlanCore={sceneStyle,suEdges,floorMaterials,id,clone,blank,length,frame,dragWallEnd,drawWallEnd,snapWall,wallJoins,exteriorEdges,touchesPolygon,point,polygon,rect,bounds,inside,center,nearest,project,solids,validate,scale,wall,fromLegacy,bearingType,isLocked,assertLockedEdits};
  if(typeof module!=='undefined')module.exports=root.PlanCore;
})(globalThis);
