/* This renderer has no furniture presets: it instantiates only the API's validated parts. */
function imagePartGeometry(p){
 let geo;
 switch(p.shape){
  case 'box':geo=new THREE.BoxGeometry(1,1,1);break;
  case 'rounded_box':geo=new RoundedBoxGeometry(1,1,1,3,p.radius);break;
  case 'ellipsoid':geo=new THREE.SphereGeometry(.5,32,20);break;
  case 'cylinder':case 'cone':geo=new THREE.CylinderGeometry(p.topRadius,.5,1,40);break;
  case 'lathe':geo=new THREE.LatheGeometry(p.points.map(v=>new THREE.Vector2(...v)),40);break;
  case 'tube':geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p.points.map(v=>new THREE.Vector3(...v))),Math.min(128,p.points.length*8),p.radius,12,false);break;
  case 'extrusion':{const shape=new THREE.Shape();p.points.forEach((v,i)=>shape[i?'lineTo':'moveTo'](...v));shape.closePath();geo=new THREE.ExtrudeGeometry(shape,{depth:1,bevelEnabled:false,curveSegments:32});break;}
  case 'mesh':geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(p.vertices.flat(),3));geo.setIndex(p.triangles.flat());geo.computeVertexNormals();break;
  default:throw Error('不支持的模型部件形状');
 }
 geo.computeBoundingBox();const box=geo.boundingBox,size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());if(Math.min(size.x,size.y,size.z)<1e-6){geo.dispose();throw Error('图片模型返回了退化的部件，请重新生成');}geo.translate(-center.x,-center.y,-center.z);geo.scale(1/size.x,1/size.y,1/size.z);return geo;
}
async function createImageModel(input,dimensions){
 if(!FurniturePhotoCore.validDimensions(dimensions))throw Error('请填写有效尺寸');const spec=ImageGeometryCore.validate(input),object=new THREE.Group();object.name=spec.name;
 try{
  for(const p of spec.parts){const glass=p.material==='glass',material=new THREE.MeshStandardMaterial({color:p.color,roughness:p.roughness??(glass?.35:p.material==='metal'?.28:p.material==='fabric'?.95:.72),metalness:p.material==='metal'?.65:0,transparent:glass,opacity:p.opacity??(glass?.65:1),depthWrite:!glass,side:THREE.DoubleSide});const part=new THREE.Mesh(imagePartGeometry(p),material);part.name=p.label||p.id;part.position.fromArray(p.position);part.rotation.set(...p.rotation.map(a=>a*Math.PI/180));part.scale.fromArray(p.size);part.castShadow=!glass;part.receiveShadow=true;object.add(part);}
  object.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());if(![size.x,size.y,size.z].every(n=>Number.isFinite(n)&&n>1e-6))throw Error('模型整体尺寸无效');object.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));const root=new THREE.Group();root.name=spec.name;root.userData.geometryMethod='vision-image-parts-v1';root.add(object);root.scale.set(M(dimensions.w)/size.x,M(dimensions.h)/size.y,M(dimensions.d)/size.z);root.updateMatrixWorld(true);return await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true});
 }finally{object.traverse(o=>{o.geometry?.dispose();if(o.material)o.material.dispose();});}
}
Object.assign(window.View3D,{createImageModel});
