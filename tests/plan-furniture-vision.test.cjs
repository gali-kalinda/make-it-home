const assert=require('node:assert/strict');
const {recognizePlanFurniture,cleanInventory,mergeDetection}=require('../plan-furniture-vision.cjs');
const {testImage}=require('../vision-test-image.cjs');
(async()=>{
 const vision={base:'https://api.stepfun.com/v1',model:'step-5-preview',key:'sk-unit-test'},image='data:image/png;base64,'+testImage().toString('base64');
 const item={name:'床',type:'bed',bbox:[100,200,180,200],rotation:90,height:1080,color:'#d1c5b1',confidence:.9};let calls=0;
 const result=await recognizePlanFurniture({image,width:1000,height:800},vision,{fetchImpl:async(url,o)=>{calls++;const p=JSON.parse(o.body);assert.equal(url,vision.base+'/chat/completions');assert.equal(p.model,vision.model);assert.equal(p.reasoning_effort,'low');assert.equal(p.messages[0].content[1].image_url.url,image);return Response.json({id:'step-plan-test',choices:[{message:{content:JSON.stringify({items:[item]})},finish_reason:'stop'}]});}});
 assert.equal(calls,1);assert.equal(result.provider,'vision-api');assert.equal(result.diagnostics.responseId,'step-plan-test');assert.deepEqual(result.items[0].bbox,item.bbox);assert.equal(result.items[0].rotation,90);assert(!JSON.stringify(result).includes(vision.key));
 assert.throws(()=>cleanInventory({items:[{...item,bbox:[900,200,180,200]}]},1000,800),/坐标/);
 assert.throws(()=>cleanInventory({items:[{...item,type:'wall'}]},1000,800),/类别/);
 await assert.rejects(recognizePlanFurniture({image,width:1000,height:800},{...vision,key:''}),/配置/);
 const merged=[];mergeDetection(merged,{type:'chair',roomId:'room',bbox:[100,100,40,45],cropClearance:.05});mergeDetection(merged,{type:'chair',roomId:'room',bbox:[102,99,39,46],cropClearance:.3});assert.equal(merged.length,1);assert.equal(merged[0].cropClearance,.3);mergeDetection(merged,{type:'chair',roomId:'room',bbox:[145,100,40,45]});mergeDetection(merged,{type:'table',roomId:'room',bbox:[100,100,40,45]});assert.equal(merged.length,3,'adjacent chairs and different object types remain separate');
 const tables=[];mergeDetection(tables,{type:'cabinet',roomId:'r',bbox:[868,817,57,54],cropClearance:.2});mergeDetection(tables,{type:'cabinet',roomId:'r',bbox:[904,820,32,34],cropClearance:.05});assert.equal(tables.length,1,'overlapping crops may describe the same table with different box sizes');
 console.log('Plan furniture API: configured Step model, real image payload, pixel boxes, rotation and safe provenance; invalid coordinates/category/key rejected.');
})().catch(e=>{console.error(e);process.exitCode=1;});
