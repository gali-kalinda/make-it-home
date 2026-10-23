// Portable local encryption. Windows keeps DPAPI; other systems use an owner-only key file.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function portableCodec(directory){
 const filename=path.join(directory,'secret-key');
 function key(){
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  try{fs.writeFileSync(filename,crypto.randomBytes(32),{flag:'wx',mode:0o600});}catch(e){if(e.code!=='EEXIST')throw e;}
  const value=fs.readFileSync(filename);if(value.length!==32)throw Error('本机加密文件无效，请保留 .local 目录并检查文件权限');
  if(process.platform!=='win32')fs.chmodSync(filename,0o600);return value;
 }
 return {
  protect(text){const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key(),iv),data=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return 'aes1:'+Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');},
  unprotect(text){if(!text.startsWith('aes1:'))throw Error('密钥配置来自不同的系统，请重新填写');const b=Buffer.from(text.slice(5),'base64');if(b.length<28)throw Error('密钥配置不完整');const decipher=crypto.createDecipheriv('aes-256-gcm',key(),b.subarray(0,12));decipher.setAuthTag(b.subarray(12,28));return Buffer.concat([decipher.update(b.subarray(28)),decipher.final()]).toString('utf8');}
 };
}
module.exports={portableCodec};
