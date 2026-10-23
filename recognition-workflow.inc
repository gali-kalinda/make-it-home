async function refreshRecognitionStatus(){
 try{serviceStatus=await(await fetch('/api/status')).json();const local=serviceStatus.localAI;
  $('#visionStatus').textContent=local?.state==='ready'?'本机户型模型已就绪 · 新图片均重新推理，无需 API Key。':local?.available?(local.state==='error'?'本机模型未能启动：'+local.error:'本机户型模型正在加载，首次识别会等待加载完成。'):serviceStatus.vision?'已配置视觉 API，可识别新图。':'没有可用的智能识别服务。可以使用基础线条提取与手动描绘。';
 }catch{$('#visionStatus').textContent='未连接本地服务，请先启动网页服务。';}
}
async function recognizeImage(requested='auto'){
 if(recognizing)return;if(!pendingImage)return toast('请先选择户型图片');
 const source=pendingImage,provider=requested===true?'vision':requested===false?'auto':requested;
 recognizing=true;for(const id of ['localRecognize','cloudRecognize','basicRecognize'])$('#'+id).disabled=true;
 try{
  const s=startImagePlan();let result;
  if(provider==='basic'){
   $('#uploadInfo').textContent='正在提取基础线条；此入口不进行完整语义识别。';await new Promise(requestAnimationFrame);result=await FloorRecognition.recognize(source,$('#symbolConvention').checked);
   result.recognition.status=result.structure.walls.length?'partial':'failed';result.recognition.message='基础线条辅助结果，不代表完整门窗或阳台识别。'+result.recognition.message;
  }else{
   await refreshRecognitionStatus();const useVision=provider==='vision'||(!serviceStatus.localAI?.available&&serviceStatus.vision);
   if(useVision&&!serviceStatus.vision)throw Error('视觉 API 尚未配置；请使用本机智能识别');
   if(!useVision&&!serviceStatus.localAI?.available)throw Error('本机户型模型未安装，且未配置视觉 API。智能识别尚不可用');
   $('#uploadInfo').textContent=useVision?'正在调用已配置的视觉服务识别当前新图片…':'正在用本机模型识别当前图片的墙体、门窗和空间，再转换为可编辑结构…';
   const response=await fetch(useVision?'/api/recognize':'/api/recognize-local',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:source.data,width:source.width,height:source.height,symbolConvention:$('#symbolConvention').checked})});
   result=await response.json();if(!response.ok)throw Error(result.error||'识别服务请求失败');
   if(useVision)result.recognition={method:'vision',status:'needs-review',message:'视觉服务针对当前图片返回的候选结构，均需核对。'+(result.notes||'')};
  }
  // Never apply a delayed response to a different image selected in the meantime.
  if(pendingImage!==source)return;
  s.structure=result.structure;s.recognition=result.recognition;
  if(result.calibration?.mmPerPixel){s.calibration=result.calibration;s.source.mmPerPixel=result.calibration.mmPerPixel;}
  const hasStructure=s.structure.walls.length||s.structure.rooms.length;
  if(!hasStructure){s.recognition.status='failed';s.recognition.message='未获得可靠结构，不能视为识别完成。可重新识别、换清晰图片或手动描绘。 '+s.recognition.message;}
  for(const x of [...s.structure.walls,...s.structure.openings,...s.structure.columns,...s.structure.rooms]){x.reviewed=false;if(x.a)x.bearing='unknown';}
  await applyImagePlan(s);toast(hasStructure?'已生成当前图片的候选结构，请检查门窗与空间':'未识别出可靠结构，请重新识别或手动描绘');
 }catch(e){if(pendingImage===source){$('#uploadInfo').textContent='识别未完成：'+e.message+'。当前结果不会标为成功，可重试或手动描绘。';toast(e.message);}}
 finally{recognizing=false;for(const id of ['localRecognize','cloudRecognize','basicRecognize'])$('#'+id).disabled=false;updateStudio();}
}
$('#localRecognize').onclick=()=>recognizeImage('auto');$('#cloudRecognize').onclick=()=>recognizeImage('vision');$('#basicRecognize').onclick=()=>recognizeImage('basic');
$('#retryPlanRecognition').onclick=()=>{if(!state.source)return toast('请先上传原图');pendingImage=C.clone(state.source);$('#uploadPreview').innerHTML=`<img src="${pendingImage.data}" alt="待重新识别的户型原图">`;$('#uploadInfo').textContent='当前原图已载入，可重新运行智能识别。';$('#uploadDialog').showModal();refreshRecognitionStatus();};
refreshRecognitionStatus();
