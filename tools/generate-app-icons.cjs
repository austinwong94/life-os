// Reproduce Life OS's existing three-tile brand as local PNG app icons.
const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
function crc32(buffer){let crc=0xffffffff;for(const value of buffer){crc^=value;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return (crc^0xffffffff)>>>0;}
function chunk(type,data){const kind=Buffer.from(type),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([kind,data])));return Buffer.concat([length,kind,data,crc]);}
function icon(size){
  const pixels=Buffer.alloc((size*4+1)*size),tiles=[[.24,.24,.24,.24,[47,127,117]],[.52,.24,.24,.24,[216,126,91]],[.24,.52,.52,.24,[225,192,92]]];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let color=[255,255,255];
    for(const [left,top,width,height,fill] of tiles){
      const px=x/size,py=y/size,r=.045,cx=Math.max(left+r,Math.min(px,left+width-r)),cy=Math.max(top+r,Math.min(py,top+height-r));
      if(px>=left && px<=left+width && py>=top && py<=top+height && (px-cx)**2+(py-cy)**2<=r*r)color=fill;
    }
    const offset=y*(size*4+1)+1+x*4;pixels[offset]=color[0];pixels[offset+1]=color[1];pixels[offset+2]=color[2];pixels[offset+3]=255;
  }
  const header=Buffer.alloc(13);header.writeUInt32BE(size);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(pixels)),chunk('IEND',Buffer.alloc(0))]);
}
for(const size of [180,192,512])fs.writeFileSync(path.join(__dirname,'..','app-icon-'+size+'.png'),icon(size));
