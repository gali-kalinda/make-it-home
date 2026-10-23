const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'.local','test-temp');fs.mkdirSync(directory,{recursive:true});
const files=fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.cjs')).sort();
for(const file of files){console.log('\nTEST '+file);const script=`require('node:os').tmpdir=()=>${JSON.stringify(directory)};require(${JSON.stringify(path.join(root,'tests',file))});`;const r=spawnSync(process.execPath,['-e',script],{cwd:root,stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
console.log('\n'+files.length+' test suites passed.');
