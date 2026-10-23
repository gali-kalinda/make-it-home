/* Surface decoration is independent of structural geometry and bearing locks. */
(function(root){
 const paints=[['#f4f1eb','奶油白'],['#d9cbb7','沙岩米'],['#b9c4b1','鼠尾草绿'],['#a5b7bc','雾蓝灰'],['#696b68','岩石灰']];
 const textures=['whiteoak','walnut','smokedoak','marble','terrazzo','tile600'];
 const options=()=>[...paints.map(([color,name])=>({id:color,name,color,finish:{material:'paint',color}})),...[...textures,...Object.keys(root.PlanCore.floorMaterials).filter(id=>root.PlanCore.floorMaterials[id].source)].map(id=>({id:'wall:'+id,name:root.PlanCore.floorMaterials[id].name,texture:id,finish:{material:id,color:'#ffffff'}}))];
 function valid(f){return !!f&&typeof f==='object'&&(f.material==='paint'||!!root.PlanCore.floorMaterials[f.material]&&f.material!=='carpet')&&/^#[0-9a-f]{6}$/i.test(f.color);}
 function resolve(s,w,side,t=root.PlanCore.length(w)/2){const own=w.wallFinishes?.[String(side)];if(own)return {...own};const q=root.PlanCore.point(w,t,side*(w.thickness/2+60)),r=s.structure.rooms.find(r=>root.PlanCore.inside(q,r.poly));return {material:'paint',color:r?s.rooms[r.id]?.wallColor||'#f4f1eb':'#f4f1eb'};}
 function apply(s,hit,finish){const w=s.structure.walls.find(w=>w.id===hit?.wallId);if(!w||![1,-1].includes(hit.side)||s.demolished.includes('w'+s.structure.walls.indexOf(w))||!valid(finish))throw Error('请选择有效的墙面和材质');if(JSON.stringify(w.wallFinishes?.[hit.side])===JSON.stringify(finish))return false;w.wallFinishes={...w.wallFinishes,[String(hit.side)]:{material:finish.material,color:finish.color,...(finish.layout?{layout:root.PlanCore.clone(finish.layout)}:{})}};return true;}
 root.WallFinishCore={paints,options,valid,resolve,apply};if(typeof module!=='undefined')module.exports=root.WallFinishCore;
})(typeof window!=='undefined'?window:globalThis);
