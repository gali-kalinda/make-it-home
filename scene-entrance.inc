let walkEntrance=null;
function positionWalkAtEntrance(){
 walkEntrance=EntranceCore.start(state,(x,y)=>blocked(wx(x),wz(y)));
 const p=walkEntrance.position||findSpawn(),t=walkEntrance.target||(()=>{const r=state.structure.rooms.find(r=>PlanCore.inside(p,r.poly)),center=r?PlanCore.center(r.poly):[p[0]+1000,p[1]];return Math.hypot(center[0]-p[0],center[1]-p[1])>100?center:[p[0]+1000,p[1]];})();
 camera.position.set(wx(p[0]),1.6,wz(p[1]));camera.lookAt(wx(t[0]),1.6,wz(t[1]));camera.updateMatrixWorld(true);syncWalkTexts();
}
Object.assign(window.View3D,{inspectEntrance:()=>({detection:EntranceCore.detect(state),start:walkEntrance,camera:camera?.position.toArray(),direction:camera?.getWorldDirection(new THREE.Vector3()).toArray()})});
const originalEntranceWalkTexts=syncWalkTexts;syncWalkTexts=function(){originalEntranceWalkTexts();if(opt.mode!=='walk'||!walkEntrance)return;$('#wo1').textContent=walkEntrance.position?(walkEntrance.door.explicit?'点击开始，从指定入户门看向室内':walkEntrance.ambiguous?'从外墙门候选看向室内 · 可在门属性中更正':'点击开始，从入户门看向室内'):walkEntrance.reason;};
