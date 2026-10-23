/* Render-only boundary of the union of editable wall prisms. Coordinates are mm. */
(function(root){
 const C=root.PlanCore||(typeof require==='function'?require('./core.js'):null),EPS=1e-5;
 const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
 const area=p=>p.reduce((n,a,i)=>{const b=p[(i+1)%p.length];return n+a[0]*b[1]-a[1]*b[0];},0)/2;
 function clean(poly){const out=[];for(const p of poly)if(!out.length||Math.hypot(p[0]-out.at(-1)[0],p[1]-out.at(-1)[1])>EPS)out.push(p);if(out.length>1&&Math.hypot(out[0][0]-out.at(-1)[0],out[0][1]-out.at(-1)[1])<EPS)out.pop();return out.length>=3&&Math.abs(area(out))>EPS?out:[];}
 function half(poly,a,b,sign,keepInside){
  const d=[b[0]-a[0],b[1]-a[1]],out=[],dist=p=>sign*cross(d,[p[0]-a[0],p[1]-a[1]]);
  for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],dp=dist(p),dq=dist(q),pin=keepInside?dp>=-EPS:dp<=EPS,qin=keepInside?dq>=-EPS:dq<=EPS;
   if(pin)out.push(p);if(pin!==qin){const t=dp/(dp-dq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
  }return clean(out);
 }
 function difference(poly,clip){let remaining=poly,out=[];const sign=Math.sign(area(clip))||1;for(let i=0;i<clip.length&&remaining.length;i++){const a=clip[i],b=clip[(i+1)%clip.length],piece=half(remaining,a,b,sign,false);if(piece.length)out.push(piece);remaining=half(remaining,a,b,sign,true);}return out;}
 const bounds=p=>[Math.min(...p.map(p=>p[0])),Math.min(...p.map(p=>p[1])),Math.max(...p.map(p=>p[0])),Math.max(...p.map(p=>p[1]))];
 const intersects=(a,b)=>a[0]<=b[2]+EPS&&a[2]>=b[0]-EPS&&a[1]<=b[3]+EPS&&a[3]>=b[1]-EPS;
 function exposedEdges(poly,others){const result=[],all=[poly,...others];
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],d=[b[0]-a[0],b[1]-a[1]],len=Math.hypot(...d);if(len<EPS)continue;const ts=[0,1],denom=len*len;
   for(const q of others)for(let j=0;j<q.length;j++){const c=q[j],e=q[(j+1)%q.length],v=[e[0]-c[0],e[1]-c[1]],den=cross(d,v),ac=[c[0]-a[0],c[1]-a[1]];
    if(Math.abs(den)<EPS){if(Math.abs(cross(d,ac))/len<.001)for(const p of [c,e]){const t=((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1])/denom;if(t>EPS&&t<1-EPS)ts.push(t);}continue;}
    const t=cross(ac,v)/den,u=cross(ac,d)/den;if(t>EPS&&t<1-EPS&&u>=-EPS&&u<=1+EPS)ts.push(t);
   }
   const cuts=[...new Set(ts.map(t=>Math.round(t*1e10)/1e10))].sort((a,b)=>a-b);
   for(let j=1;j<cuts.length;j++){const lo=cuts[j-1],hi=cuts[j];if((hi-lo)*len<.001)continue;const mid=[a[0]+d[0]*(lo+hi)/2,a[1]+d[1]*(lo+hi)/2],n=[-d[1]/len,d[0]/len],left=[mid[0]+n[0]*.01,mid[1]+n[1]*.01],right=[mid[0]-n[0]*.01,mid[1]-n[1]*.01],filledLeft=all.some(p=>C.inside(left,p)),filledRight=all.some(p=>C.inside(right,p));
    if(filledLeft===filledRight)continue;result.push({a:[a[0]+d[0]*lo,a[1]+d[1]*lo],b:[a[0]+d[0]*hi,a[1]+d[1]*hi],normal:filledLeft?[-n[0],-n[1]]:n});
   }
  }return result;
 }
 const keyPoint=p=>p.map(v=>Math.round(v*1000)).join(',');
 function build(s,cut=Infinity){const prisms=[];
  for(const [i,w]of s.structure.walls.entries()){if(s.demolished.includes('w'+i))continue;
   const roomCuts=s.structure.rooms.flatMap(r=>r.poly).filter(p=>{const t=C.project(w,p),q=C.point(w,t);return Math.hypot(p[0]-q[0],p[1]-q[1])<w.thickness+300;}).map(p=>C.project(w,p));
   for(const p of C.solids(w,s.structure.openings,cut)){const xs=[...new Set([p.a,...roomCuts.filter(x=>x>p.a+.01&&x<p.b-.01),p.b])].sort((a,b)=>a-b);
    for(let j=1;j<xs.length;j++){const a=xs[j-1],b=xs[j];if(b-a<.01)continue;const piece={...p,a,b,wallId:w.id,poly:[C.point(w,a,-w.thickness/2),C.point(w,b,-w.thickness/2),C.point(w,b,w.thickness/2),C.point(w,a,w.thickness/2)],faces:[]};piece.bounds=bounds(piece.poly);prisms.push(piece);}
   }
  }
  for(const join of C.wallJoins(s,cut))for(const band of join.vertical)prisms.push({...band,wallId:join.wallIds[0],joinId:join.id,poly:join.poly,bounds:bounds(join.poly),faces:[]});
  const seen=new Set();
  for(const p of prisms){const nearby=prisms.filter(q=>q!==p&&intersects(p.bounds,q.bounds)),zs=[...new Set([p.bottom,p.top,...nearby.flatMap(q=>[q.bottom,q.top]).filter(z=>z>p.bottom+EPS&&z<p.top-EPS)])].sort((a,b)=>a-b);
   for(let i=1;i<zs.length;i++){const bottom=zs[i-1],top=zs[i],mid=(bottom+top)/2,others=nearby.filter(q=>q.bottom<mid&&q.top>mid).map(q=>q.poly);
    for(const edge of exposedEdges(p.poly,others)){const ends=[keyPoint(edge.a),keyPoint(edge.b)].sort(),key=[...ends,bottom,top].join('|');if(seen.has(key))continue;seen.add(key);p.faces.push({kind:'side',...edge,bottom,top});}
   }
   for(const kind of ['top','bottom']){const h=kind==='top'?p.top:p.bottom,at=prisms.indexOf(p),cover=nearby.filter(q=>kind==='top'?q.bottom<=h+EPS&&(q.top>h+EPS||Math.abs(q.top-h)<EPS&&prisms.indexOf(q)<at):q.top>=h-EPS&&(q.bottom<h-EPS||Math.abs(q.bottom-h)<EPS&&prisms.indexOf(q)<at));let parts=[p.poly];for(const q of cover){parts=parts.flatMap(poly=>difference(poly,q.poly));if(!parts.length)break;}for(const poly of parts)p.faces.push({kind,height:h,poly});}
  }
  const data={prisms,faces:prisms.reduce((n,p)=>n+p.faces.length,0)};return root.WallRegionsCore?root.WallRegionsCore.trim(data,s,cut,root.WallSurfaceCore):data;
 }
 root.WallSurfaceCore={build,difference,exposedEdges,area};if(typeof module!=='undefined')module.exports=root.WallSurfaceCore;
})(typeof window!=='undefined'?window:globalThis);
