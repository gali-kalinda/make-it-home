(function(root,factory){const api=factory(root.PlanCore||(typeof require==='function'?require('./core.js'):null));if(typeof module==='object')module.exports=api;else root.RenderReconcileCore=api;})(globalThis,C=>{
 const clone=v=>JSON.parse(JSON.stringify(v));
 function group(t){if(/sofa/.test(t))return 'sofa';if(/photo_tv_cabinet|tvstand|rounded_tv_cabinet/.test(t))return 'console';if(/floorlamp|standing_lamp|cone_floor_lamp/.test(t))return 'floorlamp';if(/plant/.test(t))return 'plant';if(/coffee|round_tripod_table/.test(t))return 'coffee';if(/rug/.test(t))return 'rug';if(/curtain/.test(t))return 'curtain';if(/^art_/.test(t))return 'art';return t;}
 const stamp=f=>JSON.stringify([f.id,f.type,f.cx,f.cy,f.w,f.d,f.h||null,f.rot,f.assetId||null,f.elevation||0]);
 const roomFurniture=(s,id)=>{const r=s.structure.rooms.find(r=>r.id===id);return r?s.furniture.filter(f=>C.inside([f.cx,f.cy],r.poly)):[];};
 function layoutMatches(s,room,layout){return !!layout&&JSON.stringify(room.poly)===JSON.stringify(layout.roomPoly)&&layout.anchors.every(a=>{const f=s.furniture.find(f=>f.id===a.id);return f&&stamp(f)===a.stamp;});}
 function create(s,items,{roomId,imageHash,layout,project}={}){
  const room=s.structure.rooms.find(r=>r.id===roomId);if(!room)throw Error('请先选择效果图对应的房间');const originals=roomFurniture(s,roomId),used=new Set(),exact=layoutMatches(s,room,layout),center=C.center(room.poly);
  const rows=items.map((item,i)=>{const hint=exact?layout.items[item.id]:null;let original=hint?.originalId?originals.find(f=>f.id===hint.originalId):null;
   if(!original){const matches=originals.filter(f=>!used.has(f.id)&&group(f.type)===group(item.type));if(matches.length===1)original=matches[0];}
   if(original)used.add(original.id);const prior=s.furniture.find(f=>f.renderDesign?.imageHash===imageHash&&f.renderDesign?.candidateId===item.id&&f.renderDesign?.roomId===roomId);if(prior){original=prior;used.add(prior.id);}
   const projected=!hint&&!original&&project?.(item),p=original?{cx:original.cx,cy:original.cy,rot:original.rot,elevation:original.elevation||0}:hint||projected||{cx:center[0],cy:center[1],rot:0,elevation:item.elevation||0};
   return {id:item.id,name:item.name,type:item.type,selected:item.selected!==false,action:original?'keep':'add',originalId:original?.id||'',cx:p.cx,cy:p.cy,rot:p.rot||0,elevation:p.elevation||item.elevation||0,placementBasis:original?'保留原位':hint?'本次 GPT 对照原方案估算位置':projected?'按当前相机投影估算，需核对':'未关联相机，请在平面预览中调整位置',positionReviewed:!!original||!!hint,item:clone(item)};
  });
  return {roomId,imageHash,roomPoly:clone(room.poly),originals:originals.map(f=>({id:f.id,name:f.name,type:f.type,stamp:stamp(f),cx:f.cx,cy:f.cy,w:f.w,d:f.d,rot:f.rot})),rows,removeIds:[],applyFinishes:exact,finishes:exact?clone(layout.finishes):null,exactLayout:exact};
 }
 function validate(s,r,entries={}){
  const room=s.structure.rooms.find(room=>room.id===r.roomId);if(!room||JSON.stringify(room.poly)!==JSON.stringify(r.roomPoly))throw Error('房间结构已改变，请重新核对效果图布局');
  const selected=r.rows.filter(row=>row.selected&&row.action!=='omit'),owners=new Set();
  for(const row of selected){if(!['keep','add','replace'].includes(row.action))throw Error('家具处理方式无效');if(![row.cx,row.cy,row.rot,row.elevation].every(Number.isFinite)||row.elevation<0||row.elevation>10000)throw Error('家具位置或高度无效');
   const existing=s.furniture.find(f=>f.id===row.originalId);if(row.action==='keep'||row.action==='replace'){if(!existing||!C.inside([existing.cx,existing.cy],room.poly))throw Error('关联的原有家具已不存在或不在该房间');if(owners.has(existing.id))throw Error('同一件原有家具不能关联多次');owners.add(existing.id);const original=r.originals.find(f=>f.id===existing.id);if(original&&stamp(existing)!==original.stamp)throw Error('原有家具已改变，请重新核对后再应用');}
   if(row.action!=='keep'){if(!row.positionReviewed)throw Error('请勾选确认每件新增家具的位置');if(!C.inside([row.cx,row.cy],room.poly))throw Error('新增家具中心必须位于所选房间内');const entry=entries[row.id];if(!entry||!s.assets[entry.assetId])throw Error('请先生成所选家具的三维模型');}
  }
  for(const id of r.removeIds){const old=r.originals.find(f=>f.id===id),now=s.furniture.find(f=>f.id===id);if(!old||!now||stamp(now)!==old.stamp)throw Error('待移除的家具已改变，请重新核对');if(owners.has(id))throw Error('保留或替换的家具不能同时移除');}
  return selected;
 }
 function apply(s,r,entries={}){
  const selected=validate(s,r,entries),kept=[],added=[],removed=[],replaced=[];
  for(const row of selected){if(row.action==='keep'){kept.push(row.originalId);continue;}
   const prior=s.furniture.find(f=>f.renderDesign?.imageHash===r.imageHash&&f.renderDesign?.candidateId===row.id&&f.renderDesign?.roomId===r.roomId);if(prior){kept.push(prior.id);continue;}
   const e=entries[row.id],f={id:C.id('furn'),type:e.type,name:e.name,cx:row.cx,cy:row.cy,w:e.w,d:e.d,h:e.h,rot:((row.rot%360)+360)%360,color:e.color,assetId:e.assetId,catalogueId:e.id,approximate:true,reference:e.reference,photoRecipe:e.recipe,dimensionSource:e.dimensionSource,elevation:row.elevation,dimensionEstimate:e.dimensionEstimate,sceneExtraction:e.sceneExtraction,material:'original',renderDesign:{imageHash:r.imageHash,candidateId:row.id,roomId:r.roomId,placementBasis:row.placementBasis}};
   if(row.action==='replace'){const index=s.furniture.findIndex(f=>f.id===row.originalId);f.id=row.originalId;s.furniture[index]=f;replaced.push(f.id);}else{s.furniture.push(f);added.push(f.id);}
  }
  for(const id of r.removeIds){s.furniture=s.furniture.filter(f=>f.id!==id);removed.push(id);}
  if(r.applyFinishes&&r.finishes){const st=s.rooms[r.roomId];if(C.floorMaterials[r.finishes.floor]){st.mat=r.finishes.floor;delete st.surfaceLayout;}if(/^#[a-f\d]{6}$/i.test(r.finishes.wallColor))st.wallColor=r.finishes.wallColor;}
  return {kept,added,removed,replaced};
 }
 return {group,stamp,roomFurniture,layoutMatches,create,validate,apply};
});
