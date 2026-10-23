const assert=require('node:assert/strict'),C=require('../core.js');
const s=C.validate(C.blank());
s.structure.walls.push(C.wall([0,0],[3000,0]));
s.furniture.push({id:'chair',type:'chair',cx:1000,cy:1000,w:450,d:480,rot:90,color:'#bca581'});
assert.equal(C.sceneStyle(s),'standard');assert.equal(C.suEdges(s),true);
for(const style of ['standard','soft','su']){
 s.presentation={sceneStyle:style,suEdges:false};
 const restored=C.validate(JSON.parse(JSON.stringify(s)));
 assert.equal(C.sceneStyle(restored),style);assert.equal(C.suEdges(restored),false);
 assert.deepEqual(restored.structure,s.structure);assert.deepEqual(restored.furniture,s.furniture);
}
s.presentation={sceneStyle:'su'};assert.equal(C.suEdges(s),true);
s.presentation.sceneStyle='unknown';assert.equal(C.sceneStyle(s),'standard');
console.log('Scene styles: standard / soft / SU, optional edges and plan round-trip passed.');
