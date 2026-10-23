const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),C=require('../core.js');const p=C.validate(JSON.parse(fs.readFileSync(path.join(root,'examples/studio-35m2.json'))));
assert.equal(p.structure.rooms.length,3);assert.equal(p.furniture.length,26);assert.equal(p.source,null);assert.equal(p.designRenders.length,0);assert.equal(p.workflow,'furniture');
const files=[];function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(e.isDirectory()&&['node_modules','.local','.git'].includes(e.name))continue;const f=path.join(dir,e.name);if(e.isDirectory())walk(f);else files.push(f);}}walk(root);
for(const f of files){assert(fs.statSync(f).size<25*1024*1024,'GitHub browser file limit: '+f);const rel=path.relative(root,f);assert(!/^(photo-furniture|scene-extraction|design-renders|floorplan-recognition|output|local-ai|test-results)[\\/]/.test(rel),'Private path: '+rel);}
for(const required of ['LICENSE','THIRD_PARTY_NOTICES.md','licenses/floorplan-3d-LICENSE','start.cmd','start.sh','README.md','.gitignore'])assert(fs.existsSync(path.join(root,required)),required);
for(const m of fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/(?:src|href)="([^"#]+\.(?:js|css))"/g))assert(fs.existsSync(path.join(root,m[1])),'Missing asset: '+m[1]);
assert(!fs.readFileSync(path.join(root,'index.html'),'utf8').includes('src="stage01.js"'));
console.log(JSON.stringify({passed:true,files:files.length,bytes:files.reduce((n,f)=>n+fs.statSync(f).size,0),demo:{rooms:3,furniture:26,sourcePhotos:0}},null,2));
