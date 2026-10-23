/* Appearance variants of the existing editable scene and raycaster. */
let styleComposer=null,styleAO=null,styleGroundOriginal=null,styleGroundSoft=null,styleFill=null,appliedSceneStyle='',styleShadowType=null,styleRenderError='';
let suComposer=null,suOutline=null;
const styleOriginalMaterials=new WeakMap(),styleMaterials=new Map();
function resizeSceneStyle(){for(const composer of [styleComposer,suComposer])if(composer)composer.setSize(Math.max(1,SW()),Math.max(1,SH()));}
function initSUComposer(){
 if(suComposer)return;
 const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:renderer.capabilities.isWebGL2?4:0});
 suComposer=new EffectComposer(renderer,target);suComposer.setPixelRatio(renderer.getPixelRatio());
 suOutline=new SUOutlinePass(scene,camera);suComposer.addPass(new RenderPass(scene,camera));suComposer.addPass(suOutline);suComposer.addPass(new OutputPass());resizeSceneStyle();
}
function initSceneStyleComposer(){
 if(styleComposer)return;
 const composer=new EffectComposer(renderer),pass=new RenderPass(scene,camera),ao=new SSAOPass(scene,camera,SW(),SH(),24),output=new OutputPass();
 ao.kernelRadius=.42;ao.minDistance=.0003;ao.maxDistance=.012;
 composer.setPixelRatio(Math.min(renderer.getPixelRatio(),1.4));composer.addPass(pass);composer.addPass(ao);composer.addPass(output);styleComposer=composer;styleAO=ao;resizeSceneStyle();
}
function applySceneStyleLight(){
 if(!ground||!renderer)return;const style=PlanCore.sceneStyle(state),soft=style==='soft',su=style==='su';
 if(!styleGroundOriginal)styleGroundOriginal=ground.material;
 if(!styleGroundSoft)styleGroundSoft=new THREE.ShadowMaterial({color:'#000000',opacity:.19});
 if(!styleFill){styleFill=new THREE.DirectionalLight(0xffffff,0);scene.add(styleFill);}
 ground.material=soft||su?styleGroundSoft:styleGroundOriginal;
 const shadowType=soft?THREE.VSMShadowMap:THREE.PCFSoftShadowMap;
 if(styleShadowType!==shadowType){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapPass?.dispose();sun.shadow.mapPass=null;sun.shadow.mapSize.setScalar(soft?2048:COARSE?2048:4096);renderer.shadowMap.type=shadowType;renderer.shadowMap.needsUpdate=true;styleShadowType=shadowType;}
 if(soft){
  hemi.color.set('#ffffff');hemi.groundColor.set('#b2ada4');hemi.intensity=opt.night?.18:1.65;
  if(!opt.night){sun.color.set('#fffaf0');sun.intensity=1.8+Math.max(0,Math.sin((opt.hour-6)/12*Math.PI))*.4;scene.background=new THREE.Color('#e6e6e3');renderer.toneMappingExposure=1.02;}
  const bounds=PlanCore.bounds(state,false),size=Math.max(bounds.w,bounds.h)/1000;styleFill.position.set(size*.8,size*.9,size*.6);styleFill.intensity=opt.night?.05:.55;
  sun.shadow.radius=8;sun.shadow.blurSamples=10;sun.shadow.bias=-.00015;sun.shadow.normalBias=.015;styleGroundSoft.color.set('#000000');
 }else if(su){
  hemi.color.set('#ffffff');hemi.groundColor.set('#d2cdc2');hemi.intensity=opt.night?.2:2.15;
  styleFill.intensity=opt.night?.05:.2;styleFill.position.set(-6,8,4);
  if(!opt.night){sun.color.set('#fffaf3');sun.intensity=1.55;scene.background=new THREE.Color('#f2efe8');renderer.toneMappingExposure=.98;}
  sun.shadow.radius=1.2;sun.shadow.bias=-.0002;sun.shadow.normalBias=.012;
 }else{
  hemi.color.set('#fff8ee');hemi.groundColor.set('#b9a88f');styleFill.intensity=0;sun.shadow.radius=1;sun.shadow.bias=-.0004;sun.shadow.normalBias=.02;
  ground.material.color.set(opt.night?0x2a2e38:0xf2eee7);
 }
 for(const row of styleMaterials.values())if(row.source.envMap)row.material.envMapIntensity=row.source.envMapIntensity*(su?.2:1);
}
function applyMainSceneStyle(){
 if(!inited)return;const style=PlanCore.sceneStyle(state),soft=style==='soft',su=style==='su',used=new Set();
 if(style!==appliedSceneStyle){appliedSceneStyle=style;applyLight();}
 for(const [root,role] of [[archUp,'architecture'],[archFloor,'floor'],[furnG,'furniture']])root.traverse(node=>{
  if(!node.isMesh)return;
  if(!styleOriginalMaterials.has(node))styleOriginalMaterials.set(node,node.material);
  const original=styleOriginalMaterials.get(node);
  const convert=source=>{
   if(!soft&&!su)return source;const key=style+':'+role+':'+source.uuid;used.add(key);let row=styleMaterials.get(key);
   if(!row){const m=source.clone();if(source===capMat)m.color.set(su?'#faf8f2':'#eeece5');else if(soft&&role!=='floor'&&!source.userData.wallFinishOwned&&m.color){const hsl={};m.color.getHSL(hsl);m.color.setHSL(hsl.h,hsl.s*.45,hsl.l).lerp(new THREE.Color('#e7e4dc'),.14);}
    if('roughness'in m)m.roughness=Math.max(role==='floor'?.7:.62,m.roughness);if('metalness'in m)m.metalness=Math.min(.55,m.metalness);if(source===glassMat){m.opacity=.19;m.roughness=.15;}
    if(su){if('roughness'in m)m.roughness=Math.max(.85,m.roughness);if('metalness'in m)m.metalness=Math.min(.15,m.metalness);if('envMapIntensity'in m)m.envMapIntensity=(source.envMapIntensity??1)*.2;}
    row={source,material:m};styleMaterials.set(key,row);
   }return row.material;
  };
  node.material=Array.isArray(original)?original.map(convert):convert(original);
 });
 for(const [key,row] of styleMaterials)if(!used.has(key)){row.material.dispose();styleMaterials.delete(key);}
 window.syncSceneStyleControls?.();
}
function sceneStyleLamps(){
 const style=PlanCore.sceneStyle(state);
 if(lampG)for(const node of lampG.children)if(node.isMesh)node.visible=style==='standard'||opt.mode==='walk'||opt.night;
 // Legacy box-edge helpers must not leak into SU's "no outline" mode.
 archUp?.traverse(node=>{if(node.isLine&&node.userData.walkOnly)node.visible=style!=='su'&&opt.mode==='walk';});
}
let editorBackdropKey='';
const editorBackdropPixel=new Uint8Array(4);
function syncSceneEditorBackground(){
 if(!active||!scene||!renderer)return;
 const key=[PlanCore.sceneStyle(state),opt.night,opt.hour,renderer.toneMappingExposure].join(':');
 if(key===editorBackdropKey)return;
 // Read the rendered empty backdrop, including lighting and output color conversion.
 // Sampling the live view would pick a wall or furniture when the user zooms in.
 const hidden=[],shadows=renderer.shadowMap.enabled;
 try{
  for(const node of scene.children)if(node!==ground&&!node.isLight&&node.visible){hidden.push(node);node.visible=false;}
  renderer.shadowMap.enabled=false;
  if(PlanCore.sceneStyle(state)==='soft'&&!styleRenderError){
   initSceneStyleComposer();const ao=styleAO.enabled;
   try{styleAO.enabled=false;styleComposer.render();}finally{styleAO.enabled=ao;}
  }else if(PlanCore.sceneStyle(state)==='su'&&!styleRenderError){
   initSUComposer();const enabled=suOutline.enabled;
   try{suOutline.enabled=false;suComposer.render();}finally{suOutline.enabled=enabled;}
  }else renderer.render(scene,camera);
  const gl=renderer.getContext();gl.readPixels(1,Math.max(0,gl.drawingBufferHeight-2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,editorBackdropPixel);
  if(editorBackdropPixel[3]){
   document.documentElement.style.setProperty('--scene-editor-bg',`rgb(${editorBackdropPixel[0]},${editorBackdropPixel[1]},${editorBackdropPixel[2]})`);
   document.body.dataset.sceneNight=String(opt.night);editorBackdropKey=key;
  }
 }catch(e){editorBackdropKey=key;}
 finally{for(const node of hidden)node.visible=true;renderer.shadowMap.enabled=shadows;}
}
function renderStyledScene(){
 syncSceneEditorBackground();
 sceneStyleLamps();
 if(PlanCore.sceneStyle(state)==='soft'&&!styleRenderError){try{initSceneStyleComposer();styleAO.enabled=opt.mode==='orbit'&&!anim;styleComposer.render();return;}catch(e){styleRenderError=e.message;toast('柔光阴影未能启用：'+e.message);}}
 if(PlanCore.sceneStyle(state)==='su'&&!styleRenderError){try{initSUComposer();suOutline.enabled=PlanCore.suEdges(state);suComposer.render();return;}catch(e){styleRenderError=e.message;toast('SU 描边未能启用：'+e.message);}}
 renderer.render(scene,camera);
}
function setSceneStyle(style){
 if(!['standard','soft','su'].includes(style)||PlanCore.sceneStyle(state)===style)return;
 styleRenderError='';mutate(()=>{state.presentation={...state.presentation,sceneStyle:style};});
}
function setSUEdges(enabled){if(PlanCore.suEdges(state)===!!enabled)return;styleRenderError='';mutate(()=>{state.presentation={...state.presentation,suEdges:!!enabled};});}
Object.assign(window.View3D,{setSceneStyle,setSUEdges,inspectSceneStyle:()=>({style:PlanCore.sceneStyle(state),suEdges:PlanCore.suEdges(state),outlineActive:PlanCore.sceneStyle(state)==='su'&&PlanCore.suEdges(state)&&!!suComposer&&!styleRenderError,mode:opt.mode,active,materialVariants:styleMaterials.size,postprocessing:!styleRenderError&&(PlanCore.sceneStyle(state)==='soft'&&!!styleComposer||PlanCore.sceneStyle(state)==='su'&&!!suComposer),ao:PlanCore.sceneStyle(state)==='soft'&&!!styleAO?.enabled,error:styleRenderError,camera:'perspective',capColors:archUp?[...new Set(archUp.children.flatMap(g=>g.children).filter(o=>o.userData.wallId).map(o=>o.material[2]?.color.getHexString()))]:[],renderedFloors:archFloor?.children.filter(o=>o.userData.room).map(o=>({id:o.userData.room,material:o.material.userData.floorMaterial,texture:o.material.map?.uuid})),ground:ground?.material.type,night:opt.night,lamps:lampG?.children.filter(o=>o.isMesh&&o.visible).length})});
