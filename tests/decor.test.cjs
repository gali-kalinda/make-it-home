const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('three'),D=require('../decor-catalogue.js'),C=require('../core.js');
const items=D.groups.flatMap(g=>g.items);assert.equal(items.length,24);assert.equal(new Set(items.map(i=>i[0])).size,24);
const s=C.blank();s.workflow='furniture';s.furniture=items.map(([type,name,w,d,color],i)=>({id:'decor-'+i,type,name,w,d,color,cx:i*3000,cy:0,rot:90,...D.defaults(type)}));
for(const p of D.patterns){const rug=s.furniture.find(f=>f.type==='rug_round');rug.rugPattern=p.id;const copy=C.validate(JSON.parse(JSON.stringify(s)));assert.equal(copy.furniture.find(f=>f.id===rug.id).rugPattern,p.id);assert(D.rugSVG(rug).includes('ellipse'));}
const bad=C.clone(s);bad.furniture[0].rugPattern='invalid';assert.throws(()=>C.validate(bad),/地毯图案/);
assert.equal(new Set(D.patterns.map(p=>JSON.stringify(D.primitives(p.id,'#aabbcc')))).size,6);
// Real mesh construction without a browser/GPU; canvas calls are recorded stubs.
const ctx=new Proxy({},{get:(t,k)=>k in t?t[k]:(()=>{})}),canvas={width:0,height:0,getContext:()=>ctx};
const context={THREE,DecorCatalogue:D,document:{createElement:()=>({...canvas})},window:{View3D:{}},applyFurnitureMaterial:()=>{},console};vm.createContext(context);
let source=fs.readFileSync(require.resolve('../scene.js'),'utf8');const start=source.indexOf('const matCache ='),end=source.indexOf('/* ======================= 建筑');
let modelSource=source.slice(start,end);modelSource=modelSource.replace('const matCache =','const M=x=>x/1000,wx=x=>x/1000,wz=x=>x/1000; const matCache =');
vm.runInContext(modelSource+'\n'+fs.readFileSync(require.resolve('../scene-decor.inc'),'utf8')+'\nthis.build=buildFurniture;',context);
for(const f of s.furniture){const g=context.build(f),size=new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());assert(g.children.length>0,f.type+' is real geometry');assert(Math.abs(size.x-f.d/1000)<.003,f.type+' rotated depth');assert(Math.abs(size.z-f.w/1000)<.003,f.type+' rotated width');assert(Math.abs(size.y-f.h/1000)<.003,f.type+' height');g.traverse(o=>{if(o.isMesh){assert(o.geometry.attributes.position.count>0);assert([...o.geometry.attributes.position.array].every(Number.isFinite),f.type+' finite vertices');}});}
for(const type of ['curtain_double','curtain_sheer','curtain_blind'])assert(context.build(s.furniture.find(f=>f.type===type)).children.length>=2);
const circle=context.build(s.furniture.find(f=>f.type==='rug_round'));assert(circle.children[0].geometry.attributes.position.count>100);
console.log('Decor passed: 24 actual meshes, dimensions, curved rugs, curtains, 6 distinct patterns, invalid pattern rejection and full-plan round-trip.');
