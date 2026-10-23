/* Photo-derived parameter geometry. No photo planes are used in the model. */
const photoTextureCache=new Map();
async function prepareLibraryItem(item){const assetId=item[5]?.assetId;if(assetId&&!importedTemplates.has(assetId)){const asset=state.assets[assetId];if(!asset)throw Error('模型资源缺失');await importModel(asset);}}
function photoAssetPreview(item){init();return libraryThumbnail(item);}
function photoVeneer(color){
  const key='veneer-'+color;if(photoTextureCache.has(key))return photoTextureCache.get(key);
  const cv=document.createElement('canvas');cv.width=512;cv.height=512;const ctx=cv.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,512,512);const random=rng(4062);
  for(let i=0;i<650;i++){ctx.strokeStyle=i%3?'rgba(255,255,245,.11)':'rgba(45,43,35,.15)';ctx.lineWidth=.25+random()*.65;const x=random()*512;ctx.beginPath();ctx.moveTo(x,0);for(let y=0;y<=512;y+=16)ctx.lineTo(x+Math.sin(y*.12+random()*4)*1.8,y);ctx.stroke();}
  const texture=new THREE.CanvasTexture(cv);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,1);photoTextureCache.set(key,texture);return texture;
}
function capsuleShape(w,d){const r=d/2,left=-w/2+r,right=w/2-r,s=new THREE.Shape();s.moveTo(left,-r);s.lineTo(right,-r);s.absarc(right,0,r,-Math.PI/2,Math.PI/2,false);s.lineTo(left,r);s.absarc(left,0,r,Math.PI/2,Math.PI*1.5,false);s.closePath();return s;}
function capsuleMesh(w,d,h,material,y){const geo=new THREE.ExtrudeGeometry(capsuleShape(w,d),{depth:h,steps:1,bevelEnabled:false,curveSegments:32});geo.rotateX(-Math.PI/2);const object=mesh(geo,material);object.position.y=y;return object;}
function buildPhotoFurniture(recipe,dimensions){
  const {w:width,d:depth,h:height}=dimensions,w=M(width),d=M(depth),h=M(height),a=recipe.appearance||{};
  const extracted=buildSceneExtractedFurniture(recipe,dimensions);if(extracted)return extracted;
  if(recipe.kind==='coffee_oval'){const g=new THREE.Group(),top=Math.min(.055,h*.15),wood=woodM(a.bodyColor||'#96724b');g.add(decorSlab(decorShape('oval',w,d),top,wood,h-top));for(const side of [-1,1])g.add(cyl(Math.min(w*.13,d*.34),Math.min(w*.13,d*.34),h-top,wood,side*w*.24,0,0,48));g.userData.approximate=true;return g;}
  if(recipe.kind!=='rounded_tv_cabinet'){
    const type=recipe.kind==='straight_sofa'?'sofa':recipe.kind==='standing_lamp'?'floorlamp':recipe.kind==='potted_plant'?'plant':['coffee_oval','rug_rect','curtain_drape','art_abstract','tv','floorlamp'].includes(recipe.kind)?recipe.kind:recipe.kind==='sink'?'ksink':['bed','sofa','chair','table','cabinet','desk','armchair','coffeetable','wardrobe','counter','fridge','toilet','shower','washer','stove','plant'].includes(recipe.kind)?recipe.kind:'cabinet';
    const generic=buildFurniture({id:'photo-parameter',type,name:recipe.name||'近似家具',cx:0,cy:0,w:width,d:depth,h:height,rot:0,color:a.bodyColor||'#b9ac99'});generic.position.set(0,0,0);return generic;
  }
  const g=new THREE.Group();g.name=recipe.name||'照片电视柜';
  const legHeight=h*(1-(a.bodyHeightRatio||.7358490566)),bodyHeight=h-legHeight,topThickness=Math.min(.014,bodyHeight*.04),radius=d/2;
  const veneer=new THREE.MeshStandardMaterial({color:'#ffffff',map:photoVeneer(a.bodyColor||'#a7a397'),roughness:.72,metalness:.06});
  const top=new THREE.MeshStandardMaterial({color:'#ffffff',map:photoVeneer(a.topColor||'#b9b6aa'),roughness:.62,metalness:.08});
  const brass=mat(a.metalColor||'#b6a365',{metalness:.86,roughness:.34}),dark=mat(a.gapColor||'#3d372b',{roughness:.82}),black=mat('#3d3b31',{metalness:.25,roughness:.56});
  // Continuous rounded core with separate top and bottom edges.
  g.add(capsuleMesh(w-.006,d-.006,bodyHeight-topThickness,veneer,legHeight));
  g.add(capsuleMesh(w,d,topThickness,top,h-topThickness));
  g.add(capsuleMesh(w-.012,d-.012,.008,dark,legHeight));
  const drawerWidth=w*(a.centralDrawerWidthRatio||.34),flatWidth=w-d,sideWidth=(flatWidth-drawerWidth)/2,gap=.004,z=d/2+.001;
  // Front is +Z. A full-height dark reveal remains visible behind separate panels.
  g.add(box(flatWidth,bodyHeight-.020,.004,dark,0,legHeight+.009,z-.004));
  for(const side of [-1,1])g.add(box(Math.max(.01,sideWidth-gap),bodyHeight-.024,.012,veneer,side*(drawerWidth/2+sideWidth/2),legHeight+.010,z));
  const drawerHeight=(bodyHeight-.027)/2;
  for(let row=0;row<2;row++)g.add(box(drawerWidth-gap,drawerHeight-.005,.014,veneer,0,legHeight+.011+row*(drawerHeight+.005),z+.001));
  // Subtle brass finger recess between the two central drawers.
  g.add(box(drawerWidth-.008,.010,.006,brass,0,legHeight+bodyHeight/2-.004,z+.009));
  // Two narrow woven/reeded brass trims, with actual ridges and diagonal details.
  const stripWidth=Math.min(.062,w*.031),stripHeight=bodyHeight-.025;
  for(const side of [-1,1]){
    const x=side*(w/2-radius+.025);g.add(box(stripWidth,stripHeight,.009,brass,x,legHeight+.011,z+.009));
    for(let i=0;i<12;i++){const px=x-stripWidth/2+.003+i*(stripWidth-.006)/11;g.add(box(.0013,stripHeight-.006,.002,dark,px,legHeight+.014,z+.015));}
    const rows=Math.min(48,Math.floor(stripHeight/.009));for(let i=0;i<rows;i++){const yy=legHeight+.016+i*(stripHeight-.01)/rows,zig=new THREE.Group();zig.add(rod([x-stripWidth/2+.002,yy,z+.016],[x,yy+.004,z+.017],.00065,brass),rod([x,yy+.004,z+.017],[x+stripWidth/2-.002,yy,z+.016],.00065,brass));g.add(zig);}
  }
  // Two outer sculpted brass feet, two recessed feet, plus simple rear supports.
  for(const side of [-1,1]){
    const x=side*(w/2-radius*.38),front=d*.35;
    const foot=new THREE.Group();foot.add(blob(.012,legHeight*.62,.014,brass,0,legHeight*.58,0,18));foot.add(rod([0,.004,0],[side*.008,legHeight+.025,-.012],.006,brass,.010));foot.position.set(x,0,front);g.add(foot);
    g.add(cyl(.008,.010,legHeight,black,side*w*.23,0,d*.25,12));
    g.add(cyl(.006,.008,legHeight,brass,side*(w/2-radius*.75),0,-d*.31,12));
  }
  g.userData.photoRecipe=recipe.id||recipe.kind;g.userData.approximate=true;return g;
}
async function createPhotoModel(recipe,dimensions){
  if(!FurniturePhotoCore.validDimensions(dimensions))throw Error('请先填写有效的宽、深、高');
  const object=buildPhotoFurniture(recipe,dimensions);object.traverse(o=>{if(o.geometry?.getAttribute('normal'))o.geometry.normalizeNormals();});object.position.set(0,0,0);object.updateMatrixWorld(true);
  // Normalize the generated solid geometry to the exact requested real dimensions.
  const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());object.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));
  const root=new THREE.Group();root.name=recipe.name||'图片家具';root.add(object);root.scale.set(M(dimensions.w)/size.x,M(dimensions.h)/size.y,M(dimensions.d)/size.z);root.updateMatrixWorld(true);
  root.traverse(o=>{delete o.userData.fid;});
  try{return await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true,maxTextureSize:512});}
  finally{clearGroup(root);}
}
// Development inspection uses the same raycaster and projection as real dragging.
Object.assign(window.View3D,{
  inspectAt:(x,y,details=false)=>{const hit=pick({clientX:x,clientY:y});return details?{hit,hits:ray.intersectObjects([furnG,archUp,archFloor],true).slice(0,5).map(h=>({distance:h.distance,point:h.point.toArray(),chain:(()=>{const chain=[];for(let o=h.object;o&&o!==scene;o=o.parent)chain.push({name:o.name,userData:o.userData});return chain;})()}))}:hit;},
  projectFurniture:id=>{const g=furnG?.children.find(g=>g.userData.fid===id);if(!g)return null;const r=renderer.domElement.getBoundingClientRect(),b=new THREE.Box3().setFromObject(g),p=b.getCenter(new THREE.Vector3()).project(camera);return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
});
