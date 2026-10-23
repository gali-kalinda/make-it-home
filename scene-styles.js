/* Main-canvas appearance switches; the interactive scene stays in place. */
const sceneStyleGroup=document.createElement('div');sceneStyleGroup.id='sceneStyleGroup';sceneStyleGroup.className='grp scene-style-group';sceneStyleGroup.setAttribute('role','group');sceneStyleGroup.setAttribute('aria-label','三维显示风格');
sceneStyleGroup.innerHTML='<span>风格</span><button class="btn" data-scene-style="standard" aria-pressed="true" title="原有场景光照与深色墙顶">标准</button><button class="btn" data-scene-style="soft" aria-pressed="false" title="浅色墙顶、柔和光线与细腻阴影；可直接布置家具">柔光</button><button class="btn" data-scene-style="su" aria-pressed="false" title="SketchUp 风格：清晰材质、简洁明暗，可开关描边">SU</button><label class="su-edge-option" hidden><span>描边<small>显示可见轮廓与转角</small></span><input id="suEdges" type="checkbox" role="switch" aria-label="SU 描边" checked></label>';
$('#viewSeg').after(sceneStyleGroup);
function syncSceneStyleControls(){const style=C.sceneStyle(state);sceneStyleGroup.querySelectorAll('[data-scene-style]').forEach(button=>{const on=button.dataset.sceneStyle===style;button.classList.toggle('on',on);button.setAttribute('aria-pressed',String(on));});sceneStyleGroup.querySelector('.su-edge-option').hidden=style!=='su';$('#suEdges').checked=C.suEdges(state);}
sceneStyleGroup.querySelectorAll('[data-scene-style]').forEach(button=>button.onclick=()=>window.View3D?.setSceneStyle(button.dataset.sceneStyle));
$('#suEdges').onchange=e=>window.View3D?.setSUEdges(e.target.checked);
const studioBeforeSceneStyles=window.updateStudio;window.updateStudio=function(){studioBeforeSceneStyles();syncSceneStyleControls();};
syncSceneStyleControls();
