/* Data-only orthographic drawings. API responses never become executable SVG/HTML. */
(function(root){
 const labels={front:'正视图',side:'右视图',top:'俯视图'};
 const num=(v,min=0,max=1)=>Number.isFinite(v)&&v>=min&&v<=max;
 const text=(v,n=300)=>String(v||'').slice(0,n);
 const color=v=>v==='none'||/^#[\da-f]{6}$/i.test(v);
 function validate(raw){
  if(raw?.schema==='furniture-three-views-image-v1'){
   const image=v=>typeof v==='string'&&v.length<16*1024*1024&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
   if(!image(raw.sheet)||!Array.isArray(raw.views)||raw.views.length!==3||new Set(raw.views.map(v=>v.id)).size!==3||raw.views.some(v=>!labels[v.id]||!image(v.image)))throw Error('请提供完整的三视图图片');
   return {schema:raw.schema,name:text(raw.name,120),description:text(raw.description,800),observations:[],uncertainties:['由单张照片生成的不可见结构仍需核对'],sheet:raw.sheet,views:['front','side','top'].map(id=>({id,image:raw.views.find(v=>v.id===id).image}))};
  }
  if(raw?.schema!=='furniture-three-views-v1'||!Array.isArray(raw.views)||raw.views.length!==3)throw Error('三视图数据不完整，请重新生成');
  const seen=new Set(),views=raw.views.map(v=>{
   if(!labels[v?.id]||seen.has(v.id)||!Array.isArray(v.shapes)||!v.shapes.length||v.shapes.length>80)throw Error('三视图缺少独立的正视、右视或俯视图');seen.add(v.id);
   const shapes=v.shapes.map(s=>{
    if(!['rect','ellipse','polygon','polyline'].includes(s?.shape)||!color(s.fill)||!color(s.stroke)||s.fill==='none'&&s.stroke==='none')throw Error('三视图绘图数据无效');
    const p={shape:s.shape,fill:s.fill,stroke:s.stroke,width:num(s.width,.001,.025)?s.width:.004};
    if(['polygon','polyline'].includes(s.shape)){
     if(!Array.isArray(s.points)||s.points.length<(s.shape==='polygon'?3:2)||s.points.length>64||!s.points.every(q=>Array.isArray(q)&&q.length===2&&q.every(n=>num(n))))throw Error('三视图轮廓坐标无效');p.points=s.points.map(q=>q.slice());
    }else{
     if(!['x','y','w','h'].every(k=>num(s[k]))||!s.w||!s.h||s.x+s.w>1.001||s.y+s.h>1.001)throw Error('三视图部件范围无效');for(const k of ['x','y','w','h'])p[k]=s[k];
     if(s.shape==='rect')p.radius=num(s.radius,0,.2)?s.radius:0;
    }return p;
   });return {id:v.id,shapes};
  }).sort((a,b)=>Object.keys(labels).indexOf(a.id)-Object.keys(labels).indexOf(b.id));
  return {schema:'furniture-three-views-v1',name:text(raw.name,120),kind:text(raw.kind,60),description:text(raw.description,800),observations:(Array.isArray(raw.observations)?raw.observations:[]).slice(0,10).map(v=>text(v)),uncertainties:(Array.isArray(raw.uncertainties)?raw.uncertainties:[]).slice(0,10).map(v=>text(v)),views};
 }
 const signature=f=>JSON.stringify([f.id,f.assetId,f.w,f.d,f.h]);
 function replace(s,target,asset,revision){
  const f=s.furniture.find(f=>f.id===target.id);if(!f||signature(f)!==target.signature)throw Error('原家具或尺寸已改变，请重新打开面板');
  if(!revision.confirmedAt||!revision.modelApprovedAt||!asset?.id||!asset.data)throw Error('请先确认三视图及新模型');
  s.assets[asset.id]=asset;
  // Replace this instance only; keep original assets/catalogue for undo and other instances.
  f.modelRevision={...revision,previousAssetId:f.assetId};f.assetId=asset.id;f.photoRecipe=asset.recipe;f.reference=revision.source;f.approximate=true;f.material='original';
  return f;
 }
 const api={labels,validate,signature,replace};root.FurnitureThreeViewsCore=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
