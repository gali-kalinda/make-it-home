(function(root){
  function dimensionsFromText(text){
    const normalized=String(text||'').replace(/[＊✕✖]/g,'*').replace(/毫米/g,'mm').replace(/厘米/g,'cm');
    const match=normalized.match(/(\d{1,5}(?:\.\d+)?)\s*[xX×*]\s*(\d{1,5}(?:\.\d+)?)\s*[xX×*]\s*(\d{1,5}(?:\.\d+)?)\s*(mm|cm|m)\b/i);
    if(!match)return null;const factor={mm:1,cm:10,m:1000}[match[4].toLowerCase()],values=match.slice(1,4).map(v=>Number(v)*factor);
    if(!values.every(v=>Number.isFinite(v)&&v>=10&&v<=50000))return null;
    return {w:values[0],d:values[1],h:values[2],unit:'mm',source:'image-ocr',text:match[0],order:'宽（长）×深×高'};
  }
  function validDimensions(d){return !!d&&['w','d','h'].every(k=>Number.isFinite(d[k])&&d[k]>=10&&d[k]<=50000);}
  function genericRecipe(type){return {schemaVersion:1,kind:type||'cabinet',name:'图片家具',analysisProvider:'manual-parameters',appearance:{bodyColor:'#b9ac99',topColor:'#c7bba8',metalColor:'#ad965a'},approximate:true,disclosure:'按用户指定类型和尺寸制作的参数近似模型；未调用视觉模型理解该图片。'};}
  root.FurniturePhotoCore={dimensionsFromText,validDimensions,genericRecipe};if(typeof module!=='undefined')module.exports=root.FurniturePhotoCore;
})(globalThis);
