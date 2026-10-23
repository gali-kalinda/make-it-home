/* Explicitly resumed local review drafts; never used as recognition responses. */
(function(){
 const button=document.createElement('button');button.id='sceneResumeReview';button.className='btn';button.hidden=true;
 document.querySelector('.scene-upload-actions').append(button);
 let queue=Promise.resolve(),stamp='';
 const database=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('floorplan-image-reviews',1);r.onupgradeneeded=()=>r.result.createObjectStore('reviews');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 async function read(){const db=await database();try{return await new Promise((resolve,reject)=>{const r=db.transaction('reviews').objectStore('reviews').get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}}
 function label(s){button.hidden=!s;button.textContent='继续上次提取结果（'+(s?.session.results.filter(r=>r.entry).length||0)+' 件模型）';}
 async function save(){
  const s=sceneExtractSession;if(!s?.source?.data||!s.analysis||!s.items.length)return false;
  const key=JSON.stringify([s.analysis.imageHash,s.results.map(r=>[r.item.id,r.accepted,r.importedEntryId,r.asset?.id,r.signature,r.previewAngle,r.pinnedAt,r.generation]),s.items.map(i=>[i.id,i.name,i.box,i.kind,i.dimensions,i.selected,i.fidelityFeedback]),s.failures]);if(stamp===key)return queue;
  const record={version:1,savedAt:new Date().toISOString(),session:C.clone(s)};stamp=key;
  queue=queue.catch(()=>{}).then(async()=>{const db=await database();try{await new Promise((resolve,reject)=>{const t=db.transaction('reviews','readwrite');t.objectStore('reviews').put(record,'current');t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||Error('保存中断'));});label(record);return true;}finally{db.close();}}).catch(e=>{stamp='';throw e;});return queue;
 }
 async function restore(){
  if(sceneExtractBusy)return toast('请等待当前生成完成');const record=await read();if(!record||record.version!==1)throw Error('没有可恢复的提取结果');
  const s=record.session;if(!/^data:image\/(png|jpeg);base64,/.test(s?.source?.data||'')||!Array.isArray(s.items)||!Array.isArray(s.results)||s.items.length>30)throw Error('提取记录不完整');
  await PhotoFurniture.libraryReady();for(const d of s.results){ImageReviewCore.interrupted(d);d.selectedForImport=false;if(!d.entry)continue;ImageGeometryCore.validate(d.result.geometry);if(!d.asset?.data?.startsWith('data:model/gltf-binary;base64,'))throw Error('模型文件不完整');await View3D.importModel(d.asset);if(d.signatureVersion!==2){d.signature=ImageFurnitureWorkflow.signature(s,d.item);d.signatureVersion=2;}const existing=ImageReviewCore.findImported(d,state.catalogue,state.assets);d.accepted=!!existing;d.importedEntryId=existing?.id;}
  sceneAnalysisController?.abort();sceneExtractJob++;sceneExtractSession=s;sceneExtractSource=s.source;sceneAnalysisFile=new File([await fetch(s.source.data).then(r=>r.blob())],s.source.name||'效果图.jpg',{type:s.source.data.startsWith('data:image/png')?'image/png':'image/jpeg'});
  document.getElementById('sceneUploadDialog').close();document.getElementById('sceneReferenceImage').src=s.source.data;setSceneManualMode(false);renderSceneBoxes();ImageFurnitureWorkflow.renderSceneResults();sceneSelection();const models=[...new Set(s.results.filter(r=>r.entry).map(r=>r.entry.provenance?.model).filter(Boolean))].join(' / ');document.getElementById('sceneAnalysisProvider').textContent='已恢复本机保存的 '+models+' 提取结果；每件模型的接口来源记录均可查看。';document.getElementById('sceneEstimateNotice').textContent='请对照原图核对模型外观与尺寸，确认后再入库。当前为部件近似重建；单张图片未显示的背面和细节仍不确定。';document.getElementById('sceneBatchProgress').textContent=s.results.filter(r=>r.entry).length+' 件模型已恢复，可核对、导入或重试未完成项。';document.getElementById('generateSceneBatch').textContent='重试未完成模型（当前接口）';document.getElementById('sceneExtractDialog').showModal();return s.results.length;
 }
 button.onclick=()=>restore().catch(e=>toast('恢复未完成：'+e.message));
 const previous=ImageFurnitureWorkflow.generateSceneBatch;ImageFurnitureWorkflow.generateSceneBatch=async(...args)=>{try{return await previous(...args);}finally{await save().catch(e=>toast('提取结果暂未备份：'+e.message));}};
 new MutationObserver(()=>{if(sceneExtractBusy)save().catch(()=>{});}).observe(document.getElementById('sceneBatchProgress'),{childList:true,subtree:true});
 document.getElementById('sceneExtractDialog').addEventListener('change',()=>save().catch(()=>{}));
 read().then(label).catch(()=>{});window.SceneReviewPersistence={save,restore,read};
})();
