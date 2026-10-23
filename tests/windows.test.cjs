const assert=require('node:assert/strict'),T=require('three'),C=require('../core.js'),WC=require('../window-core.js'),WM=require('../window-model.js'),P=require('../plan-pipeline-core.js');
const plan=C.blank(),w=C.wall([0,0],[6000,0],{id:'wall',bearing:'bearing'});plan.structure.walls=[w];plan.structure.rooms=[{id:'room',poly:[[0,100],[6000,100],[6000,4000],[0,4000]]}];
const opening={id:'window',type:'window',wallId:w.id,offset:800,width:2000,height:1500,sill:900};plan.structure.openings=[opening];C.validate(plan);const original=JSON.stringify(plan),sig=P.signature(plan);
assert.equal(WC.spec(opening,w,plan).insideSide,1);assert.equal(WC.spec({...opening,windowInsideSide:'-1'},w,plan).insideSide,-1);
const builds={};for(const type of Object.keys(WC.types)){
 const o={...opening,windowType:type,windowPanes:2,windowFrameColor:'#775544',windowFrameWidth:65,windowOpenAngle:60};WC.validate(o);
 const model=WM.build(T,WC.spec(o,w,plan));builds[type]=model;const b=new T.Box3().setFromObject(model.group);
 assert(Math.abs(b.max.x-b.min.x-2.04)<.001);assert(Math.abs(b.max.y-1.5)<.001);assert.equal(model.counts.frame,4);assert.equal(model.counts.glass,2);assert.equal(model.counts.sash,8);
 assert.equal(model.counts.handle||0,type==='fixed'?0:4);assert.equal(model.counts.hinge||0,['fixed','sliding'].includes(type)?0:4);
 assert.equal(model.counts.track||0,type==='sliding'?4:0);assert(model.materials.every(m=>m.userData.windowOwned));
 const glass=model.group.getObjectsByProperty('isMesh',true).find(o=>o.userData.windowPart==='glass');assert(glass.material.transparent&&glass.material.opacity<.5);
 model.pose(1);model.group.traverse(o=>{if(o.isMesh){assert([...o.geometry.attributes.position.array].every(Number.isFinite));assert(o.userData.windowId===opening.id);}});
 plan.structure.openings=[o];C.validate(plan);assert.doesNotThrow(()=>C.assertLockedEdits(JSON.parse(original),plan));assert.equal(P.signature(plan),sig);assert.deepEqual(C.validate(JSON.parse(JSON.stringify(plan))).structure.openings,[o]);
 const bad=C.clone(plan);bad.structure.openings[0].width+=10;assert.throws(()=>C.assertLockedEdits(plan,bad));
}
assert(builds.casement_in.leaves[0].leaf.rotation.y<0&&builds.casement_out.leaves[0].leaf.rotation.y>0,'inward/outward hinges rotate in opposite directions');
assert(builds.casement_in.leaves[1].leaf.rotation.y>0,'opposite jamb hinge on the right sash');
assert(builds.sliding.leaves[0].leaf.position.x>builds.sliding.leaves[0].start);assert.equal(builds.sliding.leaves[0].leaf.rotation.y,0);
assert(builds.awning.leaves[0].leaf.rotation.x>0);assert(builds.awning.spec.angle<=Math.PI/4);assert.equal(builds.fixed.leaves[0].leaf.rotation.y,0);
const handle=builds.casement_in.leaves[0].leaf.children.find(o=>o.userData.windowPart==='handle'),openPos=handle.getWorldPosition(new T.Vector3());builds.casement_in.pose(0);assert(handle.getWorldPosition(new T.Vector3()).distanceTo(openPos)>.1,'handles follow opening sashes');
const reverse=WM.build(T,WC.spec({...opening,windowInsideSide:'-1',windowPanes:1,windowHinge:'end'},w,plan));reverse.pose(1);assert(reverse.leaves[0].leaf.rotation.y<0);
for(const invalid of [{windowType:'bad'},{windowPanes:5},{windowPanes:1.5},{windowFrameColor:'url(x)'},{windowFrameWidth:1},{windowOpenAngle:NaN},{windowInsideSide:3},{windowHinge:'top'}])assert.throws(()=>C.validate({...C.clone(plan),structure:{...plan.structure,openings:[{...opening,...invalid}]}}));
for(const size of [10,70,300,800])for(const type of Object.keys(WC.types)){const model=WM.build(T,WC.spec({...opening,width:size,height:size,windowType:type,windowPanes:4},w,plan));model.pose(1);model.group.traverse(o=>{if(o.isMesh)assert([...o.geometry.attributes.position.array].every(Number.isFinite));});}
const clip=WM.build(T,WC.spec(opening,w,plan),{cut:1.4,sill:.9});assert(clip.materials.every(m=>m.clippingPlanes[0].distanceToPoint(new T.Vector3(0,1.5,0))<0),'cut view clips actual full-height profiles');
for(const n of [2,3,4]){const m=WM.build(T,WC.spec({...opening,windowType:'sliding',windowPanes:n},w,plan));m.pose(1);const b=new T.Box3().setFromObject(m.group);assert(b.min.x>=-1.021&&b.max.x<=1.021,'sliding panels stay inside their frame for '+n+' panes');}
for(const n of [3,4]){const m=WM.build(T,WC.spec({...opening,windowType:'sliding',windowPanes:n},w,plan));m.pose(1);for(let i=0;i<m.leaves.length;i++)for(let j=i+1;j<m.leaves.length;j++){const a=m.leaves[i].leaf.position,b=m.leaves[j].leaf.position;assert(a.distanceTo(b)>.01,'no overlapping coplanar sashes on the same track');}}
const fs=require('node:fs'),vm=require('node:vm');new vm.Script(fs.readFileSync(require('node:path').join(__dirname,'../scene.js'),'utf8').replace(/^import .*;\s*$/gm,''),{filename:'scene.js'});
const closed=WC.symbol(opening,w,plan),opened=WC.symbol({...opening,open:true},w,plan);assert.notEqual(closed,opened);assert.notEqual(closed,WC.symbol({...opening,windowType:'sliding'},w,plan));
assert.equal(JSON.parse(original).structure.openings[0].windowType,undefined,'legacy data stays unchanged');
console.log('Windows passed: five physical models, frames/sashes/hardware, clear glazing, hinge and track motion, indoor side, tiny openings, cut clipping, symbols, bearing locks, workflow and JSON persistence.');
