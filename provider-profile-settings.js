/* Two roles: the shared recognition/modelling connection and image output. */
(function(){
 const settings=document.querySelector('#editorSettings'),entry=settings.querySelector('.vision-settings-entry');
 entry.insertAdjacentHTML('beforeend','<button class="btn" id="openImageEditSettings">图像生成接口 <span id="imageSettingsBadge">未设置</span></button>');
 const dialog=document.createElement('dialog');dialog.className='studio-dialog vision-settings-dialog';dialog.id='providerSettingsDialog';document.body.append(dialog);
 let busy=false,saved=null;
 async function api(action='',method='GET',data){
  const r=await fetch('/api/settings/image-edit'+action,{method,cache:'no-store',headers:{'Content-Type':'application/json','X-Studio-Settings':'1'},...(data?{body:JSON.stringify(data)}:{})});
  const value=await r.json();if(!r.ok)throw Error(value.error||'接口操作失败');return value;
 }
 function badge(value){document.querySelector('#imageSettingsBadge').textContent=value.configured?'已设置':'未设置';}
 function message(text,error=false){const el=dialog.querySelector('[role=status]');el.textContent=text;el.classList.toggle('error',error);}
 function lock(on){busy=on;dialog.querySelectorAll('input,select,button').forEach(el=>el.disabled=on);}
 function hint(){
  const el=dialog.querySelector('#providerImageHint');let host='';try{host=new URL(dialog.querySelector('#providerBase').value).hostname;}catch{}
  const sf=['api.siliconflow.cn','api.siliconflow.com'].includes(host),wrong=sf&&dialog.querySelector('#providerProtocol').value!=='siliconflow';
  el.textContent=wrong?'硅基流动使用 images/generations，请选择“硅基流动生图”协议。':'需要支持参考图输入、并实际返回图片的服务。请按服务商文档选择协议。';el.classList.toggle('error',wrong);
 }
 function draft(){return {base:dialog.querySelector('#providerBase').value.trim(),model:dialog.querySelector('#providerModel').value.trim(),key:dialog.querySelector('#providerKey').value.trim(),protocol:dialog.querySelector('#providerProtocol').value};}
 async function open(){
  if(busy)return;settings.open=false;
  dialog.innerHTML=`<button class="close-dialog" aria-label="关闭图像生成接口">×</button><div class="eyebrow">AI CONNECTION</div><h2>图像生成接口</h2><p class="muted">用于根据家具参考图和外观要求生成白底三视图。确认图片后，再由模型生成接口建模。</p><form autocomplete="off"><label for="providerProtocol">接口协议</label><select id="providerProtocol"><option value="image-edits">图片编辑 / images/edits</option><option value="siliconflow">硅基流动生图 / images/generations</option><option value="gemini">Gemini 原生图片输出</option><option value="chat-image">对话式图片输出 / chat/completions</option></select><label for="providerBase">接口地址</label><input id="providerBase" type="url" required spellcheck="false" placeholder="服务商提供的基础接口地址"><label for="providerModel">模型名称</label><input id="providerModel" required spellcheck="false" placeholder="填写支持参考图生成图片的模型名"><p id="providerImageHint" class="small muted" aria-live="polite"></p><label for="providerKey">API 密钥</label><input id="providerKey" type="password" autocomplete="new-password" placeholder="粘贴对应平台密钥"><small>密钥加密保存在本机，不进入方案或导出文件。</small><p role="status" aria-live="polite"></p><div class="vision-settings-actions"><button type="button" class="btn" id="providerTest">测试图片输出</button><button class="btn primary" type="submit">保存此配置</button></div><small>测试会实际生成一张测试图片，使用该服务的额度。</small><div id="providerImageTest"></div></form>`;
  dialog.querySelector('.close-dialog').onclick=()=>dialog.close();dialog.showModal();lock(true);message('正在读取配置…');
  try{saved=await api();badge(saved);dialog.querySelector('#providerBase').value=saved.base;dialog.querySelector('#providerModel').value=saved.model;dialog.querySelector('#providerKey').placeholder=saved.hasKey?'已保存；留空保留现有密钥':'粘贴对应平台密钥';dialog.querySelector('#providerProtocol').value=saved.protocol;message(saved.configured?'已保存，可测试或修改。':'填写后保存；图像生成与模型生成密钥独立保留。');}catch(e){message(e.message,true);}finally{lock(false);}
  hint();for(const id of ['providerProtocol','providerBase','providerModel'])dialog.querySelector('#'+id).addEventListener('input',()=>{hint();dialog.querySelector('#providerImageTest').replaceChildren();message('配置已修改，尚未保存或测试。');});
  dialog.querySelector('form').onsubmit=async e=>{e.preventDefault();if(busy||!e.target.reportValidity())return;const data=draft();lock(true);try{saved=await api('','POST',data);badge(saved);dialog.querySelector('#providerKey').value='';dialog.querySelector('#providerKey').placeholder='已保存；留空保留现有密钥';message('已保存，后续三视图生成使用这个图像接口。');}catch(e){message(e.message,true);}finally{data.key='';lock(false);}};
  dialog.querySelector('#providerTest').onclick=async()=>{if(busy||!dialog.querySelector('form').reportValidity())return;const data=draft();lock(true);message('正在请求服务商验证图片输出…');try{const result=await api('/test','POST',data);message(result.message);if(result.image){const img=document.createElement('img');img.src=result.image;img.alt='接口实际生成的测试图片';img.style.cssText='max-width:100%;max-height:180px;object-fit:contain';dialog.querySelector('#providerImageTest').replaceChildren(img);}}catch(e){message(e.message,true);}finally{data.key='';lock(false);}};
 }
 dialog.addEventListener('keydown',e=>e.stopPropagation());dialog.addEventListener('close',()=>{const key=dialog.querySelector('#providerKey');if(key)key.value='';});
 entry.querySelector('#openImageEditSettings').onclick=open;window.ImageEditSettings={open};
 // Preserve old callers without exposing provider-specific configuration branches.
 window.ProviderProfiles={open:()=>window.ModelSettings.open()};
 api().then(badge).catch(()=>{document.querySelector('#imageSettingsBadge').textContent='待配置';});
})();
