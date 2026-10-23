const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),S=require('./scene-extraction-core.js');
const {requestSceneVision}=require('./scene-vision-request.cjs');
const referenceHash=null;
function cleanResult(input){if(!Array.isArray(input.items)||input.items.length>30)throw Error('效果图识别候选列表无效');const items=input.items.map(S.cleanItem);if(new Set(items.map(i=>i.id)).size!==items.length)throw Error('效果图候选编号重复');return {items,excluded:Array.isArray(input.excluded)?input.excluded.slice(0,20).map(String):[]};}
async function extractScene(input,vision={},options={}){
 if(typeof input.image!=='string'||!/^data:image\/(png|jpeg);base64,/.test(input.image))throw Error('请提供 PNG 或 JPG 效果图');const imageHash=crypto.createHash('sha256').update(Buffer.from(input.image.split(',')[1],'base64')).digest('hex');
 if(vision.base&&vision.key&&vision.model){const result=await requestSceneVision(input.image,vision,Object.keys(S.kinds),options);return {provider:'vision-api',diagnostics:result.diagnostics,imageHash,matchedReference:false,...cleanResult(result),message:'已通过当前配置的 '+vision.model+' 重新分析本次效果图；尺寸为估算，生成前请核对。'};}
 if(!vision.base||!vision.key||!vision.model)return {provider:'unavailable',imageHash,matchedReference:false,items:[],excluded:[],message:'当前图片没有已保存的分析，也尚未配置视觉 API。可手动框选并填写类型和尺寸；不会套用其他图片的家具。'};
 const result=await requestSceneVision(input.image,vision,Object.keys(S.kinds),options);return {provider:'vision-api',diagnostics:result.diagnostics,imageHash,matchedReference:false,...cleanResult(result),message:'已通过所配置视觉模型分析当前效果图；尺寸为估算，生成前请核对。'};
}
module.exports={extractScene,cleanResult,referenceHash};
