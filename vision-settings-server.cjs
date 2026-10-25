const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const DEFAULT_BASE='',DEFAULT_MODEL='';
const {testImage}=require('./vision-test-image.cjs');
const {serviceError}=require('./vision-errors.cjs');
const {requestVisionJSON}=require('./vision-protocol.cjs');
function fail(message,status=400){const e=Error(message);e.status=status;throw e;}
function normalize(input){
 if(!input||typeof input!=='object')fail('请填写接口配置');
 let url;try{url=new URL(String(input.base||'').trim());}catch{fail('接口地址无效');}
 if(url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol)||url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))fail('接口地址请使用 HTTPS，本机接口可使用 HTTP');
 const base=url.href.replace(/\/+$/,''),model=String(input.model||'').trim(),key=String(input.key||'').trim();
 if(base.length>1000||!model||model.length>200||/[\x00-\x1f\x7f]/.test(model)||key.length>4000||/[\x00-\x1f\x7f]/.test(key))fail('模型名称或密钥格式无效');
 if(/\/chat\/completions$/.test(base))fail('接口地址只需填写到 /v1，请去掉 /chat/completions');
 return {base,model,key};
}
function windowsCodec(){
 function run(mode,input){
  if(process.platform!=='win32')fail('当前系统暂不支持安全保存密钥，请使用服务端环境变量',503);
  const operation=mode==='protect'?"[Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($data),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)":"[Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($data),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)";
  const output=mode==='protect'?`[Convert]::ToBase64String(${operation})`:`[Text.Encoding]::UTF8.GetString(${operation})`;
  const script=`$ErrorActionPreference='Stop';[Console]::InputEncoding=[Text.Encoding]::UTF8;[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);Add-Type -AssemblyName System.Security;$data=[Console]::In.ReadToEnd();[Console]::Write(${output})`;
  // The credential is passed over stdin, never placed in process arguments/logs.
  const result=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input,encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024});
  if(result.error||result.status!==0)fail(mode==='protect'?'本机密钥加密失败，配置未保存':'无法读取已保存的密钥，请重新填写',503);
  return result.stdout.trim();
 }
 return {protect:text=>run('protect',text),unprotect:text=>run('unprotect',text)};
}
function platformCodec(filename){return process.platform==='win32'?windowsCodec():require('./local-secret-codec.cjs').portableCodec(path.dirname(filename));}
function createVisionSettings({filename,env=process.env,codec=platformCodec(filename),fetchImpl=fetch}={}){
 let source='environment',loadError=false;
 let current={base:env.VISION_BASE_URL||DEFAULT_BASE,model:env.VISION_MODEL||DEFAULT_MODEL,key:env.VISION_API_KEY||''};
 try{const saved=JSON.parse(fs.readFileSync(filename,'utf8'));if(saved.version!==1||typeof saved.protected!=='string')throw Error();current=normalize(JSON.parse(codec.unprotect(saved.protected)));source='local';}
 catch(e){if(e.code!=='ENOENT'){loadError=true;current={base:DEFAULT_BASE,model:DEFAULT_MODEL,key:''};source='none';}}
 function publicState(){return {base:current.base,model:current.model,hasKey:!!current.key,configured:!!(current.base&&current.model&&current.key),source:current.key?source:'none',loadError};}
 function draft(input){const next=normalize(input);if(!next.key){if(next.base!==current.base&&current.key)fail('更换接口地址时，请重新填写对应服务的密钥');next.key=current.key;}if(!next.key)fail('请输入 API 密钥');return next;}
 function persist(next){
  const encrypted=codec.protect(JSON.stringify(next)),dir=path.dirname(filename),temp=filename+'.tmp';
  try{fs.mkdirSync(dir,{recursive:true,mode:0o700});fs.writeFileSync(temp,JSON.stringify({version:1,protected:encrypted}),{encoding:'utf8',mode:0o600});fs.renameSync(temp,filename);}
  catch{try{fs.unlinkSync(temp);}catch{}fail('配置保存失败，原配置仍然有效',503);}
  current=next;source='local';loadError=false;return publicState();
 }
 async function test(input){
  const next=draft(input);
  const result=await requestVisionJSON(next,{image:'data:image/png;base64,'+testImage().toString('base64'),prompt:'Connection and image understanding test. Look at the attached image. Identify the central colored geometric shape against the background. Return JSON with exactly two fields: color (a lowercase English color name) and shape (a lowercase English shape name). Use the image as evidence; do not guess without seeing it.',maxTokens:4096,timeoutMs:90000,fetchImpl,imageLabel:'测试图片'});
  if(String(result.value.color).toLowerCase()!=='red'||String(result.value.shape).toLowerCase()!=='square'){const e=Error('接口连接和 JSON 解析已通过，但测试图片的颜色或形状识别不符。请核对模型的图片理解能力或代理服务的图片转发。');e.status=502;e.code='IMAGE_CHECK_FAILED';e.diagnostics={...result.diagnostics,connection:true,json:true,image:false};throw e;}
  return {ok:true,message:'连接成功：图片颜色、形状辨识和 JSON 输出均通过。'+(result.diagnostics.jsonMode==='prompt_json'?' 当前使用提示词约束 JSON，接口不支持强制 JSON 参数。':''),diagnostics:{...result.diagnostics,connection:true,json:true,image:true}};
 }
 return {current:()=>({...current}),publicState,save:input=>persist(draft(input)),clear:()=>persist({...current,key:''}),test};
}
function allowSettingsRequest(req,port){
 const host=req.headers.host,origin=req.headers.origin;
 if(!['localhost:'+port,'127.0.0.1:'+port].includes(host))return false;
 if(origin&&!['http://localhost:'+port,'http://127.0.0.1:'+port].includes(origin))return false;
 if(req.method==='GET')return req.headers['sec-fetch-site']!=='cross-site';
 return !!origin&&req.headers['x-studio-settings']==='1'&&String(req.headers['content-type']||'').split(';')[0]==='application/json';
}
module.exports={createVisionSettings,allowSettingsRequest,normalize,windowsCodec,platformCodec,serviceError};
