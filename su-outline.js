import * as THREE from 'three';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';

// Screen-space geometry edges: coplanar wall partitions have no depth/normal
// discontinuity, so they cannot create the seams of per-mesh wireframes.
export class SUOutlinePass extends Pass{
 constructor(scene,camera){
  super();this.scene=scene;this.camera=camera;
  this.target=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthTexture:new THREE.DepthTexture(1,1,THREE.UnsignedIntType)});
  this.normal=new THREE.MeshNormalMaterial({blending:THREE.NoBlending});
  this.material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{tDiffuse:{value:null},tNormal:{value:this.target.texture},tDepth:{value:this.target.depthTexture},texel:{value:new THREE.Vector2()},cameraNear:{value:camera.near},cameraFar:{value:camera.far}},vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,fragmentShader:`
   #include <packing>
   varying vec2 vUv;
   uniform sampler2D tDiffuse,tNormal,tDepth;
   uniform vec2 texel;
   uniform float cameraNear,cameraFar;
   float distanceAt(vec2 uv){return -perspectiveDepthToViewZ(texture2D(tDepth,uv).x,cameraNear,cameraFar);}
   float depthEdge(float c,float a,float b){
    float slope=min(abs(c-a),abs(c-b));
    float limit=.012+c*.0015+2.0*slope;
    return smoothstep(limit,limit*2.0,abs(a+b-2.0*c));
   }
   void main(){
    vec2 dx=vec2(texel.x,0.0),dy=vec2(0.0,texel.y);
    float d=texture2D(tDepth,vUv).x;
    float z=distanceAt(vUv);
    float edge=max(depthEdge(z,distanceAt(vUv-dx),distanceAt(vUv+dx)),depthEdge(z,distanceAt(vUv-dy),distanceAt(vUv+dy)));
    vec3 n=texture2D(tNormal,vUv).xyz*2.0-1.0;
    float crease=0.0;
    for(int i=0;i<4;i++){
     vec2 uv=vUv+(i==0?dx:i==1?-dx:i==2?dy:-dy);
     float nd=texture2D(tDepth,uv).x;
     if(d<.99999&&nd<.99999){
      vec3 other=texture2D(tNormal,uv).xyz*2.0-1.0;
      crease=max(crease,smoothstep(.22,.48,1.0-dot(normalize(n),normalize(other))));
     }
    }
    vec4 color=texture2D(tDiffuse,vUv);
    gl_FragColor=vec4(mix(color.rgb,vec3(.018,.016,.013),max(edge,crease)*.78),color.a);
   }`});
  this.quad=new FullScreenQuad(this.material);
 }
 setSize(w,h){this.target.setSize(w,h);this.material.uniforms.texel.value.set(1/w,1/h);}
 render(renderer,writeBuffer,readBuffer){
  const oldTarget=renderer.getRenderTarget(),override=this.scene.overrideMaterial,background=this.scene.background,clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha(),shadows=renderer.shadowMap.enabled,hidden=[];
  try{
   this.scene.traverse(node=>{
    if(!node.visible)return;
    const materials=node.material?(Array.isArray(node.material)?node.material:[node.material]):[];
    if(node.isLine||node.isPoints||node.isSprite||materials.length&&materials.every(m=>m.transparent&&m.opacity<.5)){hidden.push(node);node.visible=false;}
   });
   this.scene.overrideMaterial=this.normal;this.scene.background=null;
   renderer.shadowMap.enabled=false;renderer.setClearColor(0x8080ff,1);
   renderer.setRenderTarget(this.target);renderer.clear();renderer.render(this.scene,this.camera);
  }finally{
   this.scene.overrideMaterial=override;this.scene.background=background;
   for(const node of hidden)node.visible=true;
   renderer.shadowMap.enabled=shadows;renderer.setClearColor(clear,alpha);renderer.setRenderTarget(oldTarget);
  }
  this.material.uniforms.tDiffuse.value=readBuffer.texture;
  this.material.uniforms.cameraNear.value=this.camera.near;this.material.uniforms.cameraFar.value=this.camera.far;
  renderer.setRenderTarget(this.renderToScreen?null:writeBuffer);this.quad.render(renderer);
 }
 dispose(){this.target.dispose();this.normal.dispose();this.material.dispose();this.quad.dispose();}
}
