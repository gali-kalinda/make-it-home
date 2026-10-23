/* Millimetre layout, independent of screen size and texture resolution. */
(function(root){
 const defaults=(kind)=>{const m=root.PlanCore.floorMaterials[kind]||root.PlanCore.floorMaterials.tile800;return {tileW:m.size[0],tileH:m.size[1],jointMm:m.family==='wood'?1:2,jointColor:'#b9b6ae',pattern:'grid',rotation:0,...m.layout};};
 const valid=v=>!!v&&typeof v==='object'&&['tileW','tileH'].every(k=>Number.isFinite(v[k])&&v[k]>=50&&v[k]<=6000)&&Number.isFinite(v.jointMm)&&v.jointMm>=0&&v.jointMm<=20&&v.jointMm<Math.min(v.tileW,v.tileH)/4&&/^#[0-9a-f]{6}$/i.test(v.jointColor)&&['grid','brick','seamless'].includes(v.pattern)&&[0,90,180,270].includes(v.rotation);
 function normalized(kind,v){const result={...defaults(kind),...v};if(!valid(result))throw Error('铺贴规格须为 50–6000 mm，缝宽 0–20 mm，且小于砖宽高的四分之一');return result;}
 function key(kind,v){let h=2166136261;for(const c of JSON.stringify(normalized(kind,v)))h=Math.imul(h^c.charCodeAt(0),16777619)>>>0;return kind+'-'+h.toString(16);}
 function atlas(kind,v){const l=normalized(kind,v),n=l.pattern==='seamless'?1:2;return {layout:l,w:l.tileW*n,d:l.tileH*n,cols:n,rows:n};}
 root.SurfaceLayoutCore={defaults,valid,normalized,key,atlas};if(typeof module!=='undefined')module.exports=root.SurfaceLayoutCore;
})(typeof window!=='undefined'?window:globalThis);
