/* Image output and recognition/modelling each use one shared connection. */
const {editImage}=require('./image-edit-server.cjs');
const {generateFromViews}=require('./furniture-three-views-server.cjs');
function fail(message,status=503){const e=Error(message);e.status=status;throw e;}
function workflowStatus({visionSettings,imageSettings}){
 return {defaultImageProfile:'image-edit',imageEdit:{...imageSettings.publicState(),profile:'image-edit'},modelling:{...visionSettings.publicState(),profile:'model'},nativeImageTo3D:false};
}
async function generatePhotoViews(input,{imageSettings},options={}){
 const config=imageSettings.current();
 if(!config.key)fail('尚未配置图像生成接口，请在设置中填写支持参考图输入和图片输出的服务。');
 const result=await editImage(input,config,options);result.provenance.workflowProfile='image-edit';return result;
}
async function generatePhotoModel(input,{visionSettings},options={}){
 if(input.drawing?.schema!=='furniture-three-views-image-v1')fail('请先生成并确认图片三视图，不能直接用原图建模',400);
 const config=visionSettings.current();if(!config.key)fail('尚未配置模型生成接口，请在设置中填写后继续。');
 const result=await generateFromViews(input,config,options);result.provenance.workflowProfile='model';return result;
}
module.exports={workflowStatus,generatePhotoViews,generatePhotoModel};
