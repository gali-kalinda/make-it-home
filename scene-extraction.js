/* Multi-object extraction, size review and atomic model-library import. */
const SceneCore=SceneExtractionCore;
let sceneExtractSession=null,sceneExtractBusy=false,sceneExtractJob=0,sceneManual=false;
let sceneAnalysisController=null,sceneAnalysisFile=null,sceneExtractSource=null;
document.querySelector('.import-actions').insertAdjacentHTML('beforeend','<button id="extractSceneFurniture">▧ 效果图提取 · 多件家具</button><input id="sceneFurnitureInput" type="file" accept="image/png,image/jpeg" hidden>');
document.body.insertAdjacentHTML('beforeend',`<dialog id="sceneExtractDialog" class="studio-dialog scene-extract-dialog" aria-labelledby="sceneExtractTitle"><form method="dialog"><button class="close-dialog" aria-label="关闭效果图提取">×</button></form><div class="eyebrow">RENDER TO YOUR FURNITURE LIBRARY</div><h2 id="sceneExtractTitle">从一张效果图，提取多件家具。</h2><p class="muted">核对框选与造型 → 调整预估尺寸 → 批量生成立体近似模型并入库</p><div class="scene-extract-layout"><div><div class="scene-reference" id="sceneReference"><img id="sceneReferenceImage" alt="待提取家具的效果图"><svg id="sceneReferenceBoxes" aria-label="家具候选框选"></svg></div><p class="scene-source-info" id="sceneAnalysisProvider"></p><div class="scene-extract-tools"><button class="btn" id="sceneManualBox">＋ 手动框选</button><button class="btn" id="sceneSelectClear">选清晰主体</button><button class="btn" id="sceneSelectAll">全选</button><button class="btn" id="sceneSelectNone">取消全选</button></div><details class="small muted"><summary>提取范围与不确定项</summary><p id="sceneExcluded"></p></details></div><div><div class="scene-estimate-notice" id="sceneEstimateNotice">AI 预估尺寸 · 非实测。单张透视图无法确定真实尺寸，生成前可逐件调整；遮挡严重的候选默认不选。</div><div id="sceneCandidateList"></div><div id="sceneResultGrid" class="scene-results" hidden></div><p id="sceneBatchProgress" role="status"></p><div class="scene-extract-footer"><small id="sceneSelectionCount">正在读取图片…</small><button class="btn primary" id="generateSceneBatch" disabled>生成所选家具并入库</button></div></div></div></dialog>`);
document.body.insertAdjacentHTML('beforeend',`<dialog id="sceneUploadDialog" class="studio-dialog scene-upload-dialog" aria-labelledby="sceneUploadTitle"><form method="dialog"><button class="close-dialog" aria-label="关闭效果图上传">×</button></form><div class="eyebrow">RENDER TO YOUR FURNITURE LIBRARY</div><h2 id="sceneUploadTitle">上传效果图</h2><p class="muted">粘贴图片，或从文件夹选择一张效果图。</p><div id="scenePasteZone" class="scene-paste-zone" tabindex="0" role="group" aria-label="效果图粘贴区域"><svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="7" width="22" height="21" rx="3"/><path d="M12 7V4h8v3M5 22l7-7 6 6 4-4 5 5"/><circle cx="22" cy="12" r="2"/></svg><b>在此按 Ctrl + V 粘贴图片</b><span>也支持 ⌘ + V · PNG / JPG · 最大 15 MB</span><img id="sceneUploadPreview" alt="已选择的效果图预览" hidden></div><div class="scene-upload-actions"><button class="btn" id="sceneChooseFile">从文件夹选择图片</button><button class="btn primary" id="sceneStartExtract" disabled>开始提取家具 →</button></div><p id="sceneUploadStatus" class="scene-upload-status" role="status">复制一张图片后，在此窗口直接粘贴。</p></dialog>`);
let sceneUploadFile=null,sceneUploadRevision=0;
$('#sceneUploadPreview').insertAdjacentHTML('afterend','<button type="button" id="sceneRemoveUpload" class="scene-remove-upload" aria-label="移除已选图片" title="移除图片" hidden>×</button>');
function clearSceneUploadImage(message='图片已移除，可以重新粘贴或从文件夹选择。'){
 sceneUploadRevision++;sceneUploadFile=null;$('#sceneFurnitureInput').value='';$('#sceneUploadPreview').hidden=true;$('#sceneUploadPreview').removeAttribute('src');$('#sceneRemoveUpload').hidden=true;$('#scenePasteZone').classList.remove('has-image');$('#sceneStartExtract').disabled=true;$('#sceneStartManual').disabled=true;$('#sceneUploadStatus').textContent=message;
}
$('#sceneRemoveUpload').onclick=e=>{e.preventDefault();e.stopPropagation();clearSceneUploadImage();$('#scenePasteZone').focus();};
function openSceneUpload(){
 if(sceneExtractBusy)return toast('当前批次仍在生成，完成后可继续上传');
 clearSceneUploadImage('复制一张图片后，在此窗口直接粘贴。');
 if(!$('#sceneUploadDialog').open)$('#sceneUploadDialog').showModal();$('#scenePasteZone').focus();
}
async function setSceneUploadImage(file){
 clearSceneUploadImage('正在读取图片…');const revision=sceneUploadRevision;
 try{const source=await readImage(file);if(revision!==sceneUploadRevision||!$('#sceneUploadDialog').open)return;
  sceneUploadFile=file;$('#sceneUploadPreview').src=source.data;$('#sceneUploadPreview').hidden=false;$('#sceneRemoveUpload').hidden=false;$('#scenePasteZone').classList.add('has-image');$('#sceneStartExtract').disabled=false;$('#sceneUploadStatus').textContent=`${source.width} × ${source.height} · 已准备好，可开始提取或粘贴另一张图片。`;
 }catch(e){if(revision===sceneUploadRevision)$('#sceneUploadStatus').textContent=e.message;}
}
$('#extractSceneFurniture').onclick=openSceneUpload;
$('#sceneChooseFile').onclick=()=>$('#sceneFurnitureInput').click();
$('#sceneFurnitureInput').onchange=e=>{const file=e.target.files[0];e.target.value='';if(file){if(!$('#sceneUploadDialog').open)openSceneUpload();setSceneUploadImage(file);}};
$('#sceneUploadDialog').addEventListener('paste',e=>{
 const items=[...(e.clipboardData?.items||[])],images=items.filter(i=>i.kind==='file'&&i.type.startsWith('image/'));
 const file=images.find(i=>['image/png','image/jpeg'].includes(i.type))?.getAsFile()||images[0]?.getAsFile()||[...(e.clipboardData?.files||[])].find(f=>f.type.startsWith('image/'));
 if(file){e.preventDefault();e.stopPropagation();setSceneUploadImage(file);}
 else if(!e.target.closest('input,textarea,[contenteditable="true"]')){$('#sceneUploadStatus').textContent='剪贴板中没有图片，请先复制图片或截图，也可以从文件夹选择。';e.preventDefault();e.stopPropagation();}
});
$('#sceneUploadDialog').addEventListener('keydown',e=>e.stopPropagation());
$('#sceneUploadDialog').addEventListener('close',()=>{sceneUploadRevision++;sceneUploadFile=null;});
$('#sceneStartExtract').onclick=()=>{const file=sceneUploadFile;if(!file)return;$('#sceneUploadDialog').close();openSceneExtraction(file);};
$('#sceneStartExtract').insertAdjacentHTML('beforebegin','<button class="btn" id="sceneStartManual" disabled>直接手动框选</button>');
$('#sceneStartManual').onclick=()=>{const file=sceneUploadFile;if(!file)return;$('#sceneUploadDialog').close();openSceneExtraction(file,{manualOnly:true});};
new MutationObserver(()=>$('#sceneStartManual').disabled=$('#sceneStartExtract').disabled).observe($('#sceneStartExtract'),{attributes:true,attributeFilter:['disabled']});
const sceneKinds={sofa:'沙发',chair:'椅子',stool:'凳子',coffeetable:'茶几',sidetable:'边几',table:'餐桌',bed:'床',wardrobe:'衣柜',cabinet:'柜子',wall_cubby_shelf:'壁挂架',lamp:'灯具',rug:'地毯',art_abstract:'装饰画',tv:'壁挂电视'};
// Keep previously selected model variants intact while grouping their UI labels.
function sceneManualCategory(kind){return ({scene_sofa:'sofa',straight_sofa:'sofa',slab_armchair:'chair',thin_frame_chair:'chair',z_child_chair:'chair',clover_stool:'stool',round_tripod_table:'coffeetable',coffee_oval:'coffeetable',pedestal_side_table:'sidetable',block_dining_table:'table',cone_floor_lamp:'lamp',standing_lamp:'lamp',geometric_rug:'rug',rug_rect:'rug',rounded_tv_cabinet:'cabinet'})[kind]||kind;}
async function sceneCrop(source,box){const image=new Image();await new Promise((res,rej)=>{image.onload=res;image.onerror=rej;image.src=source.data;});const [x,y,w,h]=box,canvas=document.createElement('canvas'),scale=Math.min(1,768/Math.max(image.width*w,image.height*h));canvas.width=Math.max(1,Math.round(image.width*w*scale));canvas.height=Math.max(1,Math.round(image.height*h*scale));canvas.getContext('2d').drawImage(image,image.width*x,image.height*y,image.width*w,image.height*h,0,0,canvas.width,canvas.height);return canvas.toDataURL('image/jpeg',.87);}
$('#sceneAnalysisProvider').insertAdjacentHTML('afterend','<div id="sceneAnalysisActions" class="scene-extract-tools"><button class="btn" id="sceneRetryAnalysis" hidden>重新识别这张图</button><button class="btn" id="sceneCancelAnalysis" hidden>取消识别</button></div>');
$('#sceneRetryAnalysis').onclick=()=>{if(sceneAnalysisFile)openSceneExtraction(sceneAnalysisFile);};
$('#sceneCancelAnalysis').onclick=()=>sceneAnalysisController?.abort();
$('#sceneExtractDialog').addEventListener('close',()=>{sceneExtractJob++;sceneAnalysisController?.abort();});
async function openSceneExtraction(file,{manualOnly=false}={}){
 if(sceneExtractBusy)return toast('当前批次仍在生成，完成后可继续上传');sceneAnalysisController?.abort();const controller=new AbortController(),job=++sceneExtractJob,start=Date.now();sceneAnalysisController=controller;sceneAnalysisFile=file;
 sceneExtractSource=null;setSceneManualMode(false);
 let source=null,phase='正在读取图片…';sceneManual=false;sceneExtractSession=null;$('#sceneResultGrid').hidden=true;$('#sceneCandidateList').hidden=false;$('#sceneCandidateList').innerHTML='<div class="scene-empty">正在分析效果图中的多件家具…</div>';$('#sceneBatchProgress').textContent='';$('#generateSceneBatch').disabled=true;$('#sceneSelectionCount').textContent='正在分析…';$('#sceneReferenceBoxes').innerHTML='';$('#sceneAnalysisProvider').textContent='';$('#sceneExcluded').textContent='';$('#sceneManualBox').classList.remove('on');$('#sceneReference').classList.remove('manual');$('#sceneRetryAnalysis').hidden=true;$('#sceneCancelAnalysis').hidden=false;
 const tools=['sceneManualBox','sceneSelectClear','sceneSelectAll','sceneSelectNone'];tools.forEach(id=>$('#'+id).disabled=true);
 const update=()=>{if(job===sceneExtractJob){const seconds=Math.round((Date.now()-start)/1000);$('#sceneBatchProgress').textContent=phase;$('#sceneSelectionCount').textContent=`识别中 · 已用 ${seconds} 秒`;}};const timer=setInterval(update,1000);update();
 try{
  source=await readImage(file);if(job!==sceneExtractJob)return;if(controller.signal.aborted)throw new DOMException('识别已取消','AbortError');sceneExtractSource=source;$('#sceneReferenceImage').src=source.data;if(!$('#sceneExtractDialog').open)$('#sceneExtractDialog').showModal();
  if(manualOnly){await createManualSceneSession(source,'手动框选模式：未调用 AI，请自行填写家具类别及宽、深、高。');if(job!==sceneExtractJob)return;setSceneManualMode(true);$('#sceneBatchProgress').textContent='请在左侧原图上拖出家具矩形。';return;}
  let analysis=null;
  if(!analysis){phase='正在连接图片识别服务…';update();const response=await fetch('/api/furniture/extract-scene-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:source.data}),signal:controller.signal});analysis=await SceneExtractionStream.read(response,event=>{phase=event.text||'正在识别…';update();});}
  if(job!==sceneExtractJob)return;
  const items=analysis.items.map((item,i)=>({...SceneCore.cleanItem(item,i),dimensionSource:'ai-estimate',originalDimensions:C.clone(item.dimensions)}));for(const item of items)item.crop=await sceneCrop(source,item.box);if(job!==sceneExtractJob)return;
  sceneExtractSession={source,analysis,items,results:[],failures:[]};$('#sceneAnalysisProvider').textContent=analysis.message;$('#sceneEstimateNotice').textContent=analysis.provider==='unavailable'?'自动识别暂不可用。可直接手动框选并填写类别及宽、深、高，不会猜测或套用其他图片。':'AI 预估尺寸 · 非实测。单张透视图无法确定真实尺寸，生成前可逐件调整；遮挡严重的候选默认不选。';$('#sceneExcluded').textContent=(analysis.excluded||[]).join('；')||'只提取图中可见家具；遮挡和背面保持不确定，尺寸为预估。';renderSceneCandidates();window.RenderReconcile?.sessionReady(sceneExtractSession);$('#sceneBatchProgress').textContent=`本次识别用时 ${Math.round((Date.now()-start)/1000)} 秒。`;
 }catch(e){
  if(job!==sceneExtractJob)return;const message=e.name==='AbortError'?'识别已取消，原图已保留。':e.message;
  if(source){await createManualSceneSession(source,message);if(job!==sceneExtractJob)return;$('#sceneRetryAnalysis').hidden=false;}
  else $('#sceneCandidateList').innerHTML=`<div class="scene-empty">${esc(message)}</div>`;
  $('#sceneSelectionCount').textContent='识别未完成 · 可以重试或手动框选';$('#sceneBatchProgress').textContent=message;if(e.name!=='AbortError')toast(message);
 }finally{clearInterval(timer);if(sceneAnalysisController===controller){sceneAnalysisController=null;$('#sceneCancelAnalysis').hidden=true;tools.forEach(id=>$('#'+id).disabled=!sceneExtractSession);}}
}
function renderSceneBoxes(){const session=sceneExtractSession;if(!session)return;const svg=$('#sceneReferenceBoxes'),W=session.source.width,H=session.source.height;svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.innerHTML=session.items.map((item,i)=>{const [x,y,w,h]=item.box;return `<g data-scene-box="${item.id}" class="${item.selected?'selected':''}"><rect x="${x*W}" y="${y*H}" width="${w*W}" height="${h*H}" rx="3"/><text x="${x*W+W*.006}" y="${y*H+H*.036}" style="font-size:${W*.018}px">${i+1}</text></g>`;}).join('');}
function sceneSelection(){const items=sceneExtractSession?.items.filter(i=>i.selected)||[];$('#sceneSelectionCount').textContent=`${sceneExtractSession?.items.length||0} 项候选 · 已选 ${items.length} 件 · 尺寸${items.some(i=>i.dimensionSource==='ai-estimate')?'含 AI 预估':'待自行核对'}`;$('#generateSceneBatch').disabled=sceneExtractBusy||!items.length||!items.every(i=>SceneCore.validSize(i.dimensions));return items;}
function renderSceneCandidates(){
 const session=sceneExtractSession;if(!session)return;if(session.items.length)$('#sceneRetryAnalysis').hidden=true;$('#sceneResultGrid').hidden=true;$('#sceneCandidateList').hidden=false;$('#sceneCandidateList').innerHTML=session.items.length?session.items.map((i,index)=>`<article class="scene-candidate ${i.selected?'':'unselected'}" data-candidate="${i.id}"><input type="checkbox" data-scene-select="${i.id}" aria-label="选择 ${esc(i.name)}" ${i.selected?'checked':''}><img src="${i.crop}" alt="${esc(i.name)}的原图局部"><div><input class="scene-candidate-name" data-scene-name="${i.id}" aria-label="家具 ${index+1} 名称" value="${esc(i.name)}"><span class="scene-candidate-badge">${index+1} · ${i.visibility==='occluded'?'遮挡较多 · 待核对':'框选候选 · 待看图建模'} · ${i.dimensionSource==='ai-estimate'?'AI 预估尺寸':'手动调整'}</span><div class="scene-size-fields">${[['w','宽'],['d','深'],['h','高']].map(([key,label])=>`<label>${label} mm<input type="number" min="10" max="50000" data-scene-size="${i.id}" data-size-key="${key}" value="${i.dimensions[key]||''}" aria-label="${esc(i.name)} ${label}"></label>`).join('')}${i.elevation?`<label>离地 mm<input type="number" min="0" max="10000" data-scene-elevation="${i.id}" value="${i.elevation}" aria-label="${esc(i.name)} 离地高度"></label>`:''}</div>${i.manual?`<label class="small">家具类别 <select data-scene-kind="${i.id}">${Object.entries(sceneKinds).map(([kind,name])=>`<option value="${kind}" ${kind===sceneManualCategory(i.kind)?'selected':''}>${name}</option>`).join('')}</select></label>`:''}<details><summary>估算依据 / 遮挡说明</summary><p>${esc(i.dimensions.basis||'请自行填写实际尺寸。')}</p>${i.dimensions.range?`<p>建议范围（非测量）：${['w','d','h'].map(k=>(i.dimensions.range[k]||[]).join('–')).join(' × ')} mm</p>`:''}<p>${esc((i.uncertainFeatures||[]).join('；'))}</p></details></div></article>`).join(''):'<div class="scene-empty">当前没有可用的家具候选。可用左侧「手动框选」标出家具，并填写类型与尺寸后生成近似模型。</div>';renderSceneBoxes();sceneSelection();window.RenderReconcile?.render();
}
$('#sceneCandidateList').addEventListener('input',e=>{const session=sceneExtractSession;if(!session||sceneExtractBusy)return;const el=e.target,id=el.dataset.sceneSize||el.dataset.sceneName||el.dataset.sceneElevation,item=session.items.find(i=>i.id===id);if(!item)return;if(el.dataset.sceneSize){item.dimensions[el.dataset.sizeKey]=Number(el.value);item.dimensionSource='user-input';el.closest('article').querySelector('.scene-candidate-badge').textContent='手动调整尺寸 · 请核对';}if(el.dataset.sceneName)item.name=el.value.slice(0,120);if(el.dataset.sceneElevation)item.elevation=Math.max(0,Math.min(10000,Number(el.value)||0));sceneSelection();});
$('#sceneCandidateList').addEventListener('change',e=>{const el=e.target,item=sceneExtractSession?.items.find(i=>i.id===(el.dataset.sceneSelect||el.dataset.sceneKind));if(!item||sceneExtractBusy)return;if(el.dataset.sceneSelect)item.selected=el.checked;if(el.dataset.sceneKind){item.kind=el.value;item.type=SceneCore.kinds[item.kind];}renderSceneCandidates();});
for(const [id,test] of [['sceneSelectAll',()=>true],['sceneSelectNone',()=>false],['sceneSelectClear',i=>i.visibility!=='occluded']])$('#'+id).onclick=()=>{if(!sceneExtractSession||sceneExtractBusy)return;sceneExtractSession.items.forEach(i=>i.selected=test(i));renderSceneCandidates();};
$('#sceneReferenceBoxes').addEventListener('click',e=>{if(sceneManual||sceneExtractBusy)return;const el=e.target.closest('[data-scene-box]'),item=sceneExtractSession?.items.find(i=>i.id===el?.dataset.sceneBox);if(item){item.selected=!item.selected;renderSceneCandidates();}});
$('#sceneManualBox').setAttribute('aria-pressed','false');
$('#sceneReferenceImage').draggable=false;
$('#sceneManualBox').closest('.scene-extract-tools').insertAdjacentHTML('afterend','<p id="sceneManualHint" class="scene-manual-hint" role="status" hidden></p>');
async function createManualSceneSession(source,message){
 const binary=Uint8Array.from(atob(source.data.split(',')[1]),c=>c.charCodeAt(0)),hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',binary))].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(source!==sceneExtractSource)return;
 sceneExtractSession={source,analysis:{provider:'unavailable',imageHash:hash,items:[],excluded:[],message},items:[],results:[],failures:[]};renderSceneCandidates();window.RenderReconcile?.sessionReady(sceneExtractSession);$('#sceneAnalysisProvider').textContent=message;$('#sceneEstimateNotice').textContent='手动框选后，请填写家具类别及宽、深、高。尺寸未填写完整前不会生成家具。';
}
function setSceneManualMode(active){
 sceneManual=active;clearSceneBox();$('#sceneManualBox').classList.toggle('on',active);$('#sceneManualBox').setAttribute('aria-pressed',String(active));$('#sceneManualBox').textContent=active?'✓ 结束框选':'＋ 手动框选';$('#sceneReference').classList.toggle('manual',active);$('#sceneManualHint').hidden=!active;$('#sceneManualHint').textContent=active?'按住鼠标左键，从家具的一角拖到对角后松开。可以连续框选多件家具。':'';
}
$('#sceneManualBox').onclick=async()=>{
 if(sceneExtractBusy)return toast('家具正在生成，请完成后再框选');
 if(!sceneExtractSession&&sceneExtractSource)await createManualSceneSession(sceneExtractSource,'请手动框选家具并填写尺寸。');
 if(!sceneExtractSession)return toast('请先选择一张效果图');setSceneManualMode(!sceneManual);
};
let sceneBoxStart=null,sceneBoxPointer=null;
function sceneBoxPoint(e){const r=$('#sceneReferenceBoxes').getBoundingClientRect();return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];}
function clearSceneBox(){sceneBoxStart=null;sceneBoxPointer=null;document.getElementById('sceneDragBox')?.remove();}
$('#sceneExtractDialog').addEventListener('close',()=>setSceneManualMode(false));
$('#sceneReferenceBoxes').addEventListener('pointerdown',e=>{if(!sceneManual||!sceneExtractSession||sceneExtractBusy||e.button!==0)return;e.preventDefault();sceneBoxStart=sceneBoxPoint(e);sceneBoxPointer=e.pointerId;e.currentTarget.setPointerCapture(e.pointerId);});
$('#sceneReferenceBoxes').addEventListener('pointermove',e=>{if(!sceneBoxStart||e.pointerId!==sceneBoxPointer||!sceneExtractSession)return;const [x,y]=sceneBoxPoint(e),W=sceneExtractSession.source.width,H=sceneExtractSession.source.height;document.getElementById('sceneDragBox')?.remove();const rect=document.createElementNS('http://www.w3.org/2000/svg','rect');rect.id='sceneDragBox';for(const [k,v] of Object.entries({x:Math.min(x,sceneBoxStart[0])*W,y:Math.min(y,sceneBoxStart[1])*H,width:Math.abs(x-sceneBoxStart[0])*W,height:Math.abs(y-sceneBoxStart[1])*H}))rect.setAttribute(k,v);e.currentTarget.append(rect);});
$('#sceneReferenceBoxes').addEventListener('pointerup',async e=>{
 if(!sceneBoxStart||e.pointerId!==sceneBoxPointer)return;e.preventDefault();const end=sceneBoxPoint(e),start=sceneBoxStart,session=sceneExtractSession,job=sceneExtractJob;clearSceneBox();if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(!sceneManual||!session||sceneExtractBusy)return;
 const box=[Math.min(start[0],end[0]),Math.min(start[1],end[1]),Math.abs(end[0]-start[0]),Math.abs(end[1]-start[1])];if(Math.min(box[2],box[3])<.015){$('#sceneManualHint').textContent='框选范围太小，请按住鼠标左键拖出一个矩形。';return;}
 const item={id:C.id('manual'),name:'手动框选家具',kind:'cabinet',type:'cabinet',box,selected:true,visibility:'partial',manual:true,dimensionSource:'user-input',dimensions:{w:0,d:0,h:0,basis:'手动框选，未调用视觉模型理解；请填写尺寸。'},appearance:{bodyColor:'#b8ad98',secondaryColor:'#696457',accentColor:'#982d31'},visibleFeatures:[],uncertainFeatures:['造型按所选类型近似'],elevation:0};
 try{item.crop=await sceneCrop(session.source,box);if(session!==sceneExtractSession||job!==sceneExtractJob)return;session.items.push(item);renderSceneCandidates();$('#sceneManualHint').textContent='已添加 '+session.items.length+' 项候选。可继续框选，或在右侧填写类别和尺寸。';}catch{$('#sceneManualHint').textContent='图片裁剪未完成，请重新框选。';}
});
$('#sceneReferenceBoxes').addEventListener('pointercancel',clearSceneBox);
$('#sceneReferenceBoxes').addEventListener('lostpointercapture',clearSceneBox);
function generateSceneBatch(){return window.ImageFurnitureWorkflow.generateSceneBatch();}
function renderSceneResults(){return window.ImageFurnitureWorkflow.renderSceneResults();}
$('#generateSceneBatch').onclick=generateSceneBatch;
$('#sceneResultGrid').onclick=e=>{const id=e.target.closest('[data-place-scene]')?.dataset.placeScene;if(!id)return;const entry=state.catalogue.find(i=>i.id===id);if(!entry)return;if(state.workflow==='structure')enterFurniture();const p=placement(),item=LIB.flatMap(c=>c.items).find(i=>i[5]?.catalogueId===id);if(item){addItem(item,p[0],p[1]);$('#sceneExtractDialog').close();}};
const scenePropertyPanel=renderPanel;
renderPanel=function(){scenePropertyPanel();if(ui.sel?.kind!=='furn')return;const f=getF(ui.sel.id);if(!f?.sceneExtraction)return;$('#panel').insertAdjacentHTML('afterbegin',`<section><h3>效果图提取家具</h3><p class="scene-estimate-notice">${f.dimensionSource==='ai-estimate'?'AI 预估尺寸 · 非实测':'尺寸经过手动调整，尚未标为实测'}。单图透视、遮挡与画外部分会造成误差，请按实际商品核对。</p><label class="small">离地高度（mm）<input id="sceneFurnitureElevation" type="number" min="0" max="10000" value="${f.elevation||0}" style="width:100%;padding:8px;border:1px solid #ded6c9;margin-top:5px"></label><p class="small muted">${esc(f.dimensionEstimate?.basis||'根据图中比例估算。')}</p></section>`);$('#sceneFurnitureElevation').onchange=e=>mutate(()=>getF(f.id).elevation=Math.max(0,Math.min(10000,Number(e.target.value)||0)));};
window.SceneFurniture={openUpload:openSceneUpload,open:openSceneExtraction,generate:generateSceneBatch,getStatus:()=>({busy:sceneExtractBusy,analyzing:!!sceneAnalysisController,analysis:sceneExtractSession?.analysis,items:sceneExtractSession?.items,results:sceneExtractSession?.results,failures:sceneExtractSession?.failures}),ready:()=>!!sceneExtractSession&&!sceneExtractBusy&&sceneExtractSession.items.some(i=>i.selected)&&sceneExtractSession.items.filter(i=>i.selected).every(i=>SceneCore.validSize(i.dimensions))};

