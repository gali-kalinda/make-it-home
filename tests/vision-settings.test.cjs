const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createVisionSettings,allowSettingsRequest,normalize,platformCodec}=require('../vision-settings-server.cjs');
const {testImage,crc32}=require('../vision-test-image.cjs'),{inflateSync}=require('node:zlib');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'studio-vision-settings-')),filename=path.join(dir,'private','settings.json');
 const secret='sk-unit-test-not-a-real-key',codec=platformCodec(filename);let seen;
 try{
  const png=testImage();assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);let offset=8,decoded=0;const chunks=[];
  while(offset<png.length){const length=png.readUInt32BE(offset),payload=png.subarray(offset+4,offset+8+length),type=payload.subarray(0,4).toString();assert.equal(crc32(payload),png.readUInt32BE(offset+8+length));chunks.push(type);if(type==='IHDR'){assert.equal(payload.readUInt32BE(4),64);assert.equal(payload.readUInt32BE(8),64);}if(type==='IDAT')decoded+=inflateSync(payload.subarray(4)).length;offset+=length+12;}
  assert.equal(offset,png.length);assert.deepEqual(chunks,['IHDR','IDAT','IEND']);assert.equal(decoded,64*193);
  const settings=createVisionSettings({filename,env:{},codec,fetchImpl:async(url,request)=>{seen={url,request};return {ok:true,json:async()=>({choices:[{message:{content:'{"color":"red","shape":"square"}'},finish_reason:'stop'}]})};}});
  assert.equal(settings.publicState().configured,false);
  settings.save({base:'https://api.siliconflow.cn/v1/',model:'Qwen/Qwen3-VL-32B-Instruct',key:secret});
  const disk=fs.readFileSync(filename,'utf8');assert(!disk.includes(secret));assert(!JSON.stringify(settings.publicState()).includes(secret));
  assert.equal(settings.publicState().configured,true);
  const reopened=createVisionSettings({filename,env:{VISION_API_KEY:'wrong-env-key'},codec});assert.equal(reopened.current().key,secret);
  settings.save({...settings.publicState(),key:''});assert.equal(settings.current().key,secret);
  assert.throws(()=>settings.save({base:'https://example.com/v1',model:'model',key:''}),/重新填写/);
  await settings.test({...settings.publicState(),key:''});assert.equal(seen.url,'https://api.siliconflow.cn/v1/chat/completions');assert.equal(seen.request.headers.Authorization,'Bearer '+secret);
  const request=JSON.parse(seen.request.body);assert.equal(request.response_format.type,'json_object');assert(request.max_tokens>=4096);assert(!/\bred\b/.test(request.messages[0].content[0].text));assert.deepEqual(Buffer.from(request.messages[0].content.find(i=>i.type==='image_url').image_url.url.split(',')[1],'base64'),png);assert.equal(seen.request.redirect,'error');
  const failed=createVisionSettings({filename,env:{},codec,fetchImpl:async()=>{throw Error(secret);}});await assert.rejects(failed.test({...settings.publicState(),key:''}),e=>!e.message.includes(secret)&&/连接失败/.test(e.message));
  for(const [status,reason,expected] of [[400,'image_url provided is not a valid image.','测试图片'],[400,'response_format unsupported for model','请求参数'],[402,'Insufficient balance','余额'],[401,'Invalid API key '+secret,'密钥'],[429,'Rate limit exceeded','频繁']]){
   const rejected=createVisionSettings({filename,env:{},codec,fetchImpl:async()=>({ok:false,status,json:async()=>({error:{message:reason}})})});
   await assert.rejects(rejected.test({...settings.publicState(),key:''}),e=>e.message.includes(expected)&&!e.message.includes(secret));
  }
  settings.clear();assert.equal(settings.publicState().configured,false);assert.equal(createVisionSettings({filename,env:{VISION_API_KEY:'env-key'},codec}).current().key,'');
  fs.writeFileSync(filename,'{"version":1,"protected":"corrupt"}');const corrupt=createVisionSettings({filename,env:{VISION_API_KEY:secret},codec});assert(corrupt.publicState().loadError);assert(!corrupt.publicState().configured);
  assert.throws(()=>normalize({base:'https://user:pass@example.com/v1',model:'m',key:'k'}));assert.throws(()=>normalize({base:'http://example.com/v1',model:'m',key:'k'}));assert.throws(()=>normalize({base:'https://example.com/v1/chat/completions',model:'m',key:'k'}));
  const good={method:'POST',headers:{host:'127.0.0.1:8787',origin:'http://127.0.0.1:8787','content-type':'application/json','x-studio-settings':'1'}};
  assert(allowSettingsRequest(good,8787));for(const headers of [{origin:'https://evil.example'},{host:'evil.example:8787'},{'x-studio-settings':''},{origin:''},{'content-type':'text/plain'}])assert(!allowSettingsRequest({...good,headers:{...good.headers,...headers}},8787));
  console.log('Vision settings passed: platform encryption, restart persistence, no secret responses, blank-key preservation, changed-host guard, immediate clear, corrupted-store isolation, image/JSON connection test and cross-site guards.');
 }finally{assert.equal(path.dirname(dir),os.tmpdir());assert(path.basename(dir).startsWith('studio-vision-settings-'));fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
