const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('three'),C=require('../core.js'),R=require('../wall-regions-core.js'),S=require('../wall-surfaces.js'),P=require('../plan-pipeline-core.js');
const s=C.blank(),w=C.wall([0,0],[6000,0],{height:2800,thickness:200,bearing:'nonbearing'});s.structure.walls=[w];
const region={id:'region1',wallId:w.id,offset:1000,bottom:0,width:1200,height:2200,shape:'arch',radius:600,mode:'cut',side:1,material:'fluted_glass',color:'#cde1e1'};s.structure.wallRegions=[region];C.validate(s);
assert(R.profile(region).length>40);assert(R.slice(R.profile(region),2100)[0]>1000);assert(R.clearIntervals(s,w).some(([a,b])=>a<1600&&b>1600));assert.deepEqual(R.solidIntervals(s,w,0,6000).map(a=>a.map(Math.round)),[[0,1009],[2191,6000]]);
const snap=R.snapRect(s,w,[25,20],[5900,2770],100);assert.deepEqual(snap,{offset:0,bottom:0,width:6000,height:2800});
const source=fs.readFileSync(require.resolve('../scene-architecture.inc'),'utf8'),helpers=source.slice(0,source.indexOf('function addCollider'));
const ctx={THREE,PlanCore:C,M:x=>x/1000};vm.createContext(ctx);vm.runInContext(helpers+'\nthis.geom=wallSurfaceGeometry;',ctx);
function meshes(plan){return S.build(plan).prisms.filter(p=>p.faces.length).map(row=>new THREE.Mesh(ctx.geom(row,(p,h)=>new THREE.Vector3(p[0]/1000,h/1000,p[1]/1000),n=>new THREE.Vector3(n[0],0,n[1]),()=>0),new THREE.MeshBasicMaterial({side:THREE.DoubleSide})));}
function hit(list,x,y){list.forEach(o=>o.updateMatrixWorld());return new THREE.Raycaster(new THREE.Vector3(x,y,-2),new THREE.Vector3(0,0,1),0,4).intersectObjects(list,true).length>0;}
let list=meshes(s);assert(!hit(list,1.6,1.0),'real arch passage');assert(!hit(list,1.6,2.15),'arch crown void');assert(hit(list,1.03,2.15),'solid outside arch curve');assert(hit(list,.5,1),'wall remains');
const same=C.clone(s);same.structure.walls.push({...C.clone(w),id:'overlap-wall',a:[800,0],b:[3000,0]});assert(!hit(meshes(same),1.6,1),'coplanar overlap cut follows exposed union face');
const rounded=C.clone(s);Object.assign(rounded.structure.wallRegions[0],{shape:'rounded',bottom:300,height:1500,radius:200});assert(!hit(meshes(rounded),1.6,1));assert(hit(meshes(rounded),1.02,.32),'solid rounded corner');assert.equal(R.clearIntervals(rounded,w).length,0);
const insert=C.clone(s);insert.structure.wallRegions[0].mode='insert';assert.equal(R.clearIntervals(insert,w).length,0,'glass stays collidable');
const finish=C.clone(s);finish.structure.wallRegions[0].mode='finish';assert(hit(meshes(finish),1.6,1),'finish keeps original wall');
const locked=C.clone(s);locked.structure.walls[0].bearing='bearing';const before=C.clone(locked);locked.structure.wallRegions[0].width=1000;assert.throws(()=>C.assertLockedEdits(before,locked),/锁定/);
const alias=C.clone(s);alias.structure.walls.push({...C.clone(w),id:'locked-copy',bearing:'bearing'});const aliasBefore=C.clone(alias);alias.structure.wallRegions[0].width=1000;assert.throws(()=>C.assertLockedEdits(aliasBefore,alias),/锁定/);
const withDoor=C.clone(s);withDoor.structure.openings=[{id:'d',wallId:w.id,type:'door',offset:1100,sill:0,width:900,height:2000}];assert.throws(()=>C.validate(withDoor),/重叠/);withDoor.structure.wallRegions[0].mode='finish';C.validate(withDoor);
const exported=C.validate(JSON.parse(JSON.stringify(s)));assert.deepEqual(exported.structure.wallRegions,s.structure.wallRegions);const shifted=C.clone(s);shifted.structure.walls[0].a[1]+=2000;shifted.structure.walls[0].b[1]+=2000;assert.equal(shifted.structure.wallRegions[0].offset,1000);C.scale(shifted,2);assert.equal(shifted.structure.wallRegions[0].width,2400);
const empty=C.blank();assert.equal(P.signature(empty),P.signature(C.validate(C.clone(empty))),'legacy empty regions preserve workflow signature');
console.log('Wall regions passed: snapping, true arch/rounded ray-tested holes, overlap walls, finish preservation, glass collision, locks, door conflicts, calibration and full JSON round-trip.');
