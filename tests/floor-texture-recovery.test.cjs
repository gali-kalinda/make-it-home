const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),THREE=require('three');
const pending=[],listeners={};
class TestImage{set src(value){this.url=value;pending.push(this);}}
const source={href:'saved-2d-color',normalHref:'saved-normal',roughHref:'saved-rough',w:800,d:800,pbr:true,canvas:{empty:true,width:512,height:512}};
const context={THREE,Image:TestImage,PlanCore:{floorMaterials:{tile800:{sw:'#e1ddd3',roughness:.3,source:'test'}}},SurfaceLayoutCore:{key:()=> 'tile800',normalized:()=>({})},SurfaceTextures:{pbr:()=>source},renderer:{capabilities:{getMaxAnisotropy:()=>4}},document:{createElement:()=>({width:0,height:0,getContext:()=>({fillRect(){},set fillStyle(v){}})})},architectOpened:false,addEventListener:(name,fn)=>listeners[name]=fn};
vm.createContext(context);vm.runInContext(fs.readFileSync('scene-surface-materials.inc','utf8')+'\nglobalThis.result=floorMat("tile800");',context);
const m=context.result;
assert.equal(pending.length,3);assert.equal(pending[0].url,source.href,'Color comes from the intact 2D image, never the emptied canvas');
assert.notEqual(m.map.image,source.canvas);assert.equal(m.map.image.width,512,'Fallback keeps the final image dimensions for immutable GPU texture storage');assert.equal(m.map.image.height,512);
pending.forEach(i=>i.onload());assert.equal(m.map.image,pending[0]);assert.equal(m.normalMap.image,pending[1]);assert.equal(m.roughnessMap.image,pending[2]);
assert.equal(m.map.colorSpace,THREE.SRGBColorSpace);assert.equal(m.map.repeat.x,1.25);assert.equal(m.map.repeat.y,1.25);
listeners['surface-texture-ready']();assert.equal(pending.length,3,'Unchanged texture events do not reload the image');
source.href='updated-color-1';listeners['surface-texture-ready']();const old=pending.at(-1);
source.href='updated-color-2';listeners['surface-texture-ready']();const latest=pending.at(-1);latest.onload();old.onload();assert.equal(m.map.image,latest,'An older decode cannot replace the latest material');
assert.equal(m.map.image.url,'updated-color-2');
console.log('Floor texture recovery passed: empty backing canvas, opaque fallback, shared 2D image, all PBR maps, physical repeat, update deduplication and stale decode protection.');
