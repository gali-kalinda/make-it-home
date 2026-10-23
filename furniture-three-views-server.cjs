const crypto=require('node:crypto'),V=require('./furniture-three-views-core.js'),{configuration,generateGeometry}=require('./image-geometry-server.cjs'),{requestVisionJSON}=require('./vision-protocol.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function imageHash(image){
 if(typeof image!=='string'||image.length>21*1024*1024||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(image))throw Error('请提供有效的 PNG / JPG 参考图');
 const bytes=Buffer.from(image.split(',')[1],'base64');if(!(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))||bytes[0]===255&&bytes[1]===216&&bytes[2]===255))throw Error('参考图片无法读取');return hash(bytes);
}
function dimensions(input){if(!input.dimensions||!['w','d','h'].every(k=>Number.isFinite(input.dimensions[k])&&input.dimensions[k]>=10&&input.dimensions[k]<=50000))throw Error('原家具宽、深、高无效');}
function prompt(input){return `Create orthographic reference drawings of ONE furniture object isolated from this CURRENT photo crop. Name hint ${JSON.stringify(input.name||'')}, category hint ${JSON.stringify(input.kind||'')}, dimensions width/depth/height mm ${input.dimensions.w}/${input.dimensions.d}/${input.dimensions.h}. Extract the target visually; exclude every background, ceiling, wall, floor and neighboring object. Preserve its actual silhouette, curves, separate supports, openings and colors. Do not substitute a generic stock design. Draw front view looking toward -Z, RIGHT side looking toward -X (front at LEFT), and top view looking down -Y (front at BOTTOM). All three views must depict the same object consistently. The invisible side/back are INFERRED; list uncertain features. If target cannot be isolated, return {"error":"unclear target"}.
Return compact JSON only: {"schema":"furniture-three-views-v1","name":"中文名","kind":"functional category","description":"中文外观","observations":["可见细节"],"uncertainties":["推测部分"],"views":[{"id":"front","shapes":[{"shape":"polygon","points":[[0.1,0.2],[0.9,0.2],[0.8,0.8],[0.2,0.8]],"fill":"#efe6d4","stroke":"#665b4d","width":0.004}]},{"id":"side","shapes":[]},{"id":"top","shapes":[]}]}.
Each view MUST contain 1..40 separate 2D shapes in paint order. Coordinates normalized 0..1, X right Y down. The drawable area has the object's physical aspect ratio: front width/height, side depth/height, top width/depth. Fit the entire object to its bounds. Use ONLY rect {x,y,w,h,radius}, ellipse {x,y,w,h} (bounding rectangle), polygon/polyline {points:[[x,y],...]}, fill and stroke as #RRGGBB or none, width .001..025. Use 8..32 points for curved silhouettes rather than rectangles. Open glass remains transparent (fill none); do not fill gaps. No text shapes, no SVG markup, no links, no code, no perspective or isometric views. Return all three views, concise and complete.${input.feedback?'\nUser corrections: '+String(input.feedback).slice(0,1200):''}`;}
async function generateViews(input,vision,options={}){
 const config=configuration(vision),sourceHash=imageHash(input.image);dimensions(input);let repair='',drawing,diagnostics;const requests=[];
 for(let attempt=0;attempt<2;attempt++){
  const result=await requestVisionJSON(config,{image:input.image,prompt:prompt(input)+repair,maxTokens:config.provider==='stepfun'?30000:18000,stream:true,timeoutMs:480000,...options,imageLabel:'家具原始截取图'});diagnostics=result.diagnostics;requests.push(diagnostics.responseId);
  if(result.value.error)throw Error('当前图片无法确认家具主体，请换一张更清晰的参考图');
  try{drawing=V.validate(result.value);break;}catch(e){if(attempt)throw e;repair='\nCorrect the SAME object drawings after validation error: '+e.message+'. Previous JSON: '+JSON.stringify(result.value).slice(0,70000);options.onProgress?.({phase:'repairing',text:'正在请同一模型修正三视图格式…'});}
 }
 return {drawing,provenance:{method:'vision-orthographic-drawing-v1',provider:config.provider,host:new URL(config.base).hostname,model:config.model,sourceHash,drawingHash:hash(JSON.stringify(drawing)),responseId:diagnostics.responseId,requests,generatedAt:new Date().toISOString(),diagnostics}};
}
async function generateFromViews(input,vision,options={}){
 const drawing=V.validate(input.drawing),drawingHash=hash(JSON.stringify(drawing));dimensions(input);
 if(input.confirmed!==true||input.approvedDrawingHash!==drawingHash)throw Error('请先确认当前三视图，再生成模型');
 if(drawing.schema==='furniture-three-views-image-v1'&&imageHash(input.image)!==imageHash(drawing.sheet))throw Error('用于建模的图片不是已确认的三视图');
 const sourceHash=imageHash(input.source);if(sourceHash!==input.sourceHash)throw Error('参考原图已改变，请重新生成并确认三视图');imageHash(input.image);
 const result=await generateGeometry({image:input.image,contextImage:input.source,dimensions:input.dimensions,kind:input.kind,name:input.name,mode:'three-views',feedback:'Confirmed orthographic drawing description: '+drawing.description+'; observations: '+drawing.observations.join('; ')+'; uncertainties: '+drawing.uncertainties.join('; ')},vision,options);
 result.provenance.threeViews={drawingHash,sourceHash,responseId:String(input.viewsResponseId||'').slice(0,200),confirmed:true};return result;
}
module.exports={generateViews,generateFromViews,imageHash,prompt};
