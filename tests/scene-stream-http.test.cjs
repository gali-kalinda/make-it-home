const assert=require('node:assert/strict'),{once}=require('node:events');
// Isolated local HTTP contract test: no saved credentials, external calls or AI worker.
let abortedResolve;const aborted=new Promise(resolve=>abortedResolve=resolve);
require.cache[require.resolve('../scene-extraction-server.cjs')]={exports:{extractScene:async(input,vision,options={})=>{
 options.onProgress?.({phase:'analyzing',text:'正在识别…'});
 if(input.mode==='failure')throw Error('测试服务未完成');
 if(input.mode==='cancel')return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{abortedResolve();reject(Error('取消'));},{once:true}));
 await new Promise(resolve=>setTimeout(resolve,40));return {provider:'test',items:[]};
}}};
require.cache[require.resolve('../vision-settings-server.cjs')]={exports:{createVisionSettings:()=>({current:()=>({}),publicState:()=>({hasKey:false})}),allowSettingsRequest:()=>false,serviceError:async()=> 'Test provider error'}};
require.cache[require.resolve('../image-edit-server.cjs')]={exports:{createImageSettings:()=>({current:()=>({}),publicState:()=>({})}),bytesOf:()=>{throw Error('No image input in isolated HTTP test');},threeViewPrompt:()=>'',editImage:async()=>{throw Error('No image provider in isolated HTTP test');}}};
require.cache[require.resolve('../local-ai-server.cjs')]={exports:{start:async()=>{},close:()=>{},status:()=>({})}};
process.env.PORT='0';const {server}=require('../server.cjs');
(async()=>{
 try{
  if(!server.listening)await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
  const post=(mode,signal)=>fetch(base+'/api/furniture/extract-scene-stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode}),signal});
  const response=await post('success');assert(response.headers.get('content-type').includes('ndjson'));const reader=response.body.getReader(),first=new TextDecoder().decode((await reader.read()).value);assert(first.includes('"type":"progress"'));assert(!first.includes('"type":"result"'));let remainder='';while(true){const {value,done}=await reader.read();if(done)break;remainder+=new TextDecoder().decode(value);}assert(remainder.includes('"type":"result"'));
  const failed=await(await post('failure')).text();assert(failed.includes('"type":"error"'));assert(!failed.includes('"type":"result"'));
  const controller=new AbortController(),cancelResponse=await post('cancel',controller.signal);await cancelResponse.body.getReader().read();controller.abort();let timer;await Promise.race([aborted,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(Error('Provider was not cancelled')),1000);})]);clearTimeout(timer);
  const denied=await fetch(base+'/api/furniture/extract-scene-stream',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:'{}'});assert.equal(denied.status,403);
  console.log('Passed HTTP progress before results, streamed failure, provider cancellation on disconnect and cross-site rejection.');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
