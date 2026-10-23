/* Room-aware material swatches. Choices live in the existing full plan data. */
let surfaceOpen=false,surfaceFamily='wood',surfaceRoom='',surfaceCardsFamily='',surfaceRoomOptions='',surfaceSignature='',surfaceRefresh=Promise.resolve();
const wallPaints=[['#f4f1eb','奶油白'],['#d9cbb7','沙岩米'],['#b9c4b1','鼠尾草绿'],['#a5b7bc','雾蓝灰'],['#696b68','岩石灰']];
const surfaceToggle=document.createElement('button');surfaceToggle.id='surfaceToggle';surfaceToggle.className='btn';surfaceToggle.textContent='▦ 材质';surfaceToggle.setAttribute('aria-expanded','false');$('#openArchitectView').after(surfaceToggle);
const surfaceDock=document.createElement('section');surfaceDock.id='surfaceDock';surfaceDock.className='surface-dock';surfaceDock.setAttribute('aria-label','房间材质样板');surfaceDock.hidden=true;
surfaceDock.innerHTML=`<div class="surface-top"><div class="surface-tabs" role="tablist" aria-label="材质分类">${[['wood','木地板'],['stone','石材'],['fabric','地毯'],['paint','墙面']].map(([id,label])=>`<button id="surface-tab-${id}" role="tab" aria-selected="false" aria-controls="surfaceSamples" data-surface-family="${id}">${label}</button>`).join('')}</div><label class="surface-target">应用到 <select id="surfaceRoom" aria-label="更换材质的房间"></select></label><button id="closeSurface" class="surface-close" aria-label="收起材质面板">×</button></div><div id="surfaceSamples" class="surface-samples" role="tabpanel"></div><div class="surface-bottom"><span id="surfaceDescription" aria-live="polite"></span><span>墙面样板可拖放 · 高亮后松手</span></div>`;
$('#stage').append(surfaceDock);
const architectSurfaceButton=document.createElement('button');architectSurfaceButton.id='architectMaterials';architectSurfaceButton.className='btn';architectSurfaceButton.textContent='▦ 材质';$('#architectClose').before(architectSurfaceButton);
const galleryLogo=document.createElement('div');galleryLogo.className='home-logo-mark gallery-home-logo';galleryLogo.setAttribute('aria-label','造个家');galleryLogo.innerHTML='<small>MAKE IT</small><strong>HOME<i>.</i></strong>';$('.architect-title').prepend(galleryLogo);
function surfaceRug(){return state.furniture.find(f=>'rug:'+f.id===surfaceRoom&&DecorCatalogue.isRug(f.type));}
function toggleSurface(){const rug=ui.sel?.kind==='furn'&&getF(ui.sel.id);if(!state.structure.rooms.length&&!DecorCatalogue.isRug(rug?.type))return toast('先添加房间或地毯，再选择材质');if(state.workflow==='structure'&&!$('#architectDialog').open)return toast('请先确认结构，进入家具布置后选择材质');if(rug&&DecorCatalogue.isRug(rug.type)){surfaceRoom='rug:'+rug.id;surfaceFamily='fabric';}surfaceOpen=!surfaceOpen;renderSurfaceDock();}
surfaceToggle.onclick=architectSurfaceButton.onclick=toggleSurface;
$('#closeSurface').onclick=()=>{surfaceOpen=false;renderSurfaceDock();};
surfaceDock.querySelectorAll('[data-surface-family]').forEach(button=>button.onclick=()=>{surfaceFamily=button.dataset.surfaceFamily;renderSurfaceDock();});
$('#surfaceRoom').onchange=e=>{surfaceRoom=e.target.value;const rug=surfaceRug();if(rug){surfaceFamily='fabric';select({kind:'furn',id:rug.id});}else if(surfaceRoom){surfaceFamily=C.floorMaterials[state.rooms[surfaceRoom]?.mat]?.family||'wood';select({kind:'room',id:surfaceRoom});}else{ui.sel=null;renderSel();renderPanel();}renderSurfaceDock();};
function renderSurfaceCards(){
 const rug=surfaceRug(),key=surfaceFamily+'|'+(rug?rug.color:JSON.stringify(state.rooms[surfaceRoom]?.surfaceLayout||null));if(surfaceCardsFamily===key)return;surfaceCardsFamily=key;
 const items=rug?DecorCatalogue.patterns:surfaceFamily==='paint'?WallFinishCore.options():Object.entries(C.floorMaterials).filter(([,m])=>m.family===surfaceFamily).map(([id,m])=>({id,...m}));
 const root=$('#surfaceSamples');root.replaceChildren();root.setAttribute('aria-labelledby','surface-tab-'+surfaceFamily);
 for(const item of items){const button=document.createElement('button');button.className='surface-sample';button.dataset.surface=item.id;button.setAttribute('aria-label',item.name);button.setAttribute('aria-pressed','false');const preview=document.createElement('i');preview.className='surface-texture';if(rug)preview.style.backgroundImage=`url("${decorPatternImage(item.id,rug.color)}")`;else if(item.color)preview.style.backgroundColor=item.color;else preview.style.backgroundImage=`url("${PlanStyle.texture(item.texture||item.id,item.finish?undefined:state.rooms[surfaceRoom]?.surfaceLayout).href}")`;const name=document.createElement('b');name.textContent=item.name;const price=document.createElement('small');price.textContent=rug?'当前地毯图案':item.finish?'拖到 3D 墙面':`参考 ¥${item.price}/m²`;if(item.source||C.floorMaterials[item.texture]?.source)button.title='ambientCG · CC0 · 规格为铺贴预设';button.append(preview,name,price);button.onclick=()=>{if(window.WallFinishDrag?.suppressClick())return;applySurface(item.id);};if(item.finish){button.dataset.wallFinish=item.id;button.style.touchAction='none';}root.append(button);}
}
function applySurface(id){
 const rug=surfaceRug();if(rug){applyRugPattern(rug,id);return;}
 if(surfaceFamily==='paint'&&id.startsWith('wall:'))return toast('请将这个样板拖到要铺贴的 3D 墙面');
 if(!surfaceRoom||!state.rooms[surfaceRoom])return toast('请先选择要更换材质的房间');
 const roomId=surfaceRoom,family=surfaceFamily;if(family==='paint'&&!wallPaints.some(([c])=>c===id)||family!=='paint'&&!C.floorMaterials[id])return;
 if(state.rooms[roomId][family==='paint'?'wallColor':'mat']===id)return;
 mutate(()=>{state.rooms[roomId][family==='paint'?'wallColor':'mat']=id;if(family!=='paint')delete state.rooms[roomId].surfaceLayout;});
}
function renderSurfaceDock(){
 const gallery=$('#architectDialog').open,rooms=state.structure.rooms,selected=ui.sel?.kind==='room'&&rooms.find(r=>r.id===ui.sel.id);
 const selectedRug=ui.sel?.kind==='furn'&&getF(ui.sel.id);if(selectedRug&&DecorCatalogue.isRug(selectedRug.type)&&surfaceRoom!=='rug:'+selectedRug.id){surfaceRoom='rug:'+selectedRug.id;surfaceFamily='fabric';}
 if(selected&&surfaceRoom!==selected.id){surfaceRoom=selected.id;surfaceFamily=C.floorMaterials[state.rooms[surfaceRoom]?.mat]?.family||'wood';surfaceOpen=true;}
 if(!rooms.some(r=>r.id===surfaceRoom)&&!surfaceRug())surfaceRoom='';
 const options=[...rooms.map(r=>[r.id,state.rooms[r.id]?.name||r.name||'未命名房间']),...state.furniture.filter(f=>DecorCatalogue.isRug(f.type)).map(f=>['rug:'+f.id,'地毯 · '+f.name])],signature=JSON.stringify(options);
 if(signature!==surfaceRoomOptions){surfaceRoomOptions=signature;$('#surfaceRoom').innerHTML='<option value="">选择房间…</option>'+options.map(([id,name])=>`<option value="${esc(id)}">${esc(name)}</option>`).join('');}
 $('#surfaceRoom').value=surfaceRoom;
 const visible=surfaceOpen&&(rooms.length>0||!!surfaceRug())&&(gallery||state.workflow==='furniture'),parent=gallery?$('#architectCanvas'):$('#stage');if(surfaceDock.parentElement!==parent)parent.append(surfaceDock);surfaceDock.hidden=!visible;
 $('#stage').classList.toggle('materials-open',!!visible&&!gallery);surfaceToggle.classList.toggle('on',!!visible);surfaceToggle.disabled=!rooms.length&&!state.furniture.some(f=>DecorCatalogue.isRug(f.type));surfaceToggle.setAttribute('aria-expanded',String(!!visible));architectSurfaceButton.setAttribute('aria-expanded',String(!!visible));
 if(visible){renderSurfaceCards();const rug=surfaceRug();surfaceDock.querySelectorAll('[data-surface-family]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.surfaceFamily===surfaceFamily));b.disabled=!!rug&&b.dataset.surfaceFamily!=='fabric';});const material=state.rooms[surfaceRoom];surfaceDock.querySelectorAll('[data-surface]').forEach(b=>{b.disabled=surfaceFamily!=='paint'&&!material&&!rug;b.setAttribute('aria-pressed',String(rug?b.dataset.surface===(rug.rugPattern||'woven'):!!material&&b.dataset.surface===(surfaceFamily==='paint'?material.wallColor:material.mat)));});$('#surfaceDescription').textContent=rug?'当前地毯 · '+rug.name+'（不影响房间地面）':material?(surfaceFamily==='paint'?'墙面颜色 · '+material.wallColor:'当前地面 · '+C.floorMaterials[material.mat].name):surfaceFamily==='paint'?'拖到 3D 墙面 · 高亮后松手，逐渐铺开':'先选择房间或地毯，再点击喜欢的材质';}
 const materials=JSON.stringify([state.structure.walls.map(w=>[w.id,w.wallFinishes]),rooms.map(r=>[r.id,state.rooms[r.id]?.mat,state.rooms[r.id]?.wallColor,state.rooms[r.id]?.surfaceLayout]),state.furniture.filter(f=>DecorCatalogue.isRug(f.type)).map(f=>[f.id,f.rugPattern,f.color])]);
 if(materials!==surfaceSignature){surfaceSignature=materials;if(gallery&&window.ArchitectView?.refreshMaterials)surfaceRefresh=Promise.resolve().then(()=>ArchitectView.refreshMaterials()).catch(e=>toast('材质已保存，效果图更新失败：'+e.message));}
}
const panelBeforeSurfaces=renderPanel;renderPanel=function(){panelBeforeSurfaces();renderSurfaceDock();};
const studioBeforeSurfaces=window.updateStudio;window.updateStudio=function(){studioBeforeSurfaces();renderSurfaceDock();};
new MutationObserver(renderSurfaceDock).observe($('#architectDialog'),{attributes:true,attributeFilter:['open']});
window.SurfaceMaterials={open:()=>{surfaceOpen=true;renderSurfaceDock();},close:()=>{surfaceOpen=false;renderSurfaceDock();},ready:()=>surfaceRefresh,inspect:()=>({open:!surfaceDock.hidden,room:surfaceRoom,family:surfaceFamily})};
renderAll();

addEventListener('surface-texture-ready',()=>{surfaceCardsFamily='';renderSurfaceDock();});
