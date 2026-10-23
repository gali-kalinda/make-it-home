(function(root,factory){const api=factory(root.PlanCore||(typeof require==='function'?require('./core.js'):null));if(typeof module==='object')module.exports=api;else root.EntranceCore=api;})(globalThis,C=>{
 // Flood from outside with all wall centrelines closed, including their door openings.
 // This tests the building envelope, rather than the drawing's rectangular bounding box.
 function envelope(plan){
  const walls=plan.structure.walls.filter((w,i)=>!plan.demolished.includes('w'+i));if(!walls.length)return null;
  const xs=walls.flatMap(w=>[w.a[0],w.b[0]]),ys=walls.flatMap(w=>[w.a[1],w.b[1]]),step=Math.max(35,Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))/200),pad=step*5+600,x0=Math.min(...xs)-pad,y0=Math.min(...ys)-pad,nx=Math.ceil((Math.max(...xs)-x0+pad)/step),ny=Math.ceil((Math.max(...ys)-y0+pad)/step),cells=new Uint8Array(nx*ny);
  for(const w of walls){const f=C.frame(w),r=w.thickness/2+step*.72,minX=Math.max(0,Math.floor((Math.min(...[w.a[0],w.b[0]])-r-x0)/step)),maxX=Math.min(nx-1,Math.ceil((Math.max(w.a[0],w.b[0])+r-x0)/step)),minY=Math.max(0,Math.floor((Math.min(w.a[1],w.b[1])-r-y0)/step)),maxY=Math.min(ny-1,Math.ceil((Math.max(w.a[1],w.b[1])+r-y0)/step));for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const px=x0+(x+.5)*step,py=y0+(y+.5)*step,t=Math.max(0,Math.min(f.l,(px-w.a[0])*f.ux+(py-w.a[1])*f.uy));if(Math.hypot(px-w.a[0]-f.ux*t,py-w.a[1]-f.uy*t)<=r)cells[y*nx+x]=1;}}
  const q=new Int32Array(nx*ny);let head=0,tail=0;const put=i=>{if(!cells[i]){cells[i]=2;q[tail++]=i;}};for(let x=0;x<nx;x++){put(x);put((ny-1)*nx+x);}for(let y=0;y<ny;y++){put(y*nx);put(y*nx+nx-1);}while(head<tail){const i=q[head++],x=i%nx,y=Math.floor(i/nx);if(x)put(i-1);if(x<nx-1)put(i+1);if(y)put(i-nx);if(y<ny-1)put(i+nx);}
  return {sample:p=>{const x=Math.floor((p[0]-x0)/step),y=Math.floor((p[1]-y0)/step);return x<0||y<0||x>=nx||y>=ny?'outside':cells[y*nx+x]===2?'outside':cells[y*nx+x]===1?'wall':'inside';}};
 }
 function detect(plan){
  const env=envelope(plan),rooms=plan.structure.rooms,rows=[];if(!env)return {door:null,candidates:[],reason:'尚未绘制墙体，无法判断入户门'};
  const roomAt=p=>rooms.find(r=>C.inside(p,r.poly));
  for(const o of plan.structure.openings){if(o.type!=='door'||o.entryRole==='exclude')continue;const index=plan.structure.walls.findIndex(w=>w.id===o.wallId),w=plan.structure.walls[index];if(!w||plan.demolished.includes('w'+index))continue;
   const f=C.frame(w),mid=C.point(w,o.offset+o.width/2),dist=w.thickness/2+Math.max(250,o.width*.18),sides=[1,-1].map(side=>{const point=[mid[0]-f.uy*dist*side,mid[1]+f.ux*dist*side];return {side,point,room:roomAt(point),zone:env.sample(point)};}),indoor=sides.filter(s=>s.room&&!['balcony','bay_window'].includes(s.room.kind)),balcony=sides.some(s=>['balcony','bay_window'].includes(s.room?.kind)),explicit=o.entryRole==='entry'||o.entryRole!=='auto'&&o.entry===true;
   let inside=indoor.length===1?indoor[0]:sides.find(s=>s.zone==='inside'&&sides.find(t=>t!==s).zone==='outside'),outer=inside&&sides.find(s=>s!==inside),exterior=!!inside&&outer.zone==='outside'&&!outer.room;
   if(!inside&&explicit){inside=sides.find(s=>s.room)||sides.find(s=>s.zone==='inside');outer=inside&&sides.find(s=>s!==inside);}
   if(o.entryInsideSide==='1'||o.entryInsideSide==='-1')inside=sides.find(s=>s.side===Number(o.entryInsideSide));
   if(!inside||!explicit&&(!exterior||balcony||o.sill>100||o.height<1700||o.width<550))continue;
   const name=[o.name,inside.room?.name,plan.rooms[inside.room?.id]?.name].filter(Boolean).join(' '),score=(explicit?1000:0)+(exterior?100:0)+(o.style==='sliding'?-45:15)+(o.width>=750&&o.width<=1300?12:0)+(/入户|玄关|门厅|entrance|foyer/i.test(name)?35:0)+(/客厅|客餐|餐厅|living/i.test(name)?8:0)-(/阳台|露台|庭院|balcony|terrace/i.test(name)?80:0)-(/卫生|浴|bath|toilet/i.test(name)?25:0);
   rows.push({id:o.id,wallId:w.id,mid,normal:[-f.uy*inside.side,f.ux*inside.side],insideSide:inside.side,roomId:inside.room?.id||null,exterior,explicit,score,width:o.width,thickness:w.thickness,reason:explicit?'用户指定入户门':exterior?'门的一侧连通户外，另一侧通向室内':'朝向待核对'});
  }
  rows.sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));const door=rows[0]||null,ambiguous=!!door&&!door.explicit&&rows.length>1&&door.score-rows[1].score<15;
  return {door,candidates:rows,ambiguous,reason:door?(ambiguous?'多扇外墙门，暂从首选候选进入，可在门属性中指定':door.reason):'未找到可靠的外墙入户门，将使用室内安全位置；可在门属性中指定入户门'};
 }
 function start(plan,isBlocked=()=>false){
  const result=detect(plan),d=result.door;if(!d)return {...result,position:null,target:null};
  const tangent=[d.normal[1],-d.normal[0]],room=plan.structure.rooms.find(r=>r.id===d.roomId);
  for(const depth of [d.thickness/2+350,d.thickness/2+550,d.thickness/2+800,1100])for(const offset of [0,-Math.min(150,d.width*.15),Math.min(150,d.width*.15)]){
   const p=d.mid.map((v,i)=>v+d.normal[i]*depth+tangent[i]*offset);if(isBlocked(...p)||room&&!C.inside(p,room.poly))continue;
   return {...result,position:p,target:p.map((v,i)=>v+d.normal[i]*1800)};
  }
  return {...result,position:null,target:null,reason:'入户门内侧暂时没有可站立的位置，将使用室内安全位置'};
 }
 return {detect,start};
});
