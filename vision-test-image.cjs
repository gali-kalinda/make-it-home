const {deflateSync}=require('node:zlib');
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const payload=Buffer.concat([Buffer.from(type),data]),length=Buffer.alloc(4),checksum=Buffer.alloc(4);length.writeUInt32BE(data.length);checksum.writeUInt32BE(crc32(payload));return Buffer.concat([length,payload,checksum]);}
// Generate a real PNG, rather than maintaining a hand-copied base64 string.
function testImage(){const size=64,header=Buffer.alloc(13),rows=Buffer.alloc(size*(size*3+1),255);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=2;for(let y=0;y<size;y++){rows[y*(size*3+1)]=0;if(y>=16&&y<48)for(let x=16;x<48;x++){const offset=y*(size*3+1)+1+x*3;rows[offset]=255;rows[offset+1]=rows[offset+2]=0;}}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
module.exports={testImage,crc32};
