/* A bounded, declarative geometry format. No model response is executed as code. */
(function(root){
 const shapes=['box','rounded_box','ellipsoid','cylinder','cone','lathe','tube','extrusion','mesh'];
 const materials=['wood','fabric','metal','glass','paint','stone'];
 const vector=(v,min,max)=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&n>=min&&n<=max);
 const text=(v,max=200)=>String(v||'').slice(0,max);
 function validate(input){
  if(input?.schema!=='image-parts-v1'||!Array.isArray(input.parts)||!input.parts.length||input.parts.length>100)throw Error('模型部件数据无效，未使用预设模型替代');
  const mounting=['floor','wall','ceiling','surface'].includes(input.mounting)?input.mounting:'floor',seen=new Set();let vertexCount=0;
  const parts=input.parts.map((p,index)=>{
   if(!p||!shapes.includes(p.shape)||!vector(p.position,-2,2)||!vector(p.size,.0001,2)||!vector(p.rotation||[0,0,0],-360,360)||!/^#[0-9a-f]{6}$/i.test(p.color)||!materials.includes(p.material))throw Error('模型部件 '+(index+1)+' 的形状、尺寸或材质无效');
   const id=text(p.id,50);if(!/^[\w-]+$/.test(id)||seen.has(id))throw Error('模型部件编号无效');seen.add(id);
   const part={id,label:text(p.label,100),shape:p.shape,position:p.position.slice(),size:p.size.slice(),rotation:(p.rotation||[0,0,0]).slice(),color:p.color,material:p.material};
   for(const property of ['opacity','roughness'])if(p[property]!==undefined){if(!Number.isFinite(p[property])||p[property]<0||p[property]>1)throw Error('材质透明度或粗糙度无效');part[property]=p[property];}
   if(p.shape==='rounded_box'){if(!Number.isFinite(p.radius)||p.radius<0||p.radius>.3)throw Error('圆角参数无效');part.radius=p.radius;}
   if(['cylinder','cone'].includes(p.shape)){part.topRadius=p.shape==='cone'?0:.5;if(p.topRadius!==undefined){if(!Number.isFinite(p.topRadius)||p.topRadius<0||p.topRadius>1)throw Error('圆柱轮廓无效');part.topRadius=p.topRadius;}}
   if(['lathe','tube','extrusion'].includes(p.shape)){
    const dim=p.shape==='tube'?3:2,max=p.shape==='tube'?40:64;
    if(!Array.isArray(p.points)||p.points.length<2||p.points.length>max||!p.points.every(q=>Array.isArray(q)&&q.length===dim&&q.every(n=>Number.isFinite(n)&&n>=-1&&n<=1)))throw Error('曲线或截面数据无效');
    if(p.shape==='lathe'&&p.points.some(q=>q[0]<0)||p.shape==='extrusion'&&p.points.length<3)throw Error('截面数据无效');part.points=p.points.map(q=>q.slice());
    if(p.shape==='tube'){if(!Number.isFinite(p.radius)||p.radius<=0||p.radius>.3)throw Error('管件半径无效');part.radius=p.radius;
     // size describes the final bounding box, including the thin cross-section.
     // A default unit width on a planar centerline turns a thin rod into a panel.
     for(let axis=0;axis<3;axis++){const values=p.points.map(q=>q[axis]),span=Math.max(...values)-Math.min(...values);if(span<1e-5&&p.size[axis]>.2&&p.radius<.05)throw Error('管件 '+id+' 的横截面被放大：size 是最终包围盒尺寸，平面管线的法向厚度应接近管径，不能填 1；请修正 size 或改用细圆柱段');}
    }
   }
   if(p.shape==='mesh'){
    if(!Array.isArray(p.vertices)||!p.vertices.length||p.vertices.length>2000||!p.vertices.every(v=>vector(v,-1,1))||!Array.isArray(p.triangles)||!p.triangles.length||p.triangles.length>4000||!p.triangles.every(t=>Array.isArray(t)&&t.length===3&&t.every(n=>Number.isInteger(n)&&n>=0&&n<p.vertices.length)))throw Error('自定义网格数据无效');
    vertexCount+=p.vertices.length;if(vertexCount>6000)throw Error('模型网格过大');part.vertices=p.vertices.map(v=>v.slice());part.triangles=p.triangles.map(t=>t.slice());
   }return part;
  });
  return {schema:'image-parts-v1',name:text(input.name,120),kind:text(input.kind,60),mounting,description:text(input.description,1000),observations:(Array.isArray(input.observations)?input.observations:[]).slice(0,10).map(v=>text(v,200)),uncertainties:(Array.isArray(input.uncertainties)?input.uncertainties:[]).slice(0,10).map(v=>text(v,200)),parts};
 }
 root.ImageGeometryCore={validate,shapes,materials};if(typeof module!=='undefined')module.exports=root.ImageGeometryCore;
})(globalThis);
