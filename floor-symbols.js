/* Image-derived symbol candidates. No layout templates for unknown images. */
(function(root){
  function enclosedRegions(walls,width,height,scale){
    const C=root.PlanCore,factor=Math.max(1,Math.ceil(Math.max(width,height)/280)),gw=Math.ceil(width/factor),gh=Math.ceil(height/factor),mask=new Uint8Array(gw*gh),seen=new Uint8Array(gw*gh);
    for(const w of walls){const r=C.rect(w).map(v=>v/scale);for(let y=Math.max(0,Math.floor(r[1]/factor));y<Math.min(gh,Math.ceil(r[3]/factor));y++)for(let x=Math.max(0,Math.floor(r[0]/factor));x<Math.min(gw,Math.ceil(r[2]/factor));x++)mask[y*gw+x]=1;}
    const rooms=[];
    for(let start=0;start<mask.length;start++){
      if(mask[start]||seen[start])continue;const queue=[start];seen[start]=1;let exterior=false;
      for(let i=0;i<queue.length;i++){const k=queue[i],x=k%gw,y=Math.floor(k/gw);if(!x||!y||x===gw-1||y===gh-1)exterior=true;for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(nx>=0&&ny>=0&&nx<gw&&ny<gh){const n=ny*gw+nx;if(!mask[n]&&!seen[n]){seen[n]=1;queue.push(n);}}}
      if(exterior||queue.length<gw*gh*.008)continue;
      const component=new Set(queue),edges=new Map(),add=(a,b)=>edges.set(a.join(','),b);
      for(const k of queue){const x=k%gw,y=Math.floor(k/gw);if(!component.has(k-gw))add([x,y],[x+1,y]);if(x===gw-1||!component.has(k+1))add([x+1,y],[x+1,y+1]);if(!component.has(k+gw))add([x+1,y+1],[x,y+1]);if(x===0||!component.has(k-1))add([x,y+1],[x,y]);}
      let best=[];while(edges.size){const first=edges.keys().next().value,poly=[first.split(',').map(Number)];let key=first;for(let i=0;i<gw*gh*4;i++){const next=edges.get(key);if(!next)break;edges.delete(key);key=next.join(',');if(key===first)break;poly.push(next);}if(poly.length>best.length)best=poly;}
      const poly=best.filter((p,i)=>{const a=best[(i+best.length-1)%best.length],b=best[(i+1)%best.length];return (p[0]-a[0])*(b[1]-p[1])!==(p[1]-a[1])*(b[0]-p[0]);}).map(p=>p.map(v=>v*factor*scale));
      if(poly.length>=3)rooms.push({id:C.id('room'),name:'未命名区域 '+(rooms.length+1),poly,kind:'room',mat:'tile800',reviewed:false,source:'local-enclosed-symbol-region'});
    }
    return rooms;
  }
  function enhance(base,data,width,height,mmPerPixel,sourceScale=1,convention=true){
    if(!convention)return base;
    const C=root.PlanCore,scale=mmPerPixel/sourceScale,ink=new Uint8Array(width*height);
    for(let i=0;i<ink.length;i++){const j=i*4;ink[i]=data[j]*.2126+data[j+1]*.7152+data[j+2]*.0722<150?1:0;}
    const minLength=Math.max(40,Math.min(width,height)*.065),maxBand=Math.max(18,Math.min(width,height)*.024);
    function segments(hz){
      const along=hz?width:height,across=hz?height:width,raw=[];
      for(let z=0;z<across;z++){let a=-1,last=-1;for(let x=0;x<=along+2;x++){
        const dark=x<along&&ink[hz?z*width+x:x*width+z];
        if(dark){if(a<0)a=x;last=x;}else if(a>=0&&x-last>2){if(last-a>=minLength)raw.push({z,a,b:last+1});a=-1;}
      }}
      // Coalesce antialias/thickness rows; preserve separate parallel strokes.
      const lines=[];for(const r of raw){const old=lines.findLast(l=>r.z-l.last<=2&&r.z>=l.last&&Math.min(r.b,l.b)-Math.max(r.a,l.a)>.8*Math.max(r.b-r.a,l.b-l.a));if(old){old.a=Math.min(old.a,r.a);old.b=Math.max(old.b,r.b);old.last=r.z;}else lines.push({...r,last:r.z});}
      return lines.map(l=>({...l,z:(l.z+l.last)/2,hz,weight:l.last-l.z+1}));
    }
    const candidates=[],black=base.structure.walls.map(w=>({...w,bearingHint:'bearing',bearingEvidence:'深色实心长条；按当前图例推定，待核对'}));
    // Only thin parallel outlines can become white walls or multi-line windows.
    for(const hz of [true,false]){
      const lines=segments(hz).filter(l=>l.weight<=3.5);
      for(let i=0;i<lines.length;i++)for(let j=i+1;j<lines.length;j++){
        const a=lines[i],b=lines[j],gap=b.z-a.z;if(gap<5||gap>maxBand)continue;
        const start=Math.max(a.a,b.a),end=Math.min(a.b,b.b);if(end-start<minLength||end-start<.8*Math.min(a.b-a.a,b.b-b.a))continue;
        const intermediate=lines.filter(l=>l.z>a.z+1&&l.z<b.z-1&&Math.min(l.b,end)-Math.max(l.a,start)>.78*(end-start));
        const center=(a.z+b.z)/2;let occupied=0,total=0;
        for(let x=Math.ceil(start+3);x<end-3;x+=3)for(let z=Math.ceil(a.z+2);z<b.z-1;z++){total++;occupied+=ink[hz?z*width+x:x*width+z];}
        if(!total||occupied/total>.4)continue;
        const p=hz?[start,center]:[center,start],q=hz?[end,center]:[center,end];
        const rect=hz?[start,a.z,end,b.z]:[a.z,start,b.z,end];
        if(black.some(w=>{const r=C.rect(w).map(v=>v/scale);return rect[0]>=r[0]-3&&rect[1]>=r[1]-3&&rect[2]<=r[2]+3&&rect[3]<=r[3]+3;}))continue;
        candidates.push({p,q,gap,hz,start,end,center,strokes:2+intermediate.length});
      }
    }
    // Prefer outer pairs of a 4-stroke window instead of three overlapping walls.
    const pairs=candidates.filter((a,i)=>!candidates.some((b,j)=>i!==j&&a.hz===b.hz&&b.gap>a.gap+2&&Math.abs(a.center-b.center)<b.gap/2&&Math.min(a.end,b.end)-Math.max(a.start,b.start)>.85*(a.end-a.start)));
    const accepted=[],distance=(p,w)=>{const t=C.project(w,p),q=C.point(w,t);return Math.hypot(p[0]-q[0],p[1]-q[1]);};
    for(let pass=0;pass<5;pass++)for(const p of pairs){if(accepted.includes(p))continue;const neighbours=black.concat(accepted.map(x=>x.wall)),ends=[p.p,p.q].map(x=>x.map(v=>v*scale));
      // Both ends must connect to established structural strokes, not free furniture rectangles.
      if(!ends.every(e=>neighbours.some(w=>distance(e,w)<(Math.max(w.thickness/2,p.gap*scale/2)+8*scale))))continue;
      p.wall=C.wall(ends[0],ends[1],{thickness:p.gap*scale,bearingHint:'nonbearing',bearingEvidence:'白色平行双线符号；待核对',source:'local-parallel-lines',confidence:.58,reviewed:false});accepted.push(p);
    }
    base.structure.walls=black.concat(accepted.map(p=>p.wall));
    for(const p of accepted.filter(p=>p.strokes>=4))base.structure.openings.push({id:C.id('window'),type:'window',wallId:p.wall.id,offset:0,width:C.length(p.wall),sill:900,height:1500,reviewed:false,source:'local-four-strokes',confidence:.56,symbol:'four_parallel_lines'});
    base.structure.rooms=enclosedRegions(base.structure.walls,width,height,scale);
    base.recognition={method:'local-symbol-pixels',message:`像素识别：${black.length} 段实心墙候选、${accepted.length} 段白色平行线结构、${base.structure.openings.length} 扇多线窗候选、${base.structure.rooms.length} 个闭合区域。按当前图例推定承重 / 非承重；承重候选已锁定但尚未确认。家具相邻细线仍可能干扰；未闭合区域、阳台与飘窗请手动核对或使用视觉服务。`};
    return base;
  }
  root.FloorSymbols={enhance,enclosedRegions};if(typeof module!=='undefined')module.exports=root.FloorSymbols;
})(globalThis);
