const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const C=require('./core.js');
const {analyseFurniture}=require('./furniture-photo-server.cjs');
const {alignPlan}=require('./plan-aligned-vision.cjs');
const {structurePrompt,expandPlanStructure,convertStructure}=require('./stage01-vision.cjs');
const {guideImage,checkWallEvidence}=require('./stage01-image.cjs');
const {recognizePlanFurniture}=require('./plan-furniture-vision.cjs');
const {extractScene}=require('./scene-extraction-server.cjs');
const {generateGeometry,configuration:geometryConfiguration}=require('./image-geometry-server.cjs');
const {generateViews,generateFromViews}=require('./furniture-three-views-server.cjs');
const {createImageSettings,editImage}=require('./image-edit-server.cjs');
const {workflowStatus,generatePhotoViews,generatePhotoModel}=require('./photo-three-view-server.cjs');
const localAI=require('./local-ai-server.cjs');
const {createVisionSettings,allowSettingsRequest}=require('./vision-settings-server.cjs');
const {requestVisionJSON}=require('./vision-protocol.cjs');
const ROOT=__dirname;
const {identity,listenOrReuse}=require('./startup-runtime.cjs');
let PORT=Number(process.env.PORT||8787);
// Optional server-only configuration. No credentials are returned to the browser.
const visionSettings=createVisionSettings({filename:path.join(ROOT,'.local','vision-config.json')});
const imageSettings=createImageSettings({filename:path.join(ROOT,'.local','image-edit-config.json')});
const visionProfiles=Object.fromEntries(['deepseek','glm'].map(id=>[id,createVisionSettings({filename:path.join(ROOT,'.local','vision-profile-'+id+'.json'),env:id==='deepseek'?{VISION_BASE_URL:'https://api.deepseek.com',VISION_MODEL:'deepseek-flash'}:{VISION_BASE_URL:'https://open.bigmodel.cn/api/paas/v4',VISION_MODEL:'填写图片理解模型名'}})]));
visionProfiles.step5=createVisionSettings({filename:path.join(ROOT,'.local','vision-profile-step5.json'),env:{VISION_BASE_URL:'https://api.stepfun.com/v1',VISION_MODEL:'step-5-preview'}});
if(!visionProfiles.step5.publicState().hasKey&&/^step-5/.test(visionSettings.current().model)&&visionSettings.current().key)visionProfiles.step5.save(visionSettings.current());
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary'};
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));}
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>25*1024*1024)throw Error('请求图片过大');}return JSON.parse(text);}
async function recognize(input,options={}){
 const vision=visionSettings.current();
 if(!vision.base||!vision.key||!vision.model){const e=Error('视觉模型服务未配置，请在网页设置中填写支持识图的接口');e.status=503;e.code='VISION_NOT_CONFIGURED';throw e;}
 if(!/^data:image\/(png|jpeg);base64,/.test(input.image||'')||!Number.isInteger(input.width)||!Number.isInteger(input.height)||input.width<1||input.height<1||input.width*input.height>4e7)throw Error('无效图片或像素尺寸');
 const inputHash=require('node:crypto').createHash('sha256').update(Buffer.from(input.image.split(',')[1],'base64')).digest('hex');
 const guided=await guideImage(input);
 let repair='';for(let attempt=0;attempt<2;attempt++){
  const {value:raw,diagnostics}=await requestVisionJSON(vision,{image:guided,prompt:structurePrompt(input.width,input.height)+(input.feedback?'\nUser correction: '+String(input.feedback).slice(0,3000):'')+repair,maxTokens:24000,stream:true,timeoutMs:360000,...options,imageLabel:'户型图'});
  const auditDir=path.join(ROOT,'output/stage-01/api-audit');fs.mkdirSync(auditDir,{recursive:true});fs.writeFileSync(path.join(auditDir,inputHash.slice(0,12)+'-'+Date.now()+'.json'),JSON.stringify({raw,diagnostics,inputHash,width:input.width,height:input.height},null,2));
  try{
   const result=await checkWallEvidence(convertStructure(expandPlanStructure(raw),input),input);
   const provenance={...diagnostics,geometrySource:'vision-api-direct',inputHash,inputWidth:input.width,inputHeight:input.height,coordinateGuides:true,evidenceCheck:result.evidenceCheck,at:new Date().toISOString()};
   return {...result,diagnostics:provenance,recognition:{method:'vision-api',status:result.empty?'empty':'needs-review',rawOutput:raw,unresolved:result.unresolved,diagnostics:provenance,message:result.empty?'接口已返回有效结构 JSON，但当前图片没有可用结构。'+result.notes:'当前图片的视觉 API 候选结构，均需人工核对。'+result.notes}};
  }catch(e){if(attempt){e.code='INVALID_STRUCTURE';throw e;}options.onProgress?.({phase:'repairing',text:'结构校验发现问题，正在请同一视觉模型修正…'});repair='\nCorrect the previous JSON after this validation error: '+e.message+'. Keep only observed structure. Previous JSON: '+JSON.stringify(raw).slice(0,100000);}
 }
}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){const activePort=server.address()?.port;if(activePort)PORT=activePort;const origin=req.headers.origin;if(origin&&!['http://localhost:'+PORT,'http://127.0.0.1:'+PORT].includes(origin))return json(res,403,{error:'不接受跨站请求'});
    if(url.pathname==='/api/app-instance'&&req.method==='GET')return json(res,200,identity(ROOT));
    const profileMatch=url.pathname.match(/^\/api\/settings\/vision-profiles\/(step5|deepseek|glm)(?:\/(test|activate))?$/);
    if(profileMatch){if(!allowSettingsRequest(req,PORT))return json(res,403,{error:'请在本机设置中操作'});const settings=visionProfiles[profileMatch[1]],action=profileMatch[2];if(req.method==='GET'&&!action)return json(res,200,settings.publicState());if(req.method==='POST'&&action==='test')return json(res,200,await settings.test(await body(req)));if(req.method==='POST'&&action==='activate'){const value=settings.current();if(!value.key)throw Error('请先保存这组接口和密钥');return json(res,200,visionSettings.save(value));}if(req.method==='POST'&&!action)return json(res,200,settings.save(await body(req)));if(req.method==='DELETE'&&!action)return json(res,200,settings.clear());return json(res,405,{error:'不支持此操作'});}
    if(['/api/settings/image-edit','/api/settings/image-edit/test'].includes(url.pathname)){if(!allowSettingsRequest(req,PORT))return json(res,403,{error:'请在本机设置中操作'});if(req.method==='GET'&&!url.pathname.endsWith('/test'))return json(res,200,imageSettings.publicState());if(req.method==='POST'&&url.pathname.endsWith('/test')){const c=imageSettings.draft(await body(req)),r=await editImage({image:'data:image/png;base64,'+require('./vision-test-image.cjs').testImage().toString('base64'),prompt:'把参考图中的红色方块呈现在白色背景中，直接返回图片，不要文字。'},c,{testModelOutput:true});return json(res,200,{ok:true,message:'已实际返回图片，图像编辑接口可用。',...r});}if(req.method==='POST')return json(res,200,imageSettings.save(await body(req)));if(req.method==='DELETE')return json(res,200,imageSettings.clear());return json(res,405,{error:'不支持此操作'});}
    if(url.pathname==='/api/settings/vision'||url.pathname==='/api/settings/vision/test'){
      if(!allowSettingsRequest(req,PORT))return json(res,403,{error:'请在本机网站的设置中操作'});
      if(url.pathname.endsWith('/test')&&req.method==='POST')return json(res,200,await visionSettings.test(await body(req)));
      if(url.pathname==='/api/settings/vision'){
        if(req.method==='GET')return json(res,200,visionSettings.publicState());
        if(req.method==='POST')return json(res,200,visionSettings.save(await body(req)));
        if(req.method==='DELETE')return json(res,200,visionSettings.clear());
      }
      return json(res,405,{error:'不支持此操作'});
    }
    const vision=visionSettings.current();
    if(url.pathname==='/api/furniture/photo-workflow-status'&&req.method==='GET')return json(res,200,workflowStatus({visionSettings,imageSettings}));
    if(url.pathname==='/api/furniture/photo-three-views'&&req.method==='POST'){const input=await body(req),controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});return json(res,200,await generatePhotoViews(input,{imageSettings},{signal:controller.signal}));}
    if(url.pathname==='/api/furniture/three-view-status'&&req.method==='GET')return json(res,200,{...imageSettings.publicState(),visionModel:vision.model});
    if(url.pathname==='/api/furniture/three-views'&&req.method==='POST'){const input=await body(req),controller=new AbortController();res.on('close',()=>{if(!res.writableEnded)controller.abort();});return json(res,200,await editImage(input,input.useVisionImageModel?{...vision,protocol:'chat-image'}:imageSettings.current(),{signal:controller.signal}));}
    if(url.pathname==='/api/test-artifact'&&req.method==='POST'&&process.env.STUDIO_TEST_ARTIFACTS==='1'){const input=await body(req),dir=path.join(ROOT,'test-results');fs.mkdirSync(dir,{recursive:true});if(!/^(desktop|structure|mobile|reports|plan-a|plan-b|export-2d|export-3d|library-2d|library-3d|photo-furniture|photo-model|photo-2d|photo-3d|photo-furniture-report|photo-plan|photo-no-dimensions|material-plan|material-plan-ui|plan-style-report|architect-render|architect-ui|architect-report|scene-extraction-ui|scene-extraction-models|scene-extraction-report|scene-extraction-plan|scene-extraction-preview|scene-extraction-library|floor-symbols-ui|floor-symbols-3d|floor-symbols-report|floor-symbols-plan|before-symbols-plan|general-ui|general-3d|general-report|general-gray-plan|general-black-plan|general-before-plan)\.(png|json|glb)$/.test(input.name))throw Error('无效测试产物名');fs.writeFileSync(path.join(dir,input.name),/\.(png|glb)$/.test(input.name)?Buffer.from(input.data,'base64'):JSON.stringify(input.data,null,2));return json(res,200,{saved:true});}
    if(url.pathname==='/api/status'&&req.method==='GET')return json(res,200,{vision:!!(vision.base&&vision.key&&vision.model),furnitureVision:!!(vision.base&&vision.key&&vision.model),image3d:false,local:true,localAI:localAI.status(),furnitureGeometry:'deepseek-image-parts-v1',sessionFurnitureAnalysis:false});
    if(url.pathname==='/api/furniture/recognize-plan'&&req.method==='POST')return json(res,200,await recognizePlanFurniture(await body(req),vision));
    if(url.pathname==='/api/recognize-local'&&req.method==='POST')return json(res,200,await localAI.recognize(await body(req)));
    if(url.pathname==='/api/furniture/extract-scene'&&req.method==='POST')return json(res,200,await extractScene(await body(req),vision));
    if(url.pathname==='/api/furniture/model-status'&&req.method==='GET'){let config;try{config=geometryConfiguration(vision);}catch{}return json(res,200,{model:config?.model||vision.model,provider:config?.provider,configured:!!config,method:'vision-image-parts-v1',nativeImageTo3D:false});}
    if(['/api/recognize-stream','/api/furniture/recognize-plan-stream','/api/furniture/extract-scene-stream','/api/furniture/model-from-crop','/api/furniture/model-from-three-views','/api/furniture/photo-model-from-three-views'].includes(url.pathname)&&req.method==='POST'){
      const input=await body(req),controller=new AbortController();
      res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Accel-Buffering':'no'});
      const emit=data=>{if(!res.destroyed&&!res.writableEnded)res.write(JSON.stringify(data)+'\n');};
      const heartbeat=setInterval(()=>emit({type:'heartbeat'}),10000);heartbeat.unref();
      res.on('close',()=>{if(!res.writableEnded)controller.abort();});
      try{const options={signal:controller.signal,onProgress:progress=>emit({type:'progress',...progress})};const worker=url.pathname.endsWith('model-from-three-views')?generateFromViews:url.pathname.endsWith('/three-views')?generateViews:url.pathname.endsWith('model-from-crop')?generateGeometry:url.pathname.endsWith('recognize-plan-stream')?recognizePlanFurniture:extractScene;const result=url.pathname==='/api/recognize-stream'?await recognize(input,options):url.pathname==='/api/furniture/photo-model-from-three-views'?await generatePhotoModel(input,{visionSettings},options):await worker(input,vision,options);emit({type:'result',result});}
      catch(e){if(!controller.signal.aborted)emit({type:'error',error:e.message||'图片识别未完成',code:e.code,diagnostics:e.diagnostics});}
      finally{clearInterval(heartbeat);if(!res.destroyed)res.end();}return;
    }
    if(url.pathname==='/api/furniture/analyze'&&req.method==='POST')return json(res,200,await analyseFurniture(await body(req),vision));
    if(url.pathname==='/api/recognize'&&req.method==='POST')return json(res,200,await recognize(await body(req)));return json(res,404,{error:'接口不存在'});
  }
  if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'仅支持读取静态文件'});
  if(require('./ocr-runtime.cjs').serveOCR(req,res,url.pathname,ROOT))return;
  const decoded=decodeURIComponent(url.pathname),file=path.resolve(ROOT,'.'+(decoded==='/'?'/index.html':decoded));if(!file.startsWith(ROOT+path.sep)||decoded.split('/').some(p=>p.startsWith('.'))||/\.(cjs|inc|md)$/.test(file)||file.includes(path.sep+'node_modules'+path.sep))return json(res,404,{error:'文件不存在'});
  if(decoded.startsWith('/local-ai/'))return json(res,404,{error:'文件不存在'});
  const stat=fs.statSync(file);if(!stat.isFile())throw Error('文件不存在');res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
}catch(e){if(e.code==='ENOENT')return json(res,404,{error:'文件不存在'});json(res,e.status||400,{error:e.name==='TimeoutError'?'视觉服务超时，请重试或使用手动描绘':e.message,...(e.diagnostics?{diagnostics:e.diagnostics}:{}),...(e.status&&e.code?{code:e.code}:{})});}});
listenOrReuse(server,{root:ROOT,port:PORT,onBusy:port=>console.log('Port '+port+' is occupied; trying the next port...')}).then(result=>{
 PORT=result.port;const url='http://127.0.0.1:'+PORT;
 console.log((result.reused?'Make It Home is already running: ':'Make It Home: ')+url);
 if(process.send){process.send({type:'ready',url,reused:result.reused},()=>{if(process.connected)process.disconnect();});}
 if(result.reused)localAI.close();
}).catch(error=>{console.error('Make It Home could not start: '+error.message);localAI.close();process.exitCode=1;});
server.on('close',()=>localAI.close());
module.exports={server,recognize};
