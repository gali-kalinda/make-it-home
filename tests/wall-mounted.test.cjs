const assert=require('node:assert/strict'),C=require('../core.js'),M=require('../wall-mounted-core.js');
const close=(a,b)=>assert(Math.abs(a-b)<.001,`${a} != ${b}`);
function plan(){const s=C.blank();s.structure.walls=[C.wall([0,0],[5000,0],{id:'north',bearing:'nonbearing'}),C.wall([5000,0],[5000,4000],{id:'east',bearing:'nonbearing'})];return s;}
const art=(extra={})=>({id:'art',type:'art_abstract',name:'装饰画',cx:2300,cy:1800,w:800,d:40,h:600,rot:63,color:'#bbaacc',...extra});
const s=plan(),f=art();M.attach(s,f);assert.equal(f.wallAttachment.wallId,'north');close(f.cy,122);close(f.rot,0);assert.equal(f.elevation,1350);
M.attach(s,f,[4800,2000]);assert.equal(f.wallAttachment.wallId,'east');close(f.cx,4878);close(f.rot,90);
M.attach(s,f,[5200,2000]);close(f.cx,5122);close(f.rot,270);
const diagonal=plan();diagonal.structure.walls=[C.wall([0,0],[4000,4000],{id:'diagonal'})];const d=art();M.attach(diagonal,d,[1000,1800]);close(d.rot,45);const a=C.frame(diagonal.structure.walls[0]),n=-d.cx*a.uy+d.cy*a.ux;close(n,122);
const reverse=plan();reverse.structure.walls[0].a=[5000,0];reverse.structure.walls[0].b=[0,0];const r=art();M.attach(reverse,r);close(r.rot,0);close(r.cy,122);
const openings=plan();openings.structure.walls.pop();openings.structure.openings=[{id:'door',type:'door',wallId:'north',offset:1500,width:1000,sill:0,height:2100}];const o=art();M.attach(openings,o,[2000,100]);assert(o.cx+400<=1500-3||o.cx-400>=2500+3);
const high=art({elevation:2200,h:300});M.attach(openings,high,[2000,100]);close(high.cx,2000);
openings.structure.wallRegions=[{id:'hole',wallId:'north',mode:'cut',offset:3000,width:500,bottom:1000,height:1500}];const cut=art();M.attach(openings,cut,[3250,50]);assert(cut.cx+400<=3000-3||cut.cx-400>=3500+3);
const oversized=art({w:6000});assert.equal(M.placement(openings,oversized),null);assert.throws(()=>M.attach(openings,oversized),/完整墙面/);
assert.equal(M.placement(C.blank(),art()),null);assert.equal(M.isMounted({type:'cabinet'}),false);assert.equal(M.isMounted({type:'bookshelf'}),false);assert(M.isMounted({type:'bookshelf',photoRecipe:{kind:'wall_cubby_shelf'}}));assert(M.isMounted({type:'tv'}));assert(!M.isMounted({type:'photo_tv_cabinet',photoRecipe:{kind:'rounded_tv_cabinet'}}));
const follow=plan();follow.furniture=[art()];M.attach(follow,follow.furniture[0]);let before=C.clone(follow);follow.structure.walls[0].a[1]+=500;follow.structure.walls[0].b[1]+=500;M.reconcile(follow,before);close(follow.furniture[0].cy,622);
before=C.clone(follow);follow.furniture[0].cx=4750;follow.furniture[0].cy=2500;M.reconcile(follow,before);assert.equal(follow.furniture[0].wallAttachment.wallId,'east');
const saved=C.validate(JSON.parse(JSON.stringify(follow)));assert.deepEqual(saved.furniture[0].wallAttachment,follow.furniture[0].wallAttachment);const bad=C.clone(saved);bad.furniture[0].wallAttachment.side=0;assert.throws(()=>C.validate(bad),/墙面关联/);
before=C.clone(follow);follow.demolished=['w1'];M.reconcile(follow,before);assert.equal(follow.furniture[0].wallAttachment.wallId,'north');
console.log('Wall mounting passed: both wall faces, diagonal/reversed walls, gaps, corners, doors/windows/cut-outs, height, no valid wall, recipe classification, moving walls, moving furniture, demolition and plan persistence.');
