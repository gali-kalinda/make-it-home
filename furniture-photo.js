/* Image -> evidence/dimensions -> actual geometry/GLB -> persistent personal catalogue. */
const PhotoCore=FurniturePhotoCore,personalFurniture=new Map();
const builtinCategoryCount=LIB.length;
let catalogueSignature='',photoJob=0,photoBusy=false,photoInput=null,photoRecipe=null,photoAnalysis=null,photoDimensions=null,photoResult=null,ocrWorkerPromise=null;
document.body.insertAdjacentHTML('beforeend',`
<dialog id="photoFurnitureDialog" class="studio-dialog photo-furniture-dialog"><form method="dialog"><button class="close-dialog" aria-label="关闭">×</button></form>
 <div class="eyebrow">PHOTO TO YOUR FURNITURE LIBRARY</div><h2>把图片里的家具，放进你的家。</h2><p class="muted">读取尺寸 → 核对外形 → 生成立体模型 → 加入我的家具</p>
 <div class="photo-workspace"><div><img id="photoSourcePreview" alt="家具原始参考图"><div id="photoEvidence" class="notice">正在读取图片…</div><details class="photo-ocr-details"><summary>查看文字读取结果</summary><pre id="photoOcrText"></pre></details></div>
 <div><div class="form"><label class="full">家具名称<input id="photoName" maxlength="120" placeholder="输入家具名称"></label><label class="full">外形类型<select id="photoKind"><option value="cabinet">柜子</option><option value="rounded_tv_cabinet">圆弧两端电视柜</option><option value="table">桌子</option><option value="sofa">沙发</option><option value="chair">椅子</option><option value="bed">床</option><option value="desk">书桌</option><option value="wardrobe">衣柜</option><option value="armchair">休闲椅</option><option value="coffeetable">茶几</option></select></label>
 <label>宽 / 长（mm）<input id="photoW" type="number" min="10" max="50000" placeholder="必填" required></label><label>深（mm）<input id="photoD" type="number" min="10" max="50000" placeholder="必填" required></label><label>高（mm）<input id="photoH" type="number" min="10" max="50000" placeholder="必填" required></label><label>主色<input id="photoColor" type="color" value="#a7a397"></label></div>
 <p id="photoSizeStatus" class="notice">正在寻找图片上的尺寸标注。</p><div id="photoFeatures" class="small muted"></div><p id="photoProvider" class="small muted"></p>
 <button id="generatePhotoFurniture" class="btn primary" disabled>生成模型并加入家具库</button><p id="photoProgress" class="small muted" role="status"></p></div></div>
 <div id="photoModelResult" class="photo-model-result" hidden><img id="photoModelPreview" alt="由图片描述生成的真实立体模型"><div><h3 id="photoResultTitle"></h3><p id="photoResultSize"></p><p class="small muted">已加入「我的家具」。可反复拖入 2D 平面和 3D 场景；当前模型为单张照片的参数近似重建，背面和内部为简化补全。</p><div class="actions"><button id="placePhotoFurniture" class="btn primary">放入当前方案</button><button id="downloadPhotoFurniture" class="btn">下载 GLB 模型</button></div></div></div>
</dialog>`);

function currentPhotoSize(){return {w:Number($('#photoW').value),d:Number($('#photoD').value),h:Number($('#photoH').value)};}
function updatePhotoButton(){const valid=PhotoCore.validDimensions(currentPhotoSize());$('#generatePhotoFurniture').disabled=photoBusy||!photoInput||!valid;if(!photoBusy&&!valid)$('#photoSizeStatus').textContent='未发现可靠的完整尺寸。请填写宽、深、高三个数值后再生成，不会默认猜测尺寸。';}
for(const id of ['photoW','photoD','photoH'])$('#'+id).addEventListener('input',()=>{photoDimensions={...currentPhotoSize(),source:'user-input',unit:'mm'};if(PhotoCore.validDimensions(photoDimensions))$('#photoSizeStatus').textContent=`用户输入：${photoDimensions.w} × ${photoDimensions.d} × ${photoDimensions.h} mm（宽 / 深 / 高）`;updatePhotoButton();});
$('#photoKind').onchange=()=>{if(photoRecipe&&photoRecipe.kind!==$('#photoKind').value)photoRecipe={...PhotoCore.genericRecipe($('#photoKind').value),name:$('#photoName').value};};
async function localFurnitureOCR(source,onProgress){
 if(!window.Tesseract)throw Error('尺寸文字读取组件未加载');
 if(!ocrWorkerPromise)ocrWorkerPromise=Tesseract.createWorker('eng',1,{workerPath:'/vendor/tesseract/worker.min.js',corePath:'/vendor/tesseract/core',langPath:'/vendor/tesseract/data',logger:event=>onProgress?.(event)}).catch(e=>{ocrWorkerPromise=null;throw e;});
 const worker=await ocrWorkerPromise;
 await worker.setParameters({tessedit_pageseg_mode:'11'});
 let result=await worker.recognize(source.data);let text=result.data.text||'',dimensions=PhotoCore.dimensionsFromText(text);
 if(!dimensions){const image=new Image();await new Promise((res,rej)=>{image.onload=res;image.onerror=rej;image.src=source.data;});const canvas=document.createElement('canvas');canvas.width=Math.min(2400,image.width*2);canvas.height=Math.round(canvas.width/image.width*image.height*.35);const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,image.width,image.height*.35,0,0,canvas.width,canvas.height);await worker.setParameters({tessedit_char_whitelist:'0123456789xX*×. mmc',tessedit_pageseg_mode:'6'});result=await worker.recognize(canvas);text+='\n'+(result.data.text||'');dimensions=PhotoCore.dimensionsFromText(text);await worker.setParameters({tessedit_char_whitelist:'',tessedit_pageseg_mode:'11'});}
 return {text,dimensions,confidence:result.data.confidence};
}
async function openFurniturePhoto(file){
 const job=++photoJob;photoResult=null;photoDimensions=null;photoAnalysis=null;photoRecipe=null;photoInput=null;photoBusy=true;
 $('#photoKind').value='cabinet';
 $('#photoModelResult').hidden=true;$('#photoW').value=$('#photoD').value=$('#photoH').value='';$('#photoName').value='';$('#photoOcrText').textContent='';$('#photoFeatures').textContent='';$('#photoProvider').textContent='';$('#photoProgress').textContent='正在读取图片尺寸和外形…';$('#photoSizeStatus').textContent='正在寻找图片上的尺寸标注。';updatePhotoButton();
 try{const source=await readImage(file);if(job!==photoJob)return;photoInput=source;$('#photoSourcePreview').src=source.data;$('#photoName').value=file.name.replace(/\.[^.]+$/,'');$('#photoFurnitureDialog').showModal();
 const [ocr,analysis]=await Promise.allSettled([localFurnitureOCR(source,()=>{}),fetch('/api/furniture/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:source.data})}).then(async r=>{const result=await r.json();if(!r.ok)throw Error(result.error||'外观分析失败');return result;})]);
 if(job!==photoJob)return;
 const text=ocr.status==='fulfilled'?ocr.value.text:'';$('#photoOcrText').textContent=text||(ocr.status==='rejected'?'本地文字读取失败，可手动输入尺寸。':'未读取到文字。');
 photoAnalysis=analysis.status==='fulfilled'?analysis.value:{provider:'unavailable',recipe:null,message:'未能获取外观分析，请选择家具类型。'};photoRecipe=photoAnalysis.recipe||PhotoCore.genericRecipe($('#photoKind').value);
 const size=ocr.status==='fulfilled'&&ocr.value.dimensions?ocr.value.dimensions:photoRecipe.dimensions;
 if(PhotoCore.validDimensions(size)){photoDimensions={...size};$('#photoW').value=size.w;$('#photoD').value=size.d;$('#photoH').value=size.h;$('#photoSizeStatus').textContent=`从图片读取：${size.w} × ${size.d} × ${size.h} mm（宽 / 深 / 高），可修改核对。`;}
 $('#photoKind').value=photoRecipe.kind;$('#photoName').value=photoRecipe.name||$('#photoName').value;$('#photoColor').value=photoRecipe.appearance?.bodyColor||'#b9ac99';
 $('#photoEvidence').textContent=photoAnalysis.provider==='gpt-session'?'本次 GPT 图像分析：'+(photoRecipe.appearance?.outline||'已保存图片外形描述'):photoAnalysis.provider==='vision-api'?'已从当前图片提取外形描述，请核对。':'当前图片将按所选类型与尺寸制作参数近似模型。';
 $('#photoFeatures').textContent=(photoRecipe.visibleFeatures||[]).join(' · ');
 $('#photoProvider').textContent=photoAnalysis.provider==='gpt-session'?'本次对话由 GPT 分析这张原图后保存，网页当前没有实时调用 GPT。':photoAnalysis.message;
 $('#photoProgress').textContent='';
 }catch(e){toast(e.message);$('#photoProgress').textContent=e.message;}finally{if(job===photoJob){photoBusy=false;updatePhotoButton();}}
}
$('#furnitureImageInput').onchange=e=>{const file=e.target.files[0];if(file)openFurniturePhoto(file);e.target.value='';};

function personalDB(){return new Promise((res,rej)=>{const request=indexedDB.open('floorplan-personal-furniture',1);request.onupgradeneeded=()=>request.result.createObjectStore('items',{keyPath:'id'});request.onsuccess=()=>res(request.result);request.onerror=()=>rej(request.error);});}
async function persistCatalogueItem(entry,asset){const record={id:entry.id,entry:C.clone(entry),asset:C.clone(asset)};personalFurniture.set(entry.id,record);const db=await personalDB();await new Promise((res,rej)=>{const tx=db.transaction('items','readwrite');tx.objectStore('items').put(record);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();}
async function writePersonalRecords(records){const db=await personalDB();try{await new Promise((res,rej)=>{const tx=db.transaction('items','readwrite');for(const record of records)tx.objectStore('items').put(record);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||Error('家具库保存未完成'));});}finally{db.close();}}
let personalManagementBusy=false;
async function removePersonalCatalogueItems(ids){
 await personalCatalogueReady;if(personalManagementBusy)throw Error('家具库正在保存，请稍后重试');personalManagementBusy=true;
 try{const records=LibraryWorkspaceCore.deletionRecords(state,ids);if(!records.length)return 0;await writePersonalRecords(records);for(const record of records)personalFurniture.set(record.id,record);syncPersonalCatalogue();buildLib();save();renderAll();return records.length;}finally{personalManagementBusy=false;}
}
async function restorePersonalCatalogueItems(ids){
 await personalCatalogueReady;if(personalManagementBusy)throw Error('家具库正在保存，请稍后重试');personalManagementBusy=true;
 try{const records=[...new Set(ids)].map(id=>personalFurniture.get(id)).filter(r=>r?.deletedAt).map(r=>{const record=C.clone(r);delete record.deletedAt;return record;});if(!records.length)return 0;if(state.catalogue.length+records.filter(r=>!state.catalogue.some(e=>e.id===r.id)).length>500)throw Error('家具库容量不足，请先整理后恢复');await writePersonalRecords(records);for(const record of records)personalFurniture.set(record.id,record);syncPersonalCatalogue();buildLib();save();renderAll();return records.length;}finally{personalManagementBusy=false;}
}
function syncPersonalCatalogue(){
 state.catalogue=state.catalogue||[];state.assets=state.assets||{};
 state.catalogue=state.catalogue.filter(e=>!personalFurniture.get(e.id)?.deletedAt);
 for(const record of personalFurniture.values()){if(record.deletedAt)continue;if(!state.catalogue.some(e=>e.id===record.id))state.catalogue.push(C.clone(record.entry));if(!state.assets[record.asset.id])state.assets[record.asset.id]=C.clone(record.asset);}
 const signature=JSON.stringify(state.catalogue.map(e=>[e.id,e.name,e.w,e.d,e.h,e.assetId]));if(signature===catalogueSignature)return false;catalogueSignature=signature;
 LIB.splice(builtinCategoryCount);if(state.catalogue.length)LIB.push({cat:'我的家具 · 图片生成',items:state.catalogue.map(e=>[e.type,e.name,e.w,e.d,e.color,{catalogueId:e.id,assetId:e.assetId,h:e.h}])});return true;
}
const photoBuildLibrary=buildLib;
buildLib=function(){syncPersonalCatalogue();photoBuildLibrary();const h4=[...document.querySelectorAll('#lib>h4')].find(el=>el.textContent==='我的家具 · 图片生成');if(h4){const grid=h4.nextElementSibling;grid.classList.add('personal-furniture-grid');$('#lib').prepend(h4,grid);}};
const studioBeforePersonalLibrary=window.updateStudio;
window.updateStudio=function(){if(syncPersonalCatalogue())buildLib();studioBeforePersonalLibrary();};
const originalPhotoAddItem=addItem;
addItem=function(item,x,y,rotation=0){const meta=item[5];if(!meta?.catalogueId)return originalPhotoAddItem(item,x,y,rotation);const entry=state.catalogue.find(e=>e.id===meta.catalogueId);if(!entry||!state.assets[entry.assetId])return toast('家具模型资源缺失');const f=F(entry.type,entry.name,Math.round(x/10)*10,Math.round(y/10)*10,entry.w,entry.d,norm(rotation),entry.color);Object.assign(f,{h:entry.h,assetId:entry.assetId,catalogueId:entry.id,approximate:true,reference:entry.reference,photoRecipe:entry.recipe,dimensionSource:entry.dimensionSource,elevation:entry.elevation||0,dimensionEstimate:entry.dimensionEstimate||null,sceneExtraction:entry.sceneExtraction||null,material:'original'});pushOut(f);ui.sel={kind:'furn',id:f.id};mutate(()=>state.furniture.push(f));toast('已放入「'+entry.name+'」');};
const originalPhotoFurnSVG=furnSVG;
furnSVG=function(type,w,d,color,extra={}){if(type!=='photo_tv_cabinet')return originalPhotoFurnSVG(type,w,d,color,extra);return `<rect x="${-w/2}" y="${-d/2}" width="${w}" height="${d}" rx="${d/2}" fill="${color}" stroke="#776e60" stroke-width="1" vector-effect="non-scaling-stroke"/><path d="M${-w*.34} ${d/2-18}H${w*.34}" stroke="#b6a365" stroke-width="2" vector-effect="non-scaling-stroke"/>`;};

$('#generatePhotoFurniture').onclick=()=>window.ImageFurnitureWorkflow.generatePhoto();
$('#placePhotoFurniture').onclick=()=>{if(!photoResult)return;if(state.workflow==='structure')enterFurniture();const p=placement(),item=LIB[builtinCategoryCount]?.items.find(i=>i[5]?.catalogueId===photoResult.id);if(item){addItem(item,p[0],p[1]);$('#photoFurnitureDialog').close();}};
$('#downloadPhotoFurniture').onclick=()=>{if(!photoResult)return;const asset=state.assets[photoResult.assetId],data=atob(asset.data.split(',')[1]);download(photoResult.name+'.glb',new Blob([Uint8Array.from(data,c=>c.charCodeAt(0))],{type:'model/gltf-binary'}));};
async function restorePersonalCatalogue(){try{const db=await personalDB(),records=await new Promise((res,rej)=>{const request=db.transaction('items').objectStore('items').getAll();request.onsuccess=()=>res(request.result);request.onerror=()=>rej(request.error);});db.close();for(const record of records){const test=C.blank();test.assets[record.asset.id]=record.asset;test.catalogue=[record.entry];C.validate(test);personalFurniture.set(record.id,record);}if(syncPersonalCatalogue()){buildLib();save();}}catch(e){console.error('个人家具库读取失败',e);}}
buildLib();const personalCatalogueReady=restorePersonalCatalogue();
window.PhotoFurniture={open:openFurniturePhoto,ocr:localFurnitureOCR,getStatus:()=>({busy:photoBusy,analysis:photoAnalysis,dimensions:photoDimensions,result:photoResult}),ready:()=>PhotoCore.validDimensions(currentPhotoSize()),sync:syncPersonalCatalogue,libraryReady:()=>personalCatalogueReady,removeCreated:removePersonalCatalogueItems,restoreCreated:restorePersonalCatalogueItems,deleted:()=>[...personalFurniture.values()].filter(r=>r.deletedAt).map(r=>({id:r.id,name:r.entry.name,deletedAt:r.deletedAt}))};
Studio.addItem=addItem;
