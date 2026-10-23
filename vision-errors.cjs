function sanitizeReason(value,key){let text=String(value||'');if(key)text=text.split(key).join('[密钥已隐藏]');return text.replace(/Bearer\s+\S+|sk-[A-Za-z0-9_-]+/gi,'[密钥已隐藏]').replace(/data:image\/[^\s"']+/gi,'[图片数据]').replace(/[\x00-\x1f\x7f]/g,' ').slice(0,450);}
async function providerFailure(response,key,imageLabel='图片'){
 let payload;try{payload=await response.json();}catch{}
 const reason=sanitizeReason(payload?.error?.message||payload?.message||payload?.error,key);let message;
 if([401,403].includes(response.status))message='密钥无效或没有调用该模型的权限';
 else if(response.status===402)message='账户余额或可用额度不足';
 else if(response.status===404)message='接口地址或模型名称不存在';
 else if(response.status===429)message='请求过于频繁或模型额度受限，请稍后重试';
 else if(response.status===400&&/image.*(invalid|not.*valid)|invalid.*image|图片.*无效/i.test(reason))message='服务未能读取'+imageLabel+'，请刷新后重试';
 else if([400,422].includes(response.status))message='接口拒绝了请求参数，请核对模型及其支持的参数';
 else message='模型服务暂时不可用，请稍后重试';
 const error=Error(`${message}（HTTP ${response.status}）${reason?'。服务说明：'+reason:''}`);error.status=502;error.providerStatus=response.status;error.reason=reason;error.parameter=sanitizeReason(payload?.error?.param,key);error.code='PROVIDER_HTTP';return error;
}
async function serviceError(response,key,imageLabel='测试图片'){return (await providerFailure(response,key,imageLabel)).message;}
module.exports={sanitizeReason,providerFailure,serviceError};
