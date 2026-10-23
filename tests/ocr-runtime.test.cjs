const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{Writable}=require('node:stream');
const {serveOCR}=require('../ocr-runtime.cjs'),root=path.resolve(__dirname,'..');
function head(url){let status,type;const res={writeHead(s,h){status=s;type=h['Content-Type'];},end(){}};const handled=serveOCR({method:'HEAD'},res,url,root);return {handled,status,type};}
for(const [url,type] of [['/vendor/tesseract/core/tesseract-core-simd-lstm.wasm','application/wasm'],['/vendor/tesseract/core/tesseract-core-lstm.wasm.js','text/javascript; charset=utf-8'],['/vendor/tesseract/data/eng.traineddata.gz','application/octet-stream']])assert.deepEqual(head(url),{handled:true,status:200,type});
for(const url of ['/node_modules/sharp/package.json','/vendor/tesseract/core/../../.local/vision-config.json','/vendor/tesseract/data/other.gz'])assert.equal(head(url).handled,false);
console.log('Pinned npm OCR assets served locally with bounded routes and correct MIME types; arbitrary paths are not exposed.');
