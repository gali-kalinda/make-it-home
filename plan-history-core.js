/* Full, independent plan snapshots. IndexedDB keeps embedded images and GLB models. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PlanHistoryCore=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const clone=value=>JSON.parse(JSON.stringify(value));
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const finite=n=>Number.isFinite(n);
const point=p=>Array.isArray(p)&&finite(p[0])&&finite(p[1]);
function check(plan){if(!plan||!plan.structure||!Array.isArray(plan.structure.walls)||!Array.isArray(plan.furniture))throw Error('方案内容不完整，无法保存或恢复');return plan;}
function area(poly){return Math.abs(poly.reduce((sum,p,i)=>{const q=poly[(i+1)%poly.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2e6;}
function preview(plan){
 const walls=plan.structure.walls.filter((w,i)=>point(w.a)&&point(w.b)&&!plan.demolished?.includes('w'+i));
 const rooms=(plan.structure.rooms||[]).filter(r=>r.poly?.length>=3&&r.poly.every(point));
 const points=walls.flatMap(w=>[w.a,w.b]).concat(rooms.flatMap(r=>r.poly));
 if(!points.length)return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="#f6f3ed"/><text x="200" y="155" text-anchor="middle" fill="#9c8b76" font-size="16">空白方案</text></svg>';
 let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;for(const p of points){minX=Math.min(minX,p[0]);minY=Math.min(minY,p[1]);maxX=Math.max(maxX,p[0]);maxY=Math.max(maxY,p[1]);}
 const span=Math.max(maxX-minX,maxY-minY,100),pad=span*.065;
 const color=(v,fallback)=>/^#[\da-f]{3}([\da-f]{3})?$/i.test(v)?v:fallback;
 let svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX-pad} ${minY-pad} ${Math.max(100,maxX-minX)+2*pad} ${Math.max(100,maxY-minY)+2*pad}"><rect x="${minX-pad}" y="${minY-pad}" width="100%" height="100%" fill="#f6f3ed"/>`;
 for(const r of rooms)svg+=`<polygon points="${r.poly.map(p=>p.join(',')).join(' ')}" fill="${/wood|oak|walnut/i.test(plan.rooms?.[r.id]?.mat||'')?'#ddc8a6':'#e8e3d9'}"/>`;
 for(const f of plan.furniture){if(![f.cx,f.cy,f.w,f.d].every(finite))continue;svg+=`<rect x="${f.cx-f.w/2}" y="${f.cy-f.d/2}" width="${Math.max(1,f.w)}" height="${Math.max(1,f.d)}" rx="${Math.min(f.w,f.d)*.07}" transform="rotate(${finite(f.rot)?f.rot:0} ${f.cx} ${f.cy})" fill="${color(f.color,'#c4b6a0')}" stroke="#fff" stroke-width="${span*.002}"/>`;}
 for(const w of walls)svg+=`<path d="M${w.a.join(' ')}L${w.b.join(' ')}" stroke="#605f56" stroke-width="${Math.max(1,w.thickness||160)}" stroke-linecap="square"/>`;
 for(const o of plan.structure.openings||[]){const w=walls.find(w=>w.id===o.wallId);if(!w||![o.offset,o.width].every(finite))continue;const dx=w.b[0]-w.a[0],dy=w.b[1]-w.a[1],len=Math.hypot(dx,dy);if(!len)continue;const at=t=>[w.a[0]+dx*t/len,w.a[1]+dy*t/len].join(' ');svg+=`<path d="M${at(o.offset)}L${at(o.offset+o.width)}" stroke="${o.type==='window'?'#a3c7d1':'#f6f3ed'}" stroke-width="${Math.max(1,w.thickness||160)+2}"/>`;}
 return svg+'</svg>';
}
function snapshot(plan,name,options={}){
 const saved=clone(check(plan)),createdAt=options.createdAt||new Date().toISOString();
 const id=options.id||('history-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)));
 const rooms=(saved.structure.rooms||[]).filter(r=>r.counted!==false&&r.kind!=='bay'&&r.poly?.length>=3&&r.poly.every(point));
 const meta={id,name:String(name||'未命名方案').trim().slice(0,80)||'未命名方案',createdAt,kind:['before-restore','before-new'].includes(options.kind)?options.kind:'manual',schema:1,title:String(saved.title||'未命名户型'),furnitureCount:saved.furniture.length,wallCount:saved.structure.walls.length,roomCount:(saved.structure.rooms||[]).length,area:rooms.reduce((n,r)=>n+area(r.poly),0),estimated:!saved.calibration?.confirmed,preview:preview(saved)};
 return {meta,plan:saved};
}
function createRepository(indexedDB){
 async function open(){if(!indexedDB)throw Error('当前浏览器无法使用本地历史记录');return new Promise((resolve,reject)=>{const r=indexedDB.open('floorplan-studio-history',1);let blocked=false;r.onupgradeneeded=()=>{r.result.createObjectStore('entries',{keyPath:'id'});r.result.createObjectStore('snapshots');};r.onerror=()=>reject(r.error);r.onblocked=()=>{blocked=true;reject(Error('请关闭其他旧版页面后重试'));};r.onsuccess=()=>{if(blocked){r.result.close();return;}resolve(r.result);};});}
 async function run(mode,work){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(['entries','snapshots'],mode);let result;tx.oncomplete=()=>resolve(result?.result);tx.onerror=()=>reject(tx.error||Error('本地历史记录读写失败'));tx.onabort=()=>reject(tx.error||Error('本地历史记录写入已中止'));try{result=work(tx);}catch(e){tx.abort();reject(e);}});}finally{db.close();}}
 return {
  put:record=>run('readwrite',tx=>{tx.objectStore('snapshots').add(record.plan,record.meta.id);tx.objectStore('entries').add(record.meta);}),
  list:async()=>{const rows=await run('readonly',tx=>tx.objectStore('entries').getAll());return rows.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));},
  get:async id=>{const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(['entries','snapshots'],'readonly'),m=tx.objectStore('entries').get(id),p=tx.objectStore('snapshots').get(id);tx.oncomplete=()=>resolve(m.result&&p.result?{meta:m.result,plan:p.result}:null);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('读取历史方案失败'));});}finally{db.close();}}
 };
}
function createService(repository,{capture,apply,validate=p=>p,createBlank}){
 let busy=false;
 async function exclusive(fn){if(busy)throw Error('正在处理方案，请稍候');busy=true;try{return await fn();}finally{busy=false;}}
 return {
  list:()=>repository.list(),get:id=>repository.get(id),
  save:(name,options={})=>exclusive(async()=>{const record=snapshot(capture(),name,options);await repository.put(record);return clone(record.meta);}),
  newProject:()=>exclusive(async()=>{
   if(typeof createBlank!=='function')throw Error('新建入口尚未就绪');
   const next=validate(clone(check(createBlank())));check(next);
   const current=capture(),backup=snapshot(current,'新建前备份 · '+String(current.title||'未命名项目'),{kind:'before-new'});
   await repository.put(backup);await apply(next);
   return {backup:clone(backup.meta)};
  }),
  restore:id=>exclusive(async()=>{
   const record=await repository.get(id);if(!record)throw Error('没有找到这份历史方案');
   const next=validate(clone(check(record.plan)));check(next);
   const backup=snapshot(capture(),'恢复前备份 · '+record.meta.name,{kind:'before-restore'});
   // Never replace the editor if the backup could not be committed to disk.
   await repository.put(backup);await apply(next);
   return {restored:clone(record.meta),backup:clone(backup.meta)};
  }),
  get busy(){return busy;}
 };
}
return {snapshot,preview,escape,check,createRepository,createService};
});
