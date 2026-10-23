const assert=require('node:assert/strict');
const {planThreeViews,generateStep5ThreeViews}=require('../step5-three-view-agent.cjs');
const {testImage}=require('../vision-test-image.cjs');
const bytes=testImage(),image='data:image/png;base64,'+bytes.toString('base64');
const step5={base:'https://api.stepfun.com/v1',model:'step-5-preview',key:'qa-step-key'},tool={base:'https://images.example/v1',model:'reference-image-model',key:'qa-image-key',protocol:'image-edits'};
const prompt='保留原图弯曲木靠背、白坐垫与黑金属框架，白底等宽三格正视、右视、俯视，写实摄影。';
const request=(args={prompt})=>({id:'qa-step-response',choices:[{finish_reason:'tool_calls',message:{tool_calls:[{id:'qa-tool-call',type:'function',function:{name:'generate_furniture_three_views',arguments:JSON.stringify(args)}}]}}]});
(async()=>{
 let requests=[];
 const fetchImpl=async(url,options)=>{
  requests.push(url);
  if(url===step5.base+'/chat/completions'){
   assert.equal(options.headers.Authorization,'Bearer '+step5.key);const body=JSON.parse(options.body);
   assert.equal(body.model,'step-5-preview');assert.equal(body.messages[1].content[1].image_url.url,image);
   assert.equal(body.tool_choice.function.name,'generate_furniture_three_views');assert.equal(body.tools[0].function.parameters.additionalProperties,false);
   return Response.json(request());
  }
  assert.equal(url,tool.base+'/images/edits');assert.equal(options.headers.Authorization,'Bearer '+tool.key);
  assert.equal(options.body.get('prompt'),prompt);assert.deepEqual(Buffer.from(await options.body.get('image').arrayBuffer()),bytes);
  return Response.json({id:'qa-image-response',data:[{b64_json:bytes.toString('base64')}]});
 };
 const profile=c=>({current:()=>({...c})});
 const result=await generateStep5ThreeViews({image,name:'椅子'},step5,tool,{fetchImpl});
 assert.deepEqual(requests,[step5.base+'/chat/completions',tool.base+'/images/edits']);assert.equal(result.image,image);
 assert.equal(result.provenance.model,tool.model);assert.equal(result.provenance.orchestratorModel,step5.model);assert.equal(result.provenance.toolRequested,true);
 assert.equal(result.provenance.orchestratorResponseId,'qa-step-response');assert.equal(result.provenance.responseId,'qa-image-response');assert.equal(result.provenance.workflowProfile,'step5');
 assert(!JSON.stringify(result).includes('qa-step-key'));assert(!JSON.stringify(result).includes('qa-image-key'));
 requests=[];await assert.rejects(generateStep5ThreeViews({image},step5,{}, {fetchImpl}),e=>e.status===503&&e.diagnostics.toolRequested&&e.diagnostics.stage==='image_tool_not_configured');assert.equal(requests.length,1);
 await assert.rejects(planThreeViews({image},step5,{fetchImpl:async()=>Response.json(request({prompt,url:'https://unexpected.example'}))}),/参数校验失败/);
 await assert.rejects(planThreeViews({image},step5,{fetchImpl:async()=>Response.json({choices:[{finish_reason:'stop',message:{content:'已生成图片'}}]})}),/未返回可执行/);
 await assert.rejects(planThreeViews({image},step5,{fetchImpl:async()=>new Response('<html>bad gateway</html>',{status:502})}),/HTTP 502/);
 await assert.rejects(planThreeViews({image},step5,{fetchImpl:async()=>new Response('<html>ok</html>')}),/不是有效 JSON/);
 await assert.rejects(planThreeViews({image},step5,{fetchImpl:async()=>{const r=request();r.choices[0].finish_reason='length';return Response.json(r);}}),/被截断/);
 await assert.rejects(generateStep5ThreeViews({image},step5,tool,{fetchImpl:async(url,options)=>url.includes('stepfun')?Response.json(request()):Response.json({data:[]})}),e=>e.diagnostics.toolRequested&&e.diagnostics.stage==='image_tool_failed');
 await assert.rejects(planThreeViews({image:'invalid'},step5,{fetchImpl:()=>{throw Error('must not call');}}),/图片数据格式无效/);
 console.log('Step 5 tool workflow passed: real source binding, separate credentials, strict tool arguments, actual image output and provenance required, explicit incomplete states.');
})().catch(e=>{console.error(e);process.exitCode=1;});
