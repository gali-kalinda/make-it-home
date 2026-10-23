/* Step 5 controls a real image-output tool. Only prompts are executable tool arguments. */
const {bytesOf,editImage,threeViewPrompt}=require('./image-edit-server.cjs');
const {sanitizeReason}=require('./vision-errors.cjs');
const toolName='generate_furniture_three_views';
function fail(message,status=502,diagnostics){const e=Error(message);e.status=status;e.diagnostics=diagnostics;throw e;}
async function planThreeViews(input,step5,{fetchImpl=fetch,signal,timeoutMs=120000}={}){
 if(!step5.key||step5.model!=='step-5-preview')fail('请先保存 Step 5 Preview 接口和密钥',503);
 bytesOf(input.image);
 const payload={model:step5.model,messages:[{role:'system',content:'你是家具三视图任务的执行模型。先仔细观察用户提供的真实家具照片，提取可见结构、材料和颜色，再调用唯一的图片生成工具。工具参数只能是描述同一件家具的图片生成提示词，不能是代码、SVG、几何坐标或文件路径。不得声称图片已经生成。'},{role:'user',content:[{type:'text',text:threeViewPrompt(input)+'\n请调用工具，生成一张正视、右视、俯视从左到右排列的纯白背景三视图。三格必须是同一件家具；不要用背视代替俯视。'},{type:'image_url',image_url:{url:input.image}}]}],tools:[{type:'function',function:{name:toolName,description:'根据原家具参考照片和任务提示词，实际调用配置的图像生成工具，返回可展示的三视图图片。原图由系统绑定，不能更换或增加其他参考图。',parameters:{type:'object',properties:{prompt:{type:'string',description:'针对所见家具的三视图生图指令，包含结构、颜色、材质、视图顺序、白色背景与需排除的场景'}},required:['prompt'],additionalProperties:false}}}],tool_choice:{type:'function',function:{name:toolName}},parallel_tool_calls:false,stream:false,max_tokens:4096,reasoning_effort:'low',temperature:1};
 const combined=AbortSignal.any([AbortSignal.timeout(timeoutMs),...(signal?[signal]:[])]);let response;
 try{response=await fetchImpl(step5.base.replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+step5.key,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:combined,redirect:'error'});}catch(e){if(signal?.aborted)throw Object.assign(Error('三视图任务已取消'),{name:'AbortError'});fail(e.name==='TimeoutError'?'Step 5 三视图分析超时，请重试':'Step 5 连接中断，请检查接口服务');}
 if(!response.ok)fail('Step 5 三视图任务返回 HTTP '+response.status+'，请核对接口权限、额度及工具调用支持');
 let raw;try{raw=await response.json();}catch{fail('Step 5 返回的不是有效 JSON，请核对接口地址或网关响应',502);}
 const choice=raw.choices?.[0],calls=choice?.message?.tool_calls,diagnostics={orchestratorModel:step5.model,orchestratorHost:new URL(step5.base).hostname,orchestratorResponseId:sanitizeReason(String(raw.id||''),step5.key).slice(0,200),finishReason:choice?.finish_reason||'',tool:toolName};
 if(['length','max_tokens'].includes(choice?.finish_reason))fail('Step 5 三视图工具请求被截断，请重试',502,diagnostics);
 if(!Array.isArray(calls)||calls.length!==1||calls[0]?.function?.name!==toolName)fail('Step 5 未返回可执行的三视图工具请求，未使用文字或几何图替代图片',502,diagnostics);
 let args;try{args=JSON.parse(calls[0].function.arguments);}catch{fail('Step 5 的图片工具参数不完整，请重试',502,diagnostics);}
 if(!args||Object.keys(args).some(k=>k!=='prompt')||typeof args.prompt!=='string'||args.prompt.length<20||args.prompt.length>8000)fail('Step 5 的图片工具参数校验失败，请重试',502,diagnostics);
 return {prompt:args.prompt,diagnostics:{...diagnostics,toolCallId:sanitizeReason(String(calls[0].id||''),step5.key).slice(0,200),toolRequested:true}};
}
async function generateStep5ThreeViews(input,step5,imageTool,options={}){
 const plan=await planThreeViews(input,step5,options),d=plan.diagnostics;
 if(!imageTool?.key||!imageTool.base||!imageTool.model)fail('Step 5 已根据原图发起三视图生图工具请求；网站尚未连接可输出图片的工具。请配置 WorkBuddy 同款生图服务，或填写三视图图像生成接口。',503,{...d,stage:'image_tool_not_configured'});
 try{const result=await editImage({...input,prompt:plan.prompt},imageTool,options);Object.assign(result.provenance,d,{workflowProfile:'step5',orchestration:'step5-image-tool-v1',imageToolModel:result.provenance.model});return result;}catch(e){e.diagnostics={...(e.diagnostics||{}),...d,stage:'image_tool_failed'};throw e;}
}
module.exports={planThreeViews,generateStep5ThreeViews};
