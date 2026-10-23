/* Material floor plan: editable SVG structure + exact top-down model sprites. */
const planSpriteImages=new Map(),planSpritePending=new Map(),planTextureCache=new Map();
let planSpriteWork=Promise.resolve();
const materialPlan=()=>state.workflow!=='structure'&&(state.presentation?.planStyle||'rendered')==='rendered';
const planSpriteKey=f=>JSON.stringify([f.type,f.w,f.d,f.h||0,f.color,f.material||'original',f.assetId||'',f.rugPattern||'woven']);
const oldPlanDefs=buildDefs;
buildDefs=function(){oldPlanDefs();$('#defs').insertAdjacentHTML('beforeend',`<filter id="plan-wall-shadow" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feDropShadow dx="28" dy="45" stdDeviation="48" flood-color="#30291f" flood-opacity=".22"/></filter><filter id="plan-room-inset" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="44" result="blur"/><feComposite in="SourceAlpha" in2="blur" operator="out" result="edge"/><feFlood flood-color="#3b3428" flood-opacity=".22"/><feComposite in2="edge" operator="in"/><feMerge><feMergeNode in="SourceGraphic"/><feMergeNode/></feMerge></filter>`);};
function planRandom(seed){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
function planTextureBase(kind,raw=false){
 const cacheKey=kind+(raw?'|raw':'');
 if(planTextureCache.has(cacheKey))return planTextureCache.get(cacheKey);
 const cv=document.createElement('canvas'),wood=C.floorMaterials[kind]?.family==='wood';cv.width=wood?1024:512;cv.height=wood?256:512;const c=cv.getContext('2d'),R=planRandom(1738+kind.length*97),W=cv.width,H=cv.height;
 const colors={wood:'#cbbb9e',walnut:'#9e8167',tile800:'#e1ddd3',tile600:'#dddeda',marble:'#e9e5dd',antislip:'#d5d8d2',terrazzo:'#e2ddd3',carpet:'#d2cbbd'};c.fillStyle=C.floorMaterials[kind]?.sw||colors.tile800;c.fillRect(0,0,W,H);
 const noise=c.getImageData(0,0,W,H);for(let i=0;i<noise.data.length;i+=4){const n=(R()-.5)*(wood?8:10);for(let k=0;k<3;k++)noise.data[i+k]+=n;}c.putImageData(noise,0,0);
 if(wood){
   if(!raw)for(let row=0;row<2;row++){const y=row*H/2;c.fillStyle=`rgba(${row?'255,255,250':'72,54,31'},.025)`;c.fillRect(0,y,W,H/2);const seam= row?W*.34:W*.72;c.fillStyle='rgba(66,51,31,.16)';c.fillRect(seam,y,1,H/2);c.fillRect(0,y,W,1);c.fillStyle='rgba(255,255,245,.22)';c.fillRect(0,y+1,W,1);}
   for(let i=0;i<650;i++){const y=R()*H,x=R()*W;c.strokeStyle=i%3?'rgba(255,255,240,.09)':'rgba(67,46,25,.065)';c.lineWidth=.25+R()*.6;c.beginPath();c.moveTo(x,y);c.bezierCurveTo(x+80,y-2+R()*4,x+180,y+2-R()*4,x+280+R()*380,y+(R()-.5)*4);c.stroke();}
 }else if(kind==='carpet'){for(let i=0;i<15000;i++){c.fillStyle=i%2?'#ffffff25':'#63564115';c.fillRect(R()*W,R()*H,1,2);}}
 else{if(kind==='marble'){for(let i=0;i<12;i++){c.strokeStyle='rgba(121,110,93,.085)';c.lineWidth=.5+R()*2;c.beginPath();c.moveTo(R()*W,0);c.bezierCurveTo(R()*W,H*.35,R()*W,H*.6,R()*W,H);c.stroke();}}if(kind==='terrazzo'){for(let i=0;i<220;i++){c.fillStyle=['#a69c8960','#faf6e780','#8c929340'][i%3];c.beginPath();c.ellipse(R()*W,R()*H,1+R()*4,1+R()*3,R()*3,0,Math.PI*2);c.fill();}}if(!raw){c.fillStyle='#8f8a801f';c.fillRect(0,0,W,1);c.fillRect(0,0,1,H);}}
 const size=wood?[1800,360]:kind==='carpet'?[500,500]:kind==='antislip'?[300,300]:kind==='tile600'?[600,600]:[800,800];
 const dimensions=C.floorMaterials[kind]?.size||size;const texture={href:cv.toDataURL('image/png'),canvas:cv,w:dimensions[0],d:dimensions[1]};planTextureCache.set(cacheKey,texture);return texture;
}
SurfaceTextures.setLegacy(planTextureBase);
function planTexture(kind,layout){return C.floorMaterials[kind]?.source||layout?SurfaceTextures.texture(kind,layout):planTextureBase(kind);}
function surfacePatternId(kind,layout){return 'plan-m-'+(layout?SurfaceLayoutCore.key(kind,layout):kind);}
function ensurePlanPatterns(){const configs=[...Object.keys(C.floorMaterials).map(k=>[k,null]),...Object.values(state.rooms).map(r=>[r.mat,r.surfaceLayout])];for(const [kind,layout]of configs){const id=surfacePatternId(kind,layout),t=planTexture(kind,layout);let p=document.getElementById(id);if(!p){$('#defs').insertAdjacentHTML('beforeend','<pattern id="'+id+'" patternUnits="userSpaceOnUse"><image x="0" y="0" preserveAspectRatio="none"/></pattern>');p=document.getElementById(id);}p.setAttribute('width',t.w);p.setAttribute('height',t.d);p.setAttribute('patternTransform','rotate('+(t.rotation||0)+')');const i=p.querySelector('image');i.setAttribute('href',t.href);i.setAttribute('width',t.w);i.setAttribute('height',t.d);}}
addEventListener('surface-texture-ready',()=>{ensurePlanPatterns();renderRooms();});
const beforeSurfacePatternDefs=buildDefs;
buildDefs=function(){beforeSurfacePatternDefs();ensurePlanPatterns();for(const kind of Object.keys(C.floorMaterials)){if(document.getElementById('m-'+kind))continue;const pattern=document.getElementById('plan-m-'+kind).cloneNode(true);pattern.id='m-'+kind;document.getElementById('defs').append(pattern);}};
const oldPlanRooms=renderRooms;
renderRooms=function(){oldPlanRooms();if(!materialPlan())return;ensurePlanPatterns();document.querySelectorAll('#gRooms .room').forEach(el=>{const kind=state.rooms[el.dataset.room]?.mat||'tile800';el.setAttribute('fill','url(#'+surfacePatternId(kind,state.rooms[el.dataset.room]?.surfaceLayout)+')');el.setAttribute('filter','url(#plan-room-inset)');});};
function planSpriteSVG(f,s){return `<image class="plan-model-image" href="${s.href}" x="${s.x}" y="${s.y}" width="${s.w}" height="${s.d}" pointer-events="none"/><rect class="plan-model-hit" x="${-f.w/2}" y="${-f.d/2}" width="${f.w}" height="${f.d}" fill="transparent"/>`;}
function requestPlanSprite(f){
 const key=planSpriteKey(f);if(planSpriteImages.has(key)||planSpritePending.has(key)||!window.View3D)return;
 const promise=planSpriteWork=planSpriteWork.catch(()=>{}).then(async()=>{
   const sprite=await View3D.planFurnitureSprite(f);planSpriteImages.set(key,sprite);if(planSpriteImages.size>180){const used=new Set(state.furniture.map(planSpriteKey));for(const cat of LIB)for(const i of cat.items)used.add(planSpriteKey({type:i[0],w:i[2],d:i[3],color:i[4],...(i[5]||{})}));for(const old of planSpriteImages.keys()){if(planSpriteImages.size<=180)break;if(!used.has(old))planSpriteImages.delete(old);}}
   if(materialPlan()){for(const el of document.querySelectorAll('#gFurn .furn')){const current=getF(el.dataset.fid);if(current&&planSpriteKey(current)===key){el.innerHTML=planSpriteSVG(current,sprite);el.dataset.planPreview='ready';}}refreshPlanLibrary();}await new Promise(requestAnimationFrame);
 });planSpritePending.set(key,promise);promise.catch(e=>console.warn('平面家具预览暂不可用',f.type,e.message)).finally(()=>planSpritePending.delete(key));
}
const oldPlanFurn=renderFurn;
renderFurn=function(){
 if(!materialPlan())return oldPlanFurn();$('#gFurn').setAttribute('display',ui.layers.furn?'inline':'none');$('#gFurn').innerHTML=state.furniture.map(f=>{const key=planSpriteKey(f),sprite=planSpriteImages.get(key);if(!sprite)requestPlanSprite(C.clone(f));return `<g class="furn" data-fid="${f.id}" transform="translate(${f.cx} ${f.cy}) rotate(${f.rot})" data-plan-preview="${sprite?'ready':'pending'}">${sprite?planSpriteSVG(f,sprite):furnSVG(f.type,f.w,f.d,f.color,f)}</g>`;}).join('');
};
const oldPlanStructure=window.renderStructure;
window.renderStructure=function(){oldPlanStructure();if(!materialPlan())return;$('#gWalls').setAttribute('filter','url(#plan-wall-shadow)');for(const el of document.querySelectorAll('#gWalls .wall')){const wall=state.structure.walls.find(w=>w.id===el.dataset.wall);el.setAttribute('fill',C.isLocked(wall)?'#181a18':C.bearingType(wall)==='nonbearing'?'#fffdf8':'#787973');el.setAttribute('stroke',C.isLocked(wall)&&ui.layers.bearing?'#c07850':'#181a18');el.setAttribute('stroke-width',C.isLocked(wall)&&ui.layers.bearing?'2':'.6');}document.querySelectorAll('#gWalls [data-column]').forEach(el=>{el.setAttribute('fill','#272926');el.setAttribute('stroke','#181a18');});for(const el of document.querySelectorAll('#gOpen [data-opening]')){const opening=state.structure.openings.find(o=>o.id===el.dataset.opening),w=state.structure.walls.find(w=>w.id===opening.wallId);el.querySelector('rect').setAttribute('fill',opening.type==='window'?'#e9ece7':'#e2d9c9');if(opening.type==='window')el.querySelector('path').setAttribute('stroke','#7e8989');else{el.querySelector('path').setAttribute('stroke','#716757');el.querySelector('path').setAttribute('stroke-width','.8');}if(opening.type==='window'&&!window.WindowCore)el.insertAdjacentHTML('beforeend',`<path d="M0 ${-w.thickness/2+24}H${opening.width}M0 ${w.thickness/2-24}H${opening.width}" stroke="#ffffff" stroke-width="14" fill="none" pointer-events="none"/>`);}};
const oldPlanLabels=renderLabels;
function materialRoomLabel(room){
 const poly=room.poly,xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]),x0=Math.min(...xs),y0=Math.min(...ys),w=Math.max(...xs)-x0,d=Math.max(...ys)-y0,center=C.center(poly),name=state.rooms[room.id]?.name||room.name||'',halfW=Math.max(400,name.length*100),halfD=235;
 const obstacles=state.furniture.filter(f=>!DecorCatalogue.isRug(f.type)).map(f=>{const a=f.rot*Math.PI/180,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));return {x:f.cx,y:f.cy,w:(f.w*c+f.d*s)/2+halfW,d:(f.w*s+f.d*c)/2+halfD};});
 const candidates=[room.at||center,center];for(let y=1;y<8;y++)for(let x=1;x<8;x++)candidates.push([x0+w*x/8,y0+d*y/8]);let best=room.at||center,bestScore=Infinity;
 for(const p of candidates){if(![[-halfW,-halfD],[-halfW,halfD],[halfW,-halfD],[halfW,halfD]].every(q=>C.inside([p[0]+q[0],p[1]+q[1]],poly)))continue;const overlap=obstacles.filter(o=>Math.abs(p[0]-o.x)<o.w&&Math.abs(p[1]-o.y)<o.d).length,score=overlap*100+Math.hypot((p[0]-center[0])/w,(p[1]-center[1])/d);if(score<bestScore){bestScore=score;best=p;}}
 return best;
}
renderLabels=function(){oldPlanLabels();if(!materialPlan())return;const texts=[...document.querySelectorAll('#gLabels text')],rooms=ROOMS.filter(r=>r.at);for(let i=0;i<texts.length;i++){const el=texts[i],p=materialRoomLabel(rooms[Math.floor(i/2)]);el.setAttribute('x',p[0]);el.setAttribute('y',p[1]+(i%2?170:-25));el.setAttribute('font-size',i%2?'135':'190');el.setAttribute('font-weight',i%2?'400':'500');el.setAttribute('stroke','#f8f5ed');el.setAttribute('stroke-width','14');el.setAttribute('fill',i%2?'#82796b':'#35362f');}};
const styleControls=document.createElement('div');styleControls.className='grp only2d plan-style-buttons';styleControls.innerHTML='<button class="btn" data-plan-style="rendered" title="材质、家具俯视与柔和阴影">材质平面</button><button class="btn" data-plan-style="technical" title="简洁线稿与家具名称">线稿</button>';$('#fit').closest('.grp').after(styleControls);
const styleNote=document.createElement('div');styleNote.className='plan-render-note';$('#stage').append(styleNote);
document.querySelectorAll('[data-plan-style]').forEach(button=>button.onclick=()=>{mutate(()=>{state.presentation={...state.presentation,planStyle:button.dataset.planStyle};});buildLib();refreshPlanLibrary();});
function refreshPlanLibrary(){if(!materialPlan()||is3D())return;document.querySelectorAll('#lib .item').forEach(el=>{const item=itemOf(el),f={type:item[0],name:item[1],w:item[2],d:item[3],color:item[4],...(item[5]||{})},s=planSpriteImages.get(planSpriteKey(f));if(!s){requestPlanSprite(f);return;}const svg=el.querySelector('.library-plan');if(!svg)return;svg.setAttribute('viewBox',`${s.x} ${s.y} ${s.w} ${s.d}`);svg.innerHTML=planSpriteSVG(f,s);});}
const oldPlanUpdate=window.updateStudio;
window.updateStudio=function(){oldPlanUpdate();const enabled=materialPlan();document.body.classList.toggle('plan-rendered',enabled);if(!enabled)$('#gWalls').removeAttribute('filter');document.querySelectorAll('[data-plan-style]').forEach(b=>b.classList.toggle('on',b.dataset.planStyle===(state.presentation?.planStyle||'rendered')));styleControls.hidden=state.workflow==='structure';styleNote.hidden=!enabled;styleNote.textContent='MATERIAL PLAN / 材质俯视';refreshPlanLibrary();};
// Export waits for visible model sprites, then uses embedded SVG patterns/images.
const oldPlanExport=exportPNG;
async function exportMaterialPlan(){
 await window.PlanStyle.ready();const clone=svg.cloneNode(true),b=C.bounds(state),width=3200,height=Math.round(width*b.h/b.w);clone.setAttribute('viewBox',`${b.x} ${b.y} ${b.w} ${b.h}`);clone.setAttribute('width',width);clone.setAttribute('height',height);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.querySelector('#gSel').innerHTML='';clone.querySelector('#gGrid').innerHTML=`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="#fafaf8"/>`;
 const image=new Image(),url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml;charset=utf-8'}));
 try{await new Promise((res,rej)=>{image.onload=res;image.onerror=()=>rej(Error('平面图片导出失败，请重试'));image.src=url;});const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;canvas.getContext('2d').drawImage(image,0,0);return await new Promise((res,rej)=>canvas.toBlob(blob=>blob?res(blob):rej(Error('平面图片生成失败')),'image/png'));}finally{URL.revokeObjectURL(url);}
}
exportPNG=async function(){if(!materialPlan()||is3D())return oldPlanExport();try{download('材质平面方案.png',await exportMaterialPlan());}catch(e){toast(e.message);}};$('#exportPng').onclick=exportPNG;
window.PlanStyle={ready:async()=>{await SurfaceTextures.ready();ensurePlanPatterns();for(let i=0;i<6;i++){for(const f of state.furniture)requestPlanSprite(C.clone(f));await Promise.allSettled([...planSpritePending.values()]);if(!state.furniture.some(f=>!planSpriteImages.has(planSpriteKey(f))))break;}if(materialPlan())renderFurn();},inspect:()=>({style:state.presentation?.planStyle||'rendered',images:planSpriteImages.size,pending:planSpritePending.size}),texture:planTexture,exportBlob:exportMaterialPlan};
addEventListener('load',()=>{buildDefs();renderAll();});
buildDefs();renderAll();
