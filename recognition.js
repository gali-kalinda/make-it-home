/* Real local raster processing. No template/layout fallback and no invented openings. */
(function(root){
function extract(data,width,height,mmPerPixel,sourceScale=1,symbolMode=false){
  const ink=new Uint8Array(width*height);for(let i=0;i<ink.length;i++){const j=i*4,a=data[j+3]/255,r=data[j]*a+255*(1-a),g=data[j+1]*a+255*(1-a),b=data[j+2]*a+255*(1-a);ink[i]=(r*.2126+g*.7152+b*.0722<85&&Math.max(r,g,b)-Math.min(r,g,b)<65)?1:0;}
  const minLength=Math.max(38,Math.min(width,height)*(symbolMode?.045:.1)),minThickness=Math.max(3,Math.round(Math.min(width,height)*.004)),maxThickness=Math.min(width,height)*.065;
  function runs(horizontal){const major=horizontal?width:height,minor=horizontal?height:width,out=[],active=[];for(let y=0;y<minor;y++){
    const row=[];let x=0;while(x<major){if(!ink[horizontal?y*width+x:x*width+y]){x++;continue;}const start=x;let last=x;while(x<major){if(ink[horizontal?y*width+x:x*width+y])last=x;else if(x-last>1)break;x++;}if(last-start+1>=minLength)row.push([start,last+1]);if(x===start)x++;}
    const used=new Set();for(const [a,b] of row){let match=null;for(const old of active){if(used.has(old)||old.end!==y)continue;if(Math.abs(old.a-a)<=3&&Math.abs(old.b-b)<=3){match=old;break;}}if(match){match.a=Math.min(match.a,a);match.b=Math.max(match.b,b);match.end=y+1;used.add(match);}else{const o={a,b,start:y,end:y+1};active.push(o);used.add(o);}}
    for(let i=active.length-1;i>=0;i--)if(active[i].end<y+1){out.push(active[i]);active.splice(i,1);}
  }out.push(...active);return out.filter(r=>r.end-r.start>=minThickness&&r.end-r.start<=maxThickness&&(r.b-r.a)/(r.end-r.start)>=(symbolMode?2.6:5)).map(r=>horizontal?[r.a,r.start,r.b,r.end]:[r.start,r.a,r.end,r.b]);}
  let rects=runs(true).concat(runs(false));
  rects=rects.filter((r,i)=>!rects.some((q,j)=>j!==i&&(q[2]-q[0])*(q[3]-q[1])>(r[2]-r[0])*(r[3]-r[1])*1.1&&r[0]>=q[0]-2&&r[1]>=q[1]-2&&r[2]<=q[2]+2&&r[3]<=q[3]+2));
  const scale=mmPerPixel/sourceScale,wallRects=rects.slice(0,800),walls=wallRects.map(r=>{const horizontal=r[2]-r[0]>=r[3]-r[1];return PlanCore.wall(horizontal?[r[0]*scale,(r[1]+r[3])/2*scale]:[(r[0]+r[2])/2*scale,r[1]*scale],horizontal?[r[2]*scale,(r[1]+r[3])/2*scale]:[(r[0]+r[2])/2*scale,r[3]*scale],{thickness:(horizontal?r[3]-r[1]:r[2]-r[0])*scale,source:'local-pixels',confidence:.55,reviewed:false});});
  // Flood fill bounded free space, then trace its actual polygon boundary.
  const factor=Math.max(1,Math.ceil(Math.max(width,height)/280)),gw=Math.ceil(width/factor),gh=Math.ceil(height/factor),mask=new Uint8Array(gw*gh),seen=new Uint8Array(gw*gh);
  for(const r of wallRects){for(let y=Math.max(0,Math.floor(r[1]/factor));y<Math.min(gh,Math.ceil(r[3]/factor));y++)for(let x=Math.max(0,Math.floor(r[0]/factor));x<Math.min(gw,Math.ceil(r[2]/factor));x++)mask[y*gw+x]=1;}
  const rooms=[];
  for(let start=0;start<mask.length;start++){if(mask[start]||seen[start])continue;const queue=[start];seen[start]=1;let exterior=false;for(let i=0;i<queue.length;i++){const n=queue[i],x=n%gw,y=Math.floor(n/gw);if(!x||!y||x===gw-1||y===gh-1)exterior=true;for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(nx>=0&&ny>=0&&nx<gw&&ny<gh){const k=ny*gw+nx;if(!mask[k]&&!seen[k]){seen[k]=1;queue.push(k);}}}if(exterior||queue.length<gw*gh*.008)continue;
    const component=new Set(queue),edges=new Map();const add=(a,b)=>edges.set(a.join(','),b);
    for(const n of queue){const x=n%gw,y=Math.floor(n/gw);if(y===0||!component.has(n-gw))add([x,y],[x+1,y]);if(x===gw-1||!component.has(n+1))add([x+1,y],[x+1,y+1]);if(y===gh-1||!component.has(n+gw))add([x+1,y+1],[x,y+1]);if(x===0||!component.has(n-1))add([x,y+1],[x,y]);}
    let best=[];while(edges.size){const first=edges.keys().next().value,p=first.split(',').map(Number),poly=[p];let key=first;for(let i=0;i<gw*gh*4;i++){const next=edges.get(key);if(!next)break;edges.delete(key);key=next.join(',');if(key===first)break;poly.push(next);}if(poly.length>best.length)best=poly;}
    const simplified=best.filter((p,i)=>{const a=best[(i+best.length-1)%best.length],b=best[(i+1)%best.length];return (p[0]-a[0])*(b[1]-p[1])!==(p[1]-a[1])*(b[0]-p[0]);});
    if(simplified.length>=3)rooms.push({id:PlanCore.id('room'),name:'未命名区域 '+(rooms.length+1),poly:simplified.map(p=>p.map(v=>v*factor*scale)),mat:'tile800',reviewed:false,source:'local-enclosed-region'});
  }
  return {structure:{walls,openings:[],columns:[],rooms,height:2800},recognition:{method:'local-pixels',message:walls.length?`已从图片像素提取 ${walls.length} 段粗横竖墙线、${rooms.length} 个封闭区域。均为待核对候选；未自动识别门窗、柱子、房名或标注尺寸。`:'没有提取到足够可靠的粗墙线。细线、彩色、倾斜或复杂户型请使用手动描绘，或配置视觉模型。'}};
}
async function recognize(source,convention=true){
  // Basic raster path only. Smart recognition runs the installed neural model.
  const img=new Image();await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=source.data;});const ratio=Math.min(1,1400/Math.max(img.width,img.height)),cv=document.createElement('canvas');cv.width=Math.round(img.width*ratio);cv.height=Math.round(img.height*ratio);const ctx=cv.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,cv.width,cv.height);ctx.drawImage(img,0,0,cv.width,cv.height);const data=ctx.getImageData(0,0,cv.width,cv.height).data,result=extract(data,cv.width,cv.height,source.mmPerPixel,ratio,convention);return root.FloorSymbols?FloorSymbols.enhance(result,data,cv.width,cv.height,source.mmPerPixel,ratio,convention):result;
}
root.FloorRecognition={recognize,extract};if(typeof module!=='undefined')module.exports=root.FloorRecognition;
})(globalThis);
