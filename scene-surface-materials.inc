// Shared atlas dimensions, grout and PBR maps for floors and wall faces.
const floorMats={};
const floorTextureSources=new WeakMap();
function refreshFloorTexture(texture){
 const record=floorTextureSources.get(texture);if(!record)return;
 const href=record.source[record.field];if(!href||href===record.href)return;
 record.href=href;const image=new Image();
 image.onload=()=>{if(record.href!==href)return;texture.image=image;texture.needsUpdate=true;};
 image.onerror=()=>{if(record.href===href)record.href=null;};image.src=href;
}
function floorMat(kind,layout){
 const key=(!PlanCore.floorMaterials[kind]?.source&&!layout?'legacy-':'')+SurfaceLayoutCore.key(kind,layout);if(floorMats[key])return floorMats[key];
 const meta=PlanCore.floorMaterials[kind]||PlanCore.floorMaterials.tile800,source=meta.source||layout?SurfaceTextures.pbr(kind,layout):PlanStyle.texture(kind);
 // Use the same immutable image as 2D. A long-lived canvas backing store can
 // become empty after background/context recovery while its saved image is intact.
 const textureOf=(field,fallback,color=false)=>{const canvas=document.createElement('canvas');canvas.width=source.canvas.width;canvas.height=source.canvas.height;const ctx=canvas.getContext('2d');ctx.fillStyle=fallback;ctx.fillRect(0,0,canvas.width,canvas.height);const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1000/source.w,1000/source.d);t.rotation=-(source.rotation||0)*Math.PI/180;if(color)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=renderer.capabilities.getMaxAnisotropy();t.userData.surfaceManaged=true;floorTextureSources.set(t,{source,field,href:null});refreshFloorTexture(t);return t;};
 const texture=textureOf('href',meta.sw,true);texture.userData.floorMaterial=kind;const material=new THREE.MeshStandardMaterial({map:texture,roughness:source.pbr?1:meta.roughness});if(source.pbr){material.normalMap=textureOf('normalHref','#8080ff');material.normalScale.setScalar(.35);material.roughnessMap=textureOf('roughHref','#b0b0b0');}
 material.userData.floorMaterial=kind;material.userData.surfaceLayout=SurfaceLayoutCore.normalized(kind,layout);material.userData.surfacePeriod=[source.w,source.d];return floorMats[key]=material;
}
globalThis.addEventListener?.('surface-texture-ready',()=>{for(const m of Object.values(floorMats))for(const t of [m.map,m.normalMap,m.roughnessMap])if(t?.userData.surfaceManaged)refreshFloorTexture(t);if(architectOpened)architectRequest();});
