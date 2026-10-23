/* True orthographic top-down furniture, shared with the editable 3D scene. */
const planSpriteCache=new Map();let planSpriteStudio;
async function planFurnitureSprite(f){
  init();const key=JSON.stringify([f.type,f.w,f.d,f.h||0,f.color,f.material||'original',f.assetId||'',f.rugPattern||'woven']);
  if(planSpriteCache.has(key))return planSpriteCache.get(key);
  if(f.assetId)await prepareLibraryItem([f.type,f.name,f.w,f.d,f.color,{assetId:f.assetId,h:f.h}]);
  if(!planSpriteStudio){
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,100);
    scene.add(new THREE.HemisphereLight(0xffffff,0xc9c1b4,1.45));
    const light=new THREE.DirectionalLight(0xfffaf0,2.1);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.normalBias=.006;light.shadow.bias=-.00015;light.shadow.radius=4;
    scene.add(light,light.target);const fill=new THREE.DirectionalLight(0xffffff,.65);fill.position.set(3,5,2);scene.add(fill);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShadowMaterial({opacity:.18}));floor.rotation.x=-Math.PI/2;floor.position.y=-.008;floor.receiveShadow=true;scene.add(floor);
    planSpriteStudio={scene,camera,light,floor,target:new THREE.WebGLRenderTarget(512,512),canvas:document.createElement('canvas')};
    planSpriteStudio.target.texture.colorSpace=THREE.SRGBColorSpace;
  }
  const s=planSpriteStudio,model=buildFurniture({...f,id:'plan-sprite',cx:0,cy:0,rot:0});model.position.set(0,0,0);model.rotation.set(0,0,0);model.updateMatrixWorld(true);
  // Clone materials because per-view exposure and disposal must never affect the home.
  const materials=new Map();model.traverse(o=>{if(!o.isMesh)return;const copy=m=>{if(!materials.has(m))materials.set(m,m.clone());return materials.get(m);};o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);});
  const b=new THREE.Box3().setFromObject(model),radius=Math.max(f.w/1000,f.d/1000,.2),pad=Math.min(.18,Math.max(.07,radius*.06));
  const w=Math.max(f.w/1000,Math.abs(b.min.x)*2,Math.abs(b.max.x)*2)+pad*2,d=Math.max(f.d/1000,Math.abs(b.min.z)*2,Math.abs(b.max.z)*2)+pad*2;
  const pixels=640,width=Math.max(96,Math.round(pixels*w/Math.max(w,d))),height=Math.max(96,Math.round(pixels*d/Math.max(w,d)));
  s.target.setSize(width,height);s.canvas.width=width;s.canvas.height=height;s.floor.scale.set(w*4,d*4,1);s.scene.add(model);
  Object.assign(s.camera,{left:-w/2,right:w/2,top:d/2,bottom:-d/2,far:radius*10+20});s.camera.up.set(0,0,-1);s.camera.position.set(0,b.max.y+radius*3+5,0);s.camera.lookAt(0,0,0);s.camera.updateProjectionMatrix();s.camera.updateMatrixWorld(true);
  s.light.position.set(-radius*1.1,radius*5+4,-radius*.8);s.light.target.position.set(0,0,0);Object.assign(s.light.shadow.camera,{left:-w,right:w,top:d,bottom:-d,near:.01,far:radius*15+20});s.light.shadow.camera.updateProjectionMatrix();
  const previous={target:renderer.getRenderTarget(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),color:renderer.getClearColor(new THREE.Color()).clone(),alpha:renderer.getClearAlpha(),exposure:renderer.toneMappingExposure};
  try{
    renderer.setRenderTarget(s.target);renderer.setScissorTest(false);renderer.setClearColor(0x000000,0);renderer.toneMappingExposure=.96;renderer.render(s.scene,s.camera);
    const rgba=new Uint8Array(width*height*4);renderer.readRenderTargetPixels(s.target,0,0,width,height,rgba);const ctx=s.canvas.getContext('2d'),image=ctx.createImageData(width,height);for(let y=0;y<height;y++)image.data.set(rgba.subarray((height-1-y)*width*4,(height-y)*width*4),y*width*4);ctx.putImageData(image,0,0);
    const result={href:s.canvas.toDataURL('image/png'),x:-w*500,y:-d*500,w:w*1000,d:d*1000,width,height};planSpriteCache.set(key,result);
    // Bound the temporary preview cache while allowing reuse during normal dragging.
    if(planSpriteCache.size>180)planSpriteCache.delete(planSpriteCache.keys().next().value);return result;
  }finally{
    renderer.setRenderTarget(previous.target);renderer.setViewport(previous.viewport);renderer.setScissor(previous.scissor);renderer.setScissorTest(previous.scissorTest);renderer.setClearColor(previous.color,previous.alpha);renderer.toneMappingExposure=previous.exposure;
    s.scene.remove(model);clearGroup(model);materials.forEach(m=>m.dispose());
  }
}
Object.assign(window.View3D,{planFurnitureSprite});
