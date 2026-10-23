(function(){
'use strict';
const H=window.PlanHistoryCore,$h=id=>document.getElementById(id),esc=H.escape;
const service=H.createService(H.createRepository(window.indexedDB),{
 capture:()=>Studio.getState(),validate:p=>C.validate(p),createBlank:()=>({...C.blank(),title:'未命名项目',emptyProject:true}),
 apply:async p=>{if(is3D()&&View3D.inspect().mode==='walk')View3D.setMode('orbit');if(p.emptyProject)await window.NewProject?.prepare();Studio.importPlan(p);}
});
const settings=$h('editorSettings'),section=document.createElement('div');section.className='history-settings';
section.innerHTML='<h4>历史方案</h4><div><button id="saveHistoryPlan" class="btn">保存历史方案</button><button id="viewHistoryPlans" class="btn">查看历史方案</button></div>';
settings.querySelector('.settings-file-actions').previousElementSibling.before(section);
document.body.insertAdjacentHTML('beforeend',`
<dialog id="saveHistoryDialog" class="studio-dialog compact" aria-labelledby="saveHistoryHeading">
 <button type="button" class="close-dialog" aria-label="关闭保存历史方案">×</button>
 <div class="history-kicker">留住每一个家的想法</div><h2 id="saveHistoryHeading">保存历史方案</h2>
 <p>保存此刻的户型、家具位置、材质与模型，之后随时回来继续布置。</p>
 <form id="saveHistoryForm"><label for="historyPlanName">方案名称</label><input id="historyPlanName" maxlength="80" required autocomplete="off"><p class="history-error" role="alert" id="historySaveError"></p><div class="dialog-actions"><button type="button" class="btn" id="cancelSaveHistory">取消</button><button type="submit" class="btn primary" id="commitHistoryPlan">保存方案</button></div></form>
 <p class="history-local">历史方案保存在当前浏览器中。</p>
</dialog>
<dialog id="historyDialog" class="studio-dialog history-dialog" aria-labelledby="historyHeading">
 <button type="button" class="close-dialog" aria-label="关闭历史方案">×</button>
 <div class="history-kicker">家的每一种可能</div><h2 id="historyHeading">历史方案</h2>
 <p class="history-intro">先预览，再恢复。恢复前会自动备份当前方案。</p>
 <div id="historyFeedback" role="status" aria-live="polite"></div>
 <div class="history-browser"><div id="historyList" aria-label="已保存的历史方案"></div><section id="historyDetail" aria-label="方案预览"></section></div>
 <p class="history-local">仅保存在当前浏览器；跨设备可在设置中导出、导入 JSON 方案。</p>
</dialog>`);
const saveDialog=$h('saveHistoryDialog'),historyDialog=$h('historyDialog');let selectedId=null,loading=0,operation=false;
const date=value=>new Date(value).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});
const kindLabel=kind=>({'before-restore':'恢复前备份','before-new':'新建前备份',manual:'手动保存'}[kind]||'手动保存');
const stats=m=>`${m.roomCount} 个房间 · ${m.furnitureCount} 件家具 · ${m.estimated?'约 ':''}${m.area.toFixed(2)} m²`;
const image=m=>'<img class="history-thumb" alt="'+esc(m.name)+'的布局缩略图" src="data:image/svg+xml;charset=utf-8,'+encodeURIComponent(m.preview)+'">';
function errorText(e){return e?.name==='QuotaExceededError'?'本地存储空间不足，未能保存。请先在设置中导出 JSON 备份方案。':e?.message||'本地记录读取失败，请重试';}
function close(dialog){if(operation)return;dialog.close();}
saveDialog.querySelector('.close-dialog').onclick=()=>close(saveDialog);$h('cancelSaveHistory').onclick=()=>close(saveDialog);historyDialog.querySelector('.close-dialog').onclick=()=>close(historyDialog);
for(const d of [saveDialog,historyDialog]){d.addEventListener('cancel',e=>{if(operation)e.preventDefault();});d.addEventListener('keydown',e=>e.stopPropagation());}
$h('saveHistoryPlan').onclick=()=>{settings.open=false;$h('historySaveError').textContent='';$h('historyPlanName').value='我的方案 · '+date(new Date());saveDialog.showModal();$h('historyPlanName').select();};
$h('saveHistoryForm').onsubmit=async e=>{e.preventDefault();if(operation)return;const name=$h('historyPlanName').value.trim();if(!name){$h('historySaveError').textContent='请填写方案名称';return;}
 operation=true;$h('commitHistoryPlan').disabled=true;$h('commitHistoryPlan').textContent='正在保存…';$h('historySaveError').textContent='';
 try{await service.save(name);saveDialog.close();toast('已保存历史方案：'+name);}catch(e){$h('historySaveError').textContent=errorText(e);}finally{operation=false;$h('commitHistoryPlan').disabled=false;$h('commitHistoryPlan').textContent='保存方案';}
};
function choose(meta){
 selectedId=meta.id;for(const b of $h('historyList').querySelectorAll('[data-history-id]'))b.setAttribute('aria-pressed',String(b.dataset.historyId===selectedId));
 $h('historyDetail').innerHTML=image(meta)+'<div class="history-detail-copy"><span class="history-tag">'+esc(kindLabel(meta.kind))+'</span><h3>'+esc(meta.name)+'</h3><p>'+esc(date(meta.createdAt))+'</p><p>'+stats(meta)+'</p><p>'+meta.wallCount+' 段墙体 · 包含门窗、材质和自定义模型</p><button class="btn primary" id="restoreHistoryPlan">恢复此方案</button><small>当前方案会先存为一份“恢复前备份”。</small></div>';
 $h('restoreHistoryPlan').onclick=async()=>{if(operation)return;operation=true;historyDialog.setAttribute('aria-busy','true');$h('historyFeedback').textContent='正在备份当前方案并恢复…';$h('restoreHistoryPlan').disabled=true;
 try{const result=await service.restore(meta.id);historyDialog.close();toast('已恢复“'+result.restored.name+'”，当前方案已自动备份');}
 catch(e){$h('historyFeedback').textContent='恢复未完成：'+errorText(e);}
 finally{operation=false;historyDialog.removeAttribute('aria-busy');if($h('restoreHistoryPlan'))$h('restoreHistoryPlan').disabled=false;}
 };
}
async function refresh(){const seq=++loading;$h('historyFeedback').textContent='正在读取历史方案…';$h('historyList').replaceChildren();$h('historyDetail').replaceChildren();
 try{const rows=await service.list();if(seq!==loading)return;$h('historyFeedback').textContent=rows.length?'共 '+rows.length+' 份历史方案':'';
 if(!rows.length){$h('historyList').innerHTML='<div class="history-empty"><b>还没有历史方案</b><p>在设置中点击“保存历史方案”，留住当前布置。</p></div>';return;}
 for(const meta of rows){const b=document.createElement('button');b.type='button';b.className='history-card';b.dataset.historyId=meta.id;b.innerHTML=image(meta)+'<span><strong>'+esc(meta.name)+'</strong><time>'+esc(date(meta.createdAt))+'</time><small>'+stats(meta)+'</small>'+(meta.kind!=='manual'?'<em>'+esc(kindLabel(meta.kind))+'</em>':'')+'</span>';b.onclick=()=>{if(!operation)choose(meta);};$h('historyList').append(b);}
 choose(rows.find(m=>m.id===selectedId)||rows[0]);
 }catch(e){if(seq===loading)$h('historyFeedback').textContent=errorText(e);}
}
$h('viewHistoryPlans').onclick=()=>{settings.open=false;historyDialog.showModal();refresh();};
window.PlanHistory=Object.assign(service,{refresh});
})();
