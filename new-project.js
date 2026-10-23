/* Start with a genuinely empty plan. Keep a full history snapshot before switching. */
(function(){
 const button=document.createElement('button');button.id='newProject';button.type='button';button.className='btn';button.textContent='＋ 新建';button.setAttribute('aria-label','新建项目');button.title='新建空白项目，当前项目自动备份';const historySection=document.querySelector('#editorSettings .history-settings');historySection.querySelector('h4').after(button);
 let busy=false;const welcome=document.querySelector('#welcome'),original={heading:welcome.querySelector('h1').innerHTML,copy:welcome.querySelector('p').innerHTML};
 const empty=()=>!!state.emptyProject&&!state.source&&!state.structure.walls.length&&!state.structure.openings.length&&!state.structure.columns.length&&!state.structure.rooms.length&&!state.furniture.length;
 function sync(){const yes=empty();document.body.classList.toggle('new-project-empty',yes);button.disabled=busy;if(yes){welcome.hidden=false;welcome.querySelector('h1').textContent='从一张户型图开始';welcome.querySelector('p').textContent='这是一个空白项目，上传户型后开始创建你的家。';document.querySelector('#welcomeUpload').innerHTML='上传户型 <span>↗</span>';document.querySelector('#editorDock').hidden=true;document.querySelector('#contextPanelTitle').textContent='新项目';}else{welcome.querySelector('h1').innerHTML=original.heading;welcome.querySelector('p').innerHTML=original.copy;}}
 async function prepare(){
  if(is3D())await setView('2d');
  draft=[];structTool='pick';wallCursor=null;wallPrevious=null;structureDrag=null;drag=null;pinch=null;ui.sel=null;ui.mA=null;ui.mCur=null;calibrationPair=null;window.emptyStarted=false;
  if(libDrag){libDrag.ghost?.remove();libDrag.el?.classList.remove('dragging');libDrag=null;}
  pendingImage=null;document.querySelector('#uploadPreview').replaceChildren();document.querySelector('#uploadInfo').textContent='请选择户型图片，上传后再识别墙体、门窗与房间。';for(const id of ['dialogImage','planImageInput'])document.getElementById(id).value='';originalSetTool('select');
 }
 async function create(){
  if(busy||PlanHistory.busy)return;
  if(switching)return toast('请等待视图切换完成后再新建');
  if(recognizing||window.PlanPipeline?.inspect?.()?.busy||window.PhotoFurniture?.getStatus?.()?.busy||window.FurnitureThreeViews?.inspect?.()?.busy||typeof sceneExtractBusy!=='undefined'&&sceneExtractBusy)return toast('请等待当前识别或生成完成后再新建');
  busy=true;button.textContent='正在新建…';button.disabled=true;const app=document.querySelector('.app'),wasInert=app.inert;app.inert=true;
  try{await window.planRestorationReady;await window.PhotoFurniture?.libraryReady?.();await PlanHistory.newProject();toast('已新建空白项目，原项目已保存到历史方案');}
  catch(e){toast('新建未完成，原项目保留：'+(e?.message||'保存备份失败'));}
  finally{app.inert=wasInert;busy=false;button.textContent='＋ 新建';sync();button.focus();}
 }
 button.onclick=create;
 const beforeAddItem=addItem;addItem=function(...args){if(empty())return toast('请先上传户型，再放置家具');return beforeAddItem(...args);};Studio.addItem=addItem;
 const previous=window.updateStudio;window.updateStudio=function(){previous();sync();};
 window.NewProject={create,prepare,inspect:()=>({busy,empty:empty()})};sync();
})();
