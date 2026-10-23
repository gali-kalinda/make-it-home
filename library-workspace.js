(function(){
'use strict';
const L=LibraryWorkspaceCore,lib=$('#lib'),head=document.querySelector('.studio-lib-head'),search=$('#librarySearch'),actions=document.querySelector('.import-actions');
let prefs=L.normalize(),ready=false,writeQueue=Promise.resolve(),visibilityKey='';const repo=L.repository(window.indexedDB);
const tabs=document.createElement('div');tabs.className='library-tabs';tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','家具库来源');tabs.innerHTML='<button id="libraryPublicTab" role="tab" aria-controls="lib" aria-selected="true" data-library-tab="public">公用</button><button id="libraryMineTab" role="tab" aria-controls="lib" aria-selected="false" data-library-tab="mine">我的</button>';$('#libraryHeading').after(tabs);
const filters=document.createElement('div');filters.id='libraryMineFilters';filters.className='library-mine-filters';filters.setAttribute('role','group');filters.setAttribute('aria-label','我的家具筛选');filters.innerHTML='<button data-library-filter="all">全部</button><button data-library-filter="favorites">已收藏</button><button data-library-filter="created">我创建的</button>';search.after(filters);
const add=document.createElement('details');add.id='libraryPersonalAdd';add.className='library-personal-add';add.innerHTML='<summary>＋ 添加我的家具</summary>';filters.after(add);add.append(actions);
let managing=false,managementBusy=false,personalReady=false;const selectedCreated=new Set();
const management=document.createElement('div');management.className='library-management';management.innerHTML='<div class="library-management-actions"><button id="libraryManage" type="button">多选</button><button id="libraryTrash" type="button" hidden>最近删除</button></div><div id="libraryBatchActions" hidden><div class="library-management-actions"><button id="librarySelectCreatedAll" type="button">全选</button><button id="librarySelectCreatedNone" type="button">取消全选</button><button id="libraryDeleteCreated" type="button" class="danger" disabled>删除所选</button></div><small id="libraryCreatedSelection" role="status"></small><small>仅从家具库移除，方案中已摆放的家具会保留。</small></div>';add.after(management);
document.body.insertAdjacentHTML('beforeend','<dialog id="libraryTrashDialog" class="studio-dialog library-trash-dialog" aria-labelledby="libraryTrashTitle"><form method="dialog"><button class="close-dialog" aria-label="关闭最近删除">×</button></form><h2 id="libraryTrashTitle">最近删除</h2><p class="muted">恢复后，家具会回到“我的 → 我创建的”。</p><button id="libraryRestoreAll" class="btn" type="button">全部恢复</button><div id="libraryTrashList"></div></dialog>');
const empty=document.createElement('div');empty.id='libraryEmpty';empty.className='library-empty';lib.append(empty);
function visibleCreated(){return [...lib.querySelectorAll('.item')].filter(el=>!el.hidden&&L.owned(itemOf(el)));}
function updateManagement(){
 const mine=prefs.tab==='mine'&&!window.PlanPipelineCore?.reviewing(state),visible=visibleCreated(),ids=new Set(visible.map(el=>itemOf(el)[5].catalogueId));
 for(const id of selectedCreated)if(!ids.has(id))selectedCreated.delete(id);
 if(!mine){managing=false;selectedCreated.clear();}management.hidden=!mine;lib.classList.toggle('library-managing',managing);
 $('#libraryManage').textContent=managing?'完成':'多选';$('#libraryManage').setAttribute('aria-pressed',String(managing));$('#libraryManage').disabled=managementBusy||!personalReady||(!managing&&!visible.length);$('#libraryBatchActions').hidden=!managing;
 $('#librarySelectCreatedAll').disabled=managementBusy||!visible.length||selectedCreated.size===visible.length;$('#librarySelectCreatedNone').disabled=managementBusy||!selectedCreated.size;$('#libraryDeleteCreated').disabled=managementBusy||!selectedCreated.size;$('#libraryDeleteCreated').textContent=managementBusy?'正在保存…':`删除所选${selectedCreated.size?'（'+selectedCreated.size+'）':''}`;$('#libraryCreatedSelection').textContent=`已选 ${selectedCreated.size} 件`;
 const deleted=PhotoFurniture.deleted();$('#libraryTrash').hidden=!deleted.length;$('#libraryTrash').textContent=`最近删除（${deleted.length}）`;$('#libraryTrash').disabled=managementBusy||!personalReady;
 for(const el of lib.querySelectorAll('.item')){const id=itemOf(el)[5]?.catalogueId,control=el.querySelector('.library-select-control'),checkbox=control?.querySelector('input');if(control){control.hidden=!managing;checkbox.checked=selectedCreated.has(id);checkbox.disabled=managementBusy;}el.classList.toggle('library-item-selected',managing&&selectedCreated.has(id));}
}
function renderTrash(){const records=PhotoFurniture.deleted().sort((a,b)=>b.deletedAt-a.deletedAt);$('#libraryRestoreAll').disabled=managementBusy||!records.length;$('#libraryTrashList').innerHTML=records.length?records.map(r=>`<div class="library-trash-row"><span>${esc(r.name)}</span><button type="button" class="btn" data-restore-created="${esc(r.id)}" ${managementBusy?'disabled':''}>恢复</button></div>`).join(''):'<p class="muted">没有已删除的家具。</p>';}
$('#libraryManage').onclick=()=>{if(managementBusy)return;managing=!managing;selectedCreated.clear();updateManagement();window.refreshLibraryPreviews?.();};
$('#librarySelectCreatedAll').onclick=()=>{if(managementBusy)return;visibleCreated().forEach(el=>selectedCreated.add(itemOf(el)[5].catalogueId));updateManagement();};
$('#librarySelectCreatedNone').onclick=()=>{if(managementBusy)return;selectedCreated.clear();updateManagement();};
$('#libraryDeleteCreated').onclick=async()=>{if(managementBusy||!selectedCreated.size)return;const ids=[...selectedCreated];managementBusy=true;updateManagement();try{const count=await PhotoFurniture.removeCreated(ids);selectedCreated.clear();toast(`已删除 ${count} 件家具，可在“最近删除”中恢复`);}catch(e){toast('删除未完成：'+e.message);}finally{managementBusy=false;sync();}};
$('#libraryTrash').onclick=()=>{renderTrash();$('#libraryTrashDialog').showModal();};
async function restoreCreated(ids){if(managementBusy)return;managementBusy=true;updateManagement();renderTrash();try{const count=await PhotoFurniture.restoreCreated(ids);toast(`已恢复 ${count} 件家具`);}catch(e){toast('恢复未完成：'+e.message);}finally{managementBusy=false;sync();renderTrash();}}
$('#libraryRestoreAll').onclick=()=>restoreCreated(PhotoFurniture.deleted().map(r=>r.id));$('#libraryTrashList').onclick=e=>{const id=e.target.closest('[data-restore-created]')?.dataset.restoreCreated;if(id)restoreCreated([id]);};
// Selection mode owns card gestures so a click or drag cannot place furniture.
lib.addEventListener('pointerdown',e=>{if(!managing||!e.target.closest('.item')||e.target.closest('.library-favorite'))return;e.stopImmediatePropagation();if(!e.target.closest('.library-select-control'))e.preventDefault();},true);
lib.addEventListener('click',e=>{if(!managing||!e.target.closest('.item')||e.target.closest('.library-favorite'))return;e.stopImmediatePropagation();if(managementBusy||e.target.closest('.library-select-control'))return;const item=itemOf(e.target.closest('.item'));if(!L.owned(item))return;const id=item[5].catalogueId;selectedCreated.has(id)?selectedCreated.delete(id):selectedCreated.add(id);updateManagement();},true);
lib.addEventListener('change',e=>{if(!e.target.matches('.library-select-control input')||managementBusy)return;const id=itemOf(e.target.closest('.item'))[5].catalogueId;e.target.checked?selectedCreated.add(id):selectedCreated.delete(id);updateManagement();});
PhotoFurniture.libraryReady().finally(()=>{personalReady=true;updateManagement();});
function persist(){const payload=L.normalize(prefs);writeQueue=writeQueue.catch(()=>{}).then(()=>repo.save(payload)).catch(e=>{toast('收藏设置未能保存，请重试');console.error('Library preferences',e);});return writeQueue;}
function sync(){
 const mine=prefs.tab==='mine',review=window.PlanPipelineCore?.reviewing(state),editing=state.workflow==='structure'&&!review;
 tabs.hidden=!!review;filters.hidden=!mine||!!review;add.hidden=!mine||!!review||editing;
 actions.hidden=editing||!!review||!mine;
 for(const b of tabs.querySelectorAll('button')){const active=b.dataset.libraryTab===prefs.tab;b.setAttribute('aria-selected',String(active));b.disabled=!ready;}
 for(const b of filters.querySelectorAll('button')){b.setAttribute('aria-pressed',String(b.dataset.libraryFilter===prefs.filter));b.disabled=!ready;}
 const q=search.value,visible=[];
 for(const el of lib.querySelectorAll('.item')){
  const item=itemOf(el),show=L.matches(item,prefs,q);el.hidden=!show;if(show)visible.push(el.dataset.key);
  const b=el.querySelector('.library-favorite');if(b){const saved=prefs.favorites.includes(L.key(item)),name=String(nm(item[1]));b.setAttribute('aria-pressed',String(saved));b.setAttribute('aria-label',(saved?'取消收藏':'收藏')+' '+name);b.title=(saved?'取消收藏':'收藏')+' '+name;b.disabled=!ready;}
 }
 for(const h of lib.querySelectorAll(':scope>h4')){const grid=h.nextElementSibling;if(grid?.classList.contains('lib-grid'))h.hidden=grid.hidden=![...grid.querySelectorAll('.item')].some(el=>!el.hidden);}
 const hint=lib.querySelector('.hint');if(hint)hint.hidden=mine||!visible.length;
 empty.hidden=!!visible.length||!!review||lib.hidden;
 empty.replaceChildren();if(!empty.hidden){const title=document.createElement('b'),note=document.createElement('p');title.textContent=q.trim()?'没有找到相关家具':prefs.filter==='favorites'?'还没有收藏家具':'这里还没有家具';note.textContent=q.trim()?'试试其他名称，或切换公用 / 我的。':prefs.filter==='created'?'在“添加我的家具”中导入模型，或从图片生成。':'点击家具右上角的星标收藏，也可以添加自己生成的家具。';empty.append(title,note);}
 lib.setAttribute('role','tabpanel');lib.setAttribute('aria-labelledby',mine?'libraryMineTab':'libraryPublicTab');
 updateManagement();
 const nextKey=[prefs.tab,prefs.filter,q,is3D(),lib.hidden,visible.join('|')].join(':');if(visibilityKey!==nextKey){visibilityKey=nextKey;window.refreshLibraryPreviews?.();}
}
function decorate(){
 lib.append(empty);
 for(const grid of lib.querySelectorAll('.personal-furniture-grid')){const h=grid.previousElementSibling;if(h?.tagName==='H4')h.textContent='我的家具';}
 for(const el of lib.querySelectorAll('.item')){
  // Provenance and dimension uncertainty remain in model data / properties, not card badges.
  el.querySelectorAll('.photo-library-tag').forEach(tag=>tag.remove());
  const name=el.querySelector('b');if(name)name.title=name.textContent;
  if(L.owned(itemOf(el))&&!el.querySelector('.library-select-control')){const label=document.createElement('label'),input=document.createElement('input');label.className='library-select-control';label.hidden=true;input.type='checkbox';input.setAttribute('aria-label','选择家具 '+String(nm(itemOf(el)[1])));label.append(input);el.prepend(label);}
  if(el.querySelector('.library-favorite'))continue;
  const b=document.createElement('button');b.type='button';b.className='library-favorite';b.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3-5.7-3-5.7 3 1.1-6.3L2.8 9.7l6.4-.9z"/></svg>';
  b.addEventListener('pointerdown',e=>e.stopPropagation());b.onclick=e=>{e.stopPropagation();if(!ready)return;const id=L.key(itemOf(el)),set=new Set(prefs.favorites);set.has(id)?set.delete(id):set.add(id);prefs.favorites=[...set];sync();persist();};el.append(b);
 }
 visibilityKey='';sync();
}
tabs.onclick=e=>{const b=e.target.closest('[data-library-tab]');if(!b||!ready||managementBusy)return;managing=false;selectedCreated.clear();prefs.tab=b.dataset.libraryTab;lib.scrollTop=0;sync();persist();};
filters.onclick=e=>{const b=e.target.closest('[data-library-filter]');if(!b||!ready||managementBusy)return;managing=false;selectedCreated.clear();prefs.filter=b.dataset.libraryFilter;lib.scrollTop=0;sync();persist();};
search.oninput=()=>{lib.scrollTop=0;sync();};
const beforeBuild=buildLib;buildLib=function(){beforeBuild();decorate();};
const beforeUpdate=window.updateStudio;window.updateStudio=function(){beforeUpdate();sync();};
const beforeView=setView;setView=async function(mode){const value=await beforeView(mode);sync();return value;};
repo.load().then(value=>{prefs=value;}).catch(e=>{console.error('Library preferences',e);}).finally(()=>{ready=true;sync();});
decorate();
// Subtle edge handles use the editor's existing panel state and shortcuts.
const app=$('.app'),rails={};
for(const which of ['lib','panel']){const b=document.createElement('button');b.type='button';b.id=which==='lib'?'libraryEdgeToggle':'propertiesEdgeToggle';b.className='side-rail-toggle';b.onclick=()=>{drawer(which);positionRails();};app.append(b);rails[which]=b;}
// Keep the collapse arrow separate from the draggable panel boundary.
const librarySide=document.querySelector('aside.lib'),widthStore='floorplan-library-width-v1';
let preferredWidth=null,widthDrag=null;
try{const saved=Number(localStorage.getItem(widthStore));if(Number.isFinite(saved)&&saved>=200&&saved<=50000)preferredWidth=saved;}catch{}
const libraryResize=document.createElement('div');libraryResize.id='libraryResizeHandle';libraryResize.className='library-resize-handle';libraryResize.tabIndex=0;libraryResize.setAttribute('role','separator');libraryResize.setAttribute('aria-label','调整家具库宽度');libraryResize.setAttribute('aria-orientation','vertical');libraryResize.setAttribute('aria-controls','lib');libraryResize.title='左右拖动调整家具库宽度，双击恢复默认';app.append(libraryResize);
function widthLimits(){
 const available=app.getBoundingClientRect().width,right=app.classList.contains('hide-panel')?0:document.querySelector('aside.right').getBoundingClientRect().width;
 const max=Math.max(120,narrow()?available-24:Math.min(available*.82,available-right-240));
 return {min:Math.min(narrow()?240:225,max),max:Math.floor(max)};
}
function currentLibraryWidth(){return narrow()?librarySide.getBoundingClientRect().width:parseFloat(getComputedStyle(app).gridTemplateColumns)||250;}
function applyLibraryWidth(value){
 const limits=widthLimits(),width=Math.round(Math.max(limits.min,Math.min(limits.max,value))),css=width+'px';
 if(app.style.getPropertyValue('--library-panel-width')!==css)app.style.setProperty('--library-panel-width',css);
 return width;
}
function saveLibraryWidth(){try{if(preferredWidth===null)localStorage.removeItem(widthStore);else localStorage.setItem(widthStore,String(preferredWidth));}catch{}}
function updateLibraryResize(){
 if(preferredWidth!==null)applyLibraryWidth(preferredWidth);
 const r=librarySide.getBoundingClientRect(),open=narrow()?librarySide.classList.contains('open'):!app.classList.contains('hide-lib'),limits=widthLimits();
 libraryResize.hidden=!open||r.width<20;libraryResize.style.left=(r.right+(narrow()?0:4))+'px';libraryResize.style.top=(r.top+20)+'px';libraryResize.style.height=Math.max(0,r.height-40)+'px';
 libraryResize.setAttribute('aria-valuemin',String(limits.min));libraryResize.setAttribute('aria-valuemax',String(limits.max));libraryResize.setAttribute('aria-valuenow',String(Math.round(currentLibraryWidth())));libraryResize.setAttribute('aria-valuetext',Math.round(r.width)+' 像素');
 lib.style.setProperty('--library-columns',String(Math.max(3,Math.floor((r.width-20)/110))));
}
libraryResize.addEventListener('pointerdown',e=>{
 if(e.button!==0||!e.isPrimary)return;e.preventDefault();e.stopPropagation();widthDrag={id:e.pointerId,x:e.clientX,width:currentLibraryWidth(),preferred:preferredWidth};libraryResize.setPointerCapture(e.pointerId);app.classList.add('library-resizing');
});
libraryResize.addEventListener('pointermove',e=>{
 if(!widthDrag||widthDrag.id!==e.pointerId)return;preferredWidth=applyLibraryWidth(widthDrag.width+e.clientX-widthDrag.x);positionRails();
});
function finishWidthDrag(e,cancel=false){
 if(!widthDrag||e.pointerId!==widthDrag.id)return;const previous=widthDrag.preferred;const id=widthDrag.id;widthDrag=null;
 if(cancel){preferredWidth=previous;if(previous===null)app.style.removeProperty('--library-panel-width');else applyLibraryWidth(previous);}else saveLibraryWidth();
 app.classList.remove('library-resizing');if(libraryResize.hasPointerCapture(id))libraryResize.releasePointerCapture(id);positionRails();
}
libraryResize.addEventListener('pointerup',e=>finishWidthDrag(e));libraryResize.addEventListener('pointercancel',e=>finishWidthDrag(e,true));libraryResize.addEventListener('lostpointercapture',e=>finishWidthDrag(e,true));
libraryResize.addEventListener('dblclick',()=>{preferredWidth=null;app.style.removeProperty('--library-panel-width');saveLibraryWidth();positionRails();});
libraryResize.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&widthDrag){e.preventDefault();finishWidthDrag({pointerId:widthDrag.id},true);return;}
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const limits=widthLimits(),step=e.shiftKey?80:20;
 preferredWidth=applyLibraryWidth(e.key==='Home'?limits.min:e.key==='End'?limits.max:currentLibraryWidth()+(e.key==='ArrowRight'?step:-step));saveLibraryWidth();positionRails();
});
function positionRails(){
 updateLibraryResize();
 const stage=$('#stage').getBoundingClientRect();
 for(const which of ['lib','panel']){const side=document.querySelector(which==='lib'?'aside.lib':'aside.right'),r=side.getBoundingClientRect(),open=narrow()?side.classList.contains('open'):!app.classList.contains(which==='lib'?'hide-lib':'hide-panel'),name=which==='lib'?'家具库':'属性面板',b=rails[which];
  let x=which==='lib'?(open?(narrow()?r.right:stage.left):8):(open?(narrow()?r.left:stage.right):innerWidth-8);
  b.style.left=Math.max(8,Math.min(innerWidth-8,x))+'px';b.style.top=(stage.top+stage.height/2)+'px';b.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="'+((which==='lib')===open?'m10 3-5 5 5 5':'m6 3 5 5-5 5')+'"/></svg>';b.setAttribute('aria-label',(open?'收起':'展开')+name);b.title=(open?'收起':'展开')+name;b.setAttribute('aria-expanded',String(open));
 }
}
const resize=new ResizeObserver(positionRails);for(const el of [app,$('#stage'),document.querySelector('aside.lib'),document.querySelector('aside.right')])resize.observe(el);
for(const side of [librarySide,document.querySelector('aside.right')])side.addEventListener('transitionend',e=>{if(e.target===side&&e.propertyName==='transform')positionRails();});
const classes=new MutationObserver(positionRails);for(const el of [app,document.querySelector('aside.lib'),document.querySelector('aside.right')])classes.observe(el,{attributes:true,attributeFilter:['class']});
positionRails();window.LibraryWorkspace={sync,preferences:()=>L.normalize(prefs),saved:()=>writeQueue,ready:()=>ready};
})();
