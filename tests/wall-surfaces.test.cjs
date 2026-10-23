const assert=require('node:assert/strict'),C=require('../core.js'),S=require('../wall-surfaces.js');
const make=walls=>{const s=C.blank();s.structure.walls=walls;return s;};
const surfaceArea=result=>result.prisms.reduce((n,p)=>n+p.faces.reduce((m,f)=>m+(f.kind==='side'?Math.hypot(f.b[0]-f.a[0],f.b[1]-f.a[1])*(f.top-f.bottom):Math.abs(S.area(f.poly))),0),0);
const capArea=(r,kind,height)=>r.prisms.flatMap(p=>p.faces).filter(f=>f.kind===kind&&(height===undefined||f.height===height)).reduce((n,f)=>n+Math.abs(S.area(f.poly)),0);
const wall=(a,b,extra={})=>C.wall(a,b,{thickness:200,height:2800,...extra});
let s=make([wall([0,0],[6000,0])]),r=S.build(s);assert.equal(r.faces,6);assert.equal(surfaceArea(r),37120000);
const plainArea=surfaceArea(r);
s=make([wall([0,0],[4000,0]),wall([2000,0],[6000,0])]);const before=JSON.stringify(s);r=S.build(s);assert.equal(surfaceArea(r),plainArea);assert.equal(JSON.stringify(s),before);assert.equal(capArea(r,'top'),1200000);
assert(!r.prisms.flatMap(p=>p.faces).some(f=>f.kind==='side'&&Math.abs(f.a[0]-f.b[0])<.001&&[2000,4000].includes(f.a[0])),'No internal vertical caps at overlapping wall ends');
s=make([wall([0,0],[6000,0]),wall([6000,0],[0,0])]);assert.equal(surfaceArea(S.build(s)),plainArea,'Reversed duplicate walls have only one visible skin');
s=make([wall([0,0],[3000,0]),wall([3000,0],[6000,0])]);assert.equal(surfaceArea(S.build(s)),plainArea,'Joined pieces have no shared internal face');
s=make([wall([0,0],[6000,0])]);s.structure.rooms=[{id:'r',poly:[[1000,100],[3000,100],[3000,3000],[1000,3000]]}];r=S.build(s);assert(r.prisms.length>1);assert.equal(surfaceArea(r),plainArea,'Room color subdivision does not add end faces');
s=make([wall([0,0],[6000,0])]);s.structure.openings=[{id:'door',wallId:s.structure.walls[0].id,type:'door',offset:2000,width:900,sill:0,height:2100}];r=S.build(s);assert.equal(surfaceArea(r),34180000);
assert(!r.prisms.flatMap(p=>p.faces).some(f=>f.kind==='side'&&f.bottom<1000&&f.top>1000&&Math.min(f.a[0],f.b[0])<2450&&Math.max(f.a[0],f.b[0])>2450),'Door stays open');
s.structure.openings[0]={id:'window',wallId:s.structure.walls[0].id,type:'window',offset:2000,width:1200,sill:900,height:1400};r=S.build(s);assert(!r.prisms.flatMap(p=>p.faces).some(f=>f.kind==='side'&&f.bottom<1500&&f.top>1500&&Math.min(f.a[0],f.b[0])<2500&&Math.max(f.a[0],f.b[0])>2500));assert(capArea(r,'top',900)>0&&capArea(r,'bottom',2300)>0,'Window sill and head retained');
s=make([wall([0,0],[4000,0]),wall([2000,0],[6000,0],{height:1400})]);r=S.build(s);assert.equal(capArea(r,'top',1400),400000,'Short-wall cap hidden below taller wall');assert.equal(capArea(r,'top',2800),800000);
const rotate=p=>[(p[0]-p[1])/Math.sqrt(2),(p[0]+p[1])/Math.sqrt(2)];s=make([wall(rotate([0,0]),rotate([4000,0])),wall(rotate([2000,0]),rotate([6000,0]))]);assert(Math.abs(surfaceArea(S.build(s))-plainArea)<.1,'Diagonal overlap supported');
s=make([wall([0,0],[4000,0]),wall([0,0],[0,4000],{thickness:300})]);r=S.build(s);assert(r.prisms.some(p=>p.joinId));assert(r.prisms.every(p=>p.faces.every(f=>f.kind==='side'?f.top>f.bottom&&f.normal.every(Number.isFinite):Math.abs(S.area(f.poly))>.001)));
assert(S.build(s,1200).prisms.every(p=>p.top<=1200),'Cut height respected');s.demolished=['w1'];assert.equal(S.build(s).prisms.length,1,'Demolition omits wall and join');
const overlap=S.difference([[0,0],[4,0],[4,4],[0,4]],[[2,0],[6,0],[6,4],[2,4]]);assert.equal(overlap.reduce((a,p)=>a+Math.abs(S.area(p)),0),8);
console.log('Wall surfaces passed: partial/reversed/duplicate/diagonal overlap, no internal faces, room subdivisions, door/window voids, height changes, joins, cut height, demolition and immutable editable data.');
// Exercise the actual Three.js mesh builder, including face orientation and ray hits.
const fs=require('node:fs'),vm=require('node:vm'),THREE=require('three');
const ctx={THREE,PlanCore:C,M:n=>n/1000};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../scene-architecture.inc'),'utf8').split('function addCollider(')[0],ctx);
s=make([wall([0,0],[6000,0])]);const host=s.structure.walls[0];s.structure.openings=[{id:'door-mesh',wallId:host.id,type:'door',offset:2000,width:900,sill:0,height:2100}];r=S.build(s);const group=new THREE.Group(),material=Array.from({length:6},()=>new THREE.MeshBasicMaterial());let meshArea=0;
for(const p of r.prisms.filter(p=>p.faces.length)){const mid=C.point(host,(p.a+p.b)/2),g=ctx.localWallSurfaceGeometry(p,host,mid),mesh=new THREE.Mesh(g,material);mesh.position.set(mid[0]/1000,0,mid[1]/1000);group.add(mesh);const pos=g.attributes.position,norm=g.attributes.normal;
 for(let i=0;i<pos.count;i+=3){const a=new THREE.Vector3().fromBufferAttribute(pos,i),b=new THREE.Vector3().fromBufferAttribute(pos,i+1),c=new THREE.Vector3().fromBufferAttribute(pos,i+2),n=new THREE.Vector3().fromBufferAttribute(norm,i),cross=new THREE.Vector3().subVectors(b,a).cross(new THREE.Vector3().subVectors(c,a));assert(cross.dot(n)>0,'Front-face winding matches outward normal');meshArea+=cross.length()/2;}
}
assert(Math.abs(meshArea-surfaceArea(r)/1e6)<1e-4);group.updateMatrixWorld(true);
const hits=(x,y)=>new THREE.Raycaster(new THREE.Vector3(x,y,1),new THREE.Vector3(0,0,-1)).intersectObject(group,true).length;
assert.equal(hits(2.45,1),0,'Actual Three.js door opening is empty');assert(hits(2.45,2.4)>0,'Lintel still renders');assert(hits(1,1)>0,'Wall still renders from its outward-facing side');
console.log('Three.js wall mesh passed: outward normals, triangle area, material groups, open doorway and solid lintel.');
