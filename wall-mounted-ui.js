/* Wall art and hanging furniture keep their wall surface through every edit path. */
$('#photoKind')?.insertAdjacentHTML('beforeend','<option value="art_abstract">装饰画</option><option value="tv">壁挂电视</option><option value="wall_cubby_shelf">壁挂架</option>');
const mountedSnapMove=snapMove;
snapMove=function(f,x,y){if(!WallMountedCore.isMounted(f))return mountedSnapMove(f,x,y);const target=WallMountedCore.placement(state,f,[x,y]);if(target){const {score,...values}=target;Object.assign(f,values);}return [f.cx,f.cy];};
const mountedPushOut=pushOut;
pushOut=function(f){if(WallMountedCore.isMounted(f))WallMountedCore.attach(state,f);else mountedPushOut(f);};
const mountedAddItem=addItem;
addItem=function(...args){try{return mountedAddItem(...args);}catch(e){toast(e.message);return false;}};
window.Studio.addItem=addItem;
const mountedMutate=mutate;
mutate=function(fn,options={}){const before=WallMountedCore.baseline(state);return mountedMutate(()=>{fn();WallMountedCore.reconcile(state,before);},options);};
const mountedCommit=commit;
commit=function(before){try{WallMountedCore.reconcile(state,JSON.parse(before));C.validate(state);mountedCommit(before);}catch(e){state=JSON.parse(before);syncDerived();toast(e.message);}};
const mountedRotate=rotateSel;
rotateSel=function(delta){const f=ui.sel?.kind==='furn'&&getF(ui.sel.id);if(!libDrag&&f&&WallMountedCore.isMounted(f))return toast('壁挂家具的朝向跟随墙面，请沿墙拖动调整位置');return mountedRotate(delta);};
const mountedPanel=renderPanel;
renderPanel=function(){mountedPanel();const f=ui.sel?.kind==='furn'&&getF(ui.sel.id);if(!f||!WallMountedCore.isMounted(f))return;const section=document.createElement('section');section.innerHTML='<h3>贴墙安装</h3><p class="small muted">沿墙拖动可调整位置，朝向自动跟随墙面；会避开门窗和挖空区域。</p>';if(!$('#decorElevation')&&!$('#sceneFurnitureElevation')){section.insertAdjacentHTML('beforeend','<label class="small">底部离地高度（mm）<input id="wallMountElevation" type="number" min="0" max="10000" value="'+(f.elevation||0)+'"></label>');section.querySelector('input').onchange=e=>{const value=Number(e.target.value);if(Number.isFinite(value)&&value>=0)mutate(()=>getF(f.id).elevation=value);};}$('#panel').prepend(section);if($('#fR'))$('#fR').disabled=true;if($('#aRot'))$('#aRot').disabled=true;};
window.WallMountedFurniture={isMounted:WallMountedCore.isMounted};
