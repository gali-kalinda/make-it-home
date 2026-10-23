(function(root){
 async function read(response,onProgress=()=>{}){
  if(!response.ok){let data;try{data=await response.json();}catch{}const e=Error(data?.error||'图片识别请求失败');e.code=data?.code;e.diagnostics=data?.diagnostics;throw e;}
  if(!(response.headers.get('content-type')||'').includes('application/x-ndjson'))return response.json();
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result,hasResult=false;
  function line(text){if(!text.trim())return;const event=JSON.parse(text);if(event.type==='error'){const e=Error(event.error||'图片分析未完成');e.code=event.code;e.diagnostics=event.diagnostics;throw e;}if(event.type==='progress')onProgress(event);if(event.type==='result'){result=event.result;hasResult=true;}}
  try{while(true){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});if(buffer.length>2000000)throw Error('识别结果过长');let end;while((end=buffer.indexOf('\n'))>=0){line(buffer.slice(0,end));buffer=buffer.slice(end+1);}if(done){if(buffer.trim())line(buffer);break;}}}
  finally{await reader.cancel().catch(()=>{});}
  if(!hasResult)throw Error('识别连接中断，原图已保留，可以重试');return result;
 }
 root.SceneExtractionStream={read};if(typeof module!=='undefined')module.exports=root.SceneExtractionStream;
})(globalThis);
