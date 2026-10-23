const assert=require('node:assert/strict'),C=require('../core.js');
const {expandPlanStructure,structurePrompt}=require('../plan-structure-vision.cjs');
const raw={scale:8,walls:[['w1',100,100,900,100,20]],openings:[['d1','door','w1',200,80,2100,0]],rooms:[['r1','房间','room',[[100,100],[900,100],[900,500],[100,500]]]],notes:'估算'};
const r=expandPlanStructure(raw);assert.deepEqual(r.structure.walls[0].a,[100,100]);assert.equal(r.structure.openings[0].wallId,'w1');assert.equal(r.estimatedMmPerPixel,8);const s=C.blank();s.structure=r.structure;C.validate(s);assert.equal(s.structure.walls[0].bearing,'unknown');assert(structurePrompt(2048,1536).includes('2048x1536'));assert.throws(()=>expandPlanStructure({walls:[]}),/不完整/);
const centered=expandPlanStructure({...raw,openings:[['d1','door','w1',300,100,80,2100,0]]});assert.equal(centered.structure.openings[0].offset,160);assert.equal(centered.structure.openings[0].width,80);
assert.throws(()=>expandPlanStructure({...raw,openings:[['d1','door','w1',300,600,80,2100,0]]}),/未贴合/);
console.log('Compact structure: pixel geometry, hosted openings, room polygons, estimated scale, unknown bearing and schema validation passed.');
