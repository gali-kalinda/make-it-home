(function(root,factory){const api=factory();if(typeof module==='object')module.exports=api;else root.WindowModel=api;})(globalThis,()=>{
 // Shared by the editable scene and the architectural view; units are metres.
 function build(T,s,{cut=Infinity,sill=0}={}){
  const group=new T.Group(),leaves=[],materials=[],counts={},W=s.width,H=s.height,F=Math.min(s.frameWidth,W/(s.panes*6),H/6),D=s.depth,S=Math.min(.034,F*.7),gap=Math.min(.004,F*.1),innerW=W-2*F,innerH=H-2*F,mull=F*.65,paneW=(innerW-(s.panes-1)*mull)/s.panes;
  const material=(params)=>{const m=new T.MeshStandardMaterial(params);m.userData.windowOwned=true;if(Number.isFinite(cut)){m.clippingPlanes=[new T.Plane(new T.Vector3(0,-1,0),cut)];m.clipShadows=true;}materials.push(m);return m;};
  const frame=material({color:s.color,roughness:.36,metalness:.45}),rubber=material({color:'#20292d',roughness:.85}),hardware=material({color:'#b9bdc0',roughness:.25,metalness:.8}),glass=material({color:'#d8e8ed',transparent:true,opacity:.2,roughness:.12,metalness:.04,depthWrite:false,side:T.DoubleSide}),ledge=material({color:'#eeece5',roughness:.65});
  function box(parent,part,w,h,d,x,y,z,mat=frame){const o=new T.Mesh(new T.BoxGeometry(Math.max(w,.0001),Math.max(h,.0001),Math.max(d,.0001)),mat);o.position.set(x,y,z);o.userData.windowId=s.id;o.userData.windowPart=part;o.castShadow=part!=='glass';o.receiveShadow=true;parent.add(o);counts[part]=(counts[part]||0)+1;return o;}
  // Four jambs occupy the opening, rather than hiding half of their profile inside the wall.
  box(group,'frame',F,H,D,-W/2+F/2,H/2,0);box(group,'frame',F,H,D,W/2-F/2,H/2,0);
  box(group,'frame',innerW,F,D,0,F/2,0);box(group,'frame',innerW,F,D,0,H-F/2,0);
  box(group,'sill',W+.04,.025,D+.08,0,-.0125,s.insideSide*.025,ledge);
  for(let i=1;i<s.panes;i++)if(s.type!=='sliding')box(group,'mullion',mull,innerH,D,-W/2+F+i*paneW+(i-.5)*mull,H/2,0);
  if(s.type==='sliding')for(const z of [-D*.23,D*.23])for(const y of [F*.6,H-F*.6])box(group,'track',innerW,F*.22,.009,0,y,z,hardware);
  const handle=(parent,x,y,z,sliding)=>{const scale=Math.min(1,paneW/.25,innerH/.3);box(parent,'handle',.025*scale,.13*scale,.012*scale,x,y,z,hardware);box(parent,'handle',sliding?.018*scale:.065*scale,.015*scale,.024*scale,x+(sliding?0:.02*scale),y+.035*scale,z+s.insideSide*.013*scale,hardware);};
  for(let i=0;i<s.panes;i++){
   const pw=s.type==='sliding'?(innerW+(s.panes-1)*S)/s.panes:paneW,ph=innerH-2*gap,start=-W/2+F+i*(s.type==='sliding'?pw-S:paneW+mull),end=s.panes===1?s.hinge==='end':i>=s.panes/2,leaf=new T.Group();group.add(leaf);
   const pivotX=s.type.startsWith('casement')?start+(end?pw:0):start,pivotY=s.type==='awning'?H-F:F+gap,pivotZ=s.type==='sliding'?(i%2?D*.23:-D*.23):0;
   leaf.position.set(pivotX,pivotY,pivotZ);const cx=s.type.startsWith('casement')?(end?-pw/2:pw/2):pw/2,cy=s.type==='awning'?-ph/2:ph/2,lw=pw-2*gap;
   // Only border strips, never an opaque backing behind the glazing.
   for(const [x,y,w,h]of [[cx-lw/2+S/2,cy,S,ph],[cx+lw/2-S/2,cy,S,ph],[cx,cy-ph/2+S/2,lw-2*S,S],[cx,cy+ph/2-S/2,lw-2*S,S]]){
    box(leaf,'gasket',w+gap,h+gap,.024,x,y,0,rubber);box(leaf,'sash',w,h,.052,x,y,s.insideSide*.006);
   }
   box(leaf,'glass',lw-2*S,ph-2*S,.008,cx,cy,0,glass);
   if(s.type!=='fixed'){
    const hx=s.type==='awning'?cx:cx+(end?-1:1)*(lw/2-S*.7),hy=s.type==='awning'?cy-ph/2+S*.8:cy;
    handle(leaf,hx,hy,s.insideSide*.045,s.type==='sliding');
    if(s.type!=='sliding')for(const t of [.2,.8]){const x=s.type==='awning'?cx+lw*(t-.5):end?cx+lw/2:cx-lw/2,y=s.type==='awning'?0:ph*t;box(leaf,'hinge',s.type==='awning'?.07:.016,s.type==='awning'?.016:.07,.018,x,y,-s.insideSide*.026,hardware);}
   }
   leaves.push({leaf,end,start:pivotX,pivotY,pivotZ,width:pw});
  }
  function pose(amount){amount=Math.max(0,Math.min(1,amount));for(const [i,l]of leaves.entries()){l.leaf.rotation.set(0,0,0);l.leaf.position.set(l.start,l.pivotY,l.pivotZ);if(s.type.startsWith('casement'))l.leaf.rotation.y=(l.end?1:-1)*s.insideSide*(s.type==='casement_in'?1:-1)*s.angle*amount;else if(s.type==='awning')l.leaf.rotation.x=s.insideSide*s.angle*amount;else if(s.type==='sliding'&&i%2===0&&i+1<leaves.length)l.leaf.position.x+=Math.min(l.width-S,innerW-l.width)*amount;}group.updateMatrixWorld(true);}
  group.userData.windowId=s.id;group.userData.windowSpec=s;pose(s.open?1:0);return {id:s.id,group,spec:s,leaves,materials,counts,pose,open:s.open,cur:s.open?1:0};
 }
 return {build};
});
