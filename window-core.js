(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.WindowCore=api;})(globalThis,()=>{
 const types={fixed:'固定窗',casement_in:'内平开窗',casement_out:'外平开窗',sliding:'推拉窗',awning:'上悬外开窗'};
 const keys=['windowType','windowPanes','windowFrameColor','windowFrameWidth','windowInsideSide','windowOpenAngle','windowHinge'];
 function validate(o){
  if(o.windowType!==undefined&&!types[o.windowType])throw Error('请选择有效的窗户类型');
  if(o.windowPanes!==undefined&&(!Number.isInteger(o.windowPanes)||o.windowPanes<1||o.windowPanes>4))throw Error('窗扇数量应为 1–4');
  if(o.windowFrameColor!==undefined&&!/^#[a-f\d]{6}$/i.test(o.windowFrameColor))throw Error('窗框颜色无效');
  for(const [k,min,max]of [['windowFrameWidth',20,150],['windowOpenAngle',10,80]])if(o[k]!==undefined&&(!Number.isFinite(o[k])||o[k]<min||o[k]>max))throw Error(k==='windowFrameWidth'?'窗框宽度应为 20–150 mm':'开启角度应为 10–80°');
  if(o.windowInsideSide!==undefined&&!['auto','1','-1'].includes(String(o.windowInsideSide)))throw Error('窗户室内朝向无效');
  if(o.windowHinge!==undefined&&!['start','end'].includes(o.windowHinge))throw Error('窗轴位置无效');
 }
 function spec(o,w,plan){
  const type=o.windowType||'casement_in',panes=Math.max(type==='sliding'?2:1,o.windowPanes||(o.width>=1500?2:1));let insideSide=Number(o.windowInsideSide)||0;
  if(!insideSide&&w&&plan){const l=Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1]),ux=(w.b[0]-w.a[0])/l,uy=(w.b[1]-w.a[1])/l,t=o.offset+o.width/2,x=w.a[0]+ux*t,y=w.a[1]+uy*t;
   const inside=(p,poly)=>{let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;};
   const hit=s=>plan.structure.rooms.some(r=>r.kind!=='balcony'&&inside([x-uy*(w.thickness/2+180)*s,y+ux*(w.thickness/2+180)*s],r.poly));if(hit(1)!==hit(-1))insideSide=hit(1)?1:-1;
  }
  return {id:o.id,type,panes,width:o.width/1000,height:o.height/1000,frameWidth:(o.windowFrameWidth||55)/1000,color:o.windowFrameColor||'#41494e',insideSide:insideSide||1,angle:Math.min(type==='awning'?45:80,o.windowOpenAngle||55)*Math.PI/180,hinge:o.windowHinge||'start',open:type!=='fixed'&&!!o.open,depth:Math.min(.14,Math.max(.065,(w?.thickness||200)/1000*.55))};
 }
 function symbol(o,w,plan){const s=spec(o,w,plan),W=o.width,t=w.thickness,F=Math.min(s.frameWidth*1000,W/10,t/3),step=(W-2*F)/s.panes;let d=`<path d="M0 ${-t/2+F/2}H${W}M0 ${t/2-F/2}H${W}" stroke="${s.color}" stroke-width="${F}" fill="none"/>`;
  for(let i=0;i<=s.panes;i++){const x=F+i*step;d+=`<path d="M${x} ${-t/2}V${t/2}" stroke="${s.color}" stroke-width="${i&&i<s.panes?F*.65:F}"/>`;}
  d+=`<path d="M${F} -12H${W-F}M${F} 12H${W-F}" stroke="#7898a7" stroke-width="8"/>`;
  if(s.type==='sliding')for(let i=0;i<s.panes;i++){const x=F+(i+.5)*step;d+=`<path d="M${x-step*.2} ${i%2?25:-25}h${step*.4}m${-step*.1} -18l${step*.1} 18l${-step*.1} 18" fill="none" stroke="#7898a7" stroke-width="8"/>`;}
  if(o.open&&['casement_in','casement_out'].includes(s.type)){const side=s.insideSide*(s.type==='casement_in'?1:-1);for(let i=0;i<s.panes;i++){const end=s.panes===1?s.hinge==='end':i>=s.panes/2,hx=F+(i+(end?1:0))*step,dx=(end?-1:1)*step*.9;d+=`<path d="M${hx} 0l${dx*Math.cos(s.angle)} ${side*Math.abs(dx)*Math.sin(s.angle)}" stroke="${s.color}" stroke-width="${F*.6}"/>`;}}
  if(o.open&&s.type==='awning'){const depth=s.height*1000*Math.sin(s.angle)*-s.insideSide;d+=`<path d="M${F} 0v${depth}H${W-F}V0" stroke="${s.color}" fill="none" stroke-width="${F*.5}"/>`;}
  return `<title>${types[s.type]} · ${s.panes} 扇${s.type==='fixed'?'':' · '+(o.open?'开启':'关闭')}</title>`+d;
 }
 return {types,keys,validate,spec,symbol};
});
