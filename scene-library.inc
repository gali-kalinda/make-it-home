/* Catalogue previews use the very same geometry as furniture placed in the home.
 * Render into a small target on the existing WebGL context, then restore its state. */
const libraryThumbnailCache=new Map();
let libraryStudio=null;
function libraryThumbnail(item){
  if(!inited)throw Error('三维引擎尚未就绪');
  const key=JSON.stringify(item);if(libraryThumbnailCache.has(key))return libraryThumbnailCache.get(key);
  const width=256,height=216;
  if(!libraryStudio){
    const previewScene=new THREE.Scene(),cam=new THREE.OrthographicCamera(-1,1,1,-1,.01,100);
    previewScene.add(new THREE.HemisphereLight(0xffffff,0xc7baaa,2.2));
    const light=new THREE.DirectionalLight(0xfff6e8,3.4);light.position.set(-3,6,5);light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.normalBias=.015;
    const fill=new THREE.DirectionalLight(0xffffff,1.5);fill.position.set(4,3,-3);previewScene.add(light,light.target,fill);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShadowMaterial({opacity:.13}));floor.rotation.x=-Math.PI/2;floor.position.y=-.008;floor.receiveShadow=true;previewScene.add(floor);
    const target=new THREE.WebGLRenderTarget(width,height);target.texture.colorSpace=THREE.SRGBColorSpace;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    libraryStudio={scene:previewScene,camera:cam,light,floor,target,canvas,pixels:new Uint8Array(width*height*4)};
  }
  const studio=libraryStudio,[type,name,w,d,color]=item;
  const model=buildFurniture({id:'library-preview',type,name,w,d,color,cx:0,cy:0,rot:0,...(item[5]||{})});
  model.position.set(0,0,0);model.updateMatrixWorld(true);
  const originalBox=new THREE.Box3().setFromObject(model),center=originalBox.getCenter(new THREE.Vector3());
  model.position.set(-center.x,-originalBox.min.y,-center.z);model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),focus=bounds.getCenter(new THREE.Vector3()),radius=Math.max(size.x,size.y,size.z,.1);
  const materials=new Map();model.traverse(o=>{if(!o.isMesh)return;const copy=m=>{if(!materials.has(m)){const n=m.clone();if(n.envMap)n.envMapIntensity=1;materials.set(m,n);}return materials.get(m);};o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);});
  studio.scene.add(model);studio.floor.scale.setScalar(radius*4);
  const yaw=(item[5]?.previewAngle||0)*Math.PI/180;
  studio.camera.position.copy(focus).add(new THREE.Vector3(1.2,.95,1.4).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).normalize().multiplyScalar(radius*4));studio.camera.lookAt(focus);studio.camera.updateMatrixWorld(true);
  let halfX=0,halfY=0;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new THREE.Vector3(x,y,z).applyMatrix4(studio.camera.matrixWorldInverse);halfX=Math.max(halfX,Math.abs(p.x));halfY=Math.max(halfY,Math.abs(p.y));}
  const half=Math.max(halfY,halfX/(width/height)) *1.18;
  Object.assign(studio.camera,{left:-half*width/height,right:half*width/height,top:half,bottom:-half,far:radius*12});studio.camera.updateProjectionMatrix();
  studio.light.position.copy(focus).add(new THREE.Vector3(-2,4,3).multiplyScalar(radius));studio.light.target.position.copy(focus);Object.assign(studio.light.shadow.camera,{left:-radius*2,right:radius*2,top:radius*2,bottom:-radius*2,near:.01,far:radius*12});studio.light.shadow.camera.updateProjectionMatrix();
  const previous={target:renderer.getRenderTarget(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),color:renderer.getClearColor(new THREE.Color()).clone(),alpha:renderer.getClearAlpha(),exposure:renderer.toneMappingExposure};
  try{
    renderer.setRenderTarget(studio.target);renderer.setScissorTest(false);renderer.setClearColor(0x000000,0);renderer.toneMappingExposure=1.05;renderer.render(studio.scene,studio.camera);renderer.readRenderTargetPixels(studio.target,0,0,width,height,studio.pixels);
    const ctx=studio.canvas.getContext('2d'),rgba=ctx.createImageData(width,height);for(let y=0;y<height;y++)rgba.data.set(studio.pixels.subarray((height-1-y)*width*4,(height-y)*width*4),y*width*4);ctx.putImageData(rgba,0,0);
    const image=studio.canvas.toDataURL('image/png');libraryThumbnailCache.set(key,image);return image;
  }finally{
    renderer.setRenderTarget(previous.target);renderer.setViewport(previous.viewport);renderer.setScissor(previous.scissor);renderer.setScissorTest(previous.scissorTest);renderer.setClearColor(previous.color,previous.alpha);renderer.toneMappingExposure=previous.exposure;
    studio.scene.remove(model);clearGroup(model);materials.forEach(m=>m.dispose());
  }
}
