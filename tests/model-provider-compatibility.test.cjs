const assert=require('node:assert/strict'),crypto=require('node:crypto');
const {generatePhotoModel,workflowStatus}=require('../photo-three-view-server.cjs');
const {buildPayload}=require('../vision-protocol.cjs'),V=require('../furniture-three-views-core.js'),{testImage}=require('../vision-test-image.cjs');
const bytes=testImage(),image='data:image/png;base64,'+bytes.toString('base64'),hash=x=>crypto.createHash('sha256').update(x).digest('hex');
const drawing=V.validate({schema:'furniture-three-views-image-v1',name:'椅子',sheet:image,views:['front','side','top'].map(id=>({id,image}))});
const input={drawing,image,source:image,sourceHash:hash(bytes),approvedDrawingHash:hash(JSON.stringify(drawing)),confirmed:true,dimensions:{w:450,d:450,h:800},name:'椅子'};
const settings=c=>({current:()=>({...c}),publicState:()=>({base:c.base,model:c.model,hasKey:!!c.key,configured:!!c.key})});
const geometry={schema:'image-parts-v1',name:'白垫木椅',kind:'chair',mounting:'floor',parts:[{id:'seat',shape:'box',position:[0,.5,0],size:[1,.1,1],color:'#eee9df',material:'fabric'}]};
(async()=>{
 for(const config of [{base:'https://api.stepfun.com/v1',model:'step-5-preview',key:'qa-step-key'},{base:'https://api.deepseek.com',model:'deepseek-flash',key:'qa-deepseek-key'}]){
  const services={visionSettings:settings(config),imageSettings:settings({})};
  assert.equal(workflowStatus(services).modelling.model,config.model);
  let calls=0;
  const fetchImpl=async(url,o)=>{calls++;const p=JSON.parse(o.body);assert.equal(url,config.base+'/chat/completions');assert.equal(o.headers.Authorization,'Bearer '+config.key);assert.equal(p.model,config.model);assert.equal(p.stream,true);
   const pictures=p.messages[0].content.filter(p=>p.type==='image_url');assert.equal(pictures.length,2);assert.equal(pictures[0].image_url.url,drawing.sheet);assert.equal(pictures[1].image_url.url,input.source);
   if(config.model==='step-5-preview'){assert.equal(p.reasoning_effort,'low');assert.equal(p.temperature,1);assert.equal(p.max_tokens,36000);}else{assert.deepEqual(p.thinking,{type:'disabled'});assert.equal(p.max_tokens,24000);assert(!('reasoning_effort' in p));}
   return Response.json({id:'qa-'+config.model,choices:[{message:{content:JSON.stringify(geometry)},finish_reason:'stop'}]});
  };
  for(let n=0;n<2;n++){const result=await generatePhotoModel(input,services,{fetchImpl});assert.equal(result.provenance.model,config.model);assert.equal(result.provenance.workflowProfile,'model');assert(result.provenance.threeViews.confirmed);assert(result.geometry.parts.length);assert(!JSON.stringify(result).includes(config.key));}
  assert.equal(calls,2,'Regeneration uses a new request for '+config.model);
  if(config.model==='deepseek-flash'){
   const compatible=buildPayload({...config,base:'https://api.deepseek.com/v1'},{image,prompt:'JSON'});assert.deepEqual(compatible.thinking,{type:'disabled'});
  }
 }
 console.log('Shared model interface passed for Step 5 Preview and DeepSeek: configured endpoint/name/key, confirmed sheet plus source, provider parameters, usable geometry and fresh regeneration.');
})().catch(e=>{console.error(e);process.exitCode=1;});
