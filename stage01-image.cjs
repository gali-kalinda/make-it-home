const path=require('node:path'),os=require('node:os');
function imageLibrary(){return require("sharp");}
// Coordinate guides are added to the API input only; the original and its pixel frame stay intact.
async function guideImage(input){
 const sharp=imageLibrary(),buffer=Buffer.from(input.image.split(',')[1],'base64'),decoded=await sharp(buffer).rotate().flatten({background:'#ffffff'}).png().toBuffer({resolveWithObject:true}),meta=decoded.info;
 if(meta.width!==input.width||meta.height!==input.height)throw Error('图片实际像素与请求尺寸不符');
 const step=Math.max(100,Math.ceil(Math.max(input.width,input.height)/1400)*100),parts=[];
 for(let x=0;x<input.width;x+=step)parts.push(`<path d="M${x} 0V${input.height}"/><rect x="${x+2}" y="2" width="56" height="18"/><text x="${x+4}" y="15">x${x}</text>`);
 for(let y=step;y<input.height;y+=step)parts.push(`<path d="M0 ${y}H${input.width}"/><rect x="2" y="${y+2}" width="56" height="18"/><text x="4" y="${y+15}">y${y}</text>`);
 const svg=`<svg width="${input.width}" height="${input.height}" xmlns="http://www.w3.org/2000/svg"><style>path{fill:none;stroke:#397bce;stroke-opacity:.3;stroke-width:1}rect{fill:white;fill-opacity:.9}text{font:13px Arial;fill:#2969b8}</style>${parts.join('')}</svg>`;
 const image=await sharp(decoded.data).composite([{input:Buffer.from(svg)}]).png().toBuffer();return 'data:image/png;base64,'+image.toString('base64');
}
// Reject unsupported strokes instead of completing missing geometry from a template.
async function checkWallEvidence(result,input){
 const sharp=imageLibrary(),{data,info}=await sharp(Buffer.from(input.image.split(',')[1],'base64')).rotate().flatten({background:'#fff'}).toColourspace('srgb').removeAlpha().raw().toBuffer({resolveWithObject:true});
 const dark=(x,y)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=info.width||y>=info.height)return false;const n=(y*info.width+x)*info.channels,r=data[n],g=data[n+1],b=data[n+2];return Math.max(r,g,b)-Math.min(r,g,b)<70&&(r*.2126+g*.7152+b*.0722)<155;};
 const rejected=[],m=result.calibration.mmPerPixel;
 for(const wall of result.structure.walls){const a=wall.a.map(v=>v/m),b=wall.b.map(v=>v/m),dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),nx=-dy/len,ny=dx/len,pad=Math.max(4,wall.thickness/m*.8),openings=result.structure.openings.filter(o=>o.wallId===wall.id);let hits=0,total=0;
  for(let t=.04;t<.97;t+=.015){const along=t*len;if(openings.some(o=>along>=o.offset/m-4&&along<=(o.offset+o.width)/m+4))continue;total++;let hit=false;for(let off=-pad;off<=pad;off+=1.5)if(dark(a[0]+dx*t+nx*off,a[1]+dy*t+ny*off)){hit=true;break;}if(hit)hits++;}
  const support=total?hits/total:1;wall.pixelEvidence={support:Math.round(support*100)/100,source:'original-image',method:'neutral-dark-stroke-coverage'};
  if(support<.58){rejected.push(wall.id);const x=Math.min(a[0],b[0]),y=Math.min(a[1],b[1]);result.unresolved.push({type:'wall',bbox:[Math.max(0,x-pad),Math.max(0,y-pad),Math.min(input.width-Math.max(0,x-pad),Math.max(8,Math.abs(dx)+pad*2)),Math.min(input.height-Math.max(0,y-pad),Math.max(8,Math.abs(dy)+pad*2))],coordinateSpace:'source-pixels',reason:'视觉模型墙线缺少连续原图线条证据（'+Math.round(support*100)+'%），未生成墙体，请人工核对。',rejectedWallId:wall.id});}
 }
 if(rejected.length){result.structure.walls=result.structure.walls.filter(w=>!rejected.includes(w.id));result.structure.openings=result.structure.openings.filter(o=>!rejected.includes(o.wallId));result.notes+=' '+rejected.length+' 段缺乏原图线条证据的墙候选已移入疑点。房间边界仍需核对。';}
 const rejectedRooms=[];result.structure.rooms=result.structure.rooms.filter(room=>{const poly=room.poly.map(p=>p.map(v=>v/m));let hits=0,total=0;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);if(!len)continue;const nx=-dy/len,ny=dx/len,steps=Math.max(4,Math.min(80,Math.ceil(len/8)));for(let j=0;j<steps;j++){const t=(j+.5)/steps;total++;let hit=false;for(let off=-5;off<=5;off+=1.5)if(dark(a[0]+dx*t+nx*off,a[1]+dy*t+ny*off)){hit=true;break;}if(hit)hits++;}}
  const support=total?hits/total:0;room.pixelEvidence={support:Math.round(support*100)/100,method:'original-boundary-stroke-coverage'};if(support>=.5)return true;rejectedRooms.push(room.id);const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]);result.unresolved.push({type:'room',bbox:[Math.min(...xs),Math.min(...ys),Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)],coordinateSpace:'source-pixels',reason:'模型房间边界缺少原图边界支持，未生成房间。请手动描绘或核对。',rejectedRoomId:room.id});return false;});
 result.evidenceCheck={rejectedWallIds:rejected,rejectedRoomIds:rejectedRooms,method:'original-pixel-support',wallThreshold:.58,roomThreshold:.5};result.empty=!result.structure.walls.length&&!result.structure.rooms.length&&!result.structure.columns.length;return result;
}
module.exports={guideImage,checkWallEvidence};
