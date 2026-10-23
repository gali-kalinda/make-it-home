const assert=require('node:assert/strict'),C=require('../core.js');
const h=C.wall([100,200],[4100,200]),v=C.wall([100,200],[100,4200]);
let r=C.dragWallEnd(h,1,[500,100],.1);
assert.deepEqual(r,{locked:true,point:[4600,200]});
r=C.dragWallEnd(h,1,[500,250],.1,r.locked);
assert.deepEqual(r,{locked:false,point:[4600,450]});
assert.equal(C.dragWallEnd(h,1,[500,180],.1,r.locked).locked,false);
assert.deepEqual(C.dragWallEnd(h,1,[500,110],.1,r.locked),{locked:true,point:[4600,200]});
assert.deepEqual(C.dragWallEnd(h,0,[-500,-100],.1),{locked:true,point:[-400,200]});
assert.deepEqual(C.dragWallEnd(v,1,[100,500],.1),{locked:true,point:[100,4700]});
assert.deepEqual(C.dragWallEnd(v,0,[250,-500],.1),{locked:false,point:[350,-300]});
assert.deepEqual(C.dragWallEnd(h,1,[500,-1000],.1,false,true),{locked:true,point:[4600,200]});
// The same 20 px mouse wobble is locked both zoomed in and zoomed out.
for(const scale of [.02,.1,1,4])assert.equal(C.dragWallEnd(h,1,[100/scale,20/scale],scale).locked,true);
const diagonal=C.wall([0,0],[3000,4000]),d=C.dragWallEnd(diagonal,1,[400,500],.1);
assert(d.locked);assert(Math.abs(d.point[0]*.8-d.point[1]*.6)<1e-7);
assert.deepEqual(C.dragWallEnd(h,1,[0,0],.1),{locked:true,point:h.b});
assert.deepEqual(h.a,[100,200]);assert.deepEqual(h.b,[4100,200]);
console.log('Wall resize: direction, deliberate release, hysteresis, both endpoints, vertical/diagonal, Shift, zoom and immutable baseline passed.');
