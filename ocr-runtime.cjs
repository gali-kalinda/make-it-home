// Serve only the pinned OCR runtime files installed by npm; never expose node_modules wholesale.
const fs=require('node:fs'),path=require('node:path');
function serveOCR(req,res,pathname,root){
 let file;
 const core=pathname.match(/^\/vendor\/tesseract\/core\/(tesseract-core(?:-simd)?(?:-lstm)?\.(?:wasm|wasm\.js|js))$/);
 if(core)file=path.join(root,'node_modules/tesseract.js-core',core[1]);
 if(pathname==='/vendor/tesseract/data/eng.traineddata.gz')file=path.join(root,'node_modules/@tesseract.js-data/eng/4.0.0/eng.traineddata.gz');
 if(!file)return false;
 if(!fs.existsSync(file)){res.writeHead(503,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify({error:'OCR 运行库未安装，请在项目目录执行 npm ci'}));return true;}
 const type=file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.wasm')?'application/wasm':'application/octet-stream';
 res.writeHead(200,{'Content-Type':type,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);return true;
}
module.exports={serveOCR};
