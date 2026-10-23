const fs=require('node:fs'),path=require('node:path'),{spawn,spawnSync}=require('node:child_process');
const root=path.join(__dirname,'..');process.chdir(root);
if(Number(process.versions.node.split('.')[0])<22){console.error('Make It Home requires Node.js 22 or newer. https://nodejs.org/');process.exit(1);}
let installed=true;try{require('sharp');require('tesseract.js');}catch{installed=false;}
if(!installed){
 console.log('First start: installing locked dependencies. Internet access is required.');
 const r=process.platform==='win32'?spawnSync('cmd.exe',['/d','/s','/c','npm ci --no-audit --no-fund'],{stdio:'inherit',windowsHide:true}):spawnSync('npm',['ci','--no-audit','--no-fund'],{stdio:'inherit'});
 if(r.status!==0){console.error('Installation failed. Check your network, then run npm ci and retry.');process.exit(1);}
}
const child=spawn(process.execPath,['server.cjs'],{cwd:root,env:process.env,stdio:['inherit','pipe','inherit']});let opened=false;
child.stdout.on('data',chunk=>{process.stdout.write(chunk);if(!opened&&chunk.toString().includes('http://127.0.0.1:')){
 opened=true;const port=Number(process.env.PORT||8787);if(!Number.isInteger(port)||port<1||port>65535)return;
 const url='http://127.0.0.1:'+port;if(process.env.NO_OPEN==='1')return;
 const args=process.platform==='win32'?['cmd.exe',['/d','/s','/c','start "" '+url]]:process.platform==='darwin'?['open',[url]]:['xdg-open',[url]];
 const browser=spawn(args[0],args[1],{stdio:'ignore',windowsHide:true});browser.on('error',()=>{});browser.unref();
}});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code||0;});
process.on('SIGINT',()=>child.kill('SIGINT'));process.on('SIGTERM',()=>child.kill('SIGTERM'));
