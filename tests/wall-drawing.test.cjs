const assert=require('node:assert/strict'),C=require('../core.js');
assert.deepEqual(C.drawWallEnd([100,200],[2157,233]).point,[2160,200]);
assert.deepEqual(C.drawWallEnd([100,200],[123,3236]).point,[100,3240]);
assert.deepEqual(C.drawWallEnd([100,200],[-1983,165]).point,[-1980,200]);
assert.deepEqual(C.drawWallEnd([100,200],[2157,233],true).point,[2160,230]);
assert.deepEqual(C.drawWallEnd([100,200],[2157,233],true,true).point,[2160,200]);
const s=C.blank();let a=[0,0];for(const raw of [[3001,15],[2978,2510],[13,2504]]){const b=C.drawWallEnd(a,raw).point;s.structure.walls.push(C.wall(a,b));a=b;}
C.validate(s);assert.equal(s.structure.walls.length,3);assert.deepEqual(s.structure.walls[0].b,s.structure.walls[1].a);assert.deepEqual(s.structure.walls[1].b,s.structure.walls[2].a);assert.equal(C.wallJoins(s).length,2);
assert(s.structure.walls.every(w=>w.a[0]===w.b[0]||w.a[1]===w.b[1]));
console.log('Wall drawing passed: default orthogonal, deliberate Alt angles, Shift override, chained corners and real geometric joins.');
