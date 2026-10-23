/* Built-in decor data and shared vector/canvas patterns; no external assets required. */
(function(root){
 const groups=[
  {cat:'茶几 · 更多形状',items:[['coffee_round','圆形木茶几',900,900,'#b98d63'],['coffee_oval','椭圆茶几',1300,650,'#e4d3b9'],['coffee_square','正方形茶几',850,850,'#b29e87'],['coffee_kidney','云朵茶几',1200,750,'#ede5d6'],['coffee_nesting','高低组合茶几',1200,800,'#b5825e'],['coffee_glass','玻璃圆茶几',900,900,'#b7ccd1']]},
  {cat:'灯具',items:[['lamp_arc','弧形落地灯',1100,450,'#383b3a'],['lamp_tripod','三脚布罩落地灯',550,550,'#e6d7bd'],['lamp_mushroom','蘑菇台灯',350,350,'#bc794f'],['lamp_desk','工作台灯',450,280,'#3c554e'],['pendant_ring','环形吊灯',800,800,'#c7a36d'],['pendant_globe','球形吊灯',450,450,'#f2eadb']]},
  {cat:'装饰画',items:[['art_abstract','暖色抽象画',700,45,'#bd775d'],['art_landscape','山野风景画',1000,45,'#8f9d82'],['art_botanical','植物线描画',600,45,'#66795c'],['art_triptych','三联几何画',1500,45,'#b28869']]},
  {cat:'地毯',items:[['rug_rect','边框长方地毯',2400,1700,'#c2b29b'],['rug_square','正方形地毯',2000,2000,'#c1b5a0'],['rug_round','圆形地毯',1800,1800,'#d4bca1'],['rug_oval','椭圆地毯',2400,1500,'#b2beb4'],['rug_runner','走廊长毯',800,2600,'#c3a78c']]},
  {cat:'窗帘',items:[['curtain_double','双开落地布帘',2400,180,'#b9aa93'],['curtain_sheer','轻透白纱帘',2400,120,'#eeeae0'],['curtain_blind','木质百叶帘',1600,100,'#b7966e']]}
 ];
 const patterns=[{id:'woven',name:'素色织纹'},{id:'stripe',name:'柔和条纹'},{id:'checker',name:'双色棋盘格'},{id:'geometry',name:'现代几何'},{id:'border',name:'经典边框'},{id:'dots',name:'细点肌理'}];
 const isRug=type=>['rug','rug_rect','rug_square','rug_round','rug_oval','rug_runner'].includes(type);
 function defaults(type){if(isRug(type))return {h:18,rugPattern:type==='rug_rect'?'border':'woven',material:'original'};if(type.startsWith('coffee_'))return {h:type==='coffee_nesting'?460:400};if(type.startsWith('art_'))return {h:type==='art_triptych'?650:800,elevation:1350};if(type.startsWith('curtain_'))return {h:type==='curtain_blind'?1700:2400,elevation:type==='curtain_blind'?800:100};if(type.startsWith('pendant_'))return {h:type==='pendant_ring'?280:600,elevation:2100};if(type==='lamp_mushroom')return {h:440,elevation:600};if(type==='lamp_desk')return {h:500,elevation:750};if(type.startsWith('lamp_'))return {h:1650};return {};}
 function primitives(id,color){const out=[{kind:'rect',x:0,y:0,w:512,h:512,color}],rect=(x,y,w,h,color)=>out.push({kind:'rect',x,y,w,h,color}),ellipse=(x,y,rx,ry,color)=>out.push({kind:'ellipse',x,y,rx,ry,color});
  if(id==='stripe')for(let x=0;x<512;x+=85)rect(x,0,28,512,'#f0e9dc');
  if(id==='checker')for(let y=0;y<512;y+=85.34)for(let x=0;x<512;x+=85.34)if((Math.round(x/85.34)+Math.round(y/85.34))%2===0)rect(x,y,85.34,85.34,'#f0e9dc');
  if(id==='geometry'){rect(0,0,180,240,'#67716a');rect(325,275,187,237,'#e5d9bf');ellipse(320,175,128,128,'#ba7f5c');rect(110,350,170,162,'#eee6d9');}
  if(id==='border'){rect(24,24,464,464,'#6d655a');rect(36,36,440,440,'#ede5d5');rect(48,48,416,416,color);}
  if(id==='dots')for(let y=25;y<512;y+=46)for(let x=25;x<512;x+=46)ellipse(x+(y%92?10:0),y,4,4,'#786e5c');
  // Deterministic fine weave, shared by SVG previews and the 3D texture.
  for(let y=0;y<512;y+=5)rect(0,y,512,.65,'#ffffff20');
  return out;
 }
 function draw(ctx,id,color){ctx.clearRect(0,0,512,512);for(const p of primitives(id,color)){ctx.fillStyle=p.color;if(p.kind==='rect')ctx.fillRect(p.x,p.y,p.w,p.h);else{ctx.beginPath();ctx.ellipse(p.x,p.y,p.rx,p.ry,0,0,Math.PI*2);ctx.fill();}}}
 let serial=0;
 function rugSVG(f){const id='decor-rug-'+(++serial),round=['rug_round','rug_oval'].includes(f.type),shape=round?'<ellipse cx="256" cy="256" rx="252" ry="252"/>':'<rect x="4" y="4" width="504" height="504" rx="10"/>',content=primitives(f.rugPattern||'woven',f.color||'#d9cbb8').map(p=>p.kind==='rect'?`<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${p.color}"/>`:`<ellipse cx="${p.x}" cy="${p.y}" rx="${p.rx}" ry="${p.ry}" fill="${p.color}"/>`).join('');return `<svg x="${-f.w/2}" y="${-f.d/2}" width="${f.w}" height="${f.d}" viewBox="0 0 512 512" preserveAspectRatio="none"><defs><clipPath id="${id}">${shape}</clipPath></defs><g clip-path="url(#${id})">${content}</g><g fill="none" stroke="#8d806d" stroke-width="2">${shape}</g></svg>`;}
 function symbol(f){f={...defaults(f.type),...f};if(isRug(f.type))return rugSVG(f);const w=f.w,d=f.d,c=f.color||'#d1bd9d',rect=`<rect x="${-w/2}" y="${-d/2}" width="${w}" height="${d}" rx="${Math.min(w,d)*.06}" fill="${c}" stroke="#746854" stroke-width="1" vector-effect="non-scaling-stroke"/>`,oval=`<ellipse rx="${w/2}" ry="${d/2}" fill="${c}" stroke="#746854" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  if(f.type.startsWith('coffee_')){if(f.type==='coffee_nesting')return `<ellipse cx="${-w*.15}" cy="${-d*.08}" rx="${w*.35}" ry="${d*.42}" fill="${c}" stroke="#8f785d"/><ellipse cx="${w*.25}" cy="${d*.2}" rx="${w*.25}" ry="${d*.3}" fill="#e1d0b5" stroke="#8f785d"/>`;if(['coffee_oval','coffee_round','coffee_glass','coffee_kidney'].includes(f.type))return oval;return rect;}
  if(/^(lamp_|pendant_)/.test(f.type))return oval+`<ellipse rx="${w*.3}" ry="${d*.3}" fill="#fff1ce" stroke="#b09c7b"/>`;
  if(f.type.startsWith('art_'))return rect+`<path d="M${-w*.46} 0H${w*.46}" stroke="#b09065" stroke-width="${d*.3}"/>`;
  if(f.type.startsWith('curtain_'))return rect+Array.from({length:20},(_,i)=>`<path d="M${-w/2+i*w/20} ${-d/2}v${d}" stroke="#9b907e" stroke-width="1" vector-effect="non-scaling-stroke"/>`).join('');return null;
 }
 root.DecorCatalogue={groups,patterns,isRug,defaults,primitives,draw,rugSVG,symbol};if(typeof module!=='undefined')module.exports=root.DecorCatalogue;
})(typeof window!=='undefined'?window:globalThis);
