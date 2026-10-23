const assert=require('node:assert/strict'),C=require('../core.js'),recognition=require('../recognition.js');
function fixture(w,h,rects){const data=new Uint8ClampedArray(w*h*4).fill(255);for(const [x0,y0,x1,y1] of rects)for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*w+x)*4;data[i]=data[i+1]=data[i+2]=20;}return recognition.extract(data,w,h,10);}
const a=fixture(800,600,[[70,60,730,76],[70,514,730,530],[70,60,86,530],[714,60,730,530],[392,60,408,530]]);
const b=fixture(900,640,[[60,60,830,78],[60,60,78,580],[60,562,560,580],[812,60,830,300],[542,300,560,580],[60,291,830,309],[291,60,309,300]]);
assert.equal(a.structure.rooms.length,2);assert.equal(b.structure.rooms.length,3);assert.notDeepEqual(a.structure.walls,b.structure.walls);assert.equal(a.structure.openings.length,0);assert.equal(a.structure.columns.length,0);assert(a.structure.walls.every(w=>w.bearing==='unknown'&&!w.reviewed));
const empty=fixture(400,300,[]);assert.equal(empty.structure.walls.length,0);assert.equal(empty.structure.rooms.length,0);
const s=C.blank();s.structure=a.structure;C.validate(s);const w=s.structure.walls[0],l=C.length(w);s.structure.openings.push({id:'door',wallId:w.id,type:'door',offset:100,width:900,height:2100,sill:0});C.validate(s);const solid=C.solids(w,s.structure.openings);assert(solid.some(p=>p.a===100&&p.b===1000&&p.bottom===2100));assert(!solid.some(p=>p.a===100&&p.bottom===0));
const before=JSON.stringify(s);const restored=C.validate(JSON.parse(before));assert.equal(JSON.stringify(restored),before);
const old=C.length(w);C.scale(s,2);assert.equal(C.length(w),old*2);assert.equal(s.structure.openings[0].width,1800);assert.equal(s.structure.openings[0].height,2100);
const bad=C.clone(s);bad.structure.openings[0].width=1e7;assert.throws(()=>C.validate(bad));
const crooked=C.wall([100,100],[3100,4100],{thickness:240});assert.equal(C.length(crooked),5000);assert(Math.abs(C.project(crooked,C.point(crooked,2000))-2000)<1e-8);
console.log(JSON.stringify({passed:true,planA:{walls:a.structure.walls.length,rooms:a.structure.rooms.length},planB:{walls:b.structure.walls.length,rooms:b.structure.rooms.length},checks:['distinct image-derived structures','empty image has no default layout','unknown bearing','true opening solids','full JSON round-trip','calibration','invalid openings rejected','diagonal wall geometry']},null,2));
