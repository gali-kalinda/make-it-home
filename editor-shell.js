/* Organize existing editor controls without replacing their handlers or scene. */
(function(){
const icons={
 select:'<path d="m5 3 14 9-7 1-3 7z"/>',wall:'<path d="M4 20V4h16v5H9v11z"/>',
 openings:'<path d="M4 20V4h9v16M13 4c5 0 7 3 7 7h-7"/><circle cx="10" cy="13" r=".6"/>',
 door:'<path d="M5 21V3h12v18M5 3l9 3v15H5"/><circle cx="11" cy="13" r=".6"/>',
 window:'<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M12 4v16M3 12h18"/>',
 column:'<path d="m5 5 7-3 7 3v14l-7 3-7-3zM5 5l7 3 7-3M12 8v14"/>',
 room:'<path stroke-dasharray="3 3" d="M4 4h16v16H4z"/><path d="M3 3h3v3H3zM18 18h3v3h-3z"/>',
 ruler:'<path d="m3 16 13-13 5 5L8 21zM7 12l3 3M11 8l3 3M15 4l3 3"/>',
 view:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
 cut:'<path d="m3 8 9-5 9 5v10l-9 4-9-4zM3 8l9 4 9-4M12 12v10"/><path d="M1 15h22" stroke-dasharray="3 2"/>',
 settings:'<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2" fill="white"/><circle cx="16" cy="12" r="2" fill="white"/><circle cx="9" cy="18" r="2" fill="white"/>',
 style:'<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5z"/>',
 library:'<path d="M5 10V6c0-3 14-3 14 0v4M4 10h16v8H4zM6 18v3M18 18v3M8 10v4h8v-4"/>',
 panel:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18M18 8h1M18 12h1"/>',
 plan:'<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M12 3v18M3 10h9M12 15h9"/>',
 cube:'<path d="m12 2 9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10"/>',
 undo:'<path d="m8 4-5 5 5 5M4 9h10a6 6 0 0 1 0 12h-3"/>',redo:'<path d="m16 4 5 5-5 5M20 9H10a6 6 0 0 0 0 12h3"/>',
 full:'<path d="M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5"/>',material:'<path d="M3 4h18v16H3zM3 12h18M9 4v8M15 12v8"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>'
};
const svgIcon=name=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+icons[name]+'</svg>';
function iconButton(el,name,label){el.innerHTML=svgIcon(name);el.classList.add('editor-icon');el.title=label;el.setAttribute('aria-label',label);el.dataset.tooltip=label;el.removeAttribute('data-en');return el;}
function menu(id,name,label,extra=''){const el=document.createElement('details');el.id=id;el.className='editor-menu '+extra;el.innerHTML='<summary class="editor-icon" aria-label="'+label+'" title="'+label+'" data-tooltip="'+label+'">'+svgIcon(name)+'</summary><div class="editor-pop"></div>';return el;}
function groupTool(button,name,label){const group=document.createElement('div');group.className='primitive-group';button.before(group);group.append(iconButton(button,name,label));return group;}
const header=document.querySelector('header'),actions=document.createElement('div');actions.id='editorActions';header.append(actions);
const dock=document.createElement('div');dock.id='editorDock';dock.innerHTML='<div id="primarySlot"></div><div id="layoutTools"></div>';$('.app').append(dock);
$('#primarySlot').append($('#newUpload'),$('#confirmStructure'));dock.append($('#structureToolbar'));$('#layoutTools').append($('#tools'));
for(const [name,label] of [['pick','选择 / 移动'],['column','柱子'],['room','房间边界']])iconButton($('[data-st="'+name+'"]'),({pick:'select',column:'column',room:'room'})[name],label);
const wallGroup=groupTool($('[data-st="wall"]'),'wall','墙体');wallGroup.id='wallToolGroup';wallGroup.insertAdjacentHTML('beforeend','<div class="primitive-pop"><strong>墙体</strong><small>连续点击画墙 · Alt 自由角度</small></div>');wallGroup.querySelector('.primitive-pop').append($('#finishWallChain'));
const roomGroup=groupTool($('[data-st="room"]'),'room','房间边界');roomGroup.insertAdjacentHTML('beforeend','<div class="primitive-pop"><strong>房间边界</strong></div>');roomGroup.querySelector('.primitive-pop').append($('#finishRoom'));
const openingGroup=document.createElement('details');openingGroup.id='openingToolGroup';openingGroup.className='primitive-group';openingGroup.innerHTML='<summary class="editor-icon" title="门窗" data-tooltip="门窗" aria-label="门窗">'+svgIcon('openings')+'</summary><div class="primitive-pop"></div>';$('[data-st="door"]').before(openingGroup);
for(const [kind,label] of [['door','门'],['window','窗']]){const b=$('[data-st="'+kind+'"]');b.innerHTML=svgIcon(kind)+'<span>'+label+'</span>';b.title=label;b.setAttribute('aria-label',label);openingGroup.querySelector('.primitive-pop').append(b);b.addEventListener('click',()=>openingGroup.open=false);}
// Move room after column, matching the five primitive groups.
$('#structureToolbar').append($('[data-st="column"]'),roomGroup);
const settings=menu('editorSettings','settings','设置'),views=menu('editorViews','view','视图'),cut=menu('editorCut','cut','墙体剖切','only3d'),style=menu('editorStyle','style','风格');
actions.append(settings,views,cut,style);
const settingsBody=settings.querySelector('.editor-pop'),viewBody=views.querySelector('.editor-pop');
settingsBody.innerHTML='<h3>显示与设置</h3><h4 class="only2d">平面显示</h4>';
settingsBody.append($('#layers'));settingsBody.insertAdjacentHTML('beforeend','<h4 class="only3d">场景显示</h4>');settingsBody.append($('#toggles3d'),$('#sun').closest('.grp'));
settingsBody.insertAdjacentHTML('beforeend','<h4>户型与方案</h4><button id="replacePlan" class="btn">重新上传户型图</button>');settingsBody.append($('[data-st="calibrate"]'),$('#scaleBadge'),$('#clearAll'));
$('#replacePlan').onclick=()=>{settings.open=false;$('#newUpload').click();};$('[data-st="calibrate"]').addEventListener('click',()=>settings.open=false);
viewBody.innerHTML='<h3>视图</h3><h4 class="only3d">场景视角</h4>';viewBody.append($('#modes3d'),$('#vIso').closest('.grp'));viewBody.insertAdjacentHTML('beforeend','<h4 class="only2d">平面视图</h4>');viewBody.append($('#fit').closest('.grp'),document.querySelector('.plan-style-buttons'));
cut.querySelector('.editor-pop').innerHTML='<h3>墙体剖切</h3>';cut.querySelector('.editor-pop').append($('[data-cut]').closest('.grp'));
style.querySelector('.editor-pop').innerHTML='<h3>显示风格</h3><p>直接应用于 3D 场景，保留家具操作。</p>';style.querySelector('.editor-pop').append($('#sceneStyleGroup'));
// Keep the style switch icon-only; its tooltip describes the active style.
actions.append(iconButton($('#tgLib'),'library','家具库'),iconButton($('#tgPanel'),'panel','属性面板'),settings,views,$('#viewSeg'),cut,style);
iconButton($('#viewSeg [data-view="2d"]'),'plan','2D 平面');iconButton($('#viewSeg [data-view="3d"]'),'cube','3D 场景');
actions.append(iconButton($('#surfaceToggle'),'material','材质'),iconButton($('#undo'),'undo','撤销'),iconButton($('#redo'),'redo','重做'),iconButton($('#fullscreen'),'full','全屏'));
const files=document.querySelector('details.menu'),fileActions=files.querySelector('.menu-pop');
fileActions.className='settings-file-actions';settingsBody.insertAdjacentHTML('beforeend','<h4>导入与导出</h4>');settingsBody.append(fileActions);files.remove();settings.classList.add('menu');actions.append(settings);
const effect=$('#openArchitectView');effect.textContent='3D 效果图';effect.title='独立全屋轴测与图片导出';viewBody.append(effect);
for(const [kind,name,label] of [['select','select','选择 / 移动'],['measure','ruler','测量'],['demolish','wall','拆改非承重墙']])iconButton($('#tools [data-tool="'+kind+'"]'),name,label);
// Preserve the original structure list and selection handlers, now next to review controls.
const catalog=document.createElement('details');catalog.id='structureCatalog';catalog.open=true;catalog.innerHTML='<summary>墙体、门窗与房间</summary>';$('#reviewControls').after(catalog);catalog.append($('#structureList'));
const panelTitle=document.createElement('div');panelTitle.id='contextPanelTitle';document.querySelector('aside.right').prepend(panelTitle);
// Header holds only the logo, workflow and compact actions. Remove emptied wrappers.
for(const node of [...header.children])if(node!==actions&&node!==document.querySelector('.brand')&&node!==document.querySelector('.workflow-nav')&&node.id!=='fileIn')node.hidden=true;
for(const el of [views,cut])el.querySelectorAll('.btn').forEach(b=>b.addEventListener('click',()=>el.open=false));
for(const b of style.querySelectorAll('[data-scene-style]'))b.addEventListener('click',()=>{style.open=false;syncShell();});
document.addEventListener('pointerdown',e=>{for(const el of [settings,views,cut,style,openingGroup])if(el.open&&!el.contains(e.target))el.open=false;},true);
document.addEventListener('keydown',e=>{if(e.key==='Escape')for(const el of [settings,views,cut,style,openingGroup])el.open=false;});
for(const el of [settings,views,cut,style])el.addEventListener('toggle',()=>{if(el.open)for(const other of [settings,views,cut,style])if(other!==el)other.open=false;});
let lastStructureSelection=null;
function syncShell(){
 const ai=window.PlanPipelineCore?.reviewing(state),editing=state.workflow==='structure'&&!ai,empty=$('#welcome').hidden===false;
 // The canvas context bar and the general tools share one bottom position.
 // A pending library drag also owns that space, before the new item is selected.
 const contextActions=$('#fab').classList.contains('show');
 dock.hidden=empty||ai||contextActions||!!libDrag;$('#confirmStructure').hidden=!editing;$('#newUpload').hidden=editing;$('#newUpload').textContent='＋ 上传户型';$('#confirmStructure').textContent='确认结构 →';
 const selectedStructure=editing&&ui.sel&&['wall','opening','column','room'].includes(ui.sel.kind)?ui.sel:null;
 $('#reviewControls').hidden=!editing||!!selectedStructure;
 if(selectedStructure){catalog.open=false;if(lastStructureSelection!==selectedStructure.id)document.querySelector('aside.right').scrollTop=0;}else if(lastStructureSelection)catalog.open=true;lastStructureSelection=selectedStructure?.id||null;
 $('#layoutTools').hidden=editing||is3D();catalog.hidden=!editing;$('#finishWallChain').disabled=structTool!=='wall';
 $('#libraryHeading').innerHTML=ai?'原图家具 · AI 核对':'家具库<span>↗</span>';
 if(!ai){$('#lib').hidden=false;$('#librarySearch').hidden=false;}panelTitle.textContent=selectedStructure?({wall:'墙体',opening:'门窗',column:'柱子',room:'房间'}[selectedStructure.kind]+'属性'):editing?'检查结构':ai?'原图家具':'布置与属性';
 openingGroup.querySelector('summary').classList.toggle('on',['door','window'].includes(structTool));
 const styleLabel='风格：'+({standard:'标准',soft:'柔光',su:'SU'}[C.sceneStyle(state)])+'（标准 / 柔光 / SU）';style.querySelector('summary').title=styleLabel;style.querySelector('summary').setAttribute('aria-label',styleLabel);style.querySelector('summary').dataset.tooltip=styleLabel;
 for(const b of $('#viewSeg').querySelectorAll('[data-view]'))b.setAttribute('aria-pressed',String((b.dataset.view==='3d')===is3D()));
 if(ai)catalog.hidden=true;
}
const beforeShellPanel=renderPanel;renderPanel=function(){beforeShellPanel();syncShell();};
const beforeShell=window.updateStudio;window.updateStudio=function(){beforeShell();syncShell();};
// View changes do not necessarily trigger a full editor render.
const shellSetView=setView;setView=async function(mode){const result=await shellSetView(mode);syncShell();return result;};
// Run after the catalogue handlers, including cancelled or out-of-canvas drops.
for(const type of ['pointerdown','pointerup','pointercancel'])window.addEventListener(type,syncShell);
new MutationObserver(()=>syncShell()).observe(document.body,{attributes:true,attributeFilter:['class']});
new ResizeObserver(()=>document.documentElement.style.setProperty('--editor-menu-top',(header.getBoundingClientRect().bottom+8)+'px')).observe(header);
window.EditorShell={sync:syncShell};syncShell();
})();
