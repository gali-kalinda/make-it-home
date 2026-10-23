/* Public, versioned sample. Opening it never overwrites an unsaved project. */
(function(){
 'use strict';
 const settings=document.querySelector('#editorSettings'),welcome=document.querySelector('#welcome');
 const actions=document.createElement('div');actions.className='public-start-actions';
 actions.innerHTML='<button type="button" class="btn" id="welcomeNew">新建项目</button><button type="button" class="btn" id="viewPublicDemo">案例查看 <span>↗</span></button>';
 welcome.querySelector('#welcomeUpload').after(actions);
 const settingButton=document.createElement('button');settingButton.type='button';settingButton.className='btn';settingButton.textContent='案例查看';settingButton.id='settingsPublicDemo';document.querySelector('#newProject').after(settingButton);
 document.querySelector('#legacyDemo').hidden=true;
 document.body.insertAdjacentHTML('beforeend',`<dialog id="publicDemoDialog" class="studio-dialog public-demo-dialog" aria-labelledby="publicDemoTitle">
 <button type="button" class="close-dialog" aria-label="关闭演示案例">×</button>
 <div class="history-kicker">MAKE IT HOME · DEMO</div><h2 id="publicDemoTitle">从这个家开始探索</h2>
 <p>一份完整的布置案例，可以直接查看、修改并另存为自己的方案。</p>
 <div class="public-demo-card"><img src="examples/studio-35m2.svg" alt="35㎡小家平面布局"><div><h3>35㎡小家 · 完整布置</h3><p>3 个房间 · 26 件家具 · 约 35.42 m²</p><p>包含墙体、门窗、地面材质和家具模型，支持 2D 与 3D。</p><small>尺寸为估算值。案例已内置，查看无需配置 AI 接口。</small></div></div>
 <p id="publicDemoStatus" role="status" aria-live="polite">打开前会自动备份当前项目。</p>
 <div class="dialog-actions"><button type="button" class="btn primary" id="openPublicDemo">打开案例</button></div></dialog>`);
 const dialog=document.getElementById('publicDemoDialog'),open=document.getElementById('openPublicDemo'),status=document.getElementById('publicDemoStatus');let busy=false;
 function show(){settings.open=false;dialog.showModal();}
 document.getElementById('welcomeNew').onclick=()=>NewProject.create();
 document.getElementById('viewPublicDemo').onclick=show;settingButton.onclick=show;
 dialog.querySelector('.close-dialog').onclick=()=>{if(!busy)dialog.close();};
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('keydown',e=>e.stopPropagation());
 open.onclick=async()=>{
  if(busy||PlanHistory.busy)return;
  if(switching||recognizing||window.PlanPipeline?.inspect?.()?.busy||window.FurnitureThreeViews?.inspect?.()?.busy||window.PhotoFurniture?.getStatus?.()?.busy||typeof sceneExtractBusy!=='undefined'&&sceneExtractBusy){status.textContent='请等待当前识别、生成或视图切换完成后再打开案例。';return;}
  busy=true;open.disabled=true;dialog.setAttribute('aria-busy','true');status.textContent='正在读取案例并备份当前项目…';
  const app=document.querySelector('.app'),wasInert=app.inert;app.inert=true;
  try{
   await window.planRestorationReady;await window.PhotoFurniture?.libraryReady?.();
   const r=await fetch('examples/studio-35m2.json');if(!r.ok)throw Error('案例文件读取失败，请检查安装文件是否完整');
   const plan=C.validate(await r.json());
   await PlanHistory.save('打开案例前备份 · '+Studio.getState().title);
   await NewProject.prepare();Studio.importPlan(plan);dialog.close();toast('已打开演示案例，原项目已备份到历史方案');
  }catch(e){status.textContent='打开未完成：'+(e.message||'读取失败')+'。原项目仍保留。';}
  finally{app.inert=wasInert;busy=false;open.disabled=false;dialog.removeAttribute('aria-busy');}
 };
 window.PublicDemo={open:show,inspect:()=>({busy})};
})();
