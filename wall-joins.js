/* Continuous wall fills and exterior outlines use the same corner geometry as 3D. */
const beforeWallJoinRender=window.renderStructure;
window.renderStructure=function(){
 beforeWallJoinRender();
 const editing=state.workflow==='structure';if(editing&&!reviewOverlay)return;
 const rendered=materialPlan(),walls=state.structure.walls.filter((w,i)=>!state.demolished.includes('w'+i));
 const rows=walls.map(w=>({w,poly:C.polygon(w)}));
 for(const join of C.wallJoins(state)){const pair=walls.filter(w=>join.wallIds.includes(w.id)),w=pair.find(C.isLocked)||pair[0];rows.push({w,poly:join.poly,join:join.id,reviewed:pair.every(w=>w.reviewed)});}
 const fill=w=>C.isLocked(w)?rendered?'#181a18':'#252722':C.bearingType(w)==='nonbearing'?rendered?'#fffdf8':'#fffef9':rendered?'#787973':editing?'#ddd6ca':'#9e9990';
 const stroke=w=>C.isLocked(w)&&ui.layers.bearing?'#c07850':rendered?'#181a18':editing&&!w.reviewed?'#bc8554':'#6b655e';
 const polygons=rows.map(r=>`<polygon class="wall" data-wall="${r.w.id}" ${r.join?'data-wall-join="'+r.join+'"':''} data-bearing="${C.bearingType(r.w)}" data-locked="${C.isLocked(r.w)}" points="${r.poly.map(p=>p.join(',')).join(' ')}" fill="${fill(r.w)}" stroke="none"><title>${r.join?'墙角已接合':C.isLocked(r.w)?'承重墙 · 已锁定':'可编辑墙体'}</title></polygon>`).join('');
 const outlines=rows.map((r,i)=>{const edges=C.exteriorEdges(r.poly,rows.filter((_,j)=>j!==i).map(o=>o.poly));return `<path class="wall-outline" data-wall="${r.w.id}" d="${edges.map(([a,b])=>'M'+a.join(' ')+'L'+b.join(' ')).join('')}" fill="none" stroke="${stroke(r.w)}" stroke-width="${rendered?.6:1.4}" ${editing&&!(r.reviewed??r.w.reviewed)?'stroke-dasharray="5 3"':''} vector-effect="non-scaling-stroke" pointer-events="none"/>`;}).join('');
 const columns=state.structure.columns.map(c=>`<rect data-column="${c.id}" x="${c.x-c.w/2}" y="${c.y-c.d/2}" width="${c.w}" height="${c.d}" fill="${rendered?'#272926':'#b2aaa0'}" stroke="${rendered?'#181a18':editing&&!c.reviewed?'#bc8554':'#6b655e'}" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('');
 $('#gWalls').innerHTML=polygons+outlines+columns;
};
renderAll();
