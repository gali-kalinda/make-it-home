/* One OpenAI-compatible image/JSON transport for testing and recognition. */
const {sanitizeReason,providerFailure}=require('./vision-errors.cjs');
function providerProfile(vision){
 const host=new URL(vision.base).hostname;
 if(['api.stepfun.com','api.stepfun.ai'].includes(host))return {name:'阶跃星辰',...( /^step-5(?:-|$)/i.test(vision.model)?{reasoning_effort:'low',temperature:1,top_p:.95}:{})};
 if(host==='api.deepseek.com')return {name:'DeepSeek',thinking:{type:'disabled'}};
 if(['api.siliconflow.cn','api.siliconflow.com'].includes(host))return {name:'硅基流动',...(/Qwen3|DeepSeek-V4/i.test(vision.model)?{enable_thinking:false}:{})};
 return {name:'OpenAI 兼容接口'};
}
function buildPayload(vision,{image,contextImage,prompt,maxTokens=4096,stream=false}){
 const {name,...extra}=providerProfile(vision);
 const content=[{type:'text',text:prompt+'\nReturn one JSON object only. Do not include explanations outside the JSON.'},{type:'image_url',image_url:{url:image,detail:'high'}}];
 if(contextImage)content.push({type:'text',text:'The first image is the cropped TARGET. The following full scene is CONTEXT only. Reconstruct only that target, never other scene objects.'},{type:'image_url',image_url:{url:contextImage,detail:'high'}});
 return {model:vision.model,messages:[{role:'user',content}],response_format:{type:'json_object'},temperature:.2,max_tokens:maxTokens,stream,...extra};
}
function textParts(value){if(typeof value==='string')return value;if(Array.isArray(value))return value.filter(v=>['text','output_text'].includes(v?.type)).map(v=>typeof v.text==='string'?v.text:typeof v.text?.value==='string'?v.text.value:'').join('');return '';}
function parseObject(content){
 if(content&&typeof content==='object'&&!Array.isArray(content))return content;
 const text=String(content||'').replace(/^\uFEFF/,'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
 const result=JSON.parse(text);if(!result||typeof result!=='object'||Array.isArray(result))throw Error('Expected a JSON object');return result;
}
function protocolError(message,code,diagnostics){const e=Error(message);e.status=502;e.code=code;e.diagnostics=diagnostics;return e;}
function adaptRejectedParameter(payload,error){
 if(![400,422].includes(error.providerStatus)||!/unsupported|not supported|unknown|unrecognized|not allowed|does not support|not permitted|invalid parameter|unexpected|不支持|未知|无法识别/i.test(error.reason))return false;
 const text=(error.parameter+' '+error.reason).toLowerCase();
 for(const key of ['temperature','reasoning_effort','enable_thinking','thinking'])if(text.includes(key)&&Object.hasOwn(payload,key)){delete payload[key];return key;}
 if(text.includes('max_tokens')&&Object.hasOwn(payload,'max_tokens')){payload.max_completion_tokens=payload.max_tokens;delete payload.max_tokens;return 'max_completion_tokens';}
 if(/response_format|json_object|json mode/.test(text)&&payload.response_format){delete payload.response_format;return 'prompt_json';}
 if(text.includes('detail')&&payload.messages[0].content.some(p=>p.image_url?.detail)){payload.messages[0].content.forEach(p=>{if(p.image_url)delete p.image_url.detail;});return 'image_detail';}
 if(text.includes('stream')&&payload.stream){payload.stream=false;return 'non_streaming';}
 return false;
}
async function readCompletion(response,{key,onProgress=()=>{}}){
 let content='',parsed,finish='',reasoningChars=0,responseId='',usage,refusal=false,choices=0,last=0;
 function consume(chunk){
  if(chunk.error)throw protocolError('识别服务中断了结果输出。'+sanitizeReason(chunk.error.message,key),'PROVIDER_STREAM');
  responseId=responseId||sanitizeReason(chunk.id,key).slice(0,160);if(chunk.usage)usage=chunk.usage;
  for(const choice of chunk.choices||[]){if(choice.index&&choice.index!==0)continue;choices++;const part=choice.delta||choice.message||{};content+=textParts(part.content);if(part.parsed&&typeof part.parsed==='object')parsed=part.parsed;reasoningChars+=textParts(part.reasoning_content||part.reasoning).length;refusal=refusal||!!part.refusal;finish=choice.finish_reason||finish;}
  if(content.length>1500000)throw protocolError('识别结果过长，请缩小识别范围','OUTPUT_TOO_LARGE');
  if(Date.now()-last>700){last=Date.now();onProgress({phase:content?'assembling':'analyzing',receivedChars:content.length,text:content?'正在整理图片识别结果…':'模型正在识别图片…'});}
 }
 if((response.headers?.get('content-type')||'').toLowerCase().includes('text/event-stream')){
  const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',ended=false;
  const event=block=>{const data=block.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');if(!data)return;if(data.trim()==='[DONE]'){ended=true;return;}let chunk;try{chunk=JSON.parse(data);}catch{throw protocolError('识别服务返回了无法读取的流式数据','INVALID_STREAM');}consume(chunk);};
  try{while(!ended){const {value,done}=await reader.read();buffer+=decoder.decode(value||new Uint8Array(),{stream:!done});if(buffer.length>2000000)throw protocolError('服务返回的数据过长','OUTPUT_TOO_LARGE');let split;while((split=/\r?\n\r?\n/.exec(buffer))){event(buffer.slice(0,split.index));buffer=buffer.slice(split.index+split[0].length);}if(done){if(buffer.trim())event(buffer);break;}}}finally{await reader.cancel().catch(()=>{});}
 }else{let json;try{json=await response.json();}catch{throw protocolError('接口已连接，但返回的不是可读取的 API JSON，请核对接口地址','INVALID_ENVELOPE');}consume(json);}
 return {content,parsed,finish,reasoningChars,responseId,usage,refusal,choices};
}
async function requestVisionJSON(vision,{image,contextImage,prompt,maxTokens=4096,stream=false,timeoutMs=180000,signal,fetchImpl=fetch,onProgress=()=>{},imageLabel='图片'}={}){
 const timeout=AbortSignal.timeout(timeoutMs),combined=AbortSignal.any([timeout,...(signal?[signal]:[])]),payload=buildPayload(vision,{image,contextImage,prompt,maxTokens,stream}),adjustments=[];let diagnostics;
 try{for(let attempt=1;attempt<=3;attempt++){
  onProgress({phase:'connecting',text:attempt===1?'正在连接图片识别服务…':'正在适配服务商的请求参数…'});
  const response=await fetchImpl(vision.base.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+vision.key,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:combined,redirect:'error'});
  if(!response.ok){const e=await providerFailure(response,vision.key,imageLabel);const changed=attempt<3&&adaptRejectedParameter(payload,e);if(changed){adjustments.push(changed);continue;}throw e;}
  const result=await readCompletion(response,{key:vision.key,onProgress}),u=result.usage;
  diagnostics={provider:providerProfile(vision).name,host:new URL(vision.base).hostname,model:vision.model,responseId:result.responseId,finishReason:result.finish||'not_provided',contentChars:result.content.length,reasoningChars:result.reasoningChars,completionTokens:Number(u?.completion_tokens)||0,reasoningTokens:Number(u?.completion_tokens_details?.reasoning_tokens)||0,maxOutputTokens:payload.max_tokens||payload.max_completion_tokens,attempts:attempt,adjustments,jsonMode:payload.response_format?'json_object':'prompt_json'};
  if(result.finish==='length'||result.finish==='max_tokens')throw protocolError(`接口已连接，但输出未完成：达到 ${diagnostics.maxOutputTokens} token 上限${result.reasoningChars?'（其中包含模型推理）':''}。这不代表模型不支持图片或 JSON，请提高输出预算后重试。`,'OUTPUT_TRUNCATED',diagnostics);
  if(result.refusal||result.finish==='content_filter')throw protocolError('接口已连接，但模型拒绝处理此图片，请查看服务商限制或更换图片','MODEL_REFUSAL',diagnostics);
  if(!result.content.trim()&&!result.parsed)throw protocolError(result.reasoningChars?'接口已连接，但只返回了推理内容，没有最终 JSON 正文。请调整推理强度或输出预算后重试。':'接口已连接，但未返回识别结果的正文，请核对模型和接口格式','EMPTY_CONTENT',diagnostics);
  let value;try{value=parseObject(result.parsed||result.content);}catch{throw protocolError('接口已连接，但最终正文不是完整的 JSON 对象，请重试或核对服务商的 JSON 输出设置','INVALID_JSON',diagnostics);}
  onProgress({phase:'validating',text:'正在校验图片识别结果…'});return {value,diagnostics};
 }}catch(e){
  if(signal?.aborted){const error=Error('识别已取消');error.name='AbortError';throw error;}
  if(timeout.aborted||e.name==='TimeoutError'){const error=protocolError(`识别服务超过 ${Math.ceil(timeoutMs/1000)} 秒未完成，请重试或检查服务商状态`,'VISION_TIMEOUT',diagnostics);error.status=504;throw error;}
  if(e.status||e.providerStatus){e.message=sanitizeReason(e.message,vision.key);throw e;}
  throw protocolError('连接失败或响应中断，请检查接口地址和网络。'+sanitizeReason(e.message,vision.key),'CONNECTION_FAILED',diagnostics);
 }
}
module.exports={providerProfile,buildPayload,textParts,parseObject,readCompletion,adaptRejectedParameter,requestVisionJSON};
