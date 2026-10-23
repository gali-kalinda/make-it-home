function toggleWindow(model){
 if(model.spec.type==='fixed'){toast('固定窗不可开启，可在窗户属性中更换类型');return;}
 model.open=!model.open;const o=state.structure.openings.find(o=>o.id===model.id);if(o)o.open=model.open;save();renderStructure();if(ui.sel?.kind==='opening'&&ui.sel.id===model.id)renderPanel();
}
function updateWindows(dt){for(const m of windowModels){const target=m.open?1:0;m.cur+=(target-m.cur)*Math.min(1,dt*8);if(Math.abs(m.cur-target)<.0001)m.cur=target;m.pose(m.cur);}}
Object.assign(window.View3D,{
 focusWindow:id=>{const m=windowModels.find(m=>m.id===id);if(!m||!active||opt.mode!=='orbit')return false;const target=m.group.localToWorld(new THREE.Vector3(0,m.spec.height/2,0)),position=m.group.localToWorld(new THREE.Vector3(m.spec.width*.13,m.spec.height*.58,m.spec.insideSide*Math.max(2,m.spec.width*1.4)));flyTo(pose(target,position),500);return true;},
 isWindowActive:id=>active&&windowModels.some(m=>m.id===id),
 toggleWindow:id=>{const m=windowModels.find(m=>m.id===id);if(m)toggleWindow(m);},
 inspectWindows:()=>windowModels.map(m=>({id:m.id,type:m.spec.type,panes:m.spec.panes,color:m.spec.color,insideSide:m.spec.insideSide,open:m.open,progress:m.cur,parts:m.counts,leaves:m.leaves.map(l=>({position:l.leaf.position.toArray(),rotation:l.leaf.rotation.toArray().slice(0,3)}))})),
 windowScreenPoint:id=>{const m=windowModels.find(m=>m.id===id);if(!m)return null;const mesh=m.group.getObjectsByProperty('isMesh',true).find(o=>o.userData.windowPart==='handle')||m.group.children[0],p=mesh.getWorldPosition(new THREE.Vector3()).project(camera),r=renderer.domElement.getBoundingClientRect();return [r.x+(p.x+1)*r.width/2,r.y+(1-p.y)*r.height/2];}
});
