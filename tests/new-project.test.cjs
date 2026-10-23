const assert=require('node:assert/strict'),H=require('../plan-history-core.js'),C=require('../core.js');
const fixture=require('./fixtures/render-reconcile-plan.json'),clone=x=>JSON.parse(JSON.stringify(x));
(async()=>{
 let current=clone(fixture),writesFail=false,applied=0;current.source={width:100,height:80,mmPerPixel:10,data:'data:image/png;base64,fixture'};current.planGeneration=require('../plan-pipeline-core.js').begin();current.customReview={keep:true};
 const original=clone(current),rows=new Map(),repo={put:async r=>{if(writesFail)throw Error('disk full');rows.set(r.meta.id,clone(r));},get:async id=>clone(rows.get(id)),list:async()=>[...rows.values()].map(r=>clone(r.meta))};
 const service=H.createService(repo,{capture:()=>current,apply:async p=>{applied++;current=clone(p);},validate:p=>C.validate(p),createBlank:()=>({...C.blank(),emptyProject:true,title:'未命名项目'})});
 writesFail=true;await assert.rejects(service.newProject(),/disk full/);assert.deepEqual(current,original);assert.equal(applied,0);assert.equal(service.busy,false);
 writesFail=false;const result=await service.newProject();assert.equal(applied,1);assert.equal(result.backup.kind,'before-new');assert.deepEqual((await service.get(result.backup.id)).plan,original);
 assert.equal(current.emptyProject,true);assert.equal(current.source,null);for(const k of ['walls','rooms','openings','columns'])assert.deepEqual(current.structure[k],[]);assert.deepEqual(current.furniture,[]);assert.deepEqual(current.measures,[]);assert(!current.planGeneration);assert(!current.customReview);
 const reload=C.validate(clone(current));assert.equal(reload.emptyProject,true);assert.equal(reload.source,null);
 await service.restore(result.backup.id);assert.deepEqual(current,C.validate(clone(original)),'the old plan including source and extra metadata remains recoverable');
 const concurrent=service.newProject();await assert.rejects(service.newProject(),/正在处理/);await concurrent;
 console.log('New project passed: empty source/structure/furniture, backup before clearing, failed backup keeps old project, reload marker, exact old project recovery and duplicate-click guard.');
})().catch(e=>{console.error(e);process.exitCode=1;});
