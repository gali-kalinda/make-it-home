const assert=require('node:assert/strict');
const {providerProfile,buildPayload,requestVisionJSON,parseObject}=require('../vision-protocol.cjs');
const image='data:image/png;base64,TEST',key='sk-only-a-test-key',vision={base:'https://api.stepfun.com/v1',model:'step-5-preview',key};
const answer={color:'red',shape:'square'},reply=(content=JSON.stringify(answer),extra={})=>Response.json({id:'request-123',choices:[{message:{content},finish_reason:'stop',...extra}]});
(async()=>{
 const built=buildPayload(vision,{image,prompt:'Describe image as JSON',maxTokens:4096});assert.equal(built.reasoning_effort,'low');assert.equal(built.temperature,1);assert.equal(built.top_p,.95);assert.equal(built.max_tokens,4096);assert(!Object.hasOwn(built,'enable_thinking'));assert.equal(built.messages[0].content[1].image_url.url,image);
 const reasoningProvider=async(url,r)=>JSON.parse(r.body).max_tokens<4096?reply('',{finish_reason:'length',message:{content:null,reasoning_content:'private reasoning'}}):reply();
 await assert.rejects(requestVisionJSON(vision,{image,prompt:'JSON',maxTokens:64,fetchImpl:reasoningProvider}),e=>e.code==='OUTPUT_TRUNCATED');assert.deepEqual((await requestVisionJSON(vision,{image,prompt:'JSON',fetchImpl:reasoningProvider})).value,answer);
 assert.equal(providerProfile({...vision,base:'https://api.stepfun.ai/v1'}).reasoning_effort,'low');assert(!providerProfile({...vision,model:'step-1v'}).reasoning_effort);
 assert.deepEqual(providerProfile({...vision,base:'https://api.deepseek.com',model:'deepseek-flash'}).thinking,{type:'disabled'});
 assert.equal(providerProfile({...vision,base:'https://api.siliconflow.cn/v1',model:'Qwen/Qwen3-VL-32B-Instruct'}).enable_thinking,false);
 assert.deepEqual(providerProfile({...vision,base:'https://custom.example/v1'}),{name:'OpenAI 兼容接口'});
 for(const content of [JSON.stringify(answer),'\uFEFF ```JSON\n'+JSON.stringify(answer)+'\n```',[{type:'text',text:'{"color":"red",'},{type:'text',text:'"shape":"square"}'}]]){
  const result=await requestVisionJSON(vision,{image,prompt:'JSON',fetchImpl:async()=>reply(content)});assert.deepEqual(result.value,answer);assert.equal(result.diagnostics.attempts,1);assert.equal(result.diagnostics.finishReason,'stop');assert(!JSON.stringify(result).includes(key));
 }
 assert.deepEqual(parseObject(answer),answer);assert.throws(()=>parseObject('[]'));
 let calls=0;const payloads=[];const adapted=await requestVisionJSON({...vision,base:'https://proxy.example/v1'},{image,prompt:'JSON',fetchImpl:async(url,r)=>{assert.equal(url,'https://proxy.example/v1/chat/completions');assert.equal(r.headers.Authorization,'Bearer '+key);const p=JSON.parse(r.body);payloads.push(p);assert.equal(p.messages[0].content[1].image_url.url,image);calls++;return calls===1?Response.json({error:{message:'response_format json_object is not supported',param:'response_format'}},{status:400}):reply();}});
 assert.equal(calls,2);assert(payloads[0].response_format);assert(!payloads[1].response_format);assert.equal(adapted.diagnostics.jsonMode,'prompt_json');assert.deepEqual(adapted.diagnostics.adjustments,['prompt_json']);
 calls=0;await requestVisionJSON(vision,{image,prompt:'JSON',fetchImpl:async(url,r)=>{const p=JSON.parse(r.body);calls++;if(calls===1)return Response.json({error:{message:'temperature is not supported',param:'temperature'}},{status:400});if(calls===2){assert(!p.temperature);return Response.json({error:{message:'max_tokens is unsupported; use max_completion_tokens',param:'max_tokens'}},{status:400});}assert(!Object.hasOwn(p,'max_tokens'));assert.equal(p.max_completion_tokens,4096);return reply();}});assert.equal(calls,3);
 for(const status of [401,403,402,429]){calls=0;await assert.rejects(requestVisionJSON(vision,{image,prompt:'JSON',fetchImpl:async()=>{calls++;return Response.json({error:{message:'Rejected '+key}},{status});}}),e=>e.providerStatus===status&&!e.message.includes(key));assert.equal(calls,1);}
 const cases=[
  [()=>reply('',{finish_reason:'length',message:{content:null,reasoning_content:'private thought'}}),'OUTPUT_TRUNCATED'],
  [()=>reply('',{message:{content:null,reasoning_content:'private thought'}}),'EMPTY_CONTENT'],
  [()=>reply('{broken'),'INVALID_JSON'],
  [()=>reply('',{message:{content:null,refusal:'no'},finish_reason:'content_filter'}),'MODEL_REFUSAL'],
  [()=>Response.json({choices:[]}),'EMPTY_CONTENT'],
  [()=>new Response('not an API envelope'),'INVALID_ENVELOPE']
 ];
 for(const [mock,code] of cases)await assert.rejects(requestVisionJSON(vision,{image,prompt:'JSON',fetchImpl:async()=>mock()}),e=>e.code===code&&!e.message.includes('private thought')&&!e.message.includes(key));
 const event=j=>'data: '+JSON.stringify(j)+'\r\n\r\n',bytes=new TextEncoder().encode(event({choices:[{index:0,delta:{reasoning_content:'private reasoning'}}]})+event({choices:[{index:0,delta:{content:[{type:'text',text:'{"label":"椅子"}'}]},finish_reason:'stop'}]})+'data: [DONE]\r\n\r\n');let offset=0;
 const stream=await requestVisionJSON(vision,{image,prompt:'JSON',stream:true,fetchImpl:async()=>new Response(new ReadableStream({pull(c){if(offset>=bytes.length)return c.close();c.enqueue(bytes.slice(offset,offset+=3));}}),{headers:{'Content-Type':'text/event-stream'}})});assert.deepEqual(stream.value,{label:'椅子'});assert(!JSON.stringify(stream).includes('private reasoning'));assert(stream.diagnostics.reasoningChars>0);
 const controller=new AbortController();controller.abort();await assert.rejects(requestVisionJSON(vision,{image,prompt:'JSON',signal:controller.signal,fetchImpl:async(url,r)=>{r.signal.throwIfAborted();}}),e=>e.name==='AbortError');
 const {createVisionSettings}=require('../vision-settings-server.cjs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
 function mockSettings(content){return createVisionSettings({filename:path.join(os.tmpdir(),'unwritten-vision-'+crypto.randomUUID()+'.json'),env:{VISION_BASE_URL:vision.base,VISION_MODEL:vision.model,VISION_API_KEY:key},codec:{protect:v=>v,unprotect:v=>v},fetchImpl:async()=>reply(content)});}
 const passed=await mockSettings(JSON.stringify(answer)).test({...vision,key:''});assert(passed.ok&&passed.diagnostics.image&&passed.diagnostics.json&&passed.diagnostics.connection);
 await assert.rejects(mockSettings('{"color":"blue","shape":"square"}').test({...vision,key:''}),e=>e.code==='IMAGE_CHECK_FAILED'&&e.diagnostics.json===true&&e.diagnostics.image===false);
 const keepAlive=setTimeout(()=>{},200);await assert.rejects(requestVisionJSON(vision,{image,prompt:'JSON',timeoutMs:10,fetchImpl:async(url,r)=>new Promise((res,rej)=>r.signal.addEventListener('abort',()=>rej(r.signal.reason),{once:true}))}),e=>e.code==='VISION_TIMEOUT'&&e.status===504);clearTimeout(keepAlive);
 console.log('Vision protocol passed: Step 5/DeepSeek/SiliconFlow/generic profiles, actual images preserved, string/blocks/fenced JSON, bounded parameter negotiation, no auth retries, distinct truncation/empty/refusal/format errors, secret redaction, split UTF-8 SSE, cancellation and timeout.');
})().catch(e=>{console.error(e);process.exitCode=1;});
