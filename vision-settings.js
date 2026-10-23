(function(){
 'use strict';
 const el=id=>document.getElementById(id),settings=el('editorSettings');
 const section=document.createElement('div');section.className='vision-settings-entry';
 section.innerHTML='<h4>AI 接口配置</h4><button id="openVisionSettings" class="btn">模型生成接口 <span id="visionSettingsBadge">未设置</span></button>';
 settings.querySelector('.settings-file-actions').previousElementSibling.before(section);
 document.body.insertAdjacentHTML('beforeend',`<dialog id="visionSettingsDialog" class="studio-dialog vision-settings-dialog" aria-labelledby="visionSettingsTitle"><button type="button" class="close-dialog" aria-label="关闭 AI 接口配置">×</button><div class="eyebrow">AI CONNECTION</div><h2 id="visionSettingsTitle">AI 接口配置</h2><p class="muted">用于识别户型图、家具图片和效果图中的家具。</p><form id="visionSettingsForm" autocomplete="off"><label for="visionBase">接口地址</label><input id="visionBase" type="url" required placeholder="https://api.siliconflow.cn/v1" spellcheck="false"><small>硅基流动填写到 /v1 即可。</small><label for="visionModel">模型名称</label><input id="visionModel" type="text" required placeholder="Qwen/Qwen3-VL-32B-Instruct" spellcheck="false"><label for="visionKey">API 密钥</label><input id="visionKey" type="password" autocomplete="new-password" spellcheck="false" placeholder="粘贴你的 API Key"><small id="visionKeyHint">密钥加密保存在本机服务端，不进入户型方案或导出文件。</small><p id="visionSettingsStatus" role="status" aria-live="polite"></p><div class="vision-settings-actions"><button type="button" class="btn" id="testVisionSettings">测试连接</button><button type="submit" class="btn primary" id="saveVisionSettings">保存配置</button></div><div class="vision-settings-foot"><span>测试会发送内置测试图片，使用少量模型额度。</span><button type="button" id="clearVisionKey" class="btn">清除密钥</button></div></form></dialog>`);
 let saved=null,busy=false;
 const dialog=el('visionSettingsDialog'),form=el('visionSettingsForm'),status=el('visionSettingsStatus');
 el('visionSettingsTitle').textContent='模型生成接口';dialog.querySelector('.close-dialog').setAttribute('aria-label','关闭模型生成接口');dialog.querySelector('h2 + p').textContent='用于识别户型、家具图片，并根据确认的三视图生成模型部件。填写你使用的服务商地址、模型名称和密钥。';
 el('visionBase').nextElementSibling.textContent='Step 5 Preview：https://api.stepfun.com/v1；DeepSeek：https://api.deepseek.com。也支持其他 OpenAI 兼容接口。';
 status.insertAdjacentHTML('afterend','<details id="visionTestDetails" class="vision-test-details" hidden><summary>查看测试详情</summary><div id="visionTestSummary"></div></details>');
 function showDiagnostics(data){el('visionTestDetails').hidden=!data;if(!data)return;const lines=[`服务商：${data.provider}（${data.host}）`,`模型：${data.model}`,`结束原因：${data.finishReason} · 输出预算：${data.maxOutputTokens} token`,`请求次数：${data.attempts} · JSON 模式：${data.jsonMode==='prompt_json'?'提示词约束':'接口 JSON 模式'}`];if(data.adjustments?.length)lines.push('兼容调整：'+data.adjustments.join('、'));el('visionTestSummary').replaceChildren(...lines.map(line=>{const p=document.createElement('p');p.textContent=line;return p;}));}
 async function api(path,method='GET',data){
  const response=await fetch('/api/settings/vision'+path,{method,cache:'no-store',headers:{'Content-Type':'application/json','X-Studio-Settings':'1'},...(data?{body:JSON.stringify(data)}:{})});
  let result;try{result=await response.json();}catch{throw Error('服务尚未更新，请重新启动本机网站服务。');}
  if(!response.ok){const error=Error(result.error||'配置操作失败');error.diagnostics=result.diagnostics;error.code=result.code;throw error;}return result;
 }
 function summary(data){saved=data;el('visionSettingsBadge').textContent=data.configured?'已设置':'未设置';el('clearVisionKey').disabled=!data.hasKey;el('visionKey').placeholder=data.hasKey?'已保存；留空保留现有密钥':'粘贴你的 API Key';}
 function message(text,error=false){status.textContent=text;status.classList.toggle('error',error);}
 function lock(on){busy=on;for(const field of form.querySelectorAll('input,button'))field.disabled=on;if(!on)el('clearVisionKey').disabled=!saved?.hasKey;}
 function draft(){return {base:el('visionBase').value.trim(),model:el('visionModel').value.trim(),key:el('visionKey').value.trim()};}
 async function load(){showDiagnostics(null);const data=await api('');summary(data);el('visionBase').value=data.base;el('visionModel').value=data.model;el('visionKey').value='';message(data.loadError?'无法读取原有密钥，请重新填写并保存。':data.configured?'已配置，可测试图片识别连接。':'填写接口地址、图片识别模型和对应的密钥后保存。',data.loadError);}
 el('openVisionSettings').onclick=async()=>{settings.open=false;dialog.showModal();lock(true);message('正在读取本机配置…');try{await load();}catch(e){message(e.message,true);}finally{lock(false);}};
 window.ModelSettings={open:()=>el('openVisionSettings').click()};
 dialog.querySelector('.close-dialog').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{el('visionKey').value='';});
 dialog.addEventListener('keydown',e=>e.stopPropagation());
 form.onsubmit=async e=>{e.preventDefault();if(busy||!form.reportValidity())return;const data=draft();lock(true);showDiagnostics(null);message('正在保存…');try{summary(await api('','POST',data));el('visionKey').value='';message('已保存并立即生效，刷新或下次启动后仍可使用。');window.refreshRecognitionStatus?.();}catch(e){message(e.message,true);}finally{data.key='';lock(false);}};
 el('testVisionSettings').onclick=async()=>{if(busy||!form.reportValidity())return;const data=draft();lock(true);showDiagnostics(null);message('正在测试连接、图片辨识和 JSON 输出，最长约 90 秒…');try{const result=await api('/test','POST',data);showDiagnostics(result.diagnostics);message(result.message+' 修改过配置时，记得点击保存。');}catch(e){showDiagnostics(e.diagnostics);message(e.message,true);}finally{data.key='';lock(false);}};
 el('clearVisionKey').onclick=async()=>{if(busy)return;lock(true);try{summary(await api('','DELETE'));el('visionKey').value='';message('密钥已清除，AI 图片识别已停用。');window.refreshRecognitionStatus?.();}catch(e){message(e.message,true);}finally{lock(false);}};
 api('').then(summary).catch(()=>{el('visionSettingsBadge').textContent='待配置';});
})();
