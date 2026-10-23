const assert=require('node:assert/strict');
const {requestSceneVision}=require('../scene-vision-request.cjs');
const {read}=require('../scene-extraction-stream.js');
const {cleanResult}=require('../scene-extraction-server.cjs');
const vision={base:'https://api.siliconflow.cn/v1',model:'Qwen/Qwen3-VL-32B-Instruct',key:'sk-test-not-real'};
const compact={items:[{n:'茶几',k:'coffee_oval',b:[200,400,700,900],s:[1000,600,400],c:['#a38d73','#696457','#982d31'],z:0,v:'partial'},{n:'柜子',k:'cabinet',b:[0,0,100,300],s:[800,400,800],v:'occluded'}]};
function bytesResponse(text,type='text/event-stream',stride=7){
 const bytes=new TextEncoder().encode(text);let offset=0;
 return new Response(new ReadableStream({pull(c){if(offset===bytes.length)return c.close();c.enqueue(bytes.slice(offset,offset+=stride));}}),{headers:{'Content-Type':type}});
}
const event=data=>'data: '+JSON.stringify(data)+'\r\n\r\n';
const sse=content=>event({choices:[{delta:{content}}]})+event({choices:[{delta:{},finish_reason:'stop'}]})+'data: [DONE]\r\n\r\n';
(async()=>{
 let payload,observedSignal;const progress=[];
 const result=await requestSceneVision('data:image/png;base64,AAAA',vision,['coffee_oval','cabinet'],{fetchImpl:async(url,req)=>{assert(url.endsWith('/chat/completions'));assert.equal(req.headers.Authorization,'Bearer '+vision.key);payload=JSON.parse(req.body);return bytesResponse(': keepalive\r\n\r\n'+sse(JSON.stringify(compact)));},onProgress:p=>progress.push(p)});
 assert.equal(payload.stream,true);assert.equal(payload.enable_thinking,false);assert.equal(payload.max_tokens,24000);assert(payload.messages[0].content[0].text.includes('left,top,right,bottom'));
 const clean=cleanResult(result);assert.equal(clean.items[0].name,'茶几');assert.deepEqual(clean.items[0].box,[.2,.4,.5,.5]);assert.equal(clean.items[0].dimensions.w,1000);assert.equal(clean.items[1].selected,false);assert.equal(clean.items[0].dimensions.source,'ai-estimate');assert(progress.some(p=>p.phase==='validating'));
 const fallback=await requestSceneVision('image',vision,[],{fetchImpl:async()=>Response.json({choices:[{message:{content:JSON.stringify(compact)},finish_reason:'stop'}]})});assert.equal(fallback.items.length,2);
 for(const [text,pattern] of [
  [event({choices:[{delta:{content:'{"items":['},finish_reason:'length'}]})+'data: [DONE]\n\n',/输出未完成/],
  [sse('{"items":['),/完整.*JSON/],
  [sse(''),/未返回/],
  ['data: {invalid}\n\n',/无法读取/],
  [event({error:{message:vision.key}}),/中断/]
 ])await assert.rejects(requestSceneVision('image',vision,[],{fetchImpl:async()=>bytesResponse(text)}),pattern);
 const bad=structuredClone(compact);bad.items[0].b=[200,400,1100,900];await assert.rejects(requestSceneVision('image',vision,[],{fetchImpl:async()=>bytesResponse(sse(JSON.stringify(bad)))}));
 await assert.rejects(requestSceneVision('image',vision,[],{fetchImpl:async()=>Response.json({error:{message:'invalid API key '+vision.key}},{status:401})}),e=>!e.message.includes(vision.key)&&/密钥/.test(e.message));
 const slow=async(url,req)=>new Response(new ReadableStream({start(c){observedSignal=req.signal;req.signal.addEventListener('abort',()=>c.error(req.signal.reason),{once:true});}}),{headers:{'Content-Type':'text/event-stream'}});
 const controller=new AbortController();const pending=requestSceneVision('image',vision,[],{fetchImpl:slow,signal:controller.signal});controller.abort();await assert.rejects(pending,e=>e.name==='AbortError');assert(observedSignal.aborted);
 const keepAlive=setTimeout(()=>{},1000);await assert.rejects(requestSceneVision('image',vision,[],{fetchImpl:slow,timeoutMs:10}),e=>e.status===504);clearTimeout(keepAlive);
 const updates=[];const ndjson=[{type:'heartbeat'},{type:'progress',text:'正在识别家具…'},{type:'result',result:clean}].map(JSON.stringify).join('\r\n');assert.deepEqual(await read(bytesResponse(ndjson,'application/x-ndjson',1),p=>updates.push(p)),clean);assert.equal(updates[0].text,'正在识别家具…');
 await assert.rejects(read(bytesResponse('{"type":"heartbeat"}\n','application/x-ndjson')),/中断/);
 await assert.rejects(read(bytesResponse('{"type":"error","error":"原图已保留"}\n','application/x-ndjson')),/原图已保留/);
 await assert.rejects(read(Response.json({error:'请求失败'},{status:400})),/请求失败/);
 assert.deepEqual(await read(Response.json(clean)),clean);
 console.log('Passed scene streaming, coordinate conversion, uncertainty, split UTF-8/CRLF, errors, cancellation, timeout and browser stream tests.');
})().catch(e=>{console.error(e);process.exitCode=1;});

