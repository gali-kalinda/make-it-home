/* Scene-extracted furniture: solid parametric approximations, never image planes. */
let extractedClothTexture=null,extractedRugTexture=null;
function extractedCloth(color){
 if(!extractedClothTexture){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),r=rng(7315);ctx.fillStyle='#ddd';ctx.fillRect(0,0,256,256);for(let i=0;i<16000;i++){ctx.fillStyle=i%2?'#ffffff35':'#57544e26';ctx.fillRect(r()*256,r()*256,.5+r()*1.5,.5+r()*1.5);}extractedClothTexture=new THREE.CanvasTexture(c);extractedClothTexture.wrapS=extractedClothTexture.wrapT=THREE.RepeatWrapping;extractedClothTexture.repeat.set(3,3);}
 return new THREE.MeshStandardMaterial({color,roughness:.98,bumpMap:extractedClothTexture,bumpScale:.0018});
}
function extractedRug(){
 if(!extractedRugTexture){const c=document.createElement('canvas');c.width=1024;c.height=768;const x=c.getContext('2d');x.fillStyle='#e5dfd0';x.fillRect(0,0,1024,768);x.fillStyle='#252722';for(const [a,b,w,h] of [[60,0,95,768],[280,0,70,768],[470,0,110,768],[705,0,62,768],[865,0,95,768],[0,225,1024,75],[0,540,1024,65]])x.fillRect(a,b,w,h);x.fillStyle='#e5dfd0';for(const [a,b,w,h] of [[60,60,95,125],[280,340,70,150],[470,320,110,170],[705,60,62,140],[865,340,95,150]])x.fillRect(a,b,w,h);x.strokeStyle='#a5323b';x.lineWidth=20;x.strokeRect(10,10,1004,748);const r=rng(883);for(let i=0;i<45000;i++){x.fillStyle=i%2?'#ffffff12':'#0000000a';x.fillRect(r()*1024,r()*768,1,2);}extractedRugTexture=new THREE.CanvasTexture(c);extractedRugTexture.colorSpace=THREE.SRGBColorSpace;}
 return new THREE.MeshStandardMaterial({map:extractedRugTexture,roughness:1});
}
function buildSceneExtractedFurniture(recipe,dimensions){
 const supported=['scene_sofa','slab_armchair','round_tripod_table','clover_stool','pedestal_side_table','cone_floor_lamp','wall_cubby_shelf','z_child_chair','geometric_rug','block_dining_table','thin_frame_chair'];if(!supported.includes(recipe.kind))return null;
 const w=M(dimensions.w),d=M(dimensions.d),h=M(dimensions.h),a=recipe.appearance||{},g=new THREE.Group(),body=a.bodyColor||'#b8ad98',secondary=a.secondaryColor||'#696457',accent=a.accentColor||'#982d31',solid=mat(body,{roughness:.67}),dark=mat(secondary,{roughness:.75});g.name=recipe.name||'效果图近似家具';
 switch(recipe.kind){
 case 'scene_sofa':{
  const cloth=extractedCloth(body);g.add(capsuleMesh(w,d,h*.28,cloth,h*.055));g.add(rbox(w*.94,h*.18,d*.88,cloth,0,h*.30,0,.12));g.add(rbox(w*.80,h*.40,d*.22,cloth,0,h*.47,-d*.31,.12));
  for(const side of [-1,1]){const cushion=rbox(w*.26,h*.31,d*.17,cloth,side*w*.25,h*.45,-d*.18,.09);cushion.rotation.x=-.15;g.add(cushion);}const pillow=rbox(w*.17,h*.39,d*.17,extractedCloth(a.accentColor||'#17263e'),w*.12,h*.46,-d*.11,.055);pillow.rotation.z=-.15;pillow.rotation.x=-.20;g.add(pillow);g.add(rbox(w*.23,h*.025,d*.70,extractedCloth(secondary),-w*.20,h*.48,d*.05,.012));break;
 }
 case 'slab_armchair':{
  const cloth=extractedCloth(body);for(const side of [-1,1]){for(const z of [-d*.36,d*.36])g.add(box(w*.105,h*.64,d*.105,solid,side*w*.43,0,z));g.add(rbox(w*.12,h*.13,d*.96,solid,side*w*.43,h*.57,0,.006));}
  g.add(box(w*.78,h*.075,d*.77,dark,0,h*.29,d*.035));g.add(rbox(w*.78,h*.21,d*.69,cloth,0,h*.34,d*.08,.025));const back=rbox(w*.80,h*.51,d*.15,cloth,0,h*.46,-d*.31,.015);back.rotation.x=-.13;g.add(back);break;
 }
 case 'round_tripod_table':{
  g.add(cyl(w*.5,w*.5,h*.075,solid,0,h*.925,0,80));for(let i=0;i<3;i++){const angle=i*Math.PI*2/3,p=new THREE.Group();p.position.set(Math.sin(angle)*w*.22,0,Math.cos(angle)*d*.22);p.rotation.y=angle;p.add(box(w*.29,h*.925,d*.12,dark));g.add(p);}break;
 }
 case 'clover_stool':{
  const wood=mat(body,{roughness:.39});for(let i=0;i<3;i++){const angle=i*Math.PI*2/3;g.add(lathe([[0,0],[w*.13,0],[w*.21,h*.10],[w*.20,h*.30],[w*.135,h*.77],[w*.12,h*.91],[0,h*.91]],wood,Math.sin(angle)*w*.21,0,Math.cos(angle)*d*.21,40));}g.add(cyl(w*.48,w*.48,h*.045,dark,0,h*.895,0,72),cyl(w*.49,w*.49,h*.06,wood,0,h*.94,0,72));break;
 }
 case 'pedestal_side_table':g.add(cyl(w*.5,w*.5,h*.045,solid,0,h*.955,0,72),cyl(w*.035,w*.035,h*.9,solid,0,h*.04,0,24),cyl(w*.29,w*.31,h*.04,dark,0,0,0,64));break;
 case 'cone_floor_lamp':{
  const white=mat(body,{roughness:.88}),shade=new THREE.MeshStandardMaterial({color:body,roughness:.96,side:THREE.DoubleSide});g.add(cyl(w*.22,w*.23,h*.022,white,0,0,0,64),cyl(w*.065,w*.14,h*.75,white,0,h*.02,0,48));const shell=new THREE.Mesh(new THREE.CylinderGeometry(w*.5,w*.5,h*.22,64,1,true),shade);shell.position.y=h*.89;shell.castShadow=shell.receiveShadow=true;g.add(shell);g.add(cyl(w*.46,w*.46,h*.006,mat('#e3dfd3',{roughness:1}),0,h*.78,0,64));break;
 }
 case 'wall_cubby_shelf':{
  const t=Math.min(.027,w*.022);g.add(box(w,h,d*.045,dark,0,0,-d*.477));for(const x of [-w/2+t/2,w/2-t/2])g.add(box(t,h,d,solid,x));for(const y of [0,h/2-t/2,h-t])g.add(box(w,t,d,solid,0,y));for(const x of [-w*.17,w*.19])g.add(box(t,h/2,d,solid,x,h/2));for(const x of [-w*.31,w*.10])g.add(box(t,h/2,d,solid,x));g.add(box(w*.32,h*.45,t,solid,-w*.02,h*.03,d/2-t/2));break;
 }
 case 'z_child_chair':{
  function plank(a,b,width,depth){const v=new THREE.Vector3().subVectors(new THREE.Vector3(...b),new THREE.Vector3(...a)),o=new THREE.Mesh(new THREE.BoxGeometry(width,v.length(),depth),solid);o.position.copy(new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());o.castShadow=o.receiveShadow=true;return o;}
  for(const side of [-1,1]){g.add(box(w*.105,h*.055,d,solid,side*w*.43,0,0),plank([side*w*.43,h*.06,d*.32],[side*w*.43,h*.98,-d*.32],w*.105,d*.09));}g.add(box(w*.80,h*.045,d*.46,solid,0,h*.58,0),box(w*.80,h*.04,d*.49,solid,0,h*.32,d*.16),rbox(w*.80,h*.12,d*.055,solid,0,h*.86,-d*.29,.008),box(w*.80,h*.055,d*.06,solid,0,h*.14,d*.26));break;
 }
 case 'geometric_rug':{
  const base=box(w,h,d,mat(body,{roughness:1}));g.add(base);const top=new THREE.Mesh(new THREE.PlaneGeometry(w,d),extractedRug());top.rotation.x=-Math.PI/2;top.position.y=h+.0005;top.receiveShadow=true;g.add(top);break;
 }
 case 'block_dining_table':g.add(box(w,h*.055,d,dark,0,h*.945));for(const x of [-w*.40,w*.40])g.add(box(w*.12,h*.945,d*.88,solid,x));g.add(box(w*.72,h*.90,d*.03,solid,0,h*.025,-d*.4));break;
 case 'thin_frame_chair':{
  const metal=mat(body,{metalness:.45,roughness:.45});for(const side of [-1,1])for(const z of [-d*.37,d*.37])g.add(cyl(w*.017,w*.017,h*(z<0?.96:.53),metal,side*w*.41,0,z,12));g.add(rbox(w*.88,h*.045,d*.78,dark,0,h*.50,0,.015),rbox(w*.86,h*.13,d*.045,dark,0,h*.81,-d*.37,.014));break;
 }
 }
 g.userData.approximate=true;g.userData.extractedKind=recipe.kind;return g;
}
Object.assign(window.View3D,{inspectPlacement:id=>{const g=furnG?.children.find(g=>g.userData.fid===id);if(!g)return null;const b=new THREE.Box3().setFromObject(g);return {position:g.position.toArray(),min:b.min.toArray(),max:b.max.toArray()};}});
