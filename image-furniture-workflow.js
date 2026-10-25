/* Live crop -> 图片模型 parts -> GLB -> explicit visual approval. No preset fallback or automatic reuse. */
(function(){
 let controller=null,photoDraft=null;
 const sourceText='每件模型实时调用当前图片模型，根据当前图片生成部件。先对照原图预览，确认外观后再入库；单张图片无法还原被遮挡的细节。';
 document.querySelector('label[for="visionModel"]').textContent='模型名称';
 $('#sceneExtractDialog>.muted').textContent=sourceText;
 $('#generateSceneBatch').textContent='用当前模型生成所选模型';
 $('#sceneExtractDialog').addEventListener('close',()=>controller?.abort());
 $('#photoModelPreview').insertAdjacentHTML('beforebegin','<div class="photo-source-comparison"><small>原图</small><img id="photoGeometrySource" alt="当前家具原图"></div>');
 $('#photoModelResult .actions').insertAdjacentHTML('afterbegin','<button id="acceptPhotoGeometry" class="btn primary" hidden>外观符合，加入我的家具</button>');
 $('#generatePhotoFurniture').textContent='用 图片模型 看图生成模型';
 $('#photoColor').closest('label').hidden=true;
 $('#photoModelResult .small.muted').textContent=sourceText;
 $('#sceneResultGrid').insertAdjacentHTML('beforebegin','<button id="sceneBackToCandidates" class="btn" hidden>← 返回框选和尺寸</button>');
 $('#sceneBackToCandidates').onclick=()=>{$('#sceneResultGrid').hidden=true;$('#sceneCandidateList').hidden=false;$('#sceneBackToCandidates').hidden=true;sceneSelection();};
 $('#sceneResultGrid').insertAdjacentHTML('beforebegin','<div id="sceneResultSelection" class="scene-result-selection" hidden><div class="scene-result-select-actions" role="group" aria-label="生成结果选择"><button id="sceneResultSelectAll" class="btn">全选</button><button id="sceneResultSelectNone" class="btn">取消全选</button><span id="sceneResultSelectionCount" role="status"></span></div><button id="sceneImportSelected" class="btn primary" disabled>导入所选到家具库</button><small>勾选外观符合的家具后导入；放入方案请单独点击对应卡片。</small></div>');
 function syncImports(){for(const d of sceneExtractSession?.results||[]){const existing=ImageReviewCore.findImported(d,state.catalogue,state.assets);d.accepted=!!existing;d.importedEntryId=existing?.id;if(existing)d.selectedForImport=false;}}
 const currentSignature=d=>{const s=sceneExtractSession,i=s?.items.find(i=>i.id===d.item.id);return i?signature(s,i):null;};
 const pendingResults=()=>sceneExtractSession?.results.filter(d=>!d.accepted&&ImageReviewCore.ready(d,currentSignature(d)))||[];
 function updateResultSelection(){
  syncImports();const pending=pendingResults(),selected=pending.filter(d=>d.selectedForImport),show=!$('#sceneResultGrid').hidden,imported=sceneExtractSession?.results.filter(d=>d.accepted).length||0;
  $('#sceneResultSelection').hidden=!show;$('#sceneBackToCandidates').hidden=!show;
  $('#sceneResultSelectionCount').textContent=`待导入 ${pending.length} 件 · 已选 ${selected.length} 件${imported?' · 已在库 '+imported+' 件（自动排除重复）':''}`;
  $('#sceneImportSelected').textContent=`导入所选到家具库${selected.length?'（'+selected.length+'）':''}`;
  $('#sceneImportSelected').disabled=sceneExtractBusy||!selected.length;
  $('#sceneResultSelectAll').disabled=sceneExtractBusy||!pending.length||selected.length===pending.length;
  $('#sceneResultSelectNone').disabled=sceneExtractBusy||!selected.length;$('#sceneBackToCandidates').disabled=sceneExtractBusy;
 }
 new MutationObserver(updateResultSelection).observe($('#sceneResultGrid'),{attributes:true,attributeFilter:['hidden']});
 $('#sceneResultSelectAll').onclick=()=>{if(sceneExtractBusy)return;pendingResults().forEach(d=>d.selectedForImport=true);renderSceneResults();};
 $('#sceneResultSelectNone').onclick=()=>{if(sceneExtractBusy)return;pendingResults().forEach(d=>d.selectedForImport=false);renderSceneResults();};
 $('#sceneResultGrid').addEventListener('change',e=>{const index=e.target.dataset.importImageModel;if(index===undefined||sceneExtractBusy)return;const draft=sceneExtractSession?.results[Number(index)];if(!draft?.entry||draft.accepted)return;draft.selectedForImport=e.target.checked;e.target.closest('article').classList.toggle('selected-for-import',e.target.checked);updateResultSelection();});
 const signature=(session,item)=>SceneCore.originKey(session.analysis.imageHash,item)+':'+JSON.stringify(item.box)+':'+(item.fidelityFeedback||'');
 function recipeFor(result){return {schemaVersion:1,kind:'vision_parts',furnitureKind:result.geometry.kind,mounting:result.geometry.mounting,name:result.geometry.name,geometry:result.geometry,analysisProvider:'vision-image-geometry',approximate:true,disclosure:'当前图片模型 根据当前图片生成的部件模型，由网页转为 GLB；非原生图转 3D。未见背面和细节可能不准确，请核对外观。'};}
 async function draftFrom(input,item,reference,onProgress){
  const progress=text=>{if(onProgress)onProgress(text);else{const el=sceneExtractBusy?$('#sceneBatchProgress'):$('#photoProgress');el.textContent=text;}};
  const result=await ImageFurnitureModel.generate(input,event=>progress(event.text),controller.signal);progress('接口已返回模型部件，正在构建三维预览…');
  const recipe=recipeFor(result),binary=await View3D.createImageModel(result.geometry,input.dimensions),asset={id:C.id('image-asset'),name:(result.geometry.name||item.name)+'.glb',kind:'glb',data:await fileData(new Blob([binary],{type:'model/gltf-binary'})),recipe,provenance:result.provenance};await View3D.importModel(asset);
  const main=result.geometry.parts.filter(p=>p.material!=='glass').sort((a,b)=>b.size.reduce((n,v)=>n*v,1)-a.size.reduce((n,v)=>n*v,1))[0],mount=result.geometry.mounting;
  const entry={id:C.id('catalogue'),name:result.geometry.name||item.name,type:result.type,assetId:asset.id,...input.dimensions,color:main?.color||'#b8ad98',reference,recipe,elevation:item.elevation||(mount==='wall'?1350:mount==='ceiling'?2100:0),dimensionSource:item.dimensionSource||'user-input',dimensionEstimate:{basis:item.dimensions?.basis||'尺寸由用户填写或核对，单图无法实测。',range:item.dimensions?.range||null,measured:false},approximate:true,provenance:result.provenance};
  return {entry,asset,accepted:false,item,result};
 }
 async function acceptDraft(draft){
  if(!draft?.entry)return false;await PhotoFurniture.libraryReady();const existing=ImageReviewCore.findImported(draft,state.catalogue,state.assets);if(existing){draft.accepted=true;draft.importedEntryId=existing.id;return false;}const {entry,asset}=draft;if((state.catalogue?.length||0)>=500)throw Error('家具库容量不足');
  mutate(()=>{state.assets[asset.id]=asset;state.catalogue.push(entry);});if(!state.catalogue.some(e=>e.id===entry.id))throw Error('模型未能加入方案');draft.accepted=true;draft.importedEntryId=entry.id;
  try{await persistCatalogueItem(entry,asset);}catch{toast('模型已加入当前方案，个人库保存失败，请导出方案备份');}buildLib();save();return true;
 }
 function provenanceHTML(draft){const p=draft.entry.provenance,g=draft.result.geometry;return `<details class="model-provenance"><summary>${esc(p.model)} · ${g.parts.length} 个部件 · 查看来源</summary><p>${esc(g.description)}</p><p>${esc(g.observations.join('；'))}</p><p>待核对：${esc(g.uncertainties.join('；')||'背面和遮挡部分可能不准确')}</p><p>模型：${esc(p.model)}<br>请求：${esc(p.responseId||p.traceId||'服务未返回编号')}<br>框选图校验：${p.cropHash.slice(0,16)}…<br>几何校验：${p.geometryHash.slice(0,16)}…</p></details>`;}
 function updateJob(draft,text){
  draft.generation.text=text;const card=[...$('#sceneResultGrid').querySelectorAll('[data-scene-item-id]')].find(c=>c.dataset.sceneItemId===draft.item.id);
  if(card?.querySelector('.scene-job-text'))card.querySelector('.scene-job-text').textContent=text;
  $('#sceneBatchProgress').textContent='「'+draft.item.name+'」'+text;
 }
 function updateElapsed(){for(const card of $('#sceneResultGrid').querySelectorAll('[data-started-at]')){const seconds=Math.max(0,Math.floor((Date.now()-Number(card.dataset.startedAt))/1000));card.querySelector('.scene-job-elapsed').textContent='已用 '+seconds+' 秒'+(seconds>=60?' · 正在等待接口返回，可继续等待':'');}}
 async function generateSceneBatch(onlyIds=null,{force=false}={}){
  const session=sceneExtractSession;if(!session||sceneExtractBusy)return;
  const allSelected=sceneSelection().filter(item=>!window.RenderReconcile?.skip(item)),selected=onlyIds?session.items.filter(i=>onlyIds.includes(i.id)):allSelected;
  if(!selected.length||!selected.every(i=>SceneCore.validSize(i.dimensions)))return;if(!View3D?.createImageModel)return toast('三维组件尚未就绪');
  const pending=selected.filter(i=>force||!session.results.some(d=>d.item.id===i.id&&ImageReviewCore.ready(d,signature(session,i))));if(!pending.length){renderSceneResults();return;}
  sceneExtractBusy=true;const abort=controller=new AbortController();session.failures=(session.failures||[]).filter(f=>!pending.some(i=>i.id===f.id));let next=0,complete=0;
  const jobs=pending.map(item=>{let draft=session.results.find(d=>d.item.id===item.id);if(!draft){draft={item:C.clone(item),entry:null};session.results.push(draft);}draft.selectedForImport=false;draft.generation={status:'running',text:'等待发送到当前模型接口…',startedAt:Date.now()};if(onlyIds)draft.pinnedAt=Date.now();return draft;});
  renderSceneResults();if(onlyIds){$('#sceneResultGrid').scrollTop=0;$('#sceneResultSelection').scrollIntoView({block:'nearest'});}
  const timer=setInterval(updateElapsed,1000);updateElapsed();
  $('#sceneCandidateList').querySelectorAll('input,select').forEach(e=>e.disabled=true);$('#generateSceneBatch').disabled=true;$('#sceneAnalysisProvider').textContent='正在将本次框选图逐件发送给当前图片模型；卡片和旧预览会保留在原处。';
  const worker=async()=>{while(next<jobs.length&&!abort.signal.aborted){const draft=jobs[next++],item=C.clone(session.items.find(i=>i.id===draft.item.id));
   const retained=!force&&window.RenderReconcile?.retained(item);if(retained){Object.assign(draft,{entry:null,retainedId:retained.id,signature:signature(session,item),generation:{status:'completed'}});continue;}
   try{updateJob(draft,'正在准备当前框选图…');const crop=await sceneCrop(session.source,item.box);draft.reference=crop;renderSceneResults();updateJob(draft,'已发送框选图，等待接口生成模型部件…');
    const fresh=await draftFrom({image:crop,contextImage:session.source.data,targetBox:item.box,feedback:item.fidelityFeedback,kind:item.kind,name:item.name,dimensions:{w:item.dimensions.w,d:item.dimensions.d,h:item.dimensions.h}},item,crop,text=>updateJob(draft,text));
    if(abort.signal.aborted)throw Error('生成已取消');fresh.signature=signature(session,item);fresh.signatureVersion=2;fresh.entry.sceneExtraction={originKey:fresh.signature+':vision:'+fresh.entry.provenance.geometryHash,sourceImageHash:session.analysis.imageHash,box:item.box,candidateId:item.id,fileName:session.source.name,provider:'vision-image-geometry',visibility:item.visibility};Object.assign(fresh.asset.provenance,{sourceImageHash:session.analysis.imageHash,sourceBBox:item.box,candidateId:item.id});
    Object.assign(draft,fresh,{retainedId:null,importedEntryId:null,selectedForImport:false,generation:{status:'completed',text:'新模型已生成，请核对后导入。',finishedAt:Date.now()}});
   }catch(e){const message=abort.signal.aborted?'生成已中断，可重试此件。':e.message;draft.generation={...draft.generation,status:'failed',text:message};session.failures.push({id:item.id,name:item.name,error:message});}
   complete++;if(sceneExtractSession===session){renderSceneResults();$('#sceneBatchProgress').textContent=complete+' / '+jobs.length+' 件已结束'+(session.failures.length?' · 有未完成项，原因显示在对应卡片内':'');}
  }};
  try{await Promise.all(Array.from({length:4},worker));}
  finally{clearInterval(timer);for(const d of jobs)ImageReviewCore.interrupted(d);sceneExtractBusy=false;controller=null;$('#sceneCandidateList').querySelectorAll('input,select').forEach(e=>e.disabled=false);if(sceneExtractSession===session){renderSceneResults();sceneSelection();$('#generateSceneBatch').textContent='重试未完成模型（当前接口）';$('#sceneBatchProgress').textContent='本轮成功 '+jobs.filter(d=>d.generation.status==='completed').length+' 件'+(session.failures.length?' · 未完成 '+session.failures.length+' 件，可在卡片内重试。':' · 请核对外观后选择导入。');}window.RenderReconcile?.render();}
 }
 function renderSceneResults(){
  const session=sceneExtractSession;if(!session)return;ImageReviewCore.recoverFailures(session);syncImports();const grid=$('#sceneResultGrid'),scroll=grid.scrollTop;$('#sceneBackToCandidates').hidden=!session.results.length;$('#sceneCandidateList').hidden=!!session.results.length;grid.hidden=!session.results.length;
  grid.innerHTML=ImageReviewCore.ordered(session.results).map(({draft,index})=>{const {entry,item,retainedId}=draft;if(retainedId)return `<article class="scene-result-card"><h4>保留原有 ${esc(getF(retainedId)?.name||item.name)}</h4><p>按你的保留选择使用原件，没有新建模型。</p></article>`;
   const job=draft.generation,running=job?.status==='running',failed=job?.status==='failed',name=entry?.name||item.name,ready=ImageReviewCore.ready(draft,currentSignature(draft)),preview=entry?View3D.photoAssetPreview([entry.type,entry.name,entry.w,entry.d,entry.color,{assetId:entry.assetId,h:entry.h,previewAngle:draft.previewAngle||0}]):null,reference=draft.reference||entry?.reference||item.crop;
   const status=running?`<div class="scene-job-status" role="status"><span class="scene-job-spinner" aria-hidden="true"></span><strong class="scene-job-text">${esc(job.text)}</strong><small class="scene-job-elapsed"></small></div>`:failed?`<div class="scene-job-error" role="alert">生成未完成：${esc(job.text)}${entry?'<small>下方为旧模型预览，本次没有替换。请重试。</small>':''}</div>`:job?.status==='completed'?'<small class="scene-job-complete">✓ 新模型已生成</small>':'';
   return `<article class="scene-result-card image-model-review ${running?'is-generating':''} ${draft.selectedForImport&&!draft.accepted&&ready?'selected-for-import':''}" data-scene-item-id="${esc(item.id)}" ${running?`aria-busy="true" data-started-at="${job.startedAt}"`:''}>${draft.pinnedAt?'<small class="scene-result-pinned">↑ 最近重新生成</small>':''}${status}${draft.accepted?'<small class="scene-result-imported">✓ 已在家具库，无需重复导入</small>':ready?`<label class="scene-result-checkbox"><input type="checkbox" data-import-image-model="${index}" aria-label="选择导入 ${esc(name)}" ${draft.selectedForImport?'checked':''} ${sceneExtractBusy?'disabled':''}>选择导入</label>`:''}<div class="image-model-comparison"><figure>${reference?`<img src="${reference}" alt="${esc(name)}的实际框选图片">`:'<div class="scene-preview-empty">准备框选图…</div>'}<figcaption>当前框选图</figcaption></figure><figure><div class="scene-model-preview">${preview?`<img src="${preview}" alt="${esc(name)}${running||failed?'的旧模型预览':'的新模型预览'}">`:'<div class="scene-preview-empty">等待模型生成</div>'}${running?'<div class="scene-preview-loading"><span class="scene-job-spinner" aria-hidden="true"></span><span>正在生成新预览</span></div>':''}</div><figcaption>${running||failed?(entry?'旧预览（保留）':'等待新预览'):esc(entry?.provenance.model||'当前模型')+' 模型预览'} ${entry?`<button type="button" data-rotate-image-model="${index}" aria-label="旋转预览 ${esc(name)}" ${sceneExtractBusy?'disabled':''}>↻</button>`:''}</figcaption></figure></div><h4>${esc(name)}</h4><small>${entry?`${entry.w} × ${entry.d} × ${entry.h} mm · 请核对尺寸`:'模型生成后将在此显示'}</small>${entry?provenanceHTML(draft):''}<details class="model-refine" ${failed?'open':''}><summary>调整外观 / 重新生成</summary><textarea data-image-feedback="${index}" maxlength="1200" ${sceneExtractBusy?'disabled':''} placeholder="描述要调整的可见外观">${esc(session.items.find(i=>i.id===item.id)?.fidelityFeedback||'')}</textarea><button data-regenerate-image-model="${index}" ${sceneExtractBusy?'disabled':''}>${failed?'重试此件':'重新生成此件'}</button></details>${draft.accepted?`<button data-place-scene="${esc(draft.importedEntryId)}">放入当前方案</button>`:ready?'<small class="scene-result-pending">导入家具库后，可单独放入方案</small>':''}</article>`;
  }).join('');
  grid.scrollTop=scroll;updateElapsed();updateResultSelection();
 }
 $('#sceneResultGrid').addEventListener('click',e=>{if(sceneExtractBusy)return;const rotate=e.target.closest('[data-rotate-image-model]');if(rotate){const d=sceneExtractSession.results[Number(rotate.dataset.rotateImageModel)];d.previewAngle=((d.previewAngle||0)+90)%360;renderSceneResults();return;}const regenerate=e.target.closest('[data-regenerate-image-model]');if(!regenerate)return;const index=Number(regenerate.dataset.regenerateImageModel),d=sceneExtractSession.results[index],item=sceneExtractSession.items.find(i=>i.id===d.item.id);if(!item)return;item.fidelityFeedback=$('#sceneResultGrid').querySelector('[data-image-feedback="'+index+'"]').value;window.ImageFurnitureWorkflow.generateSceneBatch([item.id],{force:true});});
 $('#sceneImportSelected').onclick=async()=>{
  if(sceneExtractBusy)return;await PhotoFurniture.libraryReady();if(sceneExtractBusy)return;const session=sceneExtractSession,selected=session?.results.filter(d=>d.selectedForImport&&ImageReviewCore.ready(d,currentSignature(d)))||[];if(!session||!selected.length){syncImports();renderSceneResults();return toast('已在家具库的模型无需重复导入，请选择新模型');}
  if(selected.some(d=>{const current=session.items.find(i=>i.id===d.item.id);return !current||signature(session,current)!==d.signature;}))return toast('框选或尺寸已改变，请重新生成后导入');
  const fresh=selected.filter(d=>!ImageReviewCore.findImported(d,state.catalogue,state.assets));if((state.catalogue?.length||0)+fresh.length>500)return toast('家具库容量不足，请减少选择');
  sceneExtractBusy=true;$('#generateSceneBatch').disabled=true;renderSceneResults();let imported=0,skipped=0;
  try{for(const draft of selected){if(await acceptDraft(draft))imported++;else skipped++;draft.selectedForImport=false;}}
  catch(err){toast(err.message);}
  finally{sceneExtractBusy=false;renderSceneResults();sceneSelection();window.RenderReconcile?.render();const existing=session.results.filter(d=>d.accepted).length-imported;$('#sceneBatchProgress').textContent=`已导入 ${imported} 件到家具库。${Math.max(skipped,existing)?'另有 '+Math.max(skipped,existing)+' 件已在库，已跳过重复导入。':''}放入方案请单独点击对应家具卡片。`;window.SceneReviewPersistence?.save().catch(()=>{});}
 };
 const photoSignature=()=>JSON.stringify([photoInput?.data,currentPhotoSize(),$('#photoKind').value,$('#photoName').value]);
 async function generatePhoto(){
  const dimensions=currentPhotoSize();if(photoBusy||!photoInput||!PhotoCore.validDimensions(dimensions))return;photoBusy=true;controller=new AbortController();photoDraft=null;photoResult=null;updatePhotoButton();$('#photoModelResult').hidden=true;
  const original=photoInput.data,sig=photoSignature();
  try{photoDraft=await draftFrom({image:original,kind:$('#photoKind').value,dimensions}, {name:$('#photoName').value||'图片家具',dimensionSource:photoDimensions?.source||'user-input'},original);photoDraft.signature=sig;if(photoSignature()!==sig)throw Error('图片或尺寸已改变，请重新生成');const e=photoDraft.entry;$('#photoGeometrySource').src=original;$('#photoModelPreview').src=View3D.photoAssetPreview([e.type,e.name,e.w,e.d,e.color,{assetId:e.assetId,h:e.h}]);$('#photoResultTitle').textContent=e.name;$('#photoResultSize').textContent=`${e.w} × ${e.d} × ${e.h} mm · 当前图片模型 · ${photoDraft.result.geometry.parts.length} 个部件`;$('#photoModelResult').hidden=false;$('#acceptPhotoGeometry').hidden=false;$('#acceptPhotoGeometry').disabled=false;$('#placePhotoFurniture').hidden=true;$('#downloadPhotoFurniture').hidden=true;$('#photoProgress').textContent='请对照原图确认外观，尚未加入家具库。';}
  catch(e){photoDraft=null;$('#photoProgress').textContent='生成未完成：'+e.message+'。未使用预设模型替代。';}
  finally{photoBusy=false;controller=null;updatePhotoButton();}
 }
 $('#photoFurnitureDialog').addEventListener('close',()=>{if(photoBusy)controller?.abort();});
 $('#acceptPhotoGeometry').onclick=async e=>{if(!photoDraft||photoBusy)return;if(photoDraft.signature!==photoSignature())return toast('图片或尺寸已改变，请重新生成');e.target.disabled=true;try{const added=await acceptDraft(photoDraft);photoResult=state.catalogue.find(i=>i.id===photoDraft.importedEntryId)||photoDraft.entry;e.target.hidden=true;$('#placePhotoFurniture').hidden=false;$('#downloadPhotoFurniture').hidden=false;$('#photoProgress').textContent=added?'已按你的外观确认加入家具库。':'此模型已在家具库，已跳过重复导入。';}catch(err){e.target.disabled=false;toast(err.message);}};
 window.ImageFurnitureWorkflow={generateSceneBatch,renderSceneResults,generatePhoto,signature,acceptDraft};
})();
