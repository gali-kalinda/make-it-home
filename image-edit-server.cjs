const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{normalize,platformCodec}=require('./vision-settings-server.cjs');
const sha=v=>crypto.createHash('sha256').update(v).digest('hex');
const {sanitizeReason}=require('./vision-errors.cjs');
function fail(message,status=400){const e=Error(message);e.status=status;throw e;}
function config(input){const c=normalize(input);if(!['image-edits','siliconflow','gemini','chat-image'].includes(input.protocol))fail('请选择图像编辑接口协议');return {...c,protocol:input.protocol};}
function checkImageOutput(c,{testModelOutput=false}={}){const host=new URL(c.base).hostname;if(!testModelOutput&&host==='api.deepseek.com'&&/^(deepseek-flash|deepseek-v4-pro|deepseek-v4-flash|deepseek-chat|deepseek-reasoner)$/i.test(c.model))fail('DeepSeek 地址和模型名称可以用于对话与识图，但该模型不能输出图片，也不支持 images/edits 生图。请换成支持参考图编辑并返回图片的模型。',400);
 if(['api.siliconflow.cn','api.siliconflow.com'].includes(host)){
  if(!testModelOutput&&/^Qwen\/Qwen3\.8-27B$/i.test(c.model))fail('Qwen/Qwen3.8-27B 用于看图、对话和工具调用，不是三视图出图模型。请在这里选择 Qwen/Qwen-Image-Edit-2509 等支持参考图生图的模型；本次未发送图片或产生生图调用。',400);
  if(!testModelOutput&&/^tencent\/Hy4-preview$/i.test(c.model))fail('tencent/Hy4-preview 是文字、编程和工具调用模型，不能直接输出三视图图片。请改选 Qwen/Qwen-Image-Edit-2509 等图像编辑模型；本次未发送图片或产生生图调用，不能据此判定密钥无效。',400);
  if(c.protocol!=='siliconflow'&&!(testModelOutput&&c.protocol==='chat-image'))fail('硅基流动生图请将接口协议改为“硅基流动生图 / images/generations”，接口地址填写 https://api.siliconflow.cn/v1。当前协议不匹配，本次未调用服务。',400);
 }
}
function upstreamFailure(code,raw,key){const reason=sanitizeReason(typeof raw==='string'?raw:raw?.error?.message||raw?.message||typeof raw?.error==='string'&&raw.error||'',key),message=code===401?'图像接口认证未通过（HTTP 401）：请检查该平台密钥是否有效':code===403?'图像请求被服务商拒绝（HTTP 403）：请核对模型可用性、调用权限和账户状态':code===429?'图像生成额度或频率受限（HTTP 429），请稍后重试':code===404||code===405?`图像接口返回 HTTP ${code}：当前地址未提供所选的生图接口，请核对接口协议和服务商文档`:`图像生成接口返回 HTTP ${code}，请核对模型名称、协议与参考图支持情况`;const e=Error(message+(reason?'。服务说明：'+reason:''));e.status=502;e.diagnostics={providerStatus:code,reason};throw e;}
function createImageSettings({filename,codec=platformCodec(filename)}={}){
 let current={base:'',model:'',key:'',protocol:'image-edits'},loadError=false;
 try{const saved=JSON.parse(fs.readFileSync(filename,'utf8'));current=config(JSON.parse(codec.unprotect(saved.protected)));}catch(e){if(e.code!=='ENOENT')loadError=true;}
 const publicState=()=>({base:current.base,model:current.model,protocol:current.protocol,hasKey:!!current.key,configured:!!(current.key&&current.base&&current.model),loadError});
 function draft(input){const next=config(input);if(!next.key){if(next.base!==current.base)fail('更换生图接口时，请填写对应密钥');next.key=current.key;}if(!next.key)fail('请输入图像生成 API 密钥');return next;}
 function persist(next){const temp=filename+'.tmp';fs.mkdirSync(path.dirname(filename),{recursive:true});try{fs.writeFileSync(temp,JSON.stringify({version:1,protected:codec.protect(JSON.stringify(next))}),{mode:0o600});fs.renameSync(temp,filename);}catch(e){try{fs.unlinkSync(temp);}catch{}throw e;}current=next;loadError=false;return publicState();}
 return {current:()=>({...current}),publicState,draft,save:input=>persist(draft(input)),clear:()=>persist({...current,key:''})};
}
function bytesOf(image){if(typeof image!=='string'||image.length>24*1024*1024||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image))fail('图片数据格式无效');const data=Buffer.from(image.split(',')[1],'base64');if(!data.length||data.length>18*1024*1024)fail('图片过大或为空');const png=data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpeg=data[0]===255&&data[1]===216&&data[2]===255,webp=data.subarray(0,4).toString()==='RIFF'&&data.subarray(8,12).toString()==='WEBP';if(!png&&!jpeg&&!webp)fail('接口没有返回可读取的图片，未使用几何图替代');return {data,mime:png?'image/png':jpeg?'image/jpeg':'image/webp'};}
function threeViewPrompt(input){return `请以参考图片中的「${String(input.name||'家具').slice(0,120)}」为唯一主体，生成一张写实产品三视图摄影图。先去除原图的房间、墙面、桌面、周围物品和遮挡物。保留同一件家具的真实轮廓、结构、弯曲形状、木纹、布料、皮革、金属、颜色与细节，不能替换成通用款式。
画面为纯白背景，横向三个等宽区域，从左到右分别是：正视图、右侧视图、俯视图。完整展示同一件家具，三张图的部件、比例与材质保持一致。采用产品摄影或写实渲染质感，柔和均匀照明，边缘清晰。不要线稿、矢量图、几何示意图、低多边形风格、文字、标注、边框、尺寸线或背景场景。家具未显示的部分合理推测，保持产品结构可信。
${input.feedback?'补充要求：'+String(input.feedback).slice(0,1200):''}`;}
async function editImage(input,settings,{fetchImpl=fetch,resolveImageHost=require('node:dns/promises').lookup,testModelOutput=false,signal,timeoutMs=480000}={}){
 if(!settings.key||!settings.base||!settings.model)fail('尚未配置图像生成接口。请在设置中填写支持参考图编辑并输出图片的模型；也可以上传已有三视图。',503);
 const c=config(settings);checkImageOutput(c,{testModelOutput});const source=bytesOf(input.image),prompt=input.prompt||threeViewPrompt(input),base=c.base.replace(/\/$/,''),combined=AbortSignal.any([AbortSignal.timeout(timeoutMs),...(signal?[signal]:[])]);let url,body,headers;
 if(c.protocol==='chat-image'){
  url=base+'/chat/completions';headers={'Content-Type':'application/json',Authorization:'Bearer '+c.key};body=JSON.stringify({model:c.model,messages:[{role:'user',content:[{type:'text',text:prompt+'\n请直接返回生成的图片数据。若你只能输出文字，请简短说明，不能用代码、SVG、坐标或文字描述冒充图片。'},{type:'image_url',image_url:{url:input.image}}]}],max_tokens:8192,...(/^step-5(?:-|$)/i.test(c.model)?{reasoning_effort:'low',temperature:1,top_p:.95}:{})});
 }else if(c.protocol==='siliconflow'){
  url=base.endsWith('/images/generations')?base:base+'/images/generations';headers={'Content-Type':'application/json',Authorization:'Bearer '+c.key};body=JSON.stringify({model:c.model,prompt,image:input.image,...(/^Qwen\/Qwen-Image-Edit(?:-|$)/i.test(c.model)?{}:{image_size:/^Qwen\/Qwen-Image$/i.test(c.model)?'1664x928':'1024x1024'})});
 }else if(c.protocol==='gemini'){
  url=base+'/models/'+encodeURIComponent(c.model)+':generateContent';headers={'Content-Type':'application/json','x-goog-api-key':c.key};body=JSON.stringify({contents:[{role:'user',parts:[{text:prompt},{inlineData:{mimeType:source.mime,data:source.data.toString('base64')}}]}],generationConfig:{responseModalities:['TEXT','IMAGE']}});
 }else{
  url=base.endsWith('/images/edits')?base:base+'/images/edits';headers={Authorization:'Bearer '+c.key};body=new FormData();body.set('model',c.model);body.set('prompt',prompt);body.set('n','1');body.set('image',new Blob([source.data],{type:source.mime}),source.mime==='image/png'?'reference.png':source.mime==='image/webp'?'reference.webp':'reference.jpg');
 }
 try{
  const response=await fetchImpl(url,{method:'POST',headers,body,signal:combined,redirect:'error'});let raw;try{raw=await response.json();}catch{if(!response.ok)upstreamFailure(response.status,undefined,c.key);fail('图像接口已响应，但返回的不是 JSON，请核对接口协议或网关响应格式',502);}
  if(!response.ok)upstreamFailure(response.status,raw,c.key);
  let image,remoteURL;
  if(c.protocol==='chat-image'){const message=raw.choices?.[0]?.message,parts=Array.isArray(message?.content)?message.content:[],p=message?.images?.[0]||parts.find(p=>p.type==='image_url'||p.type==='image');const u=p?.image_url?.url||p?.image_url||p?.url;if(typeof u==='string'){if(u.startsWith('data:'))image=u;else remoteURL=u;}}
  else if(c.protocol==='gemini'){const part=raw.candidates?.[0]?.content?.parts?.find(p=>(p.inlineData||p.inline_data)?.data),b=part?.inlineData||part?.inline_data;if(b)image='data:'+(b.mimeType||b.mime_type||'image/png')+';base64,'+b.data;}
  else{const d=c.protocol==='siliconflow'?raw.images?.[0]:raw.data?.[0];if(d?.b64_json)image='data:image/png;base64,'+d.b64_json;else if(d?.url?.startsWith('data:'))image=d.url;else remoteURL=d?.url;}
  if(remoteURL){
   let u;try{u=new URL(remoteURL);}catch{fail('图像接口返回的图片地址无效',502);}
   // Do not make arbitrary server-side requests to private networks or forward API credentials.
   const {isIP}=require('node:net');if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443')fail('图像接口返回的图片地址不安全',502);
   const addresses=await resolveImageHost(u.hostname,{all:true});if(!addresses.length||addresses.some(({address:a})=>!isIP(a)||a.includes(':')||/^(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01])|22[4-9]|23\d)\./.test(a)))fail('图像接口返回了本机或私网图片地址，请使用 Base64 返回格式',502);
   const r=await fetchImpl(u.href,{signal:combined,redirect:'error'});if(!r.ok)fail('生成图片下载失败，请重试',502);if(Number(r.headers.get('content-length'))>18*1024*1024)fail('生成图片过大',502);
   const reader=r.body.getReader(),chunks=[];let length=0;try{while(true){const {value,done}=await reader.read();if(done)break;length+=value.length;if(length>18*1024*1024)fail('生成图片过大',502);chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}const data=Buffer.concat(chunks),mime=data[0]===255?'image/jpeg':data.subarray(0,4).toString()==='RIFF'?'image/webp':'image/png';image='data:'+mime+';base64,'+data.toString('base64');
  }
  if(!image){const text=typeof raw.choices?.[0]?.message?.content==='string'?raw.choices[0].message.content:'',truncated=['length','max_tokens'].includes(raw.choices?.[0]?.finish_reason),error=Error(truncated?'接口已连接，但本次响应达到输出上限，尚未返回图片，未生成任何替代图。':'接口已连接，但本次没有生成图片。请配置支持参考图编辑和图片输出的模型，或上传已有三视图；未使用几何图替代。');error.status=502;error.diagnostics={model:c.model,host:new URL(c.base).hostname,responseId:String(raw.id||'').slice(0,200),finishReason:raw.choices?.[0]?.finish_reason||'not_provided',imageOutput:false,textChars:text.length,textPreview:text.slice(0,180).split(c.key).join('[redacted]')};throw error;}const output=bytesOf(image);
  return {image:'data:'+output.mime+';base64,'+output.data.toString('base64'),prompt,provenance:{method:'image-edit-three-views-v1',host:new URL(c.base).hostname,model:c.model,protocol:c.protocol,sourceHash:sha(source.data),imageHash:sha(output.data),responseId:String(raw.id||response.headers.get('x-siliconcloud-trace-id')||response.headers.get('x-request-id')||'').slice(0,200),generatedAt:new Date().toISOString()}};
 }catch(e){if(signal?.aborted){const error=Error('图像生成已取消');error.name='AbortError';throw error;}if(e.status)throw e;if(e.name==='TimeoutError')fail('图像生成服务超时，原模型保留，可重试',504);fail('图像生成连接中断，请核对服务商网络与接口协议',502);}
}
module.exports={createImageSettings,editImage,threeViewPrompt,bytesOf};
