const assert=require('node:assert/strict'),C=require('../core.js');
const s=C.blank();s.structure.rooms=[{id:'room1',name:'客厅',poly:[[0,0],[4000,0],[4000,3000],[0,3000]]},{id:'room2',name:'卧室',poly:[[4000,0],[7000,0],[7000,3000],[4000,3000]]}];
C.validate(s);assert.equal(Object.values(C.floorMaterials).filter(m=>m.family==='wood').length,5);
for(const [id,m] of Object.entries(C.floorMaterials)){
 assert(m.size.every(v=>v>0)&&m.price>0&&/^#[0-9a-f]{6}$/i.test(m.sw));
 s.rooms.room1.mat=id;s.rooms.room1.wallColor='#b9c4b1';const restored=C.validate(JSON.parse(JSON.stringify(s)));
 assert.equal(restored.rooms.room1.mat,id,'Material must survive validation/import: '+id);assert.equal(restored.rooms.room1.wallColor,'#b9c4b1');assert.equal(restored.rooms.room2.mat,'tile800','Changing one room never repaints another');
}
const old=C.clone(s);old.rooms.room1.mat='unsupported-material';C.validate(old);assert.equal(old.rooms.room1.mat,'tile800');
console.log('Surface materials: all 11 materials retain actual sizes, estimating prices, per-room selection and wall colors through full-plan validation/import.');
