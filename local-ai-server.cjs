const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{spawn}=require('node:child_process'),readline=require('node:readline');
const C=require('./core.js'),root=__dirname,dir=path.join(root,'local-ai');
const python=process.env.FLOORPLAN_PYTHON||'python';
const available=fs.existsSync(path.join(dir,'models/cubicasa5k.pkl'))&&fs.existsSync(path.join(dir,'packages/torch'));
let child=null,state=available?'installed':'unavailable',error='',ready=null,sequence=0;const pending=new Map();
function status(){return {available,state,error,model:'CubiCasa5K · 本机 CPU',privacy:'local-only'};}
function start(){
 if(child)return ready;if(!available)return Promise.reject(Error('本地户型模型尚未安装'));
 state='loading';error='';
 ready=new Promise((resolve,reject)=>{
  const processHandle=child=spawn(python,[path.join(dir,'worker.py')],{cwd:root,windowsHide:true,env:{...process.env,PYTHONIOENCODING:'utf-8',PYTHONDONTWRITEBYTECODE:'1'},stdio:['pipe','pipe','pipe']});
  const timeout=setTimeout(()=>{error='本地模型启动超时';state='error';processHandle.kill();reject(Error(error));},60000);
  readline.createInterface({input:processHandle.stdout}).on('line',line=>{let data;try{data=JSON.parse(line);}catch{return;}
   if(data.event==='ready'){clearTimeout(timeout);state='ready';resolve();return;}
   if(data.event==='error'){clearTimeout(timeout);state='error';error='本地模型启动失败：'+data.error;reject(Error(error));return;}
   const p=pending.get(data.id);if(!p)return;pending.delete(data.id);clearTimeout(p.timer);if(data.ok)p.resolve(data.result);else p.reject(Error(data.error||'本地模型识别失败'));
  });
  let diagnostics='';processHandle.stderr.on('data',b=>{diagnostics=(diagnostics+b.toString()).slice(-1500);});
  const stop=e=>{clearTimeout(timeout);if(child===processHandle)child=null;if(state!=='unavailable'){state='error';error=e?.message||error||('本地模型退出；可重试。'+diagnostics.slice(-350));}reject(Error(error));for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error(error));}pending.clear();};
  processHandle.on('error',stop);processHandle.on('exit',()=>stop());
 });ready.catch(()=>{});return ready;
}
async function recognize(input){
 if(!/^data:image\/(png|jpeg);base64,/.test(input.image||'')||!Number.isInteger(input.width)||!Number.isInteger(input.height)||input.width<1||input.height<1||input.width*input.height>4e7)throw Error('无效户型图片');
 if(pending.size>=2)throw Error('已有户型正在识别，请稍候');await start();const id=++sequence;
 const result=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('本地识别超时，请缩小图片或重试'));},120000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,image:input.image,width:input.width,height:input.height,symbolConvention:input.symbolConvention!==false,task:input.task})+'\n');});
 if(input.task==='furniture')return result;
 const s=C.blank();s.structure=result.structure;C.validate(s);result.structure=s.structure;return result;
}
function close(){if(child){child.kill();child=null;}}
process.on('exit',close);
module.exports={status,start,recognize,close};
