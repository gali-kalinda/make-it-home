let windowModels=[];
import {SUOutlinePass} from './su-outline.js';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {SSAOPass} from 'three/addons/postprocessing/SSAOPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';

/* ============================================================
 *  3D 场景（three.js）—— 与 2D 共用 state / ui，切换时带过渡动画：
 *  2D → 3D：3D 相机先以正俯视对齐当前 2D 视口（比例、位置一致），
 *           交叉淡入后镜头倾斜环绕、墙体从地面升起、家具随后立起；
 *  3D → 2D：反向——家具收起、墙体下沉、镜头回到正俯视并淡出到平面图。
 * ============================================================ */
import * as THREE from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {PointerLockControls} from 'three/addons/controls/PointerLockControls.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {CSS2DRenderer, CSS2DObject} from 'three/addons/renderers/CSS2DRenderer.js';

const stage = $('#stage'), host = $('#view3d');
let OX=0, OY=0; const H = 2.8, FOV = 45;       // 户型中心放在世界原点，层高 2.8 m
const wx = x => (x - OX) / 1000, wz = y => (y - OY) / 1000, M = v => v / 1000;
const SW = () => stage.clientWidth, SH = () => stage.clientHeight;
const fullHeight=()=>Math.max(2.8,...state.structure.walls.map(w=>w.height/1000),...state.structure.columns.map(c=>c.height/1000));
const opt = {cut:2.8, furn:true, labels:true, night:false, hour:10, mode:'orbit'};

let inited = false, active = false, raf = 0, anim = null, fly = null;
let renderer, labelRenderer, scene, camera, orbit, walkCtl, hemi, sun, ground, glassMat, wallMat, capMat, frameMat;
let archFloor, archUp, furnG, labelG, lampG, colliders = [], selKey = null, selHelper = null;
let sigArch = '', sigFurn = '', sigLabels = '', grow = 1, furnGrow = 1;
const doors = [], keys = {};

/* ======================= 初始化 ======================= */
function init(){
  if (inited) return;
  renderer = new THREE.WebGLRenderer({antialias:true, preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(SW(), SH());
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  host.prepend(renderer.domElement);
  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(SW(), SH());resizeSceneStyle();
  Object.assign(labelRenderer.domElement.style, {position:'absolute', inset:'0', pointerEvents:'none'});
  host.appendChild(labelRenderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(FOV, SW()/SH(), .05, 3000);
  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true; orbit.maxPolarAngle = Math.PI*.495; orbit.minDistance = 1.5; orbit.maxDistance = 1000;
  walkCtl = new PointerLockControls(camera, document.body);
  walkCtl.addEventListener('lock', () => { $('#walkOverlay').style.display = 'none'; $('#cross').style.display = 'block'; });
  walkCtl.addEventListener('unlock', () => { if (opt.mode === 'walk'){ $('#walkOverlay').style.display = 'flex'; $('#cross').style.display = 'none'; } });

  hemi = new THREE.HemisphereLight(0xfff8ee, 0xb9a88f, 1.1);
  sun = new THREE.DirectionalLight(0xfff1dd, 2.6);
  sun.castShadow = true; sun.shadow.mapSize.setScalar(COARSE ? 2048 : 4096);   // 平板 GPU 用小一点的阴影贴图
  Object.assign(sun.shadow.camera, {left:-11, right:11, top:11, bottom:-11, near:1, far:60});
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
  ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160), new THREE.MeshStandardMaterial({color:0xf2eee7, roughness:1}));
  ground.rotation.x = -Math.PI/2; ground.position.y = -0.015; ground.receiveShadow = true;
  scene.add(hemi, sun, sun.target, ground);

  const pm = new THREE.PMREMGenerator(renderer); envTex = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
  glassMat = new THREE.MeshPhysicalMaterial({color:0xcfe6ef, roughness:.05, transparent:true, opacity:.28, depthWrite:false, side:THREE.DoubleSide});
  wallMat = mat('#f4f1eb', {roughness:.92}); capMat = mat('#34312d', {roughness:.9}); frameMat = mat('#5d6166', {roughness:.5, metalness:.4});

  archFloor = new THREE.Group(); archUp = new THREE.Group(); furnG = new THREE.Group(); labelG = new THREE.Group(); lampG = new THREE.Group();
  scene.add(archFloor, archUp, furnG, labelG, lampG);

  const cv = renderer.domElement; let downAt = null, look = null;
  cv.addEventListener('pointerdown', e => {
    downAt = [e.clientX, e.clientY]; window.closeDrawers();
    if (touchWalk && !look){ look = {id:e.pointerId, x:e.clientX, y:e.clientY}; cv.setPointerCapture(e.pointerId); }
  });
  cv.addEventListener('pointermove', e => {
    if (!look || e.pointerId !== look.id) return;
    lookBy(e.clientX - look.x, e.clientY - look.y); look.x = e.clientX; look.y = e.clientY;
  });
  cv.addEventListener('pointercancel', e => { if (look?.id === e.pointerId) look = null; });

  // 按住已选中的家具拖动：沿地面摆放（与 2D 共用网格和贴墙吸附）。
  // 在父元素上用捕获阶段监听，赶在 OrbitControls 之前关掉它，避免同时旋转镜头
  let fdrag = null;
  window.View3D.rotateDraggedFurniture = delta => {
    if (!fdrag || opt.mode !== 'orbit') return false;
    const f = getF(fdrag.id); if (!f) return false;
    f.rot = norm(f.rot + delta); fdrag.moved = true;
    const object = furnG.children.find(o => o.userData.fid === f.id);
    if (object) object.rotation.y = -f.rot * Math.PI / 180;
    updateSel(); return true;
  };
  host.addEventListener('pointerdown', e => {
    if (e.target !== cv || !e.isPrimary || anim || opt.mode !== 'orbit' || ui.sel?.kind !== 'furn') return;
    const h = pick(e), f = h?.fid === ui.sel.id && getF(h.fid), g = f && groundAt(e.clientX, e.clientY);
    if (!g) return;
    fdrag = {id:f.id, pid:e.pointerId, sx:e.clientX, sy:e.clientY, ox:g.x - f.cx, oy:g.y - f.cy, before:snap(), moved:false};
    orbit.enabled = false; fly = null; cv.setPointerCapture(e.pointerId);
  }, true);
  cv.addEventListener('pointermove', e => {
    if (!fdrag || e.pointerId !== fdrag.pid) return;
    if (!fdrag.moved && Math.hypot(e.clientX - fdrag.sx, e.clientY - fdrag.sy) < TAP) return;
    const f = getF(fdrag.id), g = groundAt(e.clientX, e.clientY); if (!f || !g) return;
    fdrag.moved = true; cv.style.cursor = 'grabbing';
    [f.cx, f.cy] = snapMove(f, g.x - fdrag.ox, g.y - fdrag.oy);
    const movedObject=furnG.children.find(o => o.userData.fid === f.id);if(movedObject){movedObject.position.set(wx(f.cx),M(f.elevation||0),wz(f.cy));movedObject.rotation.y=-f.rot*Math.PI/180;}   // 拖动中只挪模型，松手再整体同步
  });
  const endF = e => {
    if (!fdrag || e.pointerId !== fdrag.pid) return;
    const d = fdrag; fdrag = null; orbit.enabled = true; cv.style.cursor = '';
    if (d.moved){ commit(d.before); renderAll(); }
  };
  cv.addEventListener('pointerup', endF); cv.addEventListener('pointercancel', endF);

  cv.addEventListener('pointerup', e => {
    const tap = downAt && Math.hypot(e.clientX-downAt[0], e.clientY-downAt[1]) <= TAP;
    if (look?.id === e.pointerId){
      look = null;
      if (tap){ const h = pick(e); if(h?.windowModel&&h.dist<3.5)toggleWindow(h.windowModel);else if (h?.door && h.dist < 3.5) toggleDoor(h.door); }   // 漫游时点门开关
      return;
    }
    if (anim || opt.mode !== 'orbit' || !tap) return;
    const h = pick(e);
    if(h?.windowModel){window.select({kind:"opening",id:h.windowModel.id});window.drawer("panel",true);toggleWindow(h.windowModel);}else if (h?.door) toggleDoor(h.door);
    else if (h?.fid) window.select({kind:'furn', id:h.fid});
    else if (h?.room) window.select({kind:'room', id:h.room});
    else window.select(null);
  });
  new ResizeObserver(() => {
    renderer.setSize(SW(), SH()); labelRenderer.setSize(SW(), SH());resizeSceneStyle();
    const previousAspect=camera.aspect;camera.aspect=SW()/SH();camera.updateProjectionMatrix();if(active&&!anim&&opt.mode==="orbit"&&Math.abs(Math.log(camera.aspect/previousAspect))>.2)flyTo(isoWhole(),250);
  }).observe(stage);
  bindUI();inited=true;
}

/* ======================= 材质 ======================= */
const matCache = new Map();
let envTex = null, envK = 1;
function mat(color, o = {}){
  const key = color + JSON.stringify(o);
  if (!matCache.has(key)){
    const m = new THREE.MeshStandardMaterial({color, roughness:.7, ...o});
    // 金属 / 光滑表面挂环境反射，墙面等哑光材质不挂，避免整体变亮
    if (envTex && (m.metalness > 0 || m.roughness < .4)){ m.envMap = envTex; m.userData.env = m.metalness > .5 ? 1 : .5; m.envMapIntensity = m.userData.env*envK; }
    matCache.set(key, m);
  }
  return matCache.get(key);
}
function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rgbK = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = v => Math.max(0, Math.min(255, Math.round(v*k))); return `rgb(${f(n>>16&255)},${f(n>>8&255)},${f(n&255)})`; };
// 地面贴图按真实尺寸平铺（UV 单位 = 米）
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

/* ======================= 几何小工具（y = 底面高度） ======================= */
const asMat = m => typeof m === 'string' ? mat(m) : m;
const sh = o => { o.castShadow = o.receiveShadow = true; return o; };
const mesh = (geo, m) => sh(new THREE.Mesh(geo, asMat(m)));
const rot = (o, x = 0, y = 0, z = 0) => { o.rotation.set(x, y, z); return o; };
function box(w, h, d, m, x = 0, y = 0, z = 0){
  const o = mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h/2, z); return o;
}
function rbox(w, h, d, m, x = 0, y = 0, z = 0, r = .04){
  const o = mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w/2-.001, h/2-.001, d/2-.001)), m); o.position.set(x, y + h/2, z); return o;
}
function cyl(rt, rb, h, m, x = 0, y = 0, z = 0, seg = 28){
  const o = mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); o.position.set(x, y + h/2, z); return o;
}
// 旋转体：pts = [[半径, 高度], …] 自下而上，y = 底面
function lathe(pts, m, x = 0, y = 0, z = 0, seg = 40){
  const o = mesh(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(Math.max(r, 1e-4), h)), seg), m); o.position.set(x, y, z); return o;
}
// 两点之间的圆杆，r0 在 a 端、r1 在 b 端（收分椅腿、斜撑）
function rod(a, b, r0, m, r1 = r0, seg = 12){
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), o = mesh(new THREE.CylinderGeometry(r1, r0, A.distanceTo(B), seg), m);
  o.position.copy(A).add(B).multiplyScalar(.5); o.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.sub(A).normalize()); return o;
}
// 沿曲线的圆管（水龙头、扶手、灯臂）
const tube = (pts, r, m, seg = 40) => mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(...p)), false, 'centripetal'), seg, r, 10), m);
// 椭球（靠垫、叶片、豆袋），y = 中心
function blob(rx, ry, rz, m, x = 0, y = 0, z = 0, seg = 24){
  const o = mesh(new THREE.SphereGeometry(1, seg, Math.round(seg*.7)), m); o.scale.set(rx, ry, rz); o.position.set(x, y, z); return o;
}
// 水平圆环，y = 中心
function ring(R, r, m, x = 0, y = 0, z = 0){ const o = mesh(new THREE.TorusGeometry(R, r, 10, 48), m); o.rotation.x = Math.PI/2; o.position.set(x, y, z); return o; }
function rrect(w, d, r){
  const s = new THREE.Shape(), x = -w/2, y = -d/2; r = Math.min(r, w/2 - .001, d/2 - .001);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + d - r); s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d); s.quadraticCurveTo(x, y + d, x, y + d - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
// 中空圆角框（浴缸、水槽沿、椅背框）：外 w×d、壁厚 t、高 h
function shell(w, d, h, t, r, m, x = 0, y = 0, z = 0){
  const s = rrect(w, d, r); s.holes.push(rrect(w - 2*t, d - 2*t, Math.max(.004, r - t)));
  const geo = new THREE.ExtrudeGeometry(s, {depth:h, bevelEnabled:false, curveSegments:10}); geo.rotateX(-Math.PI/2);
  const o = mesh(geo, m); o.position.set(x, y, z); return o;
}
const darker = (hex, k = .8) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
const lighter = (hex, k = .2) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k).getHexString();
// 四条收分腿：inset 为距边距离，r 为腿底半径（顶部略粗）
const legs = (g, w, d, h, m, inset = .05, r = .02) => [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a, b]) => g.add(rod([a*(w/2-inset), 0, b*(d/2-inset)], [a*(w/2-inset), h, b*(d/2-inset)], r*.7, m, r)));
const metal = () => mat('#cfd2d4', {metalness:.9, roughness:.25});
const chrome = () => mat('#eef0f2', {metalness:1, roughness:.08});
const hwMat = () => mat('#b9b3a8', {metalness:.85, roughness:.3});
const blackMetal = () => mat('#2b2b2d', {metalness:.6, roughness:.4});
const mirror = () => mat('#dfeaee', {metalness:.55, roughness:.06});
const ceramic = (o = {}) => mat('#fbfbf9', {roughness:.12, ...o});
const fabric = c => mat(c, {roughness:.96});
const woodM = c => mat(c, {roughness:.55});
const screenMat = (glow = '#1a2636') => mat('#0b0e13', {roughness:.1, metalness:.3, emissive:glow, emissiveIntensity:.35});
const glowMat = (c = '#fff4dc', e = '#ffdca0', k = .5) => mat(c, {emissive:e, emissiveIntensity:k, roughness:.9, side:THREE.DoubleSide});

// 拉手：y 为拉手中心，z 为门板正面
function pull(g, len, vert, x, y, z){
  const m = hwMat(), o = new THREE.Group();
  o.add(vert ? box(.01, len, .01, m, 0, -len/2, .028) : box(len, .01, .01, m, 0, -.005, .028));
  [-1, 1].forEach(s => o.add(vert ? box(.008, .008, .028, m, 0, s*(len/2 - .015) - .004, .014) : box(.008, .008, .028, m, s*(len/2 - .015), -.004, .014)));
  o.position.set(x, y, z); g.add(o);
}
function knob(g, x, y, z){ const k = cyl(.011, .014, .02, hwMat(), x, y - .01, z + .01, 16); k.rotation.x = Math.PI/2; g.add(k, blob(.014, .014, .008, hwMat(), x, y, z + .022, 12)); }
// 柜门 / 抽屉面板：x0..x0+w、y0..y0+h 区域内 nx 列 × ny 行，正面朝 +z（z = 柜体正面）
// hd：'bar' 金属拉手 | 'knob' 圆钮 | 'edge' 顶部隐形拉槽 | 'none'；hy：门拉手中心高度（null = 面板中部）
function fronts(g, x0, y0, w, h, z, nx, ny, m, hd = 'bar', hy = null){
  const gap = .005, pw = w/nx, ph = h/ny, fz = z + .018;
  g.add(box(w, h, .002, '#2a2724', x0 + w/2, y0, z + .001));                     // 缝隙里透出的暗色
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++){
    const cx = x0 + pw*(i + .5), yb = y0 + ph*j, drawer = ph < .4 && pw >= ph;
    g.add(rbox(pw - gap, ph - gap, .018, m, cx, yb + gap/2, z + .009, .003));
    if (hd === 'none') continue;
    if (hd === 'edge'){ g.add(box(pw - .05, .01, .006, '#3c3a37', cx, yb + ph - gap - .018, fz)); continue; }
    if (drawer){ hd === 'knob' ? knob(g, cx, yb + ph/2, fz) : pull(g, Math.min(.3, pw*.45), false, cx, yb + ph/2, fz); continue; }
    const len = Math.min(.45, ph*.35), hx = nx === 1 ? cx + pw/2 - .045 : (i % 2 ? cx - pw/2 + .04 : cx + pw/2 - .04);
    const y = Math.min(yb + ph - .05 - len/2, Math.max(yb + .05 + len/2, hy ?? yb + ph/2));
    hd === 'knob' ? knob(g, hx, y, fz) : pull(g, len, true, hx, y, fz);
  }
}
const vasePts = (r, h) => [[0, 0], [r*.65, 0], [r, h*.32], [r*.92, h*.62], [r*.42, h*.86], [r*.5, h]];
function vase(g, x, y, z, r, h, c, R, flowers = true){
  g.add(lathe(vasePts(r, h), mat(c, {roughness:.35, side:THREE.DoubleSide}), x, y, z, 32));
  if (!flowers) return;
  const cols = ['#f3e6d8', '#e8b4a0', '#f6d27a', '#ffffff'];
  for (let k = 0; k < 5; k++){
    const a = k*1.26 + R()*.4, s = .03 + R()*.05, top = [x + Math.cos(a)*s, y + h + .12 + R()*.14, z + Math.sin(a)*s];
    g.add(rod([x, y + h*.6, z], top, .003, '#6f8f4a', .003, 6), blob(.022, .018, .022, cols[k % 4], ...top, 12));
  }
}
function tableLamp(g, x, y, z, s = 1){
  g.add(lathe([[0, 0], [.06*s, 0], [.075*s, .05*s], [.08*s, .12*s], [.055*s, .2*s], [.018*s, .25*s], [.012*s, .3*s]], ceramic({roughness:.3}), x, y, z, 32));
  g.add(lathe([[.13*s, 0], [.1*s, .18*s]], glowMat('#f6ecd9', '#ffdca0', .35), x, y + .26*s, z, 40), blob(.03*s, .03*s, .03*s, glowMat('#fff', '#ffe2b0', 1), x, y + .31*s, z, 12));
}
const plate = (g, r, x, y, z) => g.add(lathe([[0, 0], [r*.6, 0], [r*.72, .008], [r, .02]], ceramic({side:THREE.DoubleSide}), x, y, z, 32));

/* ======================= 家具模型（局部坐标：背面朝 -z） ======================= */
function buildFurniture(f){
  f={...DecorCatalogue.defaults(f.type),...f};
  if(f.assetId)return importedFurniture(f);
  const g = new THREE.Group(), w = M(f.w), d = M(f.d), c = f.color || '#ddd', bz = -d/2, R = rng(Math.round(f.w*7 + f.d*13 + f.cx + f.cy));
  if(!buildDecorFurniture(g,f,w,d,c)) switch (f.type){
    case 'bed': {
      const fr = woodM('#8d7258'), fab = fabric(c), fh = .3, mt = .22, top = fh + mt, n = Math.max(3, Math.round(w/.28)), sw = (w - .04)/n;
      g.add(box(w - .12, .06, d - .14, '#4a3e33', 0, 0, .03), rbox(w, fh - .06, d - .08, fr, 0, .06, .04, .015));        // 内缩踢脚 + 床箱
      g.add(rbox(w, 1.08, .06, fr, 0, 0, bz + .03, .012));                                                                 // 床头板
      for (let i = 0; i < n; i++) g.add(rbox(sw - .006, .62, .06, fabric(darker(c, .8)), -w/2 + .02 + sw*(i + .5), .42, bz + .08, .025));   // 竖向软包
      const md = d - .13, dd = md*.66, dz = d/2 - .015 - dd/2;
      g.add(rbox(w - .06, mt, md, '#f6f3ee', 0, fh, bz + .11 + md/2, .07));                                              // 床垫
      g.add(rbox(w + .02, .27, dd, fab, 0, top - .2, dz, .04), rbox(w + .024, .06, .22, fabric('#fbfaf7'), 0, top + .025, dz - dd/2 + .11, .025));   // 被子 + 翻边
      g.add(rbox(w + .05, .285, .42, fabric(darker(c, .62)), 0, top - .205, d/2 - .35, .03));                               // 床尾巾
      const np = w >= 1.3 ? 2 : 1, pw = (w - .16 - (np-1)*.06)/np;
      for (let i = 0; i < np; i++){
        const x = -w/2 + .08 + pw/2 + i*(pw + .06);
        g.add(rot(rbox(pw, .15, .42, fabric('#ffffff'), x, top - .01, bz + .34, .07), -.28), rot(rbox(pw*.62, .3, .1, fabric(i ? '#efe7da' : darker(c, .7)), x, top, bz + .54, .045), -.3));
      }
      break;
    }
    case 'sofa': case 'armchair': {
      const fab = fabric(c), dk = fabric(darker(c, .88)), a = Math.min(.18, w*.14), n = f.type === 'armchair' ? 1 : (w > 2.2 ? 3 : 2), cw = (w - 2*a)/n, bd = Math.min(.2, d*.24), lh = .12, sd = d - bd - .02;
      legs(g, w, d, lh, woodM('#3a3027'), .07, .018);
      g.add(rbox(w, .16, d, dk, 0, lh, 0, .03), rbox(w, .73, bd, dk, 0, lh, bz + bd/2, .06));
      [-1, 1].forEach(s => g.add(rbox(a, .5, d, dk, s*(w/2 - a/2), lh, 0, .07)));
      for (let i = 0; i < n; i++){
        const x = -w/2 + a + cw/2 + i*cw;
        g.add(rbox(cw - .012, .15, sd, fab, x, lh + .16, bz + bd + sd/2, .055), rot(rbox(cw - .03, .44, .16, fab, x, lh + .3, bz + bd + .08, .07), -.16));
      }
      if (n > 1) [-1, 1].forEach(s => g.add(rot(rbox(.42, .42, .12, fabric(s < 0 ? '#ece5d8' : darker(c, .7)), s*(w/2 - a - .26), lh + .32, bz + bd + .22, .06), -.3, s*-.25)));
      else g.add(rot(rbox(.4, .26, .1, fabric('#ece5d8'), 0, lh + .33, bz + bd + .2, .05), -.25));
      break;
    }
    case 'cornersofa': {
      const k = Math.min(.95, d*.56, w*.4), b = .2, fab = fabric(c), dk = fabric(darker(c, .88)), lh = .1, sw = (w - b - .2)/2;
      [[-w/2+.07, bz+.07], [w/2-.07, bz+.07], [w/2-.07, bz+k-.07], [-w/2+.07, d/2-.07], [-w/2+k-.07, d/2-.07], [-w/2+k-.07, bz+k-.07]]
        .forEach(([x, z]) => g.add(rod([x, 0, z], [x, lh, z], .012, woodM('#3a3027'), .018)));
      g.add(rbox(w, .18, k, dk, 0, lh, bz + k/2, .03), rbox(k, .18, d - k + .02, dk, -w/2 + k/2, lh, bz + k + (d - k)/2 - .01, .03));
      g.add(rbox(w, .72, b, dk, 0, lh, bz + b/2, .06), rbox(b, .72, d, dk, -w/2 + b/2, lh, 0, .06), rbox(.2, .5, k, dk, w/2 - .1, lh, bz + k/2, .07), rbox(k, .5, .2, dk, -w/2 + k/2, lh, d/2 - .1, .07));
      for (let i = 0; i < 2; i++){
        const x = -w/2 + b + sw/2 + i*sw;
        g.add(rbox(sw - .012, .15, k - b - .02, fab, x, lh + .18, bz + b + (k - b)/2, .055), rot(rbox(sw - .04, .42, .16, fab, x, lh + .3, bz + b + .07, .07), -.16));
      }
      g.add(rbox(k - b - .02, .15, d - k - .22, fab, -w/2 + b + (k - b)/2, lh + .18, bz + k + (d - k - .2)/2, .055));
      const L = d - .2 - b - .18, nl = Math.max(1, Math.round(L/.75));
      for (let i = 0; i < nl; i++) g.add(rot(rbox(.16, .42, L/nl - .03, fab, -w/2 + b + .07, lh + .3, bz + b + .18 + L/nl*(i + .5), .07), 0, 0, .16));
      g.add(rot(rbox(.42, .42, .12, fabric('#ece5d8'), -w/2 + b + .3, lh + .34, bz + b + .24, .06), -.35, .6), rot(rbox(.4, .4, .12, fabric(darker(c, .7)), w/2 - .5, lh + .34, bz + b + .2, .06), -.3, -.25));
      break;
    }
    case 'nightstand': {
      const wm = woodM(c);
      legs(g, w, d, .1, woodM('#5a4a3b'), .04, .014);
      g.add(rbox(w, .4, d - .02, wm, 0, .1, -.01, .012));
      fronts(g, -w/2 + .02, .12, w - .04, .36, d/2 - .02, 1, 2, wm, 'bar');
      tableLamp(g, -w*.12, .5, -d*.12);
      g.add(box(.16, .025, .22, '#2f5d62', w*.24, .5, .04), box(.14, .02, .2, '#e6dccd', w*.24, .525, .04));
      break;
    }
    case 'wardrobe': case 'cabinet': case 'shoecab': {
      const cm = mat(c, {roughness:.55}), fz = d/2 - .02;
      if (f.type === 'wardrobe'){
        const h = 2.2, n = Math.max(1, Math.round(w/.5));
        g.add(box(w - .02, .08, d - .06, '#4a4641', 0, 0, -.03), box(w, h - .08, d - .02, cm, 0, .08, -.01));
        fronts(g, -w/2, .08, w, h - .1, fz, n, 1, cm, 'bar', 1.05);
        g.add(box(w, .02, d - .02, darker(c, .9), 0, h - .02, -.01));
      } else if (f.type === 'shoecab'){
        const h = 1.0, y0 = .16, n = Math.max(1, Math.round(w/.45));
        g.add(box(w, h - y0, d - .02, cm, 0, y0, -.01), box(w - .04, .01, .03, glowMat('#fff7e6', '#ffe9c4', .8), 0, y0 - .01, fz - .06));   // 悬空 + 底部灯带
        fronts(g, -w/2, y0, w, h - y0, fz, n, 1, cm, 'edge');
        g.add(rbox(w + .01, .025, d, woodM(darker(c, .8)), 0, h, 0, .006));
        g.add(rbox(.22, .015, .14, woodM('#6b543f'), -w*.25, h + .025, 0, .006));
        vase(g, w*.28, h + .025, -.03, .05, .2, '#d8cfc2', R);
      } else {
        const h = .85, n = Math.max(1, Math.round(w/.5));
        legs(g, w, d, .1, woodM('#3a3027'), .05, .016);
        g.add(box(w, h - .13, d - .02, cm, 0, .1, -.01));
        fronts(g, -w/2, .62, w, .2, fz, n, 1, cm, 'bar');
        fronts(g, -w/2, .1, w, .52, fz, n, 1, cm, 'bar', .52);
        g.add(rbox(w + .02, .03, d + .01, woodM(darker(c, .78)), 0, h - .03, 0, .008));
        vase(g, w*.3, h, 0, .07, .24, '#e9e2d6', R);
        g.add(rot(box(.3, .38, .02, woodM('#3a3027'), -w*.25, h, bz + .06), -.12), rot(box(.25, .33, .005, '#d9cfbf', -w*.25, h + .03, bz + .075), -.12));   // 靠墙画框
        g.add(lathe([[0, 0], [.05, 0], [.12, .06], [.13, .07]], mat('#b8a58c', {roughness:.5, side:THREE.DoubleSide}), 0, h, .02, 32));
        for (let k = 0; k < 3; k++) g.add(blob(.035, .035, .035, ['#d98c4a', '#c9ad4f', '#b5463a'][k], Math.cos(k*2.1)*.04, h + .045, .02 + Math.sin(k*2.1)*.04, 14));
      }
      break;
    }
    case 'dresser': {
      const wm = woodM(c), r = Math.min(.34, w*.3);
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a, b]) => g.add(rod([a*(w/2 - .04), 0, b*(d/2 - .04)], [a*(w/2 - .05), .58, b*(d/2 - .05)], .012, wm, .02)));
      g.add(box(w - .04, .14, d - .04, wm, 0, .58), rbox(w, .03, d, wm, 0, .72, 0, .008));
      fronts(g, -w/2 + .03, .585, w - .06, .13, d/2 - .02, 2, 1, wm, 'knob');
      const mr = new THREE.Mesh(new THREE.TorusGeometry(r, .018, 12, 64), woodM(darker(c, .7))); mr.position.set(0, .77 + r, bz + .04); sh(mr);
      const mg = new THREE.Mesh(new THREE.CircleGeometry(r, 64), mirror()); mg.position.set(0, .77 + r, bz + .035);
      g.add(mr, mg, box(.08, .03, .06, woodM(darker(c, .7)), 0, .75, bz + .04));
      [['#e7c9b5', .03, .09], ['#b9d0d8', .025, .12], ['#f0e3cf', .02, .07]].forEach(([cc, rr, hh], i) => g.add(cyl(rr, rr, hh, mat(cc, {roughness:.15, transparent:true, opacity:.8}), w*.25 + i*.06, .75, .02)));
      g.add(rbox(.16, .06, .1, woodM('#6b543f'), -w*.28, .75, .03, .01));
      const sz = d/2 + .25;
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a, b]) => g.add(rod([a*.13, 0, sz + b*.13], [a*.12, .4, sz + b*.12], .01, wm, .014)));
      g.add(rbox(.34, .08, .34, fabric('#e8ddd0'), 0, .4, sz, .035));
      break;
    }
    case 'desk': {
      const tm = woodM(c), bm = blackMetal();
      g.add(rbox(w, .025, d, tm, 0, .72, 0, .006));
      [-1, 1].forEach(s => {
        const x = s*(w/2 - .06);
        g.add(box(.03, .72, .03, bm, x, 0, d/2 - .06), box(.03, .72, .03, bm, x, 0, bz + .06), box(.03, .03, d - .1, bm, x, 0, 0), box(.03, .03, d - .1, bm, x, .69, 0));
      });
      g.add(box(w - .12, .04, .015, bm, 0, .66, bz + .06), box(.4, .09, d - .12, tm, w/2 - .32, .63, 0));
      pull(g, .16, false, w/2 - .32, .675, d/2 - .06);
      const my = .745, mz = bz + .15;
      g.add(rbox(.22, .012, .16, bm, 0, my, mz, .004), rod([0, my, mz - .02], [0, my + .2, mz - .03], .012, bm));
      g.add(rbox(.62, .37, .02, '#1d1d1f', 0, my + .12, mz - .04, .006), box(.6, .33, .002, screenMat('#27405c'), 0, my + .15, mz - .029));
      g.add(rbox(.42, .015, .13, '#e8e8ea', 0, my, .06, .004), rbox(.4, .004, .11, '#d2d2d6', 0, my + .014, .06, .002), blob(.03, .015, .05, '#e8e8ea', .3, my + .012, .07, 16));
      const lx = -w/2 + .15, lz = bz + .12;
      g.add(cyl(.07, .075, .02, bm, lx, my, lz, 28), tube([[lx, my + .02, lz], [lx, my + .3, lz + .03], [lx + .12, my + .42, lz + .1]], .008, bm));
      const hd = cyl(.02, .06, .1, bm, lx + .14, my + .34, lz + .12, 24); hd.rotation.x = .5; g.add(hd);
      g.add(cyl(.04, .038, .09, ceramic({roughness:.3}), w/2 - .15, my, .05, 20), rbox(.2, .015, .28, '#3b5566', -w/2 + .3, my, .1, .004));
      break;
    }
    case 'chair': {
      const lw = woodM('#6b543f'), fab = fabric(c), sy = .44;
      [[-1, 1], [1, 1]].forEach(([s]) => g.add(rod([s*(w/2 - .04), 0, d/2 - .05], [s*(w/2 - .05), sy, d/2 - .07], .012, lw, .018)));
      [-1, 1].forEach(s => g.add(rod([s*(w/2 - .04), 0, bz + .03], [s*(w/2 - .05), .86, bz + .07], .012, lw, .018)));
      g.add(box(w - .08, .025, .02, lw, 0, .15, d/2 - .06), box(w - .08, .025, .02, lw, 0, .15, bz + .05));
      [-1, 1].forEach(s => g.add(box(.02, .025, d - .12, lw, s*(w/2 - .045), .18, 0)));
      g.add(box(w - .06, .04, d - .1, lw, 0, sy - .03, 0), rbox(w - .04, .05, d - .08, fab, 0, sy, .005, .022));
      g.add(rot(rbox(w - .08, .15, .025, lw, 0, .66, bz + .065, .012), -.12), rot(box(w - .08, .025, .02, lw, 0, .52, bz + .055), -.12));
      break;
    }
    case 'bookshelf': {
      const h = 1.8, t = .022, ns = 5, wm = woodM(c), sh0 = (h - .06 - t)/ns, cols = ['#b88a6a','#6f8f8a','#d9c08c','#9aa58c','#a8675e','#e6dccd','#7d8ea3','#c9bfae'];
      g.add(box(w, h, .012, woodM(darker(c, .85)), 0, 0, bz + .006), box(t, h, d, wm, -w/2 + t/2), box(t, h, d, wm, w/2 - t/2), box(w - 2*t, .06, d - .03, wm, 0, 0, .0));
      for (let s = 0; s <= ns; s++){
        const y = s < ns ? .06 + s*sh0 : h - t; g.add(box(w - 2*t, t, d - .012, wm, 0, y, .006));
        if (s === ns) break;
        const yb = y + t, end = w/2 - t - .01; let x = -w/2 + t + .01, deco = R() < .55 ? x + R()*(w - .45) : 99;
        while (x < end - .03){
          if (x >= deco){
            deco = 99;
            if (R() < .5) vase(g, x + .07, yb, 0, .045, .16, cols[Math.floor(R()*8)], R, false);
            else for (let k = 0; k < 3; k++) g.add(box(.2 - k*.02, .028, d*.7, mat(cols[Math.floor(R()*8)], {roughness:.8}), x + .1, yb + k*.028, .01));
            x += .2; continue;
          }
          if (R() < .07){ x += .03 + R()*.05; continue; }
          const bw = .018 + R()*.03, bh = Math.min(sh0 - t - .03, .17 + R()*.13), bd = d*(.62 + R()*.22);
          if (x + bw > end) break;
          g.add(box(bw, bh, bd, mat(cols[Math.floor(R()*8)], {roughness:.75}), x + bw/2, yb, d/2 - .015 - bd/2));
          x += bw + .002;
        }
      }
      break;
    }
    case 'baycushion':
      g.add(rbox(w, .08, d, fabric(c), 0, .45, 0, .03));
      g.add(rot(rbox(w - .1, .34, .14, fabric('#ffffff'), 0, .52, bz + .14, .06), .25), rot(rbox(w - .1, .34, .14, fabric('#f0e6d6'), 0, .52, d/2 - .14, .06), -.25));
      g.add(rbox(w*.8, .04, .3, fabric(darker(c, .7)), 0, .53, d*.12, .02), rbox(.28, .015, .2, woodM('#8d7258'), 0, .53, -d*.15, .006), cyl(.035, .03, .06, ceramic(), 0, .545, -d*.15, 20));
      break;
    case 'coffeetable': {
      const tm = mat(c, {roughness:.35}), lw = woodM('#3a3027');
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a, b]) => g.add(rod([a*(w/2 - .05), 0, b*(d/2 - .05)], [a*(w/2 - .07), .365, b*(d/2 - .07)], .012, lw, .02)));
      g.add(rbox(w, .035, d, tm, 0, .365, 0, .015), rbox(w - .12, .02, d - .12, woodM(darker(c, .85)), 0, .12, 0, .006));
      g.add(box(.3, .03, .22, '#2f5d62', w*.2, .14, 0), box(.26, .025, .19, '#d9b36c', w*.2, .17, .01));
      g.add(rbox(.38, .015, .24, woodM('#6b543f'), -w*.2, .4, 0, .006), box(.22, .025, .16, '#e6dccd', -w*.22, .415, 0));
      g.add(lathe([[0, 0], [.025, 0], [.035, .07], [.034, .08]], ceramic({side:THREE.DoubleSide}), -w*.12, .415, .06, 20));
      vase(g, w*.24, .4, -.05, .055, .18, '#e9e2d6', R);
      break;
    }
    case 'tvstand': {
      const sm = mat(c, {roughness:.5}), n = Math.max(2, Math.round(w/.6));
      legs(g, w, d, .1, blackMetal(), .08, .012);
      g.add(rbox(w, .4, d - .02, sm, 0, .1, -.01, .01));
      fronts(g, -w/2 + .005, .105, w - .01, .39, d/2 - .02, n, 1, sm, 'edge');
      g.add(rbox(1.45, .84, .025, mat('#18181a', {roughness:.4, metalness:.3}), 0, .95, bz + .03, .004), box(1.43, .81, .002, screenMat(), 0, .962, bz + .0435));
      g.add(rbox(.9, .06, .09, '#2a2a2c', 0, .5, -.02, .02), box(.86, .045, .002, fabric('#3a3a3c'), 0, .507, .026));
      vase(g, w/2 - .25, .5, 0, .06, .26, '#d8cfc2', R);
      g.add(box(.25, .035, .18, '#a9433b', -w/2 + .3, .5, 0), box(.22, .03, .16, '#e6dccd', -w/2 + .3, .535, 0));
      break;
    }
    case 'rug':
      [[w, d, .01, c, 0], [w - .16, d - .16, .002, darker(c, .82), .01], [w - .26, d - .26, .002, lighter(c, .12), .0115]].forEach(([a, b, h, cc, y]) => {
        const r = box(a, h, b, mat(cc, {roughness:1}), 0, y + .002); r.castShadow = false; g.add(r);
      });
      break;
    case 'plant': {
      const r = Math.min(w, d)/2, H = .9 + r*1.6, pot = mat('#d9d2c5', {roughness:.6}), lm = [mat('#5f8f4e', {roughness:.6, side:THREE.DoubleSide}), mat('#79a862', {roughness:.6, side:THREE.DoubleSide})];
      g.add(lathe([[0, 0], [r*.4, 0], [r*.44, .02], [r*.54, .36], [r*.57, .4], [r*.52, .4], [r*.5, .37], [0, .37]], pot, 0, 0, 0, 36), cyl(r*.49, r*.49, .005, '#4a3a2c', 0, .368, 0, 28));
      g.add(rod([0, .37, 0], [.02, H*.62, -.01], .016, '#6b5540', .009));
      const N = 20 + Math.round(r*36), sc = Math.sqrt(r/.25);
      for (let k = 0; k < N; k++){
        const t = k/N, a = k*2.399 + R()*.3, len = (.14 + R()*.08)*(1.1 - t*.4)*sc, s0 = .03 + R()*.08*sc, p = new THREE.Group();
        p.position.set(0, H*(.42 + .58*t), 0); p.rotation.set(0, -a, .1 + t*.5 + R()*.3, 'YXZ');
        const lf = blob(len/2, .005, len*.27, lm[k % 2], s0 + len/2, 0, 0, 16); lf.rotation.z = -.3;
        p.add(box(s0, .005, .005, '#6f8f4a', s0/2, 0, 0), lf); g.add(p);
      }
      break;
    }
    case 'table': {
      const tm = mat(c, {roughness:.4}), lw = woodM(darker(c, .55)), ns = Math.max(1, Math.round(w/.62)), top = .75;
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a, b]) => g.add(rod([a*(w/2 - .08), 0, b*(d/2 - .08)], [a*(w/2 - .1), .715, b*(d/2 - .1)], .016, lw, .026)));
      g.add(rbox(w, .035, d, tm, 0, .715, 0, .012), box(w - .22, .07, d - .22, lw, 0, .645));
      g.add(box(w*.7, .003, .32, fabric('#b9a58c'), 0, top, 0));
      for (let i = 0; i < ns; i++) [-1, 1].forEach(s => {
        const x = -w/2 + w/ns*(i + .5), z = s*(d/2 - .17);
        g.add(box(.38, .003, .28, fabric('#e7dfd1'), x, top, z)); plate(g, .12, x, top + .003, z);
        g.add(cyl(.03, .026, .1, mat('#dfeef3', {transparent:true, opacity:.35, roughness:.05}), x + .15, top + .003, z - s*.1, 16));
      });
      vase(g, 0, top + .003, 0, .06, .2, '#e9e2d6', R);
      break;
    }
    case 'roundtable': {
      const b = Math.min(.25, w*.3), lw = woodM('#4a3e33'), top = .75;
      g.add(lathe([[b, 0], [b, .015], [b*.8, .035], [.06, .12], [.045, .35], [.05, .6], [.12, .69], [.18, .715]], lw, 0, 0, 0, 40), cyl(w/2, w/2, .035, mat(c, {roughness:.4}), 0, .715, 0, 64));
      for (let k = 0; k < 4; k++){ const a = k*Math.PI/2 + .4, rr = w/2 - .17; plate(g, .11, Math.cos(a)*rr, top, Math.sin(a)*rr); }
      vase(g, 0, top, 0, .05, .18, '#e9e2d6', R);
      break;
    }
    case 'counter': {
      const cm = mat(c, {roughness:.45}), stone = mat('#dcd7cf', {roughness:.22}), n = Math.max(1, Math.round(w/.6)), fz = d/2 - .04;
      g.add(box(w - .01, .1, d - .1, '#4a4641', 0, 0, -.05), box(w, .72, d - .04, cm, 0, .1, -.02));
      fronts(g, -w/2, .64, w, .18, fz, n, 1, cm, 'bar'); fronts(g, -w/2, .1, w, .54, fz, n, 1, cm, 'bar', .56);
      g.add(rbox(w + .01, .04, d, stone, 0, .82, 0, .004), box(w, .62, .01, mat('#efece6', {roughness:.3}), 0, .86, bz + .005));
      g.add(box(w, .7, .33, cm, 0, 1.48, bz + .165)); fronts(g, -w/2, 1.48, w, .7, bz + .33, n, 1, cm, 'bar', 1.56);
      g.add(box(w - .04, .01, .02, glowMat('#fff7e6', '#ffe9c4', .8), 0, 1.47, bz + .29));
      if (w >= .8){
        g.add(rbox(.36, .018, .25, woodM('#c9a27a'), -w/2 + .3, .86, .0, .005));
        [.07, .06, .05].forEach((r, i) => g.add(cyl(r, r, .16 - i*.03, mat(['#e9e2d6', '#d6cfc3', '#bfb6a8'][i], {roughness:.4}), w/2 - .15 - i*.15, .86, bz + .1, 24)));
        g.add(cyl(.05, .045, .14, ceramic({roughness:.3}), w/2 - .6, .86, bz + .1, 20));
        for (let k = 0; k < 4; k++) g.add(rod([w/2 - .6, .9, bz + .1], [w/2 - .6 + (k - 1.5)*.018, 1.1, bz + .1 + (k % 2 - .5)*.02], .005, woodM('#8d7258'), .006, 6));
      }
      break;
    }
    case 'stove': {
      const sm = mat('#b9bec3', {metalness:.8, roughness:.3});
      g.add(rbox(w, .012, d, mat('#0d0d0e', {roughness:.06, metalness:.3}), 0, .862, 0, .004));
      (w/d > 1.4 ? [[-w/4, 0], [w/4, 0]] : [[-w/4,-d/4],[w/4,-d/4],[-w/4,d/4],[w/4,d/4]]).forEach(([x, z]) => {
        g.add(cyl(.085, .09, .008, '#2b2b2b', x, .874, z, 32), cyl(.045, .05, .014, mat('#6b5a45', {metalness:.7, roughness:.35}), x, .874, z, 28), cyl(.028, .028, .022, '#1a1a1a', x, .874, z, 20));
        for (let k = 0; k < 5; k++){ const a = k*Math.PI*2/5; g.add(rot(box(.07, .014, .012, '#1c1c1c', x + Math.cos(a)*.1, .874, z + Math.sin(a)*.1), 0, -a)); }
        g.add(cyl(.02, .022, .018, '#222', x, .874, d/2 - .04, 20));
      });
      g.add(rbox(w, .06, .5, sm, 0, 1.55, bz + .25, .01), box(.3, .72, .26, sm, 0, 1.61, bz + .13));
      g.add(rot(box(w - .02, .3, .008, mat('#15181b', {roughness:.05, metalness:.5}), 0, 1.58, bz + .38), -.9), box(.16, .012, .003, mat('#101214', {emissive:'#6fd0ff', emissiveIntensity:.6}), 0, 1.575, bz + .502));
      break;
    }
    case 'ksink': {
      const st = mat('#c7ccd1', {metalness:.85, roughness:.28}), inner = mat('#9aa1a8', {metalness:.8, roughness:.35}), two = w >= .75, bw = two ? w*.42 : w*.7, bd = d*.66;
      g.add(box(w, .008, d, st, 0, .862, 0));
      (two ? [-w*.23, w*.23] : [0]).forEach(x => g.add(shell(bw, bd, .02, .015, .04, st, x, .862, .03), box(bw - .03, .002, bd - .03, inner, x, .87, .03), cyl(.03, .03, .003, chrome(), x, .872, .03, 20)));
      const fx = two ? 0 : w*.3, cm = chrome();
      g.add(cyl(.025, .028, .03, cm, fx, .87, bz + .06, 20), tube([[fx, .9, bz + .06], [fx, 1.12, bz + .06], [fx, 1.17, bz + .1], [fx, 1.14, bz + .18], [fx, 1.08, bz + .2]], .012, cm));
      g.add(rot(box(.012, .012, .09, cm, fx + .035, .98, bz + .09), -.3));
      break;
    }
    case 'fridge': {
      const fm = mat(c, {metalness:.45, roughness:.28}), h = 1.8, fz = d/2 - .05;
      g.add(box(w - .02, .06, d - .06, '#2a2c2e', 0, 0, -.03), rbox(w, h - .06, d - .05, fm, 0, .06, -.025, .02), box(w - .01, h - .07, .003, '#2a2c2e', 0, .065, fz + .0015));
      if (w > .85){
        [-1, 1].forEach(s => { g.add(rbox(w/2 - .004, h - .08, .04, fm, s*w/4, .07, fz + .023, .012)); pull(g, .8, true, s*.035, 1.05, fz + .043); });
        g.add(box(.1, .14, .003, screenMat('#2a6f8f'), -w/4, 1.25, fz + .044));
      } else {
        g.add(rbox(w - .006, 1.06, .04, fm, 0, .72, fz + .023, .012), rbox(w - .006, .64, .04, fm, 0, .07, fz + .023, .012));
        pull(g, .5, true, -w/2 + .06, 1.05, fz + .043); pull(g, w*.5, false, 0, .64, fz + .043);
        g.add(box(.08, .1, .003, screenMat('#2a6f8f'), w*.22, 1.4, fz + .044));
      }
      break;
    }
    case 'toilet': {
      const cer = ceramic(), Rb = w*.45, zc = bz + d*.62, kz = (d*.37)/Rb, cm = chrome();
      g.add(rbox(w*.88, .4, d*.24, cer, 0, .36, bz + d*.12, .04), rbox(w*.92, .03, d*.27, cer, 0, .76, bz + d*.135, .012), cyl(.022, .022, .006, cm, 0, .79, bz + d*.135, 20));
      const ped = lathe([[0, 0], [Rb*.62, 0], [Rb*.66, .02], [Rb*.56, .12], [Rb*.62, .22], [Rb*.92, .33], [Rb, .37]], cer, 0, 0, zc, 40);
      const seat = cyl(Rb*1.01, Rb*1.01, .022, mat('#f4f4f2', {roughness:.2}), 0, .37, zc, 40), lid = cyl(Rb*.97, Rb*.99, .02, mat('#f4f4f2', {roughness:.2}), 0, .392, zc, 40);
      ped.scale.z = seat.scale.z = lid.scale.z = kz; g.add(ped, seat, lid);
      [-1, 1].forEach(s => g.add(box(.03, .02, .03, cm, s*w*.18, .39, zc - Rb*kz - .005)));
      break;
    }
    case 'vanity': {
      const vm = mat(c, {roughness:.5}), stone = mat('#fafafa', {roughness:.18}), nb = w >= 1.1 ? 2 : 1, cd = d - .04, cm = chrome();
      g.add(rbox(w, .45, cd, vm, 0, .33, bz + cd/2, .008));
      fronts(g, -w/2 + .005, .335, w - .01, .44, d/2 - .04, nb, 2, vm, 'edge');
      g.add(rbox(w, .03, d, stone, 0, .78, 0, .006));
      const rb = Math.min(.19, w/nb*.36);
      for (let i = 0; i < nb; i++){
        const x = nb === 1 ? 0 : (i ? w/4 : -w/4);
        g.add(lathe([[0, 0], [rb*.55, 0], [rb*.85, .03], [rb, .1], [rb*.97, .12]], ceramic({side:THREE.DoubleSide}), x, .81, .03, 40), cyl(.018, .018, .003, cm, x, .812, .03, 16));
        g.add(cyl(.02, .022, .02, cm, x, .81, bz + .06, 16), tube([[x, .83, bz + .06], [x, 1.03, bz + .06], [x, 1.07, bz + .11], [x, 1.03, bz + .15]], .01, cm), rot(box(.01, .01, .06, cm, x, 1.05, bz + .04), .4));
      }
      const mw = Math.min(w*.9, nb*.7);
      g.add(rbox(mw + .02, .82, .02, glowMat('#fff7e6', '#ffe9c4', .9), 0, 1.14, bz + .01, .01), box(mw, .8, .01, mirror(), 0, 1.15, bz + .025));
      g.add(cyl(.028, .028, .12, mat('#c8b8a6', {roughness:.3}), w/2 - .08, .81, bz + .1, 16), rbox(.18, .03, .12, fabric('#e9e2d6'), -w/2 + .12, .81, .05, .012));
      break;
    }
    case 'shower': {
      const cm = chrome(), x = -w/4;
      g.add(rbox(w, .05, d, mat('#f4f4f2', {roughness:.3}), 0, 0, 0, .01), box(w*.6, .003, .05, mat('#9aa1a8', {metalness:.8, roughness:.3}), 0, .05, bz + .08));
      [[w, .01, 0, d/2 - .005], [.01, d, w/2 - .005, 0]].forEach(([gw, gd, px, pz]) => { const p = box(gw, 1.95, gd, glassMat, px, .05, pz); p.castShadow = false; g.add(p); });
      g.add(box(.02, 1.95, .02, frameMat, w/2 - .01, .05, d/2 - .01), box(.02, 1.95, .03, frameMat, -w/2 + .01, .05, d/2 - .005), box(.03, 1.95, .02, frameMat, w/2 - .005, .05, bz + .01));
      g.add(box(w, .015, .02, frameMat, 0, 1.985, d/2 - .005), box(.02, .015, d, frameMat, w/2 - .005, 1.985, 0));
      g.add(rbox(.14, .1, .04, cm, x, 1.0, bz + .02, .01), rod([x, 1.1, bz + .03], [x, 1.95, bz + .03], .012, cm));
      g.add(tube([[x, 1.95, bz + .03], [x, 2.02, bz + .06], [x, 2.03, bz + .22]], .01, cm), rbox(.24, .012, .24, cm, x, 2.02, bz + .25, .004));
      g.add(rot(cyl(.015, .02, .2, cm, x + .1, 1.25, bz + .05, 16), .25), blob(.03, .012, .03, cm, x + .1, 1.47, bz + .08, 16));
      g.add(box(.26, .012, .1, ceramic(), w/2 - .2, 1.2, bz + .05));
      [['#e6dccd', .03, .18], ['#2f5d62', .025, .15], ['#f4f4f2', .028, .12]].forEach(([cc, r, hh], i) => g.add(cyl(r, r, hh, mat(cc, {roughness:.3}), w/2 - .28 + i*.07, 1.212, bz + .05, 16)));
      break;
    }
    case 'bathtub': {
      const cer = ceramic(), h = .56, t = .07, cm = chrome();
      g.add(shell(w, d, h, t, .14, cer), box(w - .1, .12, d - .1, cer, 0, 0, 0), box(w - 2*t + .004, .004, d - 2*t + .004, mat('#bfe0ea', {roughness:.03, transparent:true, opacity:.6}), 0, .4, 0));
      const fx = w/2 - t/2;
      g.add(tube([[fx, h - .02, 0], [fx, h + .1, 0], [fx - .06, h + .13, 0], [fx - .13, h + .09, 0]], .014, cm));
      [-1, 1].forEach(s => g.add(cyl(.02, .02, .04, cm, fx, h, s*.1, 16)));
      g.add(rot(rbox(.08, .16, .3, cer, -w/2 + t + .06, h - .12, 0, .04), 0, 0, -.5), rbox(.22, .05, .16, fabric('#e9e2d6'), fx - .05, h, d/2 - .1, .02));
      break;
    }
    case 'washer': case 'dryer': {
      const bm = mat(c, {roughness:.35}), R0 = Math.min(w, d)*.25, fz = d/2 - .02;
      g.add(box(w - .02, .04, d - .04, '#8f969b', 0, 0, -.02), rbox(w, .81, d - .02, bm, 0, .04, -.01, .025));
      g.add(box(w - .04, .1, .006, lighter(c, .3), 0, .72, fz + .003), rbox(.18, .07, .01, bm, -w/2 + .12, .735, fz + .006, .004));
      g.add(box(.12, .035, .003, screenMat('#1f6f6a'), w*.14, .745, fz + .007));
      const kn = cyl(.03, .03, .02, chrome(), -w*.02, .75, fz + .016, 28); kn.rotation.x = Math.PI/2; g.add(kn);
      const dr = new THREE.Mesh(new THREE.CircleGeometry(R0, 40), mat('#1b1f22', {roughness:.6})); dr.position.set(0, .4, fz + .004); g.add(dr);
      const rg = new THREE.Mesh(new THREE.TorusGeometry(R0 + .02, .022, 14, 48), mat('#c7cfd5', {metalness:.7, roughness:.25})); rg.position.set(0, .4, fz + .016); sh(rg); g.add(rg);
      const Rs = R0*1.42, cap = new THREE.Mesh(new THREE.SphereGeometry(Rs, 32, 12, 0, Math.PI*2, 0, .78), mat(f.type === 'dryer' ? '#4a4038' : '#26343d', {roughness:.04, metalness:.2, transparent:true, opacity:.8}));
      cap.rotation.x = Math.PI/2; cap.position.set(0, .4, fz + .012 - Rs*Math.cos(.78)); g.add(cap);
      g.add(box(w - .06, .004, .003, '#b9c3ca', 0, .08, fz + .002));
      break;
    }
    case 'crib': {
      const wm = woodM(c);
      g.add(rbox(w - .09, .12, d - .09, fabric('#ffffff'), 0, .3, 0, .04), box(w - .06, .025, d - .06, wm, 0, .28));
      [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([a, b]) => g.add(rbox(.045, .95, .045, wm, a*(w/2 - .022), 0, b*(d/2 - .022), .008), blob(.028, .028, .028, wm, a*(w/2 - .022), .97, b*(d/2 - .022), 14)));
      [-1, 1].forEach(s => {
        const z = s*(d/2 - .022), x = s*(w/2 - .022);
        g.add(rbox(w - .05, .035, .03, wm, 0, .88, z, .008), rbox(w - .05, .035, .03, wm, 0, .25, z, .008), rbox(.03, .035, d - .05, wm, x, .88, 0, .008), rbox(.03, .035, d - .05, wm, x, .25, 0, .008));
        for (let p = -w/2 + .09; p < w/2 - .05; p += .075) g.add(rod([p, .28, z], [p, .88, z], .009, wm, .009, 8));
        for (let p = -d/2 + .09; p < d/2 - .05; p += .075) g.add(rod([x, .28, p], [x, .88, p], .009, wm, .009, 8));
      });
      g.add(rbox(w*.5, .03, d - .14, fabric('#f3d9c9'), w*.12, .42, 0, .015), rbox(.3, .06, .2, fabric('#fbfaf7'), -w/2 + .22, .42, 0, .03));
      const bx = -w*.3 + .1, bear = '#c9a27a';
      g.add(blob(.05, .06, .045, bear, bx, .5, .12), blob(.045, .042, .04, bear, bx, .59, .12), blob(.016, .016, .01, bear, bx - .032, .625, .12), blob(.016, .016, .01, bear, bx + .032, .625, .12));
      break;
    }
    case 'beanbag': {
      const fab = mat(c, {roughness:.95});
      g.add(blob(w*.5, .3, d*.5, fab, 0, .3, 0, 40), blob(w*.42, .22, d*.22, fab, 0, .5, bz + d*.26, 32));
      break;
    }
    case 'sidetable': {
      const r = Math.min(w, d)/2, bm = blackMetal();
      g.add(lathe([[r*.55, 0], [r*.55, .012], [.03, .035], [.018, .3], [.025, .5], [.08, .52]], bm, 0, 0, 0, 40), cyl(r, r*.98, .025, mat(c, {roughness:.35}), 0, .52, 0, 48));
      g.add(box(.16, .02, .12, '#4f6b8a', -r*.25, .545, 0));
      vase(g, r*.35, .545, -r*.1, .035, .12, '#e9e2d6', R, false);
      break;
    }
    case 'floorlamp': {
      const r = Math.min(w, d)/2, lm = mat(c, {roughness:.35, metalness:.5});
      g.add(lathe([[0, 0], [r*.55, 0], [r*.58, .012], [r*.5, .03], [.02, .035]], lm, 0, 0, 0, 40), rod([0, .03, 0], [0, 1.36, 0], .011, lm));
      g.add(lathe([[r*.85, 0], [r*.55, .36]], glowMat('#f6ecd9', '#ffdca0', .45), 0, 1.22, 0, 48), blob(.035, .035, .035, glowMat('#fff', '#ffe2b0', 1.2), 0, 1.36, 0, 12));
      g.add(ring(r*.85, .004, lm, 0, 1.22, 0), ring(r*.55, .004, lm, 0, 1.58, 0));
      break;
    }
    case 'island': {
      const cm = mat(c, {roughness:.45}), stone = mat('#dcd7cf', {roughness:.2}), cd = d - .3, n = Math.max(1, Math.round((w - .1)/.6)), cab = new THREE.Group(), fz = cd/2 - .03;
      cab.add(box(w - .12, .1, cd - .08, '#4a4641', 0, 0, -.04), box(w - .1, .74, cd - .03, cm, 0, .1, -.015));
      fronts(cab, -w/2 + .05, .64, w - .1, .2, fz, n, 1, cm, 'bar'); fronts(cab, -w/2 + .05, .1, w - .1, .54, fz, n, 1, cm, 'bar', .56);
      cab.rotation.y = Math.PI; cab.position.z = bz + cd/2; g.add(cab);                    // 柜门朝 -z，+z 侧留出吧台挑空
      g.add(rbox(w, .05, d, stone, 0, .84, 0, .006));
      [-1, 1].forEach(s => g.add(box(.04, .84, d, stone, s*(w/2 - .02), 0, 0)));             // 瀑布式侧板
      g.add(lathe([[0, 0], [.06, 0], [.14, .06], [.15, .07]], mat('#6b543f', {roughness:.5, side:THREE.DoubleSide}), w*.22, .89, 0, 32));
      for (let k = 0; k < 4; k++) g.add(blob(.04, .04, .04, ['#d98c4a', '#9fbf5a', '#b5463a', '#e6c14f'][k], w*.22 + Math.cos(k*1.6)*.05, .935 + (k === 3 ? .04 : 0), Math.sin(k*1.6)*.05, 14));
      vase(g, -w*.25, .89, -.05, .05, .22, '#e9e2d6', R);
      break;
    }
    case 'barstool': {
      const r = Math.min(w, d)/2, bm = blackMetal(), sy = .7;
      [[1,1],[1,-1],[-1,1],[-1,-1]].forEach(([a, b]) => g.add(rod([a*r*.72, 0, b*r*.72], [a*r*.4, sy, b*r*.4], .011, bm)));
      g.add(ring(Math.SQRT2*r*(.72 - .32*.4), .008, bm, 0, .28, 0), cyl(r*.55, r*.55, .02, bm, 0, sy - .01, 0, 32));
      g.add(lathe([[0, 0], [r*.85, 0], [r*.95, .02], [r*.97, .045], [r*.9, .07], [0, .075]], mat(c, {roughness:.6}), 0, sy, 0, 40));
      break;
    }
    case 'waterheater': {
      const r = Math.min(d/2, .23), L = w - .06, yc = 1.95, zc = bz + r + .02, tm = mat(c, {roughness:.35}), cp = mat('#cfd4d8', {roughness:.4});
      const tank = mesh(new THREE.CylinderGeometry(r, r, L, 40), tm); tank.rotation.z = Math.PI/2; tank.position.set(0, yc, zc); g.add(tank);
      [-1, 1].forEach(s => g.add(blob(.035, r*.99, r*.99, cp, s*L/2, yc, zc, 32), box(.05, r*1.1, .02, '#9a9ea3', s*L*.3, yc - r*.55, bz + .01)));
      g.add(rbox(.2, .09, .02, '#e7eaec', L*.18, yc - .05, zc + r*.93, .008), box(.07, .03, .002, screenMat('#2f8f7a'), L*.18 - .04, yc - .02, zc + r*.93 + .011));
      [[-L*.3, '#3b7bbf'], [-L*.18, '#c0463a']].forEach(([x, cc]) => g.add(rod([x, yc - r*.8, zc], [x, 1.3, zc], .012, metal()), cyl(.02, .02, .03, cc, x, 1.5, zc, 12)));
      break;
    }
    case 'tv': {
      const th = M(f.h||f.w*.5625), yb = f.wallAttachment?0:1.2-th/2, z = bz + .03;
      g.add(rbox(w*.6, th*.6, .03, '#222', 0, yb + th*.2, bz + .015, .01));
      g.add(rbox(w, th, .025, mat('#18181a', {roughness:.4, metalness:.3}), 0, yb, z + .01, .004), box(w - .016, th - .022, .002, screenMat('#1f2b3a'), 0, yb + .014, z + .0235), box(.04, .006, .002, '#8a8a8e', 0, yb + .004, z + .0235));
      break;
    }
    case 'aircon': {
      const am = mat(c, {roughness:.3}), h = 1.8, fz = d/2 - .005;
      g.add(rbox(w, .06, d, '#cfd3d6', 0, 0, 0, .015), rbox(w - .01, h - .06, d - .01, am, 0, .06, 0, .06));
      g.add(rbox(w - .06, 1.0, .01, mat(lighter(c, .4), {roughness:.12}), 0, .22, fz, .005), box(w - .1, .42, .01, '#3d4145', 0, 1.28, fz));
      for (let i = 0; i < 8; i++) g.add(rot(box(w - .11, .012, .03, '#e4e7ea', 0, 1.3 + i*.05, fz + .008), -.35));
      g.add(box(.1, .035, .003, mat('#101214', {emissive:'#4fb3a5', emissiveIntensity:.7}), 0, 1.12, fz + .006));
      for (let i = 0; i < 8; i++) g.add(box(w - .12, .005, .004, '#b9bfc4', 0, .09 + i*.015, fz + .002));
      break;
    }
    case 'acwall': {
      const h = .3, am = mat(c, {roughness:.3}), s = new THREE.Shape();
      s.moveTo(0, .02); s.lineTo(0, h); s.lineTo(d*.75, h); s.quadraticCurveTo(d, h, d, h*.55); s.quadraticCurveTo(d, 0, d*.55, 0); s.lineTo(.02, 0); s.lineTo(0, .02);
      const geo = new THREE.ExtrudeGeometry(s, {depth:w - .02, bevelEnabled:true, bevelThickness:.01, bevelSize:.006, bevelSegments:3, curveSegments:16});
      geo.rotateY(-Math.PI/2); geo.translate((w - .02)/2, 2.2, bz); g.add(mesh(geo, am));
      g.add(box(w - .12, .004, .07, '#3a3d40', 0, 2.19, bz + d*.55), rot(box(w - .12, .008, .06, am, 0, 2.18, bz + d*.72), .35));
      g.add(box(.06, .018, .002, mat('#101214', {emissive:'#4fb3a5', emissiveIntensity:.7}), w*.3, 2.2 + h*.5, bz + d + .007));
      for (let i = 0; i < 6; i++) g.add(box(w - .12, .003, .008, '#d5d9dc', 0, 2.2 + h + .006, bz + .03 + i*.022));
      break;
    }
    case 'dishwasher': {
      const dm = mat(c, {metalness:.55, roughness:.28}), fz = d/2 - .02;
      g.add(box(w - .01, .08, d - .07, '#3a3834', 0, 0, -.035), box(w - .005, .76, d - .03, '#8b9095', 0, .08, -.015));
      g.add(rbox(w - .006, .7, .02, dm, 0, .085, fz, .004), box(w - .006, .055, .02, '#26282a', 0, .785, fz));
      for (let i = 0; i < 4; i++) g.add(box(.012, .006, .002, mat('#101214', {emissive:i ? '#6fd0ff' : '#7fe08a', emissiveIntensity:.8}), w*.1 + i*.03, .81, fz + .011));
      pull(g, w*.6, false, 0, .74, fz + .01);
      break;
    }
    case 'ovencol': {
      const cm = mat(c, {roughness:.5}), h = 2.1, fz = d/2 - .02, frm = mat('#1c1d1f', {roughness:.3, metalness:.5}), gl = mat('#0b0c0d', {roughness:.03, metalness:.6});
      g.add(box(w - .02, .08, d - .06, '#4a4641', 0, 0, -.03), box(w, h - .08, d - .02, cm, 0, .08, -.01));
      fronts(g, -w/2, .08, w, .6, fz, 1, 2, cm, 'bar'); fronts(g, -w/2, 1.78, w, h - 1.8, fz, 1, 1, cm, 'bar', 1.84);
      [[.7, .58], [1.3, .46]].forEach(([y, ah]) => {
        g.add(box(w - .02, ah - .01, .02, frm, 0, y, fz + .01), box(w - .1, ah*.52, .003, gl, 0, y + ah*.1, fz + .021), box(w - .04, .06, .003, '#2a2c2e', 0, y + ah - .075, fz + .021));
        g.add(box(.08, .022, .002, mat('#101214', {emissive:'#ff9a3c', emissiveIntensity:.7}), 0, y + ah - .056, fz + .023));
        pull(g, w*.7, false, 0, y + ah*.72, fz + .02);
      });
      break;
    }
    case 'purifier': {
      const pm = mat(c, {roughness:.45}), h = .72;
      g.add(rbox(w, h, d, pm, 0, 0, 0, Math.min(w, d)*.2), rbox(w - .05, .006, d - .05, '#8d959b', 0, h - .002, 0, .02));
      for (let i = 0; i < 7; i++) g.add(box(w - .07, .004, .006, '#6f777d', 0, h + .002, -d/2 + .05 + i*(d - .1)/6));
      g.add(rbox(w - .06, .42, .006, fabric('#c8ccd0'), 0, .06, d/2 - .001, .01));
      const rg = new THREE.Mesh(new THREE.TorusGeometry(.03, .004, 8, 32), mat('#101214', {emissive:'#4fb3a5', emissiveIntensity:.8})); rg.position.set(0, .6, d/2 + .002); g.add(rg);
      break;
    }
    case 'officechair': {
      const r = Math.min(w, d)*.46, dk = darker(c, .75), bm = mat('#2b2b2d', {roughness:.45}), cm = chrome();
      for (let k = 0; k < 5; k++){
        const a = k*Math.PI*2/5, tx = Math.sin(a)*r*.95, tz = Math.cos(a)*r*.95;
        g.add(rod([0, .1, 0], [tx, .07, tz], .022, bm, .014, 10), cyl(.008, .008, .03, bm, tx, .04, tz, 8), rot(cyl(.026, .026, .03, '#111', tx, .026 - .015, tz, 16), 0, a, Math.PI/2));
      }
      g.add(cyl(.05, .06, .05, bm, 0, .08, 0, 20), cyl(.025, .025, .22, cm, 0, .12, 0, 16), cyl(.036, .036, .12, bm, 0, .12, 0, 16), rbox(.22, .05, .22, bm, 0, .34, .02, .01));
      g.add(rbox(w*.78, .03, d*.72, bm, 0, .38, .04, .01), rbox(w*.8, .08, d*.74, fabric(c), 0, .4, .05, .035));
      g.add(tube([[0, .36, 0], [0, .38, bz + .12], [0, .6, bz + .07]], .02, bm));
      const bf = shell(w*.72, .6, .03, .025, .08, bm); bf.rotation.x = Math.PI/2 - .12; bf.position.set(0, .88, bz + .06); g.add(bf);
      g.add(rot(box(w*.68, .56, .006, mat(dk, {roughness:.85, transparent:true, opacity:.88, side:THREE.DoubleSide}), 0, .6, bz + .085), -.12), rot(rbox(w*.5, .08, .03, fabric(c), 0, .66, bz + .11, .015), -.12));
      g.add(rod([-.05, 1.14, bz + .025], [-.05, 1.22, bz + .015], .008, bm), rod([.05, 1.14, bz + .025], [.05, 1.22, bz + .015], .008, bm), rbox(w*.45, .12, .05, fabric(dk), 0, 1.2, bz + .02, .025));
      [-1, 1].forEach(s => g.add(box(.035, .22, .035, bm, s*w*.4, .42, .04), rbox(.07, .03, d*.4, bm, s*w*.4, .63, .04, .012)));
      break;
    }
    case 'piano': {
      const pk = mat(c, {roughness:.12, metalness:.1}), bd = d*.5, kz = bz + bd, h = 1.25, kd = d*.22 - .03, iv = mat('#faf8f3', {roughness:.3}), eb = mat('#111', {roughness:.25}), kw = (w - .12)/52;
      g.add(box(w, h, bd, pk, 0, 0, bz + bd/2), rbox(w + .02, .03, bd + .03, pk, 0, h, bz + bd/2 + .01, .008));
      [-1, 1].forEach(s => g.add(rbox(.06, .13, kd + .06, pk, s*(w/2 - .03), .6, kz + (kd + .06)/2, .01), box(.05, .6, .05, pk, s*(w/2 - .08), 0, kz + kd + .01), box(.06, .04, d - bd, pk, s*(w/2 - .08), 0, kz + (d - bd)/2)));
      g.add(box(w - .12, .08, kd + .05, pk, 0, .6, kz + (kd + .05)/2), box(w - .12, .1, .03, pk, 0, .68, kz + .015));
      for (let i = 0; i < 52; i++){
        const x = -w/2 + .06 + kw*(i + .5); g.add(box(kw - .0015, .022, kd, iv, x, .68, kz + .03 + kd/2));
        if (i < 51 && 'ACDFG'.includes('ABCDEFG'[i % 7])) g.add(box(kw*.58, .02, kd*.62, eb, x + kw/2, .7, kz + .03 + kd*.31));
      }
      g.add(rot(box(w*.42, .18, .012, pk, 0, .84, kz + .012), -.25));
      [-.06, 0, .06].forEach(x => g.add(box(.025, .012, .07, mat('#c9a35a', {metalness:.9, roughness:.3}), x, .05, kz + .03)));
      const mt = cyl(.0, .05, .2, woodM('#5a3e2b'), w*.3, h + .03, bz + bd/2, 4); mt.rotation.y = Math.PI/4; g.add(mt);
      g.add(rot(box(.14, .18, .015, woodM('#c9a27a'), -w*.3, h + .03, bz + .06), -.15), rot(box(.11, .14, .002, '#9fb3c2', -w*.3, h + .05, bz + .07), -.15));
      break;
    }
    case 'treadmill': {
      const tm = mat(c, {roughness:.55}), bm = mat('#2a2a2c', {roughness:.5}), al = mat('#9a9ea3', {metalness:.6, roughness:.4});
      g.add(rbox(w, .14, d - .25, tm, 0, .03, .125, .03), box(w - .16, .006, d - .5, '#141414', 0, .17, .15));
      [-1, 1].forEach(s => g.add(box(.07, .008, d - .45, al, s*(w/2 - .05), .17, .15)));
      [bz + .06, d/2 - .06].forEach(z => [-1, 1].forEach(s => g.add(box(.06, .03, .06, bm, s*(w/2 - .06), 0, z))));
      g.add(rbox(w, .22, .32, tm, 0, 0, bz + .16, .05));
      [-1, 1].forEach(s => g.add(rod([s*(w/2 - .06), .15, bz + .2], [s*(w/2 - .06), 1.15, bz + .3], .025, bm, .022), tube([[s*(w/2 - .06), 1.0, bz + .28], [s*(w/2 - .06), 1.0, bz + .5], [s*(w/2 - .07), .97, bz + .62]], .018, bm)));
      const cg = new THREE.Group(); cg.position.set(0, 1.2, bz + .31); cg.rotation.x = -.5;
      cg.add(rbox(w*.8, .2, .08, bm, 0, -.1, 0, .02), box(w*.4, .11, .004, screenMat('#2a5d8f'), 0, -.055, .041)); g.add(cg);
      break;
    }
    default: g.add(box(w, M(f.h||800), d, c));
  }
  if(f.h){const size=new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());if(size.y>0)g.scale.y=M(f.h)/size.y;}
  applyFurnitureMaterial(g,f);
  g.position.set(wx(f.cx), M(f.elevation||0), wz(f.cy));
  g.rotation.y = -f.rot * Math.PI/180;       // 平面顺时针旋转 → 绕 Y 轴负向
  g.userData.fid = f.id;
  return g;
}

/* ======================= 建筑 ======================= */
function clearGroup(g){const owned=new Set();g.traverse(o=>{for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[])if(m.userData.wallRegionOwned||m.userData.wallFinishOwned||m.userData.windowOwned)owned.add(m);});owned.forEach(m=>m.dispose()); g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); g.clear(); }
function wallBox([x0, y0, x1, y1], yb, yt, m){
  if (yt - yb <= .001) return;
  const o = new THREE.Mesh(new THREE.BoxGeometry(M(x1-x0), yt-yb, M(y1-y0)), m || [wallMat, wallMat, capMat, wallMat, wallMat, wallMat]);
  o.position.set(wx((x0+x1)/2), (yb+yt)/2, wz((y0+y1)/2)); o.castShadow = o.receiveShadow = true; archUp.add(o);
  // 漫游辅助：墙体棱线 + 踢脚线，让相邻墙面、墙角一眼可分（仅漫游模式显示）
  const ln = new THREE.LineSegments(new THREE.EdgesGeometry(o.geometry), edgeMat); ln.position.copy(o.position); ln.userData.walkOnly = true; ln.visible = opt.mode === 'walk'; archUp.add(ln);
  if (yb <= .001){
    const p = o.geometry.parameters, sh = Math.min(.12, yt), sk = new THREE.Mesh(new THREE.BoxGeometry(p.width + .02, sh, p.depth + .02), skirtMat);
    sk.position.set(o.position.x, sh/2, o.position.z); sk.userData.walkOnly = true; sk.visible = opt.mode === 'walk'; archUp.add(sk);
  }
}
const edgeMat = new THREE.LineBasicMaterial({color:0x6f675b}), skirtMat = new THREE.MeshStandardMaterial({color:'#8b7f6e', roughness:.6});
function shapeOf(poly, flip){ const s = new THREE.Shape(); poly.forEach(([x, y], i) => s[i ? 'lineTo' : 'moveTo'](wx(x), flip ? wz(y) : -wz(y))); return s; }

/* Wall surfaces contain only the union boundary, never internal box outlines. */
let currentWallSurfaceData=null;
function wallSurfaceGeometry(row,mapPoint,mapNormal,sideIndex,uvFor=v=>[v.x,v.y+v.z]){
 const positions=[],normals=[],uvs=[],geometry=new THREE.BufferGeometry();
 const emit=(points,normal,materialIndex)=>{const start=positions.length/3;for(let i=1;i<points.length-1;i++){const tri=[points[0],points[i],points[i+1]],cross=new THREE.Vector3().subVectors(tri[1],tri[0]).cross(new THREE.Vector3().subVectors(tri[2],tri[0]));if(cross.lengthSq()<1e-18)continue;if(cross.dot(normal)<0)[tri[1],tri[2]]=[tri[2],tri[1]];for(const v of tri){positions.push(v.x,v.y,v.z);normals.push(normal.x,normal.y,normal.z);uvs.push(...uvFor(v));}}const count=positions.length/3-start;if(count)geometry.addGroup(start,count,materialIndex);};
 for(const face of row.faces){if(face.kind==='region'){const n=mapNormal(face.normal);n.y=face.up;emit(face.vertices.map(p=>mapPoint(p,p[2])),n,0);}else if(face.kind==='side'){emit(face.vertices?face.vertices.map(p=>mapPoint(p,p[2])):[mapPoint(face.a,face.bottom),mapPoint(face.b,face.bottom),mapPoint(face.b,face.top),mapPoint(face.a,face.top)],mapNormal(face.normal),sideIndex(face));}else emit(face.poly.map(p=>mapPoint(p,face.height)),new THREE.Vector3(0,face.kind==='top'?1:-1,0),face.kind==='top'?2:3);}
 geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
function localWallSurfaceGeometry(p,w,mid){const f=PlanCore.frame(w);return wallSurfaceGeometry(p,(q,h)=>{const dx=q[0]-mid[0],dy=q[1]-mid[1];return new THREE.Vector3(M(dx*f.ux+dy*f.uy),M(h),M(-dx*f.uy+dy*f.ux));},n=>new THREE.Vector3(n[0]*f.ux+n[1]*f.uy,0,-n[0]*f.uy+n[1]*f.ux),face=>{const side=-face.normal[0]*f.uy+face.normal[1]*f.ux;return side>.5?4:side<-.5?5:0;},v=>[v.x+PlanCore.project(w,mid)/1000,v.y]);}
function addCollider(group,halfLength,halfThickness){group.updateMatrixWorld(true);colliders.push({inverse:group.matrixWorld.clone().invert(),halfLength,halfThickness});}
function wallColor(w,side,t=PlanCore.length(w)/2){const p=PlanCore.point(w,t,side*(w.thickness/2+60));const r=state.structure.rooms.find(r=>PlanCore.inside(p,r.poly));return r?state.rooms[r.id]?.wallColor||'#f4f1eb':'#f4f1eb';}
function buildArch(){
  clearWallFinishHighlight();cancelWallFinishAnimation();clearGroup(archFloor);clearGroup(archUp);lampG.children.forEach(o=>o.geometry?.dispose());lampG.clear();doors.length=0;windowModels.length=0;colliders=[];
  const b=PlanCore.bounds(state,false),oldOX=OX,oldOY=OY;OX=b.x+b.w/2;OY=b.y+b.h/2;if(oldOX!==OX||oldOY!==OY)sigFurn='';
  ground.scale.setScalar(Math.max(1,Math.max(b.w,b.h)/1000/60));
  const size=Math.max(b.w,b.h)/1000;Object.assign(sun.shadow.camera,{left:-size,right:size,top:size,bottom:-size,far:Math.max(60,size*4)});sun.shadow.camera.updateProjectionMatrix();
  ROOMS.forEach(r=>{const elevation=(r.elevation||0)/1000,fl=new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(r.poly)).rotateX(-Math.PI/2),floorMat(state.rooms[r.id].mat,state.rooms[r.id].surfaceLayout));fl.position.y=elevation;fl.receiveShadow=true;fl.userData.room=r.id;archFloor.add(fl);
    if(elevation>0){const base=new THREE.Mesh(new THREE.ExtrudeGeometry(shapeOf(r.poly),{depth:elevation,bevelEnabled:false}).rotateX(-Math.PI/2),mat('#e3ddd1'));base.userData.spaceId=r.id;base.userData.kind=r.kind;base.castShadow=base.receiveShadow=true;archUp.add(base);const xs=r.poly.map(p=>p[0]),ys=r.poly.map(p=>p[1]),g=new THREE.Group();g.position.set(wx((Math.min(...xs)+Math.max(...xs))/2),0,wz((Math.min(...ys)+Math.max(...ys))/2));addCollider(g,(Math.max(...xs)-Math.min(...xs))/2000,(Math.max(...ys)-Math.min(...ys))/2000);}
    const height=(r.height||state.structure.height||2800)/1000;
    const ceil=new THREE.Mesh(new THREE.ShapeGeometry(shapeOf(r.poly,true)).rotateX(Math.PI/2),mat('#fbfaf7'));ceil.position.y=height;ceil.visible=opt.cut>=height;archUp.add(ceil);
    const p=PlanCore.center(r.poly),lamp=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.02,24),new THREE.MeshStandardMaterial({color:'#fff',emissive:'#fff2d6',emissiveIntensity:.3}));lamp.position.set(wx(p[0]),height-.02,wz(p[1]));lamp.visible=opt.cut>=height;lampG.add(lamp);const light=new THREE.PointLight(0xffd9a8,0,Math.max(7,size),1.6);light.position.set(wx(p[0]),height-.25,wz(p[1]));lampG.add(light);
  });
  const surfaceData=WallSurfaceCore.build(state,opt.cut*1000);currentWallSurfaceData=surfaceData;
  state.structure.walls.forEach((w,i)=>{if(state.demolished.includes('w'+i))return;const f=PlanCore.frame(w),angle=-Math.atan2(f.uy,f.ux),pieces=surfaceData.prisms.filter(p=>p.wallId===w.id&&!p.joinId);
    pieces.forEach(p=>{const t=(p.a+p.b)/2,mid=PlanCore.point(w,t),g=new THREE.Group();g.position.set(wx(mid[0]),0,wz(mid[1]));g.rotation.y=angle;const left=wallFaceMaterial(state,w,1,t),right=wallFaceMaterial(state,w,-1,t);if(p.faces.length){const o=new THREE.Mesh(localWallSurfaceGeometry(p,w,mid),[wallMat,wallMat,capMat,wallMat,left,right]);o.castShadow=o.receiveShadow=true;o.userData.wallId=w.id;o.userData.wallSurface=true;o.userData.wallPieceKey=JSON.stringify([p.a,p.b,p.bottom,p.top]);g.add(o);}archUp.add(g);
      if(!p.regionId&&p.bottom<1700&&p.top>50)for(const [a,b]of WallRegionsCore.solidIntervals(state,w,p.a,p.b)){const q=PlanCore.point(w,(a+b)/2),cg=new THREE.Group();cg.position.set(wx(q[0]),0,wz(q[1]));cg.rotation.y=angle;addCollider(cg,M(b-a)/2,M(w.thickness)/2);}
      // No per-piece edge overlay: subdivisions are not real wall edges.
    });
    state.structure.openings.filter(o=>o.wallId===w.id).forEach(o=>{const a=PlanCore.point(w,o.offset),mid=PlanCore.point(w,o.offset+o.width/2),head=Math.min(o.sill+o.height,opt.cut*1000),height=(head-o.sill)/1000;if(height<=0)return;
      if(o.type==='window'){const model=WindowModel.build(THREE,WindowCore.spec(o,w,state),{cut:opt.cut,sill:o.sill/1000});model.group.position.set(wx(mid[0]),o.sill/1000,wz(mid[1]));model.group.rotation.y=angle;model.group.traverse(x=>{if(x.isMesh)x.userData.windowModel=model;});archUp.add(model.group);windowModels.push(model);renderer.localClippingEnabled=true;}
      else if(o.style==='sliding'){
        const l=M(o.width),start=new THREE.Vector3(wx(a[0]),0,wz(a[1])),pivot=new THREE.Group(),fixed=new THREE.Group();pivot.position.copy(start);pivot.rotation.y=angle;fixed.position.set(wx(mid[0]+f.ux*o.width/4),0,wz(mid[1]+f.uy*o.width/4));fixed.rotation.y=angle;
        const panel=()=>{const g=new THREE.Group();g.add(box(l/2,height,.025,glassMat,l/4));for(const x of [0,l/2])g.add(box(.035,height,.055,frameMat,x));for(const y of [0,height-.035])g.add(box(l/2,.035,.055,frameMat,l/4,y));return g;};
        const leaf=panel(),fixedLeaf=panel();fixedLeaf.position.x=-l/4;pivot.add(leaf);fixed.add(fixedLeaf);archUp.add(pivot,fixed);const door={id:o.id,pivot,length:l/2,sliding:true,slideStart:start,slideDirection:new THREE.Vector3(Math.cos(angle),0,-Math.sin(angle)),a0:0,a1:l/2,open:!!o.open,cur:o.open?l/2:0};pivot.position.addScaledVector(door.slideDirection,door.cur);leaf.traverse(x=>x.userData.door=door);fixedLeaf.traverse(x=>x.userData.door=door);doors.push(door);addCollider(fixed,l/4,.03);
      }
      else{const pivot=new THREE.Group(),l=M(o.width),dh=height,hinge=o.hinge==='end'?PlanCore.point(w,o.offset+o.width):a,baseAngle=angle+(o.hinge==='end'?Math.PI:0);pivot.position.set(wx(hinge[0]),0,wz(hinge[1]));const leaf=box(l,dh,.04,mat(o.entry?'#806044':'#e8dccb'),l/2);const knob=new THREE.Mesh(new THREE.SphereGeometry(.025,10,8),metal());knob.position.set(l-.07,Math.min(1,dh-.1),.04);pivot.add(leaf,knob);const door={pivot,length:l,id:o.id,a0:baseAngle,a1:baseAngle-(o.swing||1)*Math.PI/2,open:!!o.open,cur:baseAngle};door.cur=door.open?door.a1:door.a0;pivot.rotation.y=door.cur;leaf.userData.door=knob.userData.door=door;doors.push(door);archUp.add(pivot);}
    });
  });
  for(const p of surfaceData.prisms.filter(p=>p.joinId)){if(p.faces.length){const w=state.structure.walls.find(w=>w.id===p.wallId),color=wallFaceMaterial(state,w,1),back=wallFaceMaterial(state,w,-1),f=PlanCore.frame(w),o=new THREE.Mesh(wallSurfaceGeometry(p,(q,h)=>new THREE.Vector3(wx(q[0]),M(h),wz(q[1])),n=>new THREE.Vector3(n[0],0,n[1]),face=>face.normal[0]*-f.uy+face.normal[1]*f.ux>=0?4:5,v=>[((v.x*1000+OX-w.a[0])*f.ux+(v.z*1000+OY-w.a[1])*f.uy)/1000,v.y]),[wallMat,wallMat,capMat,wallMat,color,back]);o.userData.wallId=w.id;o.userData.wallPieceKey=p.joinId;o.userData.wallJoin=p.joinId;o.userData.wallSurface=true;o.castShadow=o.receiveShadow=true;archUp.add(o);}if(p.bottom<1700&&p.top>50)colliders.push({poly:p.poly});}
  state.structure.columns.forEach(c=>{const g=new THREE.Group();g.position.set(wx(c.x),0,wz(c.y));g.add(box(M(c.w),Math.min(M(c.height),opt.cut),M(c.d),mat('#c4beb5')));g.userData.columnId=c.id;archUp.add(g);addCollider(g,M(c.w)/2,M(c.d)/2);});
  for(const g of wallRegionPanels(state,opt.cut*1000,p=>new THREE.Vector3(wx(p[0]),0,wz(p[1]))))archUp.add(g);
  applyLight();applyGrow();
}
function findSpawn(){const selectedFurniture=ui.sel?.kind==='furn'?getF(ui.sel.id):null;const selected=ui.sel?.kind==='room'?state.structure.rooms.find(r=>r.id===ui.sel.id):selectedFurniture?state.structure.rooms.find(r=>PlanCore.inside([selectedFurniture.cx,selectedFurniture.cy],r.poly)):null;const rs=selected?[selected,...state.structure.rooms.filter(r=>r!==selected)]:state.structure.rooms;for(const r of rs){const p=PlanCore.center(r.poly);if(!blocked(wx(p[0]),wz(p[1])))return p;const b=bbox(r.poly);for(let y=b[1]+300;y<b[3];y+=300)for(let x=b[0]+300;x<b[2];x+=300)if(PlanCore.inside([x,y],r.poly)&&!blocked(wx(x),wz(y)))return [x,y];}const b=PlanCore.bounds(state,false);for(let y=b.y+300;y<b.y+b.h;y+=300)for(let x=b.x+300;x<b.x+b.w;x+=300)if(!blocked(wx(x),wz(y)))return [x,y];return [b.x-500,b.y-500];}

function buildFurn(){
  clearGroup(furnG);
  state.furniture.forEach(f => furnG.add(buildFurniture(f)));
  furnG.visible = opt.furn; selKey = null; applyGrow();
}

function buildLabels(){
  labelG.children.slice().forEach(o => { o.element.remove(); labelG.remove(o); });
  ROOMS.filter(r => r.at).forEach(r => {
    const el = document.createElement('div'); el.className = 'rlabel';
    el.innerHTML = `${esc(nm(state.rooms[r.id].name))}<small>${area(r.poly).toFixed(1)}m²</small>`;
    const o = new CSS2DObject(el); o.position.set(wx(r.at[0]), opt.cut + .15, wz(r.at[1])); o.visible = labelG.visible; labelG.add(o);
  });


}

// 只重建变化的部分
function sync(force){
  if (!inited || (!active && !force)) return;
  if(opt.cut>=2.8)opt.cut=fullHeight();
  const a = JSON.stringify([state.structure, state.rooms, state.demolished, opt.cut]), f = JSON.stringify(state.furniture), l = JSON.stringify([state.structure.rooms, state.rooms, opt.cut]);
  if (force || a !== sigArch){ sigArch = a; buildArch(); }
  if (force || f !== sigFurn){ sigFurn = f; buildFurn(); }
  if (force || l !== sigLabels){ sigLabels = l; buildLabels(); }
  applyMainSceneStyle();
}

// CSS2DRenderer 只看标签自身的 visible，不继承父级，所以逐个设置
function showLabels(v){ labelG.visible = v; labelG.children.forEach(o => o.visible = v); }
function applyGrow(){
  if (!inited) return;
  archUp.scale.y = Math.max(grow, .001);
  furnG.scale.y = Math.max(furnGrow, .001);
  lampG.visible = grow > .99;
}

/* ======================= 日照 / 夜景 ======================= */
function applyLight(){
  const t = (opt.hour - 6) / 12, az = Math.PI * (.15 + t*.7), el = Math.sin(Math.PI*t) * 1.05 + .15, warm = 1 - Math.sin(Math.PI*t);
  sun.position.set(Math.cos(az)*18, Math.sin(el)*20 + 3, -Math.sin(az)*10 + 8); sun.target.position.set(0, 0, 0);
  sun.color.setHSL(.09, .5 + warm*.4, .92 - warm*.12);
  sun.intensity = opt.night ? .05 : 1.4 + Math.sin(Math.PI*t)*1.6;
  hemi.intensity = opt.night ? .12 : 1.1;
  scene.background = new THREE.Color(opt.night ? 0x1c2130 : 0xf7f4ee);
  ground.material.color.set(opt.night ? 0x2a2e38 : 0xf2eee7);
  lampG.children.forEach(o => { if (o.isPointLight) o.intensity = opt.night ? 6 : 0; else o.material.emissiveIntensity = opt.night ? 2 : .3; });
  renderer.toneMappingExposure = opt.night ? 1.25 : 1.05;
  envK = opt.night ? .15 : 1; matCache.forEach(m => { if (m.envMap) m.envMapIntensity = m.userData.env*envK; });
  applySceneStyleLight();
  const h = Math.floor(opt.hour), m = Math.round((opt.hour - h)*60);
  $('#sunT').textContent = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

/* ======================= 相机位姿 / 动画 ======================= */
const ease = t => t < .5 ? 4*t*t*t : 1 - (-2*t + 2)**3/2;
const clamp01 = t => Math.max(0, Math.min(1, t));
const pose = (t, p) => ({t, p});
// 与当前 2D 视口完全重合的正俯视位姿：透视相机在该高度下，地面可视高度 = 2D 视口高度
function planPose(){
  const cx = view.x0 + SW()/2/view.s, cy = view.y0 + SH()/2/view.s, visH = SH()/view.s/1000;
  const dist = visH / 2 / Math.tan(FOV/2*Math.PI/180), t = new THREE.Vector3(wx(cx), 0, wz(cy));
  return pose(t, new THREE.Vector3(t.x, dist, t.z + 1e-4));
}
function isoFrom(P){
  const d = THREE.MathUtils.clamp(P.p.y, 5, 30), dir = new THREE.Vector3(.3, .82, .49).normalize();
  return pose(P.t.clone(), P.t.clone().addScaledVector(dir, d));
}
function wholePose(top=false){const b=PlanCore.bounds(state,false),size=Math.max(b.w,b.h)/1000,aspect=SW()/SH(),dist=Math.max(size, b.w/1000/aspect)*1.4+3;return pose(new THREE.Vector3(0,0,0),top?new THREE.Vector3(0,dist,1e-4):new THREE.Vector3(dist*.3,dist*.82,dist*.55));}
const isoWhole=()=>wholePose();
const topWhole=()=>wholePose(true);
const curPose = () => pose(orbit.target.clone(), camera.position.clone());
// 以目标点为中心做球坐标插值：镜头沿弧线倾斜环绕，而不是直线穿越
function camTween(A, B, e){
  const t = A.t.clone().lerp(B.t, e);
  const sa = new THREE.Spherical().setFromVector3(A.p.clone().sub(A.t)), sb = new THREE.Spherical().setFromVector3(B.p.clone().sub(B.t));
  let dth = sb.theta - sa.theta; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
  const s = new THREE.Spherical(sa.radius + (sb.radius - sa.radius)*e, sa.phi + (sb.phi - sa.phi)*e, sa.theta + dth*e);
  camera.position.copy(t).add(new THREE.Vector3().setFromSpherical(s)); camera.lookAt(t); orbit.target.copy(t);
}
function setPose(P){ camera.position.copy(P.p); orbit.target.copy(P.t); camera.lookAt(P.t); }
function animate(dur, fn){ return new Promise(res => { anim = {t0:performance.now(), dur, fn, res}; }); }
const wait = ms => new Promise(r => setTimeout(r, ms));
function flyTo(B, dur = 900){ fly = {t0:performance.now(), dur, A:curPose(), B}; }
function flyToRoom(id){
  const r = ROOMS.find(r => r.id === id), xs = r.poly.map(p => p[0]), ys = r.poly.map(p => p[1]);
  const roomCenter=PlanCore.center(r.poly),t=new THREE.Vector3(wx(roomCenter[0]),.6,wz(roomCenter[1]));
  const size = M(Math.max(Math.max(...xs)-Math.min(...xs), Math.max(...ys)-Math.min(...ys)));
  const dir = camera.position.clone().sub(orbit.target).setY(0); if (dir.lengthSq() < .01) dir.set(.6, 0, .8); dir.normalize();
  const dist = size*1.3 + 2.2;
  flyTo(pose(t, new THREE.Vector3(t.x + dir.x*dist*.7, dist*1.05, t.z + dir.z*dist*.7)));
}

/* ======================= 进入 / 退出 3D ======================= */
async function enter(){
  init(); active = true;window.refreshLibraryPreviews?.();
  renderer.setSize(SW(), SH()); labelRenderer.setSize(SW(), SH());resizeSceneStyle(); camera.aspect = SW()/SH(); camera.updateProjectionMatrix();
  sync(true);
  opt.mode = 'orbit'; orbit.enabled = false; showLabels(false);
  const A = planPose(), B = isoWhole();
  grow = 0; furnGrow = 0; applyGrow(); setPose(A);
  stage.classList.add('animating');
  startLoop(); renderStyledScene();
  stage.classList.add('is3d');                       // 交叉淡入：此刻 3D 画面与 2D 平面完全重合
  await wait(420);
  await animate(1700, t => {
    camTween(A, B, ease(clamp01(t/.85)));
    grow = ease(clamp01((t - .1)/.55));
    furnGrow = ease(clamp01((t - .45)/.5));
    applyGrow();
  });
  orbit.enabled = true; showLabels(opt.labels);
  stage.classList.remove('animating');
}
async function exit(){
  if (opt.mode === 'walk'){ walkCtl.unlock(); stopTouchWalk(); $('#hint3d').textContent = HINT_ORBIT; $('#walkOverlay').style.display = 'none'; $('#cross').style.display = 'none';
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir); orbit.target.copy(camera.position).addScaledVector(dir, 3).setY(0); opt.mode = 'orbit'; syncModeBtns(); }
  fly = null; orbit.enabled = false; showLabels(false); stage.classList.add('animating');
  const A = curPose(), B = planPose();
  await animate(1300, t => {
    camTween(A, B, ease(clamp01((t - .1)/.9)));
    furnGrow = 1 - ease(clamp01(t/.45));
    grow = 1 - ease(clamp01((t - .2)/.6));
    applyGrow();
  });
  stage.classList.remove('is3d');                    // 此刻 3D 已压平为正俯视，与 2D 重合后淡出
  await wait(450);
  active = false; cancelAnimationFrame(raf); raf = 0;
  stage.classList.remove('animating');
  grow = furnGrow = 1; applyGrow();
}

/* ======================= 选择 / 拾取 ======================= */
const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
function pickVisible(o){for(let n=o;n;n=n.parent)if(!n.visible)return false;return !o.userData.walkOnly;}
function pick(e){
  if (!e) ptr.set(0, 0);
  else { const r = renderer.domElement.getBoundingClientRect(); ptr.set((e.clientX - r.left)/r.width*2 - 1, -(e.clientY - r.top)/r.height*2 + 1); }
  ray.setFromCamera(ptr, camera);
  const hits = ray.intersectObjects([...(opt.furn ? [furnG] : []), archUp, archFloor], true);
  for (const h of hits){
    if(!pickVisible(h.object))continue;
    let o = h.object;
    if(o.userData.windowModel)return {windowModel:o.userData.windowModel,dist:h.distance};if (o.material === glassMat) continue;
    if (o.userData.door) return {door:o.userData.door, dist:h.distance};
    if (o.userData.room) return {room:o.userData.room};
    while (o && !o.userData.fid && o !== scene) o = o.parent;
    if (o?.userData.fid) return {fid:o.userData.fid};
    return null;                                     // 被墙体挡住
  }
  return null;
}
// 屏幕点 → 地面（y = 0）上的户型坐标 mm；s = 该处每 mm 对应的屏幕像素，用于拖放时的幽灵图大小
const ground0 = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
function groundAt(x, y){
  if (!active || anim) return null;
  const r = renderer.domElement.getBoundingClientRect(), hit = new THREE.Vector3();
  ptr.set((x - r.left)/r.width*2 - 1, -(y - r.top)/r.height*2 + 1);
  ray.setFromCamera(ptr, camera);
  if (!ray.ray.intersectPlane(ground0, hit) || hit.distanceTo(camera.position) > 60) return null;
  // 视线先碰到墙体（或飘窗台）时，落点取碰到的位置，而不是穿过墙落到看不见的墙后
  const wall = ray.intersectObjects([archUp, archFloor], true).find(h => h.object.material !== glassMat && pickVisible(h.object));
  if (wall && wall.distance < hit.distanceTo(camera.position) - .01) hit.set(wall.point.x, 0, wall.point.z);
  const px = v => new THREE.Vector2(v.x*r.width/2, v.y*r.height/2), a = px(hit.clone().project(camera));
  const s = Math.max(a.distanceTo(px(hit.clone().add(new THREE.Vector3(1, 0, 0)).project(camera))),
                     a.distanceTo(px(hit.clone().add(new THREE.Vector3(0, 0, 1)).project(camera)))) / 1000;
  return {x:hit.x*1000 + OX, y:hit.z*1000 + OY, s};
}
function updateSel(){
  const key = ui.sel?.kind === 'furn' ? ui.sel.id : '';
  if (key !== selKey){
    selKey = key;
    if (selHelper){ scene.remove(selHelper); selHelper.geometry.dispose(); selHelper = null; }
    const g = key && furnG.children.find(g => g.userData.fid === key);
    if (g){ selHelper = new THREE.BoxHelper(g, 0xb5653a); scene.add(selHelper); }
  }
  if (selHelper) selHelper.update();
}

/* ======================= 漫游 ======================= */
// 触屏漫游：左下虚拟摇杆移动，在画面上拖动转向（iPad 不支持鼠标指针锁定）
const HINT_ORBIT = () => COARSE ? tr('单指旋转 · 双指缩放 / 平移 · 点选家具后可拖动摆放 · 点门开关', '1 finger orbits · 2 fingers zoom / pan · select furniture to drag it · tap doors to open')
  : tr('左键旋转 · 右键平移 · 滚轮缩放 · 选中家具后拖动可摆放 · 点击门窗开关', 'Left-drag orbits · right-drag pans · scroll zooms · select furniture to drag it · click doors to open');
const HINT_TOUCHWALK = () => tr('左下摇杆移动 · 拖动画面转向 · 点门开关', 'Joystick moves · drag to look · tap doors to open');
const HINT_WALK = () => tr('WASD 移动 · 鼠标转向 · Shift 快走 · E 开关门窗 · Esc 暂停', 'WASD moves · mouse looks · Shift runs · E opens doors · Esc pauses');
function syncHint3d(){ $('#hint3d').textContent = opt.mode === 'orbit' ? HINT_ORBIT() : touchWalk ? HINT_TOUCHWALK() : HINT_WALK(); }
let touchWalk = false;
const joy = {x:0, y:0, id:null}, eul = new THREE.Euler(0, 0, 0, 'YXZ');
function lookBy(dx, dy){
  eul.setFromQuaternion(camera.quaternion);
  eul.y += dx * .005; eul.x = THREE.MathUtils.clamp(eul.x + dy * .005, -1.35, 1.35);
  camera.quaternion.setFromEuler(eul);
}
function startTouchWalk(){
  touchWalk = true;
  $('#walkOverlay').style.display = 'none'; $('#joy').style.display = 'block'; $('#walkExit').style.display = 'block';
  syncHint3d();
}
function stopTouchWalk(){
  touchWalk = false; joy.x = joy.y = 0; joy.id = null; $('#joy i').style.transform = '';
  $('#joy').style.display = 'none'; $('#walkExit').style.display = 'none';
}
function bindJoystick(){
  const el = $('#joy'), knob = $('#joy i'), R = 50;
  const upd = e => {
    const r = el.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width/2), dy = e.clientY - (r.top + r.height/2);
    const L = Math.hypot(dx, dy); if (L > R){ dx *= R/L; dy *= R/L; }
    joy.x = dx/R; joy.y = dy/R; knob.style.transform = `translate(${dx}px,${dy}px)`;
  };
  el.addEventListener('pointerdown', e => { e.preventDefault(); joy.id = e.pointerId; el.setPointerCapture(e.pointerId); upd(e); });
  el.addEventListener('pointermove', e => { if (e.pointerId === joy.id) upd(e); });
  const end = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}
function setMode(m){
  if (anim) return;
  opt.mode = m; syncModeBtns();
  if (m === 'walk'){
    window.select(null);
    if (opt.cut < H){ opt.cut = fullHeight(); syncCutBtns(); sync(); }
    orbit.enabled = false; fly = null;
    positionWalkAtEntrance();   // 入户门外
    $('#walkOverlay').style.display = 'flex';
    syncHint3d();
  } else {
    walkCtl.unlock(); stopTouchWalk(); orbit.enabled = true;
    $('#walkOverlay').style.display = 'none'; $('#cross').style.display = 'none';
    syncHint3d();
    orbit.target.set(0, 0, 0); flyTo(isoWhole());
  }
  showLabels(opt.labels && m === 'orbit');
  archUp.traverse(o => { if (o.userData.walkOnly) o.visible = m === 'walk'; });
}
function blocked(x, z, r = .22){
  for(const c of colliders){if(c.poly){if(PlanCore.touchesPolygon([x*1000+OX,z*1000+OY],c.poly,r*1000))return true;continue;}const p=new THREE.Vector3(x,0,z).applyMatrix4(c.inverse);if(Math.abs(p.x)<c.halfLength+r&&Math.abs(p.z)<c.halfThickness+r)return true;}
  for (const d of doors){
    const a = d.pivot.rotation.y, px = d.pivot.position.x, pz = d.pivot.position.z, ex = px + Math.cos(a)*d.length, ez = pz - Math.sin(a)*d.length;
    const t = clamp01(((x-px)*(ex-px) + (z-pz)*(ez-pz)) / ((ex-px)**2 + (ez-pz)**2));
    if (Math.hypot(x - (px + t*(ex-px)), z - (pz + t*(ez-pz))) < r*.8) return true;
  }
  return false;
}
function stepWalk(dt){
  if (!walkCtl.isLocked && !touchWalk) return;
  const sp = (keys.ShiftLeft || keys.ShiftRight ? 2.6 : 1.4) * dt, fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x), mv = new THREE.Vector3();
  if (keys.KeyW || keys.ArrowUp) mv.add(fwd); if (keys.KeyS || keys.ArrowDown) mv.sub(fwd);
  if (keys.KeyD || keys.ArrowRight) mv.add(right); if (keys.KeyA || keys.ArrowLeft) mv.sub(right);
  if (touchWalk){ mv.addScaledVector(fwd, -joy.y).addScaledVector(right, joy.x); }
  const mag = Math.min(1, mv.length());        // 摇杆推得越远走得越快
  if (mag < .05) return;
  mv.normalize().multiplyScalar(sp * mag);
  const p = camera.position;
  if (!blocked(p.x + mv.x, p.z)) p.x += mv.x;
  if (!blocked(p.x, p.z + mv.z)) p.z += mv.z;
}
addEventListener('keydown', e => {
  if (!active || e.target.matches('input,select,textarea')) return;
  keys[e.code] = true;
  if (opt.mode === 'walk' && e.code === 'KeyE'){ const h = pick(); if(h?.windowModel&&h.dist<2.5)toggleWindow(h.windowModel);else if (h?.door && h.dist < 2.5) toggleDoor(h.door); }
});
addEventListener('keyup', e => keys[e.code] = false);

/* ======================= 工具栏 ======================= */
function syncModeBtns(){ document.querySelectorAll('#modes3d .btn').forEach(b => b.classList.toggle('on', b.dataset.mode === opt.mode)); }
function syncCutBtns(){ document.querySelectorAll('[data-cut]').forEach(b => b.classList.toggle('on', (+b.dataset.cut===2.8?opt.cut>=2.8:+b.dataset.cut===opt.cut))); }
function syncWalkTexts(){
  const t = COARSE
    ? [tr('点击开始，从入户门看向室内', 'Tap to start at the front door'), tr('左下摇杆移动 · 在画面上拖动转向', 'Joystick moves · drag on screen to look'),
       tr('点门开关 · 点「退出漫游」回到鸟瞰', 'Tap doors to open · "Exit walk" returns to orbit')]
    : [tr('点击开始，从入户门看向室内', 'Click to start at the front door'),
       tr('<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> 移动 · 鼠标转向 · <kbd>Shift</kbd> 快走', '<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> move · mouse looks · <kbd>Shift</kbd> runs'),
       tr('<kbd>E</kbd> 开关正前方的门 · <kbd>Esc</kbd> 暂停', '<kbd>E</kbd> opens the door ahead · <kbd>Esc</kbd> pauses')];
  t.forEach((h, i) => $('#wo' + (i + 1)).innerHTML = h);
  syncHint3d();
}
function bindUI(){
  document.querySelectorAll('#modes3d .btn').forEach(b => b.onclick = () => setMode(b.dataset.mode));
  // 触屏设备用摇杆漫游；桌面端锁定鼠标，锁定失败时也退回到摇杆
  $('#walkOverlay').onclick = () => COARSE ? startTouchWalk() : walkCtl.lock();
  document.addEventListener('pointerlockerror', () => { if (active && opt.mode === 'walk') startTouchWalk(); });
  $('#walkExit').onclick = () => setMode('orbit');
  bindJoystick();
  syncWalkTexts();
  $('#vIso').onclick = () => { if (opt.mode === 'walk') setMode('orbit'); else flyTo(isoWhole()); };
  $('#vTop').onclick = () => { if (opt.mode === 'walk') setMode('orbit'); flyTo(topWhole()); };
  document.querySelectorAll('[data-cut]').forEach(b => b.onclick = () => { if (opt.mode === 'walk') return; opt.cut = +b.dataset.cut===2.8?fullHeight():+b.dataset.cut; syncCutBtns(); sync(); });
  document.querySelectorAll('#toggles3d .btn').forEach(b => b.onclick = () => {
    const k = b.dataset.t; opt[k] = !opt[k]; b.classList.toggle('on', opt[k]);
    if (k === 'furn'){ furnG.visible = opt.furn; if (!opt.furn && ui.sel?.kind === 'furn') window.select(null); }
    if (k === 'labels') showLabels(opt.labels && opt.mode === 'orbit' && !anim);
    if (k === 'night') applyLight();
  });
  $('#sun').oninput = e => { opt.hour = +e.target.value; applyLight(); };
}

/* ======================= 主循环 ======================= */
const clock = new THREE.Clock();
function startLoop(){ if (!raf){ clock.getDelta(); raf = requestAnimationFrame(loop); } }
function loop(){
  raf = requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), .05), now = performance.now();
  if (anim){ const t = clamp01((now - anim.t0)/anim.dur); anim.fn(t); if (t >= 1){ const r = anim.res; anim = null; r(); } }
  else if (fly){ const t = clamp01((now - fly.t0)/fly.dur); camTween(fly.A, fly.B, ease(t)); if (t >= 1) fly = null; }
  else if (opt.mode === 'orbit') orbit.update();
  else stepWalk(dt);
  doors.forEach(d => { const tg = d.open ? d.a1 : d.a0; d.cur += (tg - d.cur) * Math.min(1, dt*6); if(d.sliding)d.pivot.position.copy(d.slideStart).addScaledVector(d.slideDirection,d.cur);else d.pivot.rotation.y = d.cur; });
  updateWindows(dt);updateSel();
  renderStyledScene();
  labelRenderer.render(scene, camera);
}

function shot(){renderStyledScene();renderer.domElement.toBlob(blob=>download(tr('户型装修方案','floor-plan-design')+'-3D.png',blob),'image/png');}
function relang(){ syncWalkTexts(); if (inited) buildLabels(); }

window.View3D = {createPhotoModel,photoAssetPreview,prepareLibraryItem,libraryThumbnail,importModel,inspect:()=>({platforms:archUp?.children.filter(o=>o.userData.spaceId).map(o=>({id:o.userData.spaceId,kind:o.userData.kind,height:new THREE.Box3().setFromObject(o).max.y})),wallJoins:archUp?.children.filter(o=>o.userData.wallJoin).map(o=>({id:o.userData.wallJoin,size:new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3()).toArray()})),floorMaterials:archFloor?.children.filter(o=>o.userData.room).map(o=>({id:o.userData.room,material:o.material.userData.floorMaterial,texture:o.material.map?.uuid,image:{type:o.material.map?.image?.tagName,width:o.material.map?.image?.width,height:o.material.map?.image?.height,ready:!!o.material.map?.image?.complete},normal:!!o.material.normalMap,roughness:!!o.material.roughnessMap,period:o.material.userData.surfacePeriod,layout:o.material.userData.surfaceLayout})),inited,active,colliders:colliders.length,doors:doors.map(d=>({id:d.id,open:d.open,length:d.length})),rooms:archFloor?.children.filter(o=>o.userData.room).length,objects:furnG?.children.length,camera:camera?.position.toArray(),architecture:archUp?.children.length,mode:opt.mode,origin:[OX,OY],cut:opt.cut,furniture:furnG?.children.map(g=>({id:g.userData.fid,size:new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3()).toArray()})),wallColors:[...new Set(archUp?.children.flatMap(g=>g.children.filter(o=>o.userData.wallId).flatMap(o=>Array.isArray(o.material)?o.material.map(m=>m.color.getHexString()):[])))]}),toggleDoor:id=>{const d=doors.find(d=>d.id===id);if(d)toggleDoor(d);},testBlocked:(x,y)=>blocked(wx(x),wz(y)),spawn:findSpawn,setMode,enter, exit, relang, sync:() => sync(), shot, groundAt, flyToRoom:id => active && !anim && flyToRoom(id), walking:() => active && opt.mode === 'walk'};

function toggleDoor(d){d.open=!d.open;const o=state.structure.openings.find(o=>o.id===d.id);if(o)o.open=d.open;save();}

const importedTemplates=new Map(),modelLoading=new Set();
const gltfLoader=new GLTFLoader();
function dataBuffer(data){const s=atob(data.split(',')[1]);return Uint8Array.from(s,c=>c.charCodeAt(0)).buffer;}
async function parseAsset(asset){return await new Promise((resolve,reject)=>gltfLoader.parse(asset.kind==='glb'?dataBuffer(asset.data):asset.data,'',g=>resolve(g.scene),reject));}
async function importModel(asset){const model=await parseAsset(asset);const b=new THREE.Box3().setFromObject(model),sz=b.getSize(new THREE.Vector3());if(Math.min(sz.x,sz.y,sz.z)<.000001)throw Error('模型需要具有宽、深、高三个维度');importedTemplates.set(asset.id,model);return {w:Math.round(sz.x*1000),h:Math.round(sz.y*1000),d:Math.round(sz.z*1000)};}
function applyFurnitureMaterial(g,f){if(!f.material||f.material==='original')return;const presets={wood:{roughness:.55,metalness:0},fabric:{roughness:.98,metalness:0},metal:{roughness:.24,metalness:.88}};const p=presets[f.material];if(!p)return;g.traverse(o=>{if(!o.isMesh)return;const apply=m=>{if(m.transparent||m.emissiveIntensity>.4)return m;const n=m.clone();n.roughness=p.roughness;n.metalness=p.metalness;n.color.set(f.color);if(f.material==='wood')n.map=floorMat('wood').map;n.needsUpdate=true;return n;};o.material=Array.isArray(o.material)?o.material.map(apply):apply(o.material);});}
function importedFurniture(f){const g=new THREE.Group(),asset=state.assets[f.assetId],template=importedTemplates.get(f.assetId);g.userData.fid=f.id;g.position.set(wx(f.cx),M(f.elevation||0),wz(f.cy));g.rotation.y=-f.rot*Math.PI/180;
  if(template){const model=template.clone(true);model.traverse(o=>{delete o.userData.fid;});const b=new THREE.Box3().setFromObject(model),s=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());model.position.sub(new THREE.Vector3(c.x,b.min.y,c.z));const group=new THREE.Group();group.add(model);group.scale.set(M(f.w)/s.x,M(f.h||800)/s.y,M(f.d)/s.z);g.add(group);g.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.castShadow=o.receiveShadow=true;}});applyFurnitureMaterial(g,f);}
  else{g.add(box(M(f.w),M(f.h||800),M(f.d),mat('#bd9e7a',{wireframe:true})));if(asset&&!modelLoading.has(asset.id)){modelLoading.add(asset.id);parseAsset(asset).then(m=>{importedTemplates.set(asset.id,m);sigFurn='';sync(true);}).catch(e=>{toast('模型读取失败：'+e.message);console.error(e);}).finally(()=>modelLoading.delete(asset.id));}}
  return g;
}

/* Catalogue previews use the very same geometry as furniture placed in the home.
 * Render into a small target on the existing WebGL context, then restore its state. */
const libraryThumbnailCache=new Map();
let libraryStudio=null;
function libraryThumbnail(item){
  if(!inited)throw Error('三维引擎尚未就绪');
  const key=JSON.stringify(item);if(libraryThumbnailCache.has(key))return libraryThumbnailCache.get(key);
  const width=256,height=216;
  if(!libraryStudio){
    const previewScene=new THREE.Scene(),cam=new THREE.OrthographicCamera(-1,1,1,-1,.01,100);
    previewScene.add(new THREE.HemisphereLight(0xffffff,0xc7baaa,2.2));
    const light=new THREE.DirectionalLight(0xfff6e8,3.4);light.position.set(-3,6,5);light.castShadow=true;light.shadow.mapSize.set(512,512);light.shadow.normalBias=.015;
    const fill=new THREE.DirectionalLight(0xffffff,1.5);fill.position.set(4,3,-3);previewScene.add(light,light.target,fill);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShadowMaterial({opacity:.13}));floor.rotation.x=-Math.PI/2;floor.position.y=-.008;floor.receiveShadow=true;previewScene.add(floor);
    const target=new THREE.WebGLRenderTarget(width,height);target.texture.colorSpace=THREE.SRGBColorSpace;
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    libraryStudio={scene:previewScene,camera:cam,light,floor,target,canvas,pixels:new Uint8Array(width*height*4)};
  }
  const studio=libraryStudio,[type,name,w,d,color]=item;
  const model=buildFurniture({id:'library-preview',type,name,w,d,color,cx:0,cy:0,rot:0,...(item[5]||{})});
  model.position.set(0,0,0);model.updateMatrixWorld(true);
  const originalBox=new THREE.Box3().setFromObject(model),center=originalBox.getCenter(new THREE.Vector3());
  model.position.set(-center.x,-originalBox.min.y,-center.z);model.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3()),focus=bounds.getCenter(new THREE.Vector3()),radius=Math.max(size.x,size.y,size.z,.1);
  const materials=new Map();model.traverse(o=>{if(!o.isMesh)return;const copy=m=>{if(!materials.has(m)){const n=m.clone();if(n.envMap)n.envMapIntensity=1;materials.set(m,n);}return materials.get(m);};o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);});
  studio.scene.add(model);studio.floor.scale.setScalar(radius*4);
  const yaw=(item[5]?.previewAngle||0)*Math.PI/180;
  studio.camera.position.copy(focus).add(new THREE.Vector3(1.2,.95,1.4).applyAxisAngle(new THREE.Vector3(0,1,0),yaw).normalize().multiplyScalar(radius*4));studio.camera.lookAt(focus);studio.camera.updateMatrixWorld(true);
  let halfX=0,halfY=0;
  for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z]){const p=new THREE.Vector3(x,y,z).applyMatrix4(studio.camera.matrixWorldInverse);halfX=Math.max(halfX,Math.abs(p.x));halfY=Math.max(halfY,Math.abs(p.y));}
  const half=Math.max(halfY,halfX/(width/height)) *1.18;
  Object.assign(studio.camera,{left:-half*width/height,right:half*width/height,top:half,bottom:-half,far:radius*12});studio.camera.updateProjectionMatrix();
  studio.light.position.copy(focus).add(new THREE.Vector3(-2,4,3).multiplyScalar(radius));studio.light.target.position.copy(focus);Object.assign(studio.light.shadow.camera,{left:-radius*2,right:radius*2,top:radius*2,bottom:-radius*2,near:.01,far:radius*12});studio.light.shadow.camera.updateProjectionMatrix();
  const previous={target:renderer.getRenderTarget(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),color:renderer.getClearColor(new THREE.Color()).clone(),alpha:renderer.getClearAlpha(),exposure:renderer.toneMappingExposure};
  try{
    renderer.setRenderTarget(studio.target);renderer.setScissorTest(false);renderer.setClearColor(0x000000,0);renderer.toneMappingExposure=1.05;renderer.render(studio.scene,studio.camera);renderer.readRenderTargetPixels(studio.target,0,0,width,height,studio.pixels);
    const ctx=studio.canvas.getContext('2d'),rgba=ctx.createImageData(width,height);for(let y=0;y<height;y++)rgba.data.set(studio.pixels.subarray((height-1-y)*width*4,(height-y)*width*4),y*width*4);ctx.putImageData(rgba,0,0);
    const image=studio.canvas.toDataURL('image/png');libraryThumbnailCache.set(key,image);return image;
  }finally{
    renderer.setRenderTarget(previous.target);renderer.setViewport(previous.viewport);renderer.setScissor(previous.scissor);renderer.setScissorTest(previous.scissorTest);renderer.setClearColor(previous.color,previous.alpha);renderer.toneMappingExposure=previous.exposure;
    studio.scene.remove(model);clearGroup(model);materials.forEach(m=>m.dispose());
  }
}

/* Photo-derived parameter geometry. No photo planes are used in the model. */
const photoTextureCache=new Map();
async function prepareLibraryItem(item){const assetId=item[5]?.assetId;if(assetId&&!importedTemplates.has(assetId)){const asset=state.assets[assetId];if(!asset)throw Error('模型资源缺失');await importModel(asset);}}
function photoAssetPreview(item){init();return libraryThumbnail(item);}
function photoVeneer(color){
  const key='veneer-'+color;if(photoTextureCache.has(key))return photoTextureCache.get(key);
  const cv=document.createElement('canvas');cv.width=512;cv.height=512;const ctx=cv.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,512,512);const random=rng(4062);
  for(let i=0;i<650;i++){ctx.strokeStyle=i%3?'rgba(255,255,245,.11)':'rgba(45,43,35,.15)';ctx.lineWidth=.25+random()*.65;const x=random()*512;ctx.beginPath();ctx.moveTo(x,0);for(let y=0;y<=512;y+=16)ctx.lineTo(x+Math.sin(y*.12+random()*4)*1.8,y);ctx.stroke();}
  const texture=new THREE.CanvasTexture(cv);texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(3,1);photoTextureCache.set(key,texture);return texture;
}
function capsuleShape(w,d){const r=d/2,left=-w/2+r,right=w/2-r,s=new THREE.Shape();s.moveTo(left,-r);s.lineTo(right,-r);s.absarc(right,0,r,-Math.PI/2,Math.PI/2,false);s.lineTo(left,r);s.absarc(left,0,r,Math.PI/2,Math.PI*1.5,false);s.closePath();return s;}
function capsuleMesh(w,d,h,material,y){const geo=new THREE.ExtrudeGeometry(capsuleShape(w,d),{depth:h,steps:1,bevelEnabled:false,curveSegments:32});geo.rotateX(-Math.PI/2);const object=mesh(geo,material);object.position.y=y;return object;}
function buildPhotoFurniture(recipe,dimensions){
  const {w:width,d:depth,h:height}=dimensions,w=M(width),d=M(depth),h=M(height),a=recipe.appearance||{};
  const extracted=buildSceneExtractedFurniture(recipe,dimensions);if(extracted)return extracted;
  if(recipe.kind==='coffee_oval'){const g=new THREE.Group(),top=Math.min(.055,h*.15),wood=woodM(a.bodyColor||'#96724b');g.add(decorSlab(decorShape('oval',w,d),top,wood,h-top));for(const side of [-1,1])g.add(cyl(Math.min(w*.13,d*.34),Math.min(w*.13,d*.34),h-top,wood,side*w*.24,0,0,48));g.userData.approximate=true;return g;}
  if(recipe.kind!=='rounded_tv_cabinet'){
    const type=recipe.kind==='straight_sofa'?'sofa':recipe.kind==='standing_lamp'?'floorlamp':recipe.kind==='potted_plant'?'plant':['coffee_oval','rug_rect','curtain_drape','art_abstract','tv','floorlamp'].includes(recipe.kind)?recipe.kind:recipe.kind==='sink'?'ksink':['bed','sofa','chair','table','cabinet','desk','armchair','coffeetable','wardrobe','counter','fridge','toilet','shower','washer','stove','plant'].includes(recipe.kind)?recipe.kind:'cabinet';
    const generic=buildFurniture({id:'photo-parameter',type,name:recipe.name||'近似家具',cx:0,cy:0,w:width,d:depth,h:height,rot:0,color:a.bodyColor||'#b9ac99'});generic.position.set(0,0,0);return generic;
  }
  const g=new THREE.Group();g.name=recipe.name||'照片电视柜';
  const legHeight=h*(1-(a.bodyHeightRatio||.7358490566)),bodyHeight=h-legHeight,topThickness=Math.min(.014,bodyHeight*.04),radius=d/2;
  const veneer=new THREE.MeshStandardMaterial({color:'#ffffff',map:photoVeneer(a.bodyColor||'#a7a397'),roughness:.72,metalness:.06});
  const top=new THREE.MeshStandardMaterial({color:'#ffffff',map:photoVeneer(a.topColor||'#b9b6aa'),roughness:.62,metalness:.08});
  const brass=mat(a.metalColor||'#b6a365',{metalness:.86,roughness:.34}),dark=mat(a.gapColor||'#3d372b',{roughness:.82}),black=mat('#3d3b31',{metalness:.25,roughness:.56});
  // Continuous rounded core with separate top and bottom edges.
  g.add(capsuleMesh(w-.006,d-.006,bodyHeight-topThickness,veneer,legHeight));
  g.add(capsuleMesh(w,d,topThickness,top,h-topThickness));
  g.add(capsuleMesh(w-.012,d-.012,.008,dark,legHeight));
  const drawerWidth=w*(a.centralDrawerWidthRatio||.34),flatWidth=w-d,sideWidth=(flatWidth-drawerWidth)/2,gap=.004,z=d/2+.001;
  // Front is +Z. A full-height dark reveal remains visible behind separate panels.
  g.add(box(flatWidth,bodyHeight-.020,.004,dark,0,legHeight+.009,z-.004));
  for(const side of [-1,1])g.add(box(Math.max(.01,sideWidth-gap),bodyHeight-.024,.012,veneer,side*(drawerWidth/2+sideWidth/2),legHeight+.010,z));
  const drawerHeight=(bodyHeight-.027)/2;
  for(let row=0;row<2;row++)g.add(box(drawerWidth-gap,drawerHeight-.005,.014,veneer,0,legHeight+.011+row*(drawerHeight+.005),z+.001));
  // Subtle brass finger recess between the two central drawers.
  g.add(box(drawerWidth-.008,.010,.006,brass,0,legHeight+bodyHeight/2-.004,z+.009));
  // Two narrow woven/reeded brass trims, with actual ridges and diagonal details.
  const stripWidth=Math.min(.062,w*.031),stripHeight=bodyHeight-.025;
  for(const side of [-1,1]){
    const x=side*(w/2-radius+.025);g.add(box(stripWidth,stripHeight,.009,brass,x,legHeight+.011,z+.009));
    for(let i=0;i<12;i++){const px=x-stripWidth/2+.003+i*(stripWidth-.006)/11;g.add(box(.0013,stripHeight-.006,.002,dark,px,legHeight+.014,z+.015));}
    const rows=Math.min(48,Math.floor(stripHeight/.009));for(let i=0;i<rows;i++){const yy=legHeight+.016+i*(stripHeight-.01)/rows,zig=new THREE.Group();zig.add(rod([x-stripWidth/2+.002,yy,z+.016],[x,yy+.004,z+.017],.00065,brass),rod([x,yy+.004,z+.017],[x+stripWidth/2-.002,yy,z+.016],.00065,brass));g.add(zig);}
  }
  // Two outer sculpted brass feet, two recessed feet, plus simple rear supports.
  for(const side of [-1,1]){
    const x=side*(w/2-radius*.38),front=d*.35;
    const foot=new THREE.Group();foot.add(blob(.012,legHeight*.62,.014,brass,0,legHeight*.58,0,18));foot.add(rod([0,.004,0],[side*.008,legHeight+.025,-.012],.006,brass,.010));foot.position.set(x,0,front);g.add(foot);
    g.add(cyl(.008,.010,legHeight,black,side*w*.23,0,d*.25,12));
    g.add(cyl(.006,.008,legHeight,brass,side*(w/2-radius*.75),0,-d*.31,12));
  }
  g.userData.photoRecipe=recipe.id||recipe.kind;g.userData.approximate=true;return g;
}
async function createPhotoModel(recipe,dimensions){
  if(!FurniturePhotoCore.validDimensions(dimensions))throw Error('请先填写有效的宽、深、高');
  const object=buildPhotoFurniture(recipe,dimensions);object.traverse(o=>{if(o.geometry?.getAttribute('normal'))o.geometry.normalizeNormals();});object.position.set(0,0,0);object.updateMatrixWorld(true);
  // Normalize the generated solid geometry to the exact requested real dimensions.
  const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());object.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));
  const root=new THREE.Group();root.name=recipe.name||'图片家具';root.add(object);root.scale.set(M(dimensions.w)/size.x,M(dimensions.h)/size.y,M(dimensions.d)/size.z);root.updateMatrixWorld(true);
  root.traverse(o=>{delete o.userData.fid;});
  try{return await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true,maxTextureSize:512});}
  finally{clearGroup(root);}
}
// Development inspection uses the same raycaster and projection as real dragging.
Object.assign(window.View3D,{
  inspectAt:(x,y,details=false)=>{const hit=pick({clientX:x,clientY:y});return details?{hit,hits:ray.intersectObjects([furnG,archUp,archFloor],true).slice(0,5).map(h=>({distance:h.distance,point:h.point.toArray(),chain:(()=>{const chain=[];for(let o=h.object;o&&o!==scene;o=o.parent)chain.push({name:o.name,userData:o.userData});return chain;})()}))}:hit;},
  projectFurniture:id=>{const g=furnG?.children.find(g=>g.userData.fid===id);if(!g)return null;const r=renderer.domElement.getBoundingClientRect(),b=new THREE.Box3().setFromObject(g),p=b.getCenter(new THREE.Vector3()).project(camera);return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};}
});

/* Scene-extracted furniture: solid parametric approximations, never image planes. */
let extractedClothTexture=null,extractedRugTexture=null;
function extractedCloth(color){
 if(!extractedClothTexture){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),r=rng(7315);ctx.fillStyle='#ddd';ctx.fillRect(0,0,256,256);for(let i=0;i<16000;i++){ctx.fillStyle=i%2?'#ffffff35':'#57544e26';ctx.fillRect(r()*256,r()*256,.5+r()*1.5,.5+r()*1.5);}extractedClothTexture=new THREE.CanvasTexture(c);extractedClothTexture.wrapS=extractedClothTexture.wrapT=THREE.RepeatWrapping;extractedClothTexture.repeat.set(3,3);}
 return new THREE.MeshStandardMaterial({color,roughness:.98,bumpMap:extractedClothTexture,bumpScale:.0018});
}
function extractedRug(){
 if(!extractedRugTexture){const c=document.createElement('canvas');c.width=1024;c.height=768;const x=c.getContext('2d');x.fillStyle='#e5dfd0';x.fillRect(0,0,1024,768);x.fillStyle='#252722';for(const [a,b,w,h] of [[60,0,95,768],[280,0,70,768],[470,0,110,768],[705,0,62,768],[865,0,95,768],[0,225,1024,75],[0,540,1024,65]])x.fillRect(a,b,w,h);x.fillStyle='#e5dfd0';for(const [a,b,w,h] of [[60,60,95,125],[280,340,70,150],[470,320,110,170],[705,60,62,140],[865,340,95,150]])x.fillRect(a,b,w,h);x.strokeStyle='#a5323b';x.lineWidth=20;x.strokeRect(10,10,1004,748);const r=rng(883);for(let i=0;i<45000;i++){x.fillStyle=i%2?'#ffffff12':'#0000000a';x.fillRect(r()*1024,r()*768,1,2);}extractedRugTexture=new THREE.CanvasTexture(c);extractedRugTexture.colorSpace=THREE.SRGBColorSpace;}
 return new THREE.MeshStandardMaterial({map:extractedRugTexture,roughness:1});
}
function buildSceneExtractedFurniture(recipe,dimensions){
 const supported=['scene_sofa','slab_armchair','round_tripod_table','clover_stool','pedestal_side_table','cone_floor_lamp','wall_cubby_shelf','z_child_chair','geometric_rug','block_dining_table','thin_frame_chair'];if(!supported.includes(recipe.kind))return null;
 const w=M(dimensions.w),d=M(dimensions.d),h=M(dimensions.h),a=recipe.appearance||{},g=new THREE.Group(),body=a.bodyColor||'#b8ad98',secondary=a.secondaryColor||'#696457',accent=a.accentColor||'#982d31',solid=mat(body,{roughness:.67}),dark=mat(secondary,{roughness:.75});g.name=recipe.name||'效果图近似家具';
 switch(recipe.kind){
 case 'scene_sofa':{
  const cloth=extractedCloth(body);g.add(capsuleMesh(w,d,h*.28,cloth,h*.055));g.add(rbox(w*.94,h*.18,d*.88,cloth,0,h*.30,0,.12));g.add(rbox(w*.80,h*.40,d*.22,cloth,0,h*.47,-d*.31,.12));
  for(const side of [-1,1]){const cushion=rbox(w*.26,h*.31,d*.17,cloth,side*w*.25,h*.45,-d*.18,.09);cushion.rotation.x=-.15;g.add(cushion);}const pillow=rbox(w*.17,h*.39,d*.17,extractedCloth(a.accentColor||'#17263e'),w*.12,h*.46,-d*.11,.055);pillow.rotation.z=-.15;pillow.rotation.x=-.20;g.add(pillow);g.add(rbox(w*.23,h*.025,d*.70,extractedCloth(secondary),-w*.20,h*.48,d*.05,.012));break;
 }
 case 'slab_armchair':{
  const cloth=extractedCloth(body);for(const side of [-1,1]){for(const z of [-d*.36,d*.36])g.add(box(w*.105,h*.64,d*.105,solid,side*w*.43,0,z));g.add(rbox(w*.12,h*.13,d*.96,solid,side*w*.43,h*.57,0,.006));}
  g.add(box(w*.78,h*.075,d*.77,dark,0,h*.29,d*.035));g.add(rbox(w*.78,h*.21,d*.69,cloth,0,h*.34,d*.08,.025));const back=rbox(w*.80,h*.51,d*.15,cloth,0,h*.46,-d*.31,.015);back.rotation.x=-.13;g.add(back);break;
 }
 case 'round_tripod_table':{
  g.add(cyl(w*.5,w*.5,h*.075,solid,0,h*.925,0,80));for(let i=0;i<3;i++){const angle=i*Math.PI*2/3,p=new THREE.Group();p.position.set(Math.sin(angle)*w*.22,0,Math.cos(angle)*d*.22);p.rotation.y=angle;p.add(box(w*.29,h*.925,d*.12,dark));g.add(p);}break;
 }
 case 'clover_stool':{
  const wood=mat(body,{roughness:.39});for(let i=0;i<3;i++){const angle=i*Math.PI*2/3;g.add(lathe([[0,0],[w*.13,0],[w*.21,h*.10],[w*.20,h*.30],[w*.135,h*.77],[w*.12,h*.91],[0,h*.91]],wood,Math.sin(angle)*w*.21,0,Math.cos(angle)*d*.21,40));}g.add(cyl(w*.48,w*.48,h*.045,dark,0,h*.895,0,72),cyl(w*.49,w*.49,h*.06,wood,0,h*.94,0,72));break;
 }
 case 'pedestal_side_table':g.add(cyl(w*.5,w*.5,h*.045,solid,0,h*.955,0,72),cyl(w*.035,w*.035,h*.9,solid,0,h*.04,0,24),cyl(w*.29,w*.31,h*.04,dark,0,0,0,64));break;
 case 'cone_floor_lamp':{
  const white=mat(body,{roughness:.88}),shade=new THREE.MeshStandardMaterial({color:body,roughness:.96,side:THREE.DoubleSide});g.add(cyl(w*.22,w*.23,h*.022,white,0,0,0,64),cyl(w*.065,w*.14,h*.75,white,0,h*.02,0,48));const shell=new THREE.Mesh(new THREE.CylinderGeometry(w*.5,w*.5,h*.22,64,1,true),shade);shell.position.y=h*.89;shell.castShadow=shell.receiveShadow=true;g.add(shell);g.add(cyl(w*.46,w*.46,h*.006,mat('#e3dfd3',{roughness:1}),0,h*.78,0,64));break;
 }
 case 'wall_cubby_shelf':{
  const t=Math.min(.027,w*.022);g.add(box(w,h,d*.045,dark,0,0,-d*.477));for(const x of [-w/2+t/2,w/2-t/2])g.add(box(t,h,d,solid,x));for(const y of [0,h/2-t/2,h-t])g.add(box(w,t,d,solid,0,y));for(const x of [-w*.17,w*.19])g.add(box(t,h/2,d,solid,x,h/2));for(const x of [-w*.31,w*.10])g.add(box(t,h/2,d,solid,x));g.add(box(w*.32,h*.45,t,solid,-w*.02,h*.03,d/2-t/2));break;
 }
 case 'z_child_chair':{
  function plank(a,b,width,depth){const v=new THREE.Vector3().subVectors(new THREE.Vector3(...b),new THREE.Vector3(...a)),o=new THREE.Mesh(new THREE.BoxGeometry(width,v.length(),depth),solid);o.position.copy(new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(.5));o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize());o.castShadow=o.receiveShadow=true;return o;}
  for(const side of [-1,1]){g.add(box(w*.105,h*.055,d,solid,side*w*.43,0,0),plank([side*w*.43,h*.06,d*.32],[side*w*.43,h*.98,-d*.32],w*.105,d*.09));}g.add(box(w*.80,h*.045,d*.46,solid,0,h*.58,0),box(w*.80,h*.04,d*.49,solid,0,h*.32,d*.16),rbox(w*.80,h*.12,d*.055,solid,0,h*.86,-d*.29,.008),box(w*.80,h*.055,d*.06,solid,0,h*.14,d*.26));break;
 }
 case 'geometric_rug':{
  const base=box(w,h,d,mat(body,{roughness:1}));g.add(base);const top=new THREE.Mesh(new THREE.PlaneGeometry(w,d),extractedRug());top.rotation.x=-Math.PI/2;top.position.y=h+.0005;top.receiveShadow=true;g.add(top);break;
 }
 case 'block_dining_table':g.add(box(w,h*.055,d,dark,0,h*.945));for(const x of [-w*.40,w*.40])g.add(box(w*.12,h*.945,d*.88,solid,x));g.add(box(w*.72,h*.90,d*.03,solid,0,h*.025,-d*.4));break;
 case 'thin_frame_chair':{
  const metal=mat(body,{metalness:.45,roughness:.45});for(const side of [-1,1])for(const z of [-d*.37,d*.37])g.add(cyl(w*.017,w*.017,h*(z<0?.96:.53),metal,side*w*.41,0,z,12));g.add(rbox(w*.88,h*.045,d*.78,dark,0,h*.50,0,.015),rbox(w*.86,h*.13,d*.045,dark,0,h*.81,-d*.37,.014));break;
 }
 }
 g.userData.approximate=true;g.userData.extractedKind=recipe.kind;return g;
}
Object.assign(window.View3D,{inspectPlacement:id=>{const g=furnG?.children.find(g=>g.userData.fid===id);if(!g)return null;const b=new THREE.Box3().setFromObject(g);return {position:g.position.toArray(),min:b.min.toArray(),max:b.max.toArray()};}});

/* True orthographic top-down furniture, shared with the editable 3D scene. */
const planSpriteCache=new Map();let planSpriteStudio;
async function planFurnitureSprite(f){
  init();const key=JSON.stringify([f.type,f.w,f.d,f.h||0,f.color,f.material||'original',f.assetId||'',f.rugPattern||'woven']);
  if(planSpriteCache.has(key))return planSpriteCache.get(key);
  if(f.assetId)await prepareLibraryItem([f.type,f.name,f.w,f.d,f.color,{assetId:f.assetId,h:f.h}]);
  if(!planSpriteStudio){
    const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.01,100);
    scene.add(new THREE.HemisphereLight(0xffffff,0xc9c1b4,1.45));
    const light=new THREE.DirectionalLight(0xfffaf0,2.1);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.normalBias=.006;light.shadow.bias=-.00015;light.shadow.radius=4;
    scene.add(light,light.target);const fill=new THREE.DirectionalLight(0xffffff,.65);fill.position.set(3,5,2);scene.add(fill);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.ShadowMaterial({opacity:.18}));floor.rotation.x=-Math.PI/2;floor.position.y=-.008;floor.receiveShadow=true;scene.add(floor);
    planSpriteStudio={scene,camera,light,floor,target:new THREE.WebGLRenderTarget(512,512),canvas:document.createElement('canvas')};
    planSpriteStudio.target.texture.colorSpace=THREE.SRGBColorSpace;
  }
  const s=planSpriteStudio,model=buildFurniture({...f,id:'plan-sprite',cx:0,cy:0,rot:0});model.position.set(0,0,0);model.rotation.set(0,0,0);model.updateMatrixWorld(true);
  // Clone materials because per-view exposure and disposal must never affect the home.
  const materials=new Map();model.traverse(o=>{if(!o.isMesh)return;const copy=m=>{if(!materials.has(m))materials.set(m,m.clone());return materials.get(m);};o.material=Array.isArray(o.material)?o.material.map(copy):copy(o.material);});
  const b=new THREE.Box3().setFromObject(model),radius=Math.max(f.w/1000,f.d/1000,.2),pad=Math.min(.18,Math.max(.07,radius*.06));
  const w=Math.max(f.w/1000,Math.abs(b.min.x)*2,Math.abs(b.max.x)*2)+pad*2,d=Math.max(f.d/1000,Math.abs(b.min.z)*2,Math.abs(b.max.z)*2)+pad*2;
  const pixels=640,width=Math.max(96,Math.round(pixels*w/Math.max(w,d))),height=Math.max(96,Math.round(pixels*d/Math.max(w,d)));
  s.target.setSize(width,height);s.canvas.width=width;s.canvas.height=height;s.floor.scale.set(w*4,d*4,1);s.scene.add(model);
  Object.assign(s.camera,{left:-w/2,right:w/2,top:d/2,bottom:-d/2,far:radius*10+20});s.camera.up.set(0,0,-1);s.camera.position.set(0,b.max.y+radius*3+5,0);s.camera.lookAt(0,0,0);s.camera.updateProjectionMatrix();s.camera.updateMatrixWorld(true);
  s.light.position.set(-radius*1.1,radius*5+4,-radius*.8);s.light.target.position.set(0,0,0);Object.assign(s.light.shadow.camera,{left:-w,right:w,top:d,bottom:-d,near:.01,far:radius*15+20});s.light.shadow.camera.updateProjectionMatrix();
  const previous={target:renderer.getRenderTarget(),viewport:renderer.getViewport(new THREE.Vector4()),scissor:renderer.getScissor(new THREE.Vector4()),scissorTest:renderer.getScissorTest(),color:renderer.getClearColor(new THREE.Color()).clone(),alpha:renderer.getClearAlpha(),exposure:renderer.toneMappingExposure};
  try{
    renderer.setRenderTarget(s.target);renderer.setScissorTest(false);renderer.setClearColor(0x000000,0);renderer.toneMappingExposure=.96;renderer.render(s.scene,s.camera);
    const rgba=new Uint8Array(width*height*4);renderer.readRenderTargetPixels(s.target,0,0,width,height,rgba);const ctx=s.canvas.getContext('2d'),image=ctx.createImageData(width,height);for(let y=0;y<height;y++)image.data.set(rgba.subarray((height-1-y)*width*4,(height-y)*width*4),y*width*4);ctx.putImageData(image,0,0);
    const result={href:s.canvas.toDataURL('image/png'),x:-w*500,y:-d*500,w:w*1000,d:d*1000,width,height};planSpriteCache.set(key,result);
    // Bound the temporary preview cache while allowing reuse during normal dragging.
    if(planSpriteCache.size>180)planSpriteCache.delete(planSpriteCache.keys().next().value);return result;
  }finally{
    renderer.setRenderTarget(previous.target);renderer.setViewport(previous.viewport);renderer.setScissor(previous.scissor);renderer.setScissorTest(previous.scissorTest);renderer.setClearColor(previous.color,previous.alpha);renderer.toneMappingExposure=previous.exposure;
    s.scene.remove(model);clearGroup(model);materials.forEach(m=>m.dispose());
  }
}
Object.assign(window.View3D,{planFurnitureSprite});

/* Independent, data-driven orthographic gallery with real ambient occlusion. */
let architectStudio=null,architectSnapshot=null,architectBuildJob=0,architectFrame=0,architectOpened=false;
const architectTextures=new Map();
function architectOptions(){const p=state.presentation?.architect||{};return {palette:p.palette==='original'?'original':'soft',wall:['1300','1800','full'].includes(p.wall)?p.wall:'1800',ao:p.ao!==false};}
function architectSaveOptions(){const v=architectStudio.options;state.presentation={...state.presentation,architect:{...v}};save();}
function architectRender(){if(!architectOpened||!architectStudio)return;const s=architectStudio;s.ao.ssaoMaterial.uniforms.cameraProjectionMatrix.value.copy(s.camera.projectionMatrix);s.ao.ssaoMaterial.uniforms.cameraInverseProjectionMatrix.value.copy(s.camera.projectionMatrixInverse);s.ao.enabled=s.options.ao;s.composer.render();}
function architectRequest(){if(architectFrame||!architectOpened)return;architectFrame=requestAnimationFrame(()=>{architectFrame=0;architectRender();});}
function architectInit(){
 if(architectStudio)return;init();const host=$('#architectCanvas'),renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.4));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.VSMShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;renderer.outputColorSpace=THREE.SRGBColorSpace;host.prepend(renderer.domElement);
 const scene=new THREE.Scene();scene.background=new THREE.Color('#f3f2ee');const camera=new THREE.OrthographicCamera(-10,10,10,-10,.05,200),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minPolarAngle=.06;controls.maxPolarAngle=Math.PI*.475;controls.minZoom=.2;controls.maxZoom=9;
 const hemisphere=new THREE.HemisphereLight(0xffffff,0xb2ada4,1.65),key=new THREE.DirectionalLight(0xfffaf0,2.2),fill=new THREE.DirectionalLight(0xffffff,.55);key.castShadow=true;key.shadow.mapSize.setScalar(2048);key.shadow.radius=12;key.shadow.blurSamples=12;key.shadow.bias=-.00015;key.shadow.normalBias=.015;fill.position.set(8,14,6);scene.add(hemisphere,key,key.target,fill);
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.ShadowMaterial({opacity:.19}));ground.rotation.x=-Math.PI/2;ground.position.y=-.17;ground.receiveShadow=true;scene.add(ground);const root=new THREE.Group();scene.add(root);
 const composer=new EffectComposer(renderer),renderPass=new RenderPass(scene,camera),ao=new SSAOPass(scene,camera,800,600,24),output=new OutputPass();ao.kernelRadius=.42;ao.minDistance=.0003;ao.maxDistance=.012;ao.ssaoMaterial.defines.PERSPECTIVE_CAMERA=0;ao.depthRenderMaterial.defines.PERSPECTIVE_CAMERA=0;composer.addPass(renderPass);composer.addPass(ao);composer.addPass(output);
 architectStudio={host,renderer,scene,camera,controls,key,ground,root,composer,ao,output,options:architectOptions(),materials:new Set(),stats:{},bounds:null,half:10};controls.addEventListener('change',architectRequest);
 new ResizeObserver(()=>{if(architectOpened)architectResize();}).observe(host);
 $('#architectDialog').addEventListener('close',()=>{architectOpened=false;++architectBuildJob;if(architectFrame)cancelAnimationFrame(architectFrame);architectFrame=0;architectOpenButton.classList.remove('on');if(active)startLoop();});
 const rebuild=async()=>{try{await architectBuild(false);}catch(e){toast('效果图更新失败：'+e.message);}};
 $('#architectPalette').onchange=async e=>{architectStudio.options.palette=e.target.value;architectSaveOptions();await rebuild();};
 $('#architectWall').onchange=async e=>{architectStudio.options.wall=e.target.value;architectSaveOptions();await rebuild();};
 $('#architectAO').onclick=()=>{const s=architectStudio;s.options.ao=!s.options.ao;architectSaveOptions();architectControls();architectRequest();};
 $('#architectIso').onclick=()=>architectFrameModel(new THREE.Vector3(1,2.2,1.35));$('#architectOther').onclick=()=>architectFrameModel(new THREE.Vector3(-1,2.2,-1.35));$('#architectTop').onclick=()=>architectFrameModel(new THREE.Vector3(.0001,1,.0001));
 $('#architectExport').onclick=async()=>{const button=$('#architectExport');button.disabled=true;button.textContent='正在导出…';try{download('全屋轴测效果.png',await architectExport());}catch(e){toast('效果图导出失败：'+e.message);}finally{button.disabled=false;button.textContent='导出效果图';}};
}
function architectControls(){const o=architectStudio.options;$('#architectPalette').value=o.palette;$('#architectWall').value=o.wall;$('#architectAO').classList.toggle('on',o.ao);$('#architectAO').setAttribute('aria-pressed',String(o.ao));}
function architectDisposeRoot(){clearWallFinishHighlight();cancelWallFinishAnimation();const s=architectStudio;s.root.traverse(o=>o.geometry?.dispose());s.root.clear();s.materials.forEach(m=>m.dispose());s.materials.clear();}
async function architectFloorMaterial(kind,layout){if(PlanCore.floorMaterials[kind]?.source||layout)SurfaceTextures.pbr(kind,layout);await SurfaceTextures.ready();return floorMat(kind,layout).clone();}
async function architectBuild(frame=true){
 const job=++architectBuildJob,s=architectStudio,plan=architectSnapshot;$('#architectLoading').hidden=false;$('#architectProgress').textContent='正在构建墙体、家具与材质…';
 try{
  const floors=new Map();for(const r of plan.structure.rooms)floors.set(r.id,await architectFloorMaterial(plan.rooms[r.id]?.mat||'tile800',plan.rooms[r.id]?.surfaceLayout));
  for(const f of plan.furniture)if(f.assetId)await prepareLibraryItem([f.type,f.name,f.w,f.d,f.color,{assetId:f.assetId,h:f.h}]);if(job!==architectBuildJob||!architectOpened){for(const m of floors.values())m.dispose();return;}
  architectDisposeRoot();for(const m of floors.values())s.materials.add(m);
  const b=PlanCore.bounds(plan,false),ox=b.x+b.w/2,oy=b.y+b.h/2,px=x=>(x-ox)/1000,pz=y=>(y-oy)/1000,cut=s.options.wall==='full'?Infinity:Number(s.options.wall),materials=new Map();
  const soft=color=>{const c=new THREE.Color(color),hsl={};c.getHSL(hsl);c.setHSL(hsl.h,hsl.s*.32,hsl.l);return c.lerp(new THREE.Color('#e7e4dc'),.17);};
  const material=(color,extra={})=>{const m=new THREE.MeshStandardMaterial({color:s.options.palette==='soft'?soft(color):new THREE.Color(color),roughness:.86,metalness:0,...extra});s.materials.add(m);return m;};
  const wallBase=material('#dfded7'),cap=material('#eeece5'),slab=material('#bcbab3'),frameMat=material('#777a72',{roughness:.65,metalness:.2}),glass=new THREE.MeshPhysicalMaterial({color:'#e1e9e7',roughness:.15,transparent:true,opacity:.19,depthWrite:false});s.materials.add(glass);
  const solid=(w,h,d,m,x=0,y=0,z=0)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y+h/2,z);o.castShadow=o.receiveShadow=true;return o;};
  const shape=poly=>{const q=new THREE.Shape();poly.forEach(([x,y],i)=>q[i?'lineTo':'moveTo'](px(x),-pz(y)));q.closePath();return q;};
  for(const r of plan.structure.rooms){const elevation=(r.elevation||0)/1000,sh=shape(r.poly),base=new THREE.Mesh(new THREE.ExtrudeGeometry(sh,{depth:elevation+.12,bevelEnabled:false,steps:1}).rotateX(-Math.PI/2),slab);base.position.y=-.12;base.userData.spaceKind=r.kind;base.castShadow=base.receiveShadow=true;s.root.add(base);const floor=new THREE.Mesh(new THREE.ShapeGeometry(sh).rotateX(-Math.PI/2),floors.get(r.id));floor.position.y=elevation+.004;floor.receiveShadow=true;floor.userData.roomId=r.id;floor.userData.floorMaterial=plan.rooms[r.id]?.mat||'tile800';s.root.add(floor);}
  let pieces=0;
  const surfaceData=WallSurfaceCore.build(plan,cut);
  for(const [i,w] of plan.structure.walls.entries()){
   if(plan.demolished.includes('w'+i))continue;const angle=-Math.atan2(w.b[1]-w.a[1],w.b[0]-w.a[0]);const wallColorFor=(side,t=PlanCore.length(w)/2)=>{const q=PlanCore.point(w,t,side*(w.thickness/2+60)),r=plan.structure.rooms.find(r=>PlanCore.inside(q,r.poly));return r?plan.rooms[r.id]?.wallColor||'#f4f1eb':'#f4f1eb';};
   const left=material(wallColorFor(1)),right=material(wallColorFor(-1));
   for(const p of surfaceData.prisms.filter(p=>p.wallId===w.id&&!p.joinId&&p.faces.length)){const t=(p.a+p.b)/2,mid=PlanCore.point(w,t),g=new THREE.Group();g.position.set(px(mid[0]),0,pz(mid[1]));g.rotation.y=angle;const mesh=new THREE.Mesh(localWallSurfaceGeometry(p,w,mid),[wallBase,wallBase,cap,wallBase,wallFaceMaterial(plan,w,1,t),wallFaceMaterial(plan,w,-1,t)]);mesh.castShadow=mesh.receiveShadow=true;mesh.userData.wallSurface=true;mesh.userData.wallId=w.id;mesh.userData.wallPieceKey=JSON.stringify([p.a,p.b,p.bottom,p.top]);s.materials.add(mesh.material[4]);s.materials.add(mesh.material[5]);g.add(mesh);g.userData.wallId=w.id;s.root.add(g);pieces++;}
   for(const o of plan.structure.openings.filter(o=>o.wallId===w.id)){
    const height=(Math.min(o.sill+o.height,w.height,cut)-o.sill)/1000;if(height<=0)continue;const mid=PlanCore.point(w,o.offset+o.width/2),g=new THREE.Group();g.position.set(px(mid[0]),o.sill/1000,pz(mid[1]));g.rotation.y=angle;g.userData.openingId=o.id;
    if(o.type==='window'){const model=WindowModel.build(THREE,WindowCore.spec(o,w,plan),{cut:cut/1000,sill:o.sill/1000});g.add(model.group);for(const m of model.materials)s.materials.add(m);s.renderer.localClippingEnabled=true;}
    else if(o.style==='sliding'){const l=o.width/1000;for(let i=0;i<2;i++){const x=i?l/4:o.open?l/4:-l/4;g.add(solid(l/2,height,.024,glass,x,0,i?.018:-.018));for(const dx of [-l/4,l/4])g.add(solid(.035,height,.055,frameMat,x+dx));for(const y of [0,height-.035])g.add(solid(l/2,.035,.055,frameMat,x,y));}}
    else{const start=PlanCore.point(w,o.offset+(o.hinge==='end'?o.width:0));g.position.set(px(start[0]),0,pz(start[1]));if(o.hinge==='end')g.rotation.y+=Math.PI;if(o.open)g.rotation.y-=(o.swing||1)*Math.PI/2;g.add(solid(o.width/1000,height,.032,material(o.entry?'#8f7c63':'#d9d4c7'),o.width/2000));g.add(solid(.09,.014,.045,frameMat,(o.width-90)/1000,Math.min(1,height*.5),.035));}
    s.root.add(g);
   }
  }
  for(const p of surfaceData.prisms.filter(p=>p.joinId&&p.faces.length)){const w=plan.structure.walls.find(w=>w.id===p.wallId),f=PlanCore.frame(w),left=wallFaceMaterial(plan,w,1),right=wallFaceMaterial(plan,w,-1);s.materials.add(left);s.materials.add(right);const o=new THREE.Mesh(wallSurfaceGeometry(p,(q,h)=>new THREE.Vector3(px(q[0]),h/1000,pz(q[1])),n=>new THREE.Vector3(n[0],0,n[1]),face=>face.normal[0]*-f.uy+face.normal[1]*f.ux>=0?4:5,v=>[((v.x*1000+ox-w.a[0])*f.ux+(v.z*1000+oy-w.a[1])*f.uy)/1000,v.y]),[wallBase,wallBase,cap,wallBase,left,right]);o.userData.wallSurface=true;o.userData.wallId=w.id;o.userData.wallPieceKey=p.joinId;o.userData.wallJoin=p.joinId;o.castShadow=o.receiveShadow=true;s.root.add(o);pieces++;}
  for(const c of plan.structure.columns){const o=solid(c.w/1000,Math.min(c.height,cut)/1000,c.d/1000,wallBase,px(c.x),0,pz(c.y));o.userData.columnId=c.id;s.root.add(o);}
  for(const f of plan.furniture){const g=buildFurniture(f);g.position.set(px(f.cx),M(f.elevation||0),pz(f.cy));g.traverse(o=>{if(!o.isMesh)return;const clone=m=>{if(!materials.has(m)){const n=m.clone();if(s.options.palette==='soft'){n.color?.copy(soft(m.color||'#dedbd2'));if('roughness'in n)n.roughness=Math.max(.62,n.roughness);if('metalness'in n)n.metalness=Math.min(.55,n.metalness);if(n.emissiveIntensity)n.emissiveIntensity*=.35;}if(n.envMap){n.envMap=envTex;n.envMapIntensity=.55;}materials.set(m,n);s.materials.add(n);}return materials.get(m);};o.material=Array.isArray(o.material)?o.material.map(clone):clone(o.material);});s.root.add(g);}
  for(const g of wallRegionPanels(plan,cut,p=>new THREE.Vector3(px(p[0]),0,pz(p[1])))){g.traverse(o=>{if(o.isMesh)s.materials.add(o.material);});s.root.add(g);}
  s.root.updateMatrixWorld(true);s.bounds=new THREE.Box3().setFromObject(s.root);const radius=Math.max(b.w,b.h)/1000;s.key.position.set(-radius*.8,radius*1.7,-radius*.5);s.key.target.position.set(0,0,0);Object.assign(s.key.shadow.camera,{left:-radius,right:radius,top:radius,bottom:-radius,near:.1,far:radius*6+30});s.key.shadow.camera.updateProjectionMatrix();s.ground.scale.setScalar(Math.max(1,radius/30));s.camera.far=radius*8+100;s.ao.ssaoMaterial.uniforms.cameraFar.value=s.camera.far;s.ao.depthRenderMaterial.uniforms.cameraFar.value=s.camera.far;
  s.stats={rooms:plan.structure.rooms.length,walls:plan.structure.walls.length,wallPieces:pieces,wallSurfaceFaces:surfaceData.faces,openings:plan.structure.openings.length,columns:plan.structure.columns.length,furniture:plan.furniture.length,photoFurniture:plan.furniture.filter(f=>f.photoRecipe).length};$('#architectSummary').textContent=`${s.stats.rooms} 个房间 · ${s.stats.furniture} 件家具 · ${plan.calibration.confirmed?'尺寸已校准':'尺寸为估算值'}`;
  if(frame)architectFrameModel(new THREE.Vector3(1,2.2,1.35));else architectRequest();architectControls();
 }finally{if(job===architectBuildJob)$('#architectLoading').hidden=true;}
}
function architectFit(width,height){const s=architectStudio,b=s.bounds;if(!b)return;const center=b.getCenter(new THREE.Vector3()),direction=s.camera.position.clone().sub(s.controls.target);s.camera.position.copy(center).add(direction);s.controls.target.copy(center);s.camera.lookAt(center);s.camera.updateMatrixWorld(true);let hx=0,hy=0;for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const p=new THREE.Vector3(x,y,z).applyMatrix4(s.camera.matrixWorldInverse);hx=Math.max(hx,Math.abs(p.x));hy=Math.max(hy,Math.abs(p.y));}s.half=Math.max(hy,hx/(width/height))*1.12;s.camera.left=-s.half*width/height;s.camera.right=s.half*width/height;s.camera.top=s.half;s.camera.bottom=-s.half;s.camera.updateProjectionMatrix();}
function architectFrameModel(direction){const s=architectStudio;if(!s.bounds)return;const center=s.bounds.getCenter(new THREE.Vector3()),size=s.bounds.getSize(new THREE.Vector3()).length();s.camera.position.copy(center).add(direction.normalize().multiplyScalar(size*2+15));s.camera.zoom=1;s.controls.target.copy(center);s.controls.update();architectFit(s.host.clientWidth,s.host.clientHeight);architectRequest();}
function architectResize(){const s=architectStudio,w=Math.max(1,s.host.clientWidth),h=Math.max(1,s.host.clientHeight);s.renderer.setSize(w,h);s.composer.setSize(w,h);if(s.bounds)architectFit(w,h);architectRequest();}
async function architectOpen(){
 if(!state.structure.rooms.length&&!state.structure.walls.length&&!state.furniture.length)return toast('请先上传或绘制户型，再查看全屋效果');
 architectInit();architectSnapshot=C.clone(state);architectStudio.options=architectOptions();architectOpened=true;architectOpenButton.classList.add('on');if(raf)cancelAnimationFrame(raf);raf=0;if(!$('#architectDialog').open)$('#architectDialog').showModal();architectResize();await architectBuild(true);architectRequest();
}
async function architectExport(size=2560){
 const s=architectStudio,camera=s.camera,w=s.host.clientWidth,h=s.host.clientHeight,old={pixelRatio:s.renderer.getPixelRatio(),left:camera.left,right:camera.right,top:camera.top,bottom:camera.bottom,zoom:camera.zoom,position:camera.position.clone(),target:s.controls.target.clone()};
 try{s.renderer.setPixelRatio(1);s.composer.setPixelRatio(1);s.renderer.setSize(size,size,false);s.composer.setSize(size,size);camera.zoom=1;architectFit(size,size);architectRender();return await new Promise((res,rej)=>s.renderer.domElement.toBlob(blob=>blob?res(blob):rej(Error('图片生成失败')),'image/png'));}
 finally{s.renderer.setPixelRatio(old.pixelRatio);s.composer.setPixelRatio(old.pixelRatio);s.renderer.setSize(w,h);s.composer.setSize(w,h);Object.assign(camera,{left:old.left,right:old.right,top:old.top,bottom:old.bottom,zoom:old.zoom});camera.position.copy(old.position);s.controls.target.copy(old.target);camera.lookAt(old.target);camera.updateProjectionMatrix();architectRequest();}
}
window.ArchitectView={open:architectOpen,close:()=>$('#architectDialog').close(),exportBlob:architectExport,inspect:()=>({floorMaterials:architectStudio?.root.children.filter(o=>o.userData.roomId).map(o=>({id:o.userData.roomId,material:o.userData.floorMaterial,texture:o.material.map?.uuid,image:{type:o.material.map?.image?.tagName,width:o.material.map?.image?.width,height:o.material.map?.image?.height,ready:!!o.material.map?.image?.complete},normal:!!o.material.normalMap,roughness:!!o.material.roughnessMap,period:o.material.userData.surfacePeriod,layout:o.material.userData.surfaceLayout})),windows:architectStudio?.root.children.filter(o=>o.userData.openingId).map(g=>g.children.find(o=>o.userData.windowSpec)?.userData.windowSpec).filter(Boolean),open:architectOpened,orthographic:architectStudio?.camera.isOrthographicCamera,options:architectStudio?{...architectStudio.options}:null,stats:architectStudio?.stats,camera:architectStudio?.camera.position.toArray(),zoom:architectStudio?.camera.zoom,meshes:architectStudio?.root.children.length,sourceTitle:architectSnapshot?.title,furniture:architectStudio?.root.children.filter(g=>g.userData.fid).map(g=>({id:g.userData.fid,size:new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3()).toArray()})),bounds:architectStudio?.bounds?.getSize(new THREE.Vector3()).toArray()})};
Object.assign(window.ArchitectView,{refreshMaterials:async()=>{if(!architectOpened)return;architectSnapshot=C.clone(state);await architectBuild(false);}});

/* Appearance variants of the existing editable scene and raycaster. */
let styleComposer=null,styleAO=null,styleGroundOriginal=null,styleGroundSoft=null,styleFill=null,appliedSceneStyle='',styleShadowType=null,styleRenderError='';
let suComposer=null,suOutline=null;
const styleOriginalMaterials=new WeakMap(),styleMaterials=new Map();
function resizeSceneStyle(){for(const composer of [styleComposer,suComposer])if(composer)composer.setSize(Math.max(1,SW()),Math.max(1,SH()));}
function initSUComposer(){
 if(suComposer)return;
 const target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,samples:renderer.capabilities.isWebGL2?4:0});
 suComposer=new EffectComposer(renderer,target);suComposer.setPixelRatio(renderer.getPixelRatio());
 suOutline=new SUOutlinePass(scene,camera);suComposer.addPass(new RenderPass(scene,camera));suComposer.addPass(suOutline);suComposer.addPass(new OutputPass());resizeSceneStyle();
}
function initSceneStyleComposer(){
 if(styleComposer)return;
 const composer=new EffectComposer(renderer),pass=new RenderPass(scene,camera),ao=new SSAOPass(scene,camera,SW(),SH(),24),output=new OutputPass();
 ao.kernelRadius=.42;ao.minDistance=.0003;ao.maxDistance=.012;
 composer.setPixelRatio(Math.min(renderer.getPixelRatio(),1.4));composer.addPass(pass);composer.addPass(ao);composer.addPass(output);styleComposer=composer;styleAO=ao;resizeSceneStyle();
}
function applySceneStyleLight(){
 if(!ground||!renderer)return;const style=PlanCore.sceneStyle(state),soft=style==='soft',su=style==='su';
 if(!styleGroundOriginal)styleGroundOriginal=ground.material;
 if(!styleGroundSoft)styleGroundSoft=new THREE.ShadowMaterial({color:'#000000',opacity:.19});
 if(!styleFill){styleFill=new THREE.DirectionalLight(0xffffff,0);scene.add(styleFill);}
 ground.material=soft||su?styleGroundSoft:styleGroundOriginal;
 const shadowType=soft?THREE.VSMShadowMap:THREE.PCFSoftShadowMap;
 if(styleShadowType!==shadowType){sun.shadow.map?.dispose();sun.shadow.map=null;sun.shadow.mapPass?.dispose();sun.shadow.mapPass=null;sun.shadow.mapSize.setScalar(soft?2048:COARSE?2048:4096);renderer.shadowMap.type=shadowType;renderer.shadowMap.needsUpdate=true;styleShadowType=shadowType;}
 if(soft){
  hemi.color.set('#ffffff');hemi.groundColor.set('#b2ada4');hemi.intensity=opt.night?.18:1.65;
  if(!opt.night){sun.color.set('#fffaf0');sun.intensity=1.8+Math.max(0,Math.sin((opt.hour-6)/12*Math.PI))*.4;scene.background=new THREE.Color('#e6e6e3');renderer.toneMappingExposure=1.02;}
  const bounds=PlanCore.bounds(state,false),size=Math.max(bounds.w,bounds.h)/1000;styleFill.position.set(size*.8,size*.9,size*.6);styleFill.intensity=opt.night?.05:.55;
  sun.shadow.radius=8;sun.shadow.blurSamples=10;sun.shadow.bias=-.00015;sun.shadow.normalBias=.015;styleGroundSoft.color.set('#000000');
 }else if(su){
  hemi.color.set('#ffffff');hemi.groundColor.set('#d2cdc2');hemi.intensity=opt.night?.2:2.15;
  styleFill.intensity=opt.night?.05:.2;styleFill.position.set(-6,8,4);
  if(!opt.night){sun.color.set('#fffaf3');sun.intensity=1.55;scene.background=new THREE.Color('#f2efe8');renderer.toneMappingExposure=.98;}
  sun.shadow.radius=1.2;sun.shadow.bias=-.0002;sun.shadow.normalBias=.012;
 }else{
  hemi.color.set('#fff8ee');hemi.groundColor.set('#b9a88f');styleFill.intensity=0;sun.shadow.radius=1;sun.shadow.bias=-.0004;sun.shadow.normalBias=.02;
  ground.material.color.set(opt.night?0x2a2e38:0xf2eee7);
 }
 for(const row of styleMaterials.values())if(row.source.envMap)row.material.envMapIntensity=row.source.envMapIntensity*(su?.2:1);
}
function applyMainSceneStyle(){
 if(!inited)return;const style=PlanCore.sceneStyle(state),soft=style==='soft',su=style==='su',used=new Set();
 if(style!==appliedSceneStyle){appliedSceneStyle=style;applyLight();}
 for(const [root,role] of [[archUp,'architecture'],[archFloor,'floor'],[furnG,'furniture']])root.traverse(node=>{
  if(!node.isMesh)return;
  if(!styleOriginalMaterials.has(node))styleOriginalMaterials.set(node,node.material);
  const original=styleOriginalMaterials.get(node);
  const convert=source=>{
   if(!soft&&!su)return source;const key=style+':'+role+':'+source.uuid;used.add(key);let row=styleMaterials.get(key);
   if(!row){const m=source.clone();if(source===capMat)m.color.set(su?'#faf8f2':'#eeece5');else if(soft&&role!=='floor'&&!source.userData.wallFinishOwned&&m.color){const hsl={};m.color.getHSL(hsl);m.color.setHSL(hsl.h,hsl.s*.45,hsl.l).lerp(new THREE.Color('#e7e4dc'),.14);}
    if('roughness'in m)m.roughness=Math.max(role==='floor'?.7:.62,m.roughness);if('metalness'in m)m.metalness=Math.min(.55,m.metalness);if(source===glassMat){m.opacity=.19;m.roughness=.15;}
    if(su){if('roughness'in m)m.roughness=Math.max(.85,m.roughness);if('metalness'in m)m.metalness=Math.min(.15,m.metalness);if('envMapIntensity'in m)m.envMapIntensity=(source.envMapIntensity??1)*.2;}
    row={source,material:m};styleMaterials.set(key,row);
   }return row.material;
  };
  node.material=Array.isArray(original)?original.map(convert):convert(original);
 });
 for(const [key,row] of styleMaterials)if(!used.has(key)){row.material.dispose();styleMaterials.delete(key);}
 window.syncSceneStyleControls?.();
}
function sceneStyleLamps(){
 const style=PlanCore.sceneStyle(state);
 if(lampG)for(const node of lampG.children)if(node.isMesh)node.visible=style==='standard'||opt.mode==='walk'||opt.night;
 // Legacy box-edge helpers must not leak into SU's "no outline" mode.
 archUp?.traverse(node=>{if(node.isLine&&node.userData.walkOnly)node.visible=style!=='su'&&opt.mode==='walk';});
}
let editorBackdropKey='';
const editorBackdropPixel=new Uint8Array(4);
function syncSceneEditorBackground(){
 if(!active||!scene||!renderer)return;
 const key=[PlanCore.sceneStyle(state),opt.night,opt.hour,renderer.toneMappingExposure].join(':');
 if(key===editorBackdropKey)return;
 // Read the rendered empty backdrop, including lighting and output color conversion.
 // Sampling the live view would pick a wall or furniture when the user zooms in.
 const hidden=[],shadows=renderer.shadowMap.enabled;
 try{
  for(const node of scene.children)if(node!==ground&&!node.isLight&&node.visible){hidden.push(node);node.visible=false;}
  renderer.shadowMap.enabled=false;
  if(PlanCore.sceneStyle(state)==='soft'&&!styleRenderError){
   initSceneStyleComposer();const ao=styleAO.enabled;
   try{styleAO.enabled=false;styleComposer.render();}finally{styleAO.enabled=ao;}
  }else if(PlanCore.sceneStyle(state)==='su'&&!styleRenderError){
   initSUComposer();const enabled=suOutline.enabled;
   try{suOutline.enabled=false;suComposer.render();}finally{suOutline.enabled=enabled;}
  }else renderer.render(scene,camera);
  const gl=renderer.getContext();gl.readPixels(1,Math.max(0,gl.drawingBufferHeight-2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,editorBackdropPixel);
  if(editorBackdropPixel[3]){
   document.documentElement.style.setProperty('--scene-editor-bg',`rgb(${editorBackdropPixel[0]},${editorBackdropPixel[1]},${editorBackdropPixel[2]})`);
   document.body.dataset.sceneNight=String(opt.night);editorBackdropKey=key;
  }
 }catch(e){editorBackdropKey=key;}
 finally{for(const node of hidden)node.visible=true;renderer.shadowMap.enabled=shadows;}
}
function renderStyledScene(){
 syncSceneEditorBackground();
 sceneStyleLamps();
 if(PlanCore.sceneStyle(state)==='soft'&&!styleRenderError){try{initSceneStyleComposer();styleAO.enabled=opt.mode==='orbit'&&!anim;styleComposer.render();return;}catch(e){styleRenderError=e.message;toast('柔光阴影未能启用：'+e.message);}}
 if(PlanCore.sceneStyle(state)==='su'&&!styleRenderError){try{initSUComposer();suOutline.enabled=PlanCore.suEdges(state);suComposer.render();return;}catch(e){styleRenderError=e.message;toast('SU 描边未能启用：'+e.message);}}
 renderer.render(scene,camera);
}
function setSceneStyle(style){
 if(!['standard','soft','su'].includes(style)||PlanCore.sceneStyle(state)===style)return;
 styleRenderError='';mutate(()=>{state.presentation={...state.presentation,sceneStyle:style};});
}
function setSUEdges(enabled){if(PlanCore.suEdges(state)===!!enabled)return;styleRenderError='';mutate(()=>{state.presentation={...state.presentation,suEdges:!!enabled};});}
Object.assign(window.View3D,{setSceneStyle,setSUEdges,inspectSceneStyle:()=>({style:PlanCore.sceneStyle(state),suEdges:PlanCore.suEdges(state),outlineActive:PlanCore.sceneStyle(state)==='su'&&PlanCore.suEdges(state)&&!!suComposer&&!styleRenderError,mode:opt.mode,active,materialVariants:styleMaterials.size,postprocessing:!styleRenderError&&(PlanCore.sceneStyle(state)==='soft'&&!!styleComposer||PlanCore.sceneStyle(state)==='su'&&!!suComposer),ao:PlanCore.sceneStyle(state)==='soft'&&!!styleAO?.enabled,error:styleRenderError,camera:'perspective',capColors:archUp?[...new Set(archUp.children.flatMap(g=>g.children).filter(o=>o.userData.wallId).map(o=>o.material[2]?.color.getHexString()))]:[],renderedFloors:archFloor?.children.filter(o=>o.userData.room).map(o=>({id:o.userData.room,material:o.material.userData.floorMaterial,texture:o.material.map?.uuid})),ground:ground?.material.type,night:opt.night,lamps:lampG?.children.filter(o=>o.isMesh&&o.visible).length})});

/* Actual parametric meshes shared by catalogue previews, plans and both 3D views. */
const decorTextures=new Map(),decorMaterials=new Map();
function decorMaterial(id,color,art=false){const key=[id,color,art].join('|');if(!decorMaterials.has(key)){const m=new THREE.MeshStandardMaterial({color:'#ffffff',map:decorTexture(id,color,art),roughness:art?.9:1});m.userData.decorPattern=id;decorMaterials.set(key,m);}return decorMaterials.get(key);}
function decorTexture(id,color,art=false){const key=[id,color,art].join('|');if(decorTextures.has(key))return decorTextures.get(key);const cv=document.createElement('canvas');cv.width=cv.height=512;const ctx=cv.getContext('2d');
 if(!art)DecorCatalogue.draw(ctx,id,color);else{ctx.fillStyle='#eee8dc';ctx.fillRect(0,0,512,512);if(id==='art_landscape'){ctx.fillStyle='#c3b495';ctx.beginPath();ctx.arc(370,140,65,0,7);ctx.fill();for(const [y,c]of [[290,'#a5af91'],[355,color],[435,'#52645c']]){ctx.fillStyle=c;ctx.beginPath();ctx.moveTo(0,512);ctx.lineTo(0,y);ctx.quadraticCurveTo(150,y-180,310,y+20);ctx.quadraticCurveTo(420,y-90,512,y-30);ctx.lineTo(512,512);ctx.fill();}}else if(id==='art_botanical'){ctx.strokeStyle='#596b51';ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(245,470);ctx.bezierCurveTo(200,300,310,170,275,60);ctx.stroke();for(let i=0;i<6;i++){ctx.fillStyle=i%2?color:'#9aa98b';ctx.beginPath();ctx.ellipse(255+(i%2?48:-45),105+i*53,52,20,i%2?-.6:.6,0,7);ctx.fill();}}else{ctx.fillStyle=color;ctx.beginPath();ctx.arc(210,210,150,Math.PI,Math.PI*2);ctx.lineTo(360,470);ctx.lineTo(60,470);ctx.fill();ctx.fillStyle='#cbb793';ctx.fillRect(275,80,140,270);ctx.fillStyle='#4f605a';ctx.beginPath();ctx.arc(320,355,88,0,7);ctx.fill();}}
 const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;decorTextures.set(key,t);return t;
}
function decorShape(kind,w,d){const s=new THREE.Shape();if(kind==='round'||kind==='oval'){s.absellipse(0,0,w/2,d/2,0,Math.PI*2,false);return s;}if(kind==='kidney'){s.moveTo(-w*.5,0);s.bezierCurveTo(-w*.55,d*.6,w*.45,d*.7,w*.5,0);s.bezierCurveTo(w*.52,-d*.6,w*.1,-d*.6,-w*.05,-d*.23);s.bezierCurveTo(-w*.25,-d*.55,-w*.5,-d*.45,-w*.5,0);return s;}return rrect(w,d,Math.min(w,d)*.055);}
function decorSlab(shape,h,material,y=0){const geo=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false,curveSegments:40});geo.rotateX(-Math.PI/2);const o=mesh(geo,material);o.position.y=y;return o;}
function buildDecorFurniture(g,f,w,d,c){const type=f.type,isRug=DecorCatalogue.isRug(type);if(!isRug&&!/^(coffee_|lamp_|pendant_|art_|curtain_)/.test(type))return false;
 if(isRug){const round=['rug_round','rug_oval'].includes(type),geo=new THREE.ExtrudeGeometry(decorShape(round?'oval':'square',w,d),{depth:.018,bevelEnabled:false,curveSegments:64});geo.rotateX(-Math.PI/2);const p=geo.attributes.position,uv=geo.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/w+.5,.5-p.getZ(i)/d);uv.needsUpdate=true;const rug=mesh(geo,decorMaterial(f.rugPattern||'woven',c));rug.position.y=.007;g.add(rug);return true;}
 if(type.startsWith('coffee_')){const kind=type==='coffee_round'||type==='coffee_glass'?'round':type==='coffee_oval'?'oval':type==='coffee_kidney'?'kidney':'square',top=type==='coffee_glass'?new THREE.MeshPhysicalMaterial({color:c,transparent:true,opacity:.42,roughness:.1,metalness:0,transmission:.35,thickness:.025}):woodM(c);
  if(type==='coffee_nesting'){for(const [x,z,r,y]of [[-w*.18,-d*.12,Math.min(w*.38,d*.5),.40],[w*.25,d*.19,Math.min(w*.25,d*.36),.29]]){g.add(cyl(r,r,.05,woodM(c),x,y,z,64));for(let i=0;i<3;i++){const a=i*Math.PI*2/3;g.add(rod([x+Math.cos(a)*r*.65,0,z+Math.sin(a)*r*.65],[x+Math.cos(a)*r*.6,y,z+Math.sin(a)*r*.6],.02,woodM('#775942')));}}}
  else{g.add(decorSlab(decorShape(kind,w,d),.045,top,.355));if(kind==='round')g.add(cyl(w*.13,w*.20,.35,type==='coffee_glass'?blackMetal():woodM('#8d7156'),0,0,0,48));else legs(g,w*.85,d*.85,.355,woodM('#80664e'),Math.min(w,d)*.13,.026);}
 }else if(type.startsWith('lamp_')||type.startsWith('pendant_')){const stem=blackMetal(),shade=fabric(c),light=glowMat('#fff4d9','#ffe0a0',.65);
  if(type==='lamp_mushroom'){g.add(cyl(w*.16,w*.24,.25,shade,0,0,0,48));const hood=blob(w/2,.14,d/2,shade,0,.32,0,40);g.add(hood,cyl(w*.36,w*.36,.008,light,0,.275,0,48));}
  else if(type==='lamp_desk'){g.add(cyl(w*.22,w*.22,.035,stem,0,0,d*.15,40),rod([0,.035,d*.15],[-w*.15,.32,0],.014,stem),rod([-w*.15,.32,0],[w*.25,.45,-d*.2],.012,stem));g.add(cyl(w*.15,w*.28,.12,shade,w*.25,.38,-d*.2,40),cyl(w*.24,w*.24,.01,light,w*.25,.375,-d*.2,40));}
  else if(type==='pendant_ring'){const ring=new THREE.Mesh(new THREE.TorusGeometry(w*.46,.024,12,80),hwMat());ring.rotation.x=Math.PI/2;ring.position.y=.05;g.add(ring);for(const x of [-w*.32,w*.32])g.add(rod([x,.06,0],[0,.28,0],.003,stem));const bulb=new THREE.Mesh(new THREE.TorusGeometry(w*.46,.012,8,80),light);bulb.rotation.x=Math.PI/2;bulb.position.y=.03;g.add(bulb);}
  else if(type==='pendant_globe'){g.add(blob(w*.5,w*.5,d*.5,light,0,w*.5,0,40),rod([0,w,0],[0,.6,0],.005,stem));}
  else if(type==='lamp_tripod'){for(let i=0;i<3;i++){const a=i*2*Math.PI/3;g.add(rod([Math.cos(a)*w*.42,0,Math.sin(a)*d*.42],[0,1.32,0],.017,woodM('#9d7b56'),.025));}g.add(cyl(w*.33,w*.5,.42,shade,0,1.22,0,48),cyl(w*.44,w*.44,.01,light,0,1.22,0,48));}
  else{g.add(cyl(d*.40,d*.40,.06,stem,-w*.38,0,0,48));g.add(tube([[-w*.38,.05,0],[-w*.4,1.1,0],[-w*.15,1.65,0],[w*.28,1.55,0]],.018,stem));g.add(cyl(d*.15,d*.40,.25,shade,w*.28,1.3,0,48),cyl(d*.35,d*.35,.01,light,w*.28,1.3,0,48));}
 }else if(type.startsWith('art_')){const count=type==='art_triptych'?3:1,pw=count===1?w:w*.30,h=(f.h||800)/1000;for(let i=0;i<count;i++){const x=(i-(count-1)/2)*(w/count),frame=woodM('#79624d');g.add(box(pw,h,d,frame,x,0,0));g.add(box(pw-.045,h-.045,.004,decorMaterial(type,c,true),x,.0225,d/2+.002));}}
 else if(type.startsWith('curtain_')){const h=(f.h||2400)/1000;g.add(rod([-w/2,h+.025,0],[w/2,h+.025,0],.014,hwMat()));
  if(type==='curtain_blind'){for(let i=0;i<26;i++){const slat=box(w,h/32,d*.65,woodM(c),0,i*h/26,0);slat.rotation.x=-.28;g.add(slat);}for(const x of [-w*.3,w*.3])g.add(box(.012,h,.01,'#e6d6be',x,0,d*.3));}
  else{const sheer=type==='curtain_sheer',panelW=sheer?w*.5:w*.27,panels=sheer?[[0,w]]:[[-w/2+panelW/2,panelW],[w/2-panelW/2,panelW]],fabricMat=mat(c,{roughness:1,side:THREE.DoubleSide,transparent:sheer,opacity:sheer?.62:1});for(const [center,width]of panels){const shape=new THREE.Shape(),n=50;shape.moveTo(center-width/2,-d*.2);for(let i=0;i<=n;i++)shape.lineTo(center-width/2+width*i/n,Math.sin(i/n*Math.PI*14)*d*.40);for(let i=n;i>=0;i--)shape.lineTo(center-width/2+width*i/n,Math.sin(i/n*Math.PI*14)*d*.40+.012);shape.closePath();g.add(decorSlab(shape,h,fabricMat));} }
 }
 // The catalogue footprint is the actual outer width and depth, including curved forms.
 const bounds=new THREE.Box3().setFromObject(g),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());for(const child of g.children){child.position.x-=center.x;child.position.z-=center.z;}if(size.x>0)g.scale.x=w/size.x;if(size.z>0)g.scale.z=d/size.z;return true;
}
Object.assign(window.View3D,{inspectDecor:()=>furnG?.children.map(g=>{const patterns=new Set();let meshes=0;g.traverse(o=>{if(o.isMesh){meshes++;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.userData.decorPattern)patterns.add(m.userData.decorPattern);}});return {id:g.userData.fid,meshes,patterns:[...patterns],position:g.position.toArray(),size:new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3()).toArray()};})});

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

function wallRegionMaterial(r){if(r.material.includes('glass')){const m=new THREE.MeshPhysicalMaterial({color:r.color,roughness:r.material==='frosted_glass'?.65:.12,transparent:true,opacity:r.material==='clear_glass'?.28:.57,metalness:0,side:THREE.DoubleSide,depthWrite:false});m.userData.wallRegionOwned=true;return m;}const m=new THREE.MeshStandardMaterial({color:r.color,roughness:.8,side:THREE.DoubleSide});if(r.material==='wood')m.map=floorMat('wood').map;if(r.material==='stone')m.map=floorMat('marble').map;m.userData.wallRegionOwned=true;return m;}
function wallRegionPanels(plan,cut,map){const groups=[];
 for(const r of plan.structure.wallRegions||[]){if(r.mode==='cut')continue;const w=plan.structure.walls.find(w=>w.id===r.wallId);if(!w||plan.demolished.includes('w'+plan.structure.walls.indexOf(w)))continue;const f=PlanCore.frame(w),maxH=Math.min(cut,w.height);let polys=[WallRegionsCore.intersect(WallRegionsCore.profile(r),WallRegionsCore.rect(0,0,f.l,maxH))];
  if(r.mode==='finish')for(const o of plan.structure.openings.filter(o=>o.wallId===w.id))polys=polys.flatMap(p=>WallSurfaceCore.difference(p,WallRegionsCore.rect(o.offset,o.sill,o.width,o.height)));
  const g=new THREE.Group(),a=map(w.a);g.position.set(a.x,0,a.z);g.rotation.y=-Math.atan2(f.uy,f.ux);g.userData.wallRegion=r.id;const material=wallRegionMaterial(r),z=r.mode==='finish'?r.side*(w.thickness/2000+.004):0,depth=r.mode==='finish'?.006:Math.min(.04,w.thickness/1500);
  for(const poly of polys){if(poly.length<3)continue;const shape=new THREE.Shape();poly.forEach(([x,y],i)=>i?shape.lineTo(M(x),M(y)):shape.moveTo(M(x),M(y)));shape.closePath();const geo=new THREE.ExtrudeGeometry(shape,{depth,bevelEnabled:false,curveSegments:48});geo.translate(0,0,z-depth/2);const panel=mesh(geo,material);panel.userData.regionMaterial=r.material;g.add(panel);
   if(r.material==='fluted_glass'){const n=Math.min(180,Math.ceil(r.width/50));for(let i=0;i<n;i++){const x=r.offset+r.width*(i+.5)/n,range=WallRegionsCore.slice(poly,x,0);if(!range||range[1]-range[0]<5)continue;const rib=cyl(.008,.008,M(range[1]-range[0]),material,M(x),M(range[0]),z+.015,10);rib.userData.regionMaterial='fluted_glass';g.add(rib);}}
  }g.traverse(o=>{o.userData.wallId=w.id;o.userData.wallRegion=r.id;});if(g.children.length)groups.push(g);
 }return groups;
}
let wallRegionPreview=null;
function previewWallRegion(r){if(wallRegionPreview){scene?.remove(wallRegionPreview);wallRegionPreview.geometry.dispose();wallRegionPreview.material.dispose();wallRegionPreview=null;}if(!r||!inited)return;const w=state.structure.walls.find(w=>w.id===r.wallId);if(!w)return;const p=WallRegionsCore.profile(r).map(([t,h])=>{const q=PlanCore.point(w,t,r.side*(w.thickness/2+6));return new THREE.Vector3(wx(q[0]),M(h),wz(q[1]));});wallRegionPreview=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(p),new THREE.LineBasicMaterial({color:'#e99e58',depthTest:false}));wallRegionPreview.renderOrder=30;scene.add(wallRegionPreview);}
function projectWallRegion(x,y,id,side){if(!active||anim)return null;const w=state.structure.walls.find(w=>w.id===id);if(!w)return null;const rect=renderer.domElement.getBoundingClientRect();ptr.set((x-rect.x)/rect.width*2-1,-(y-rect.y)/rect.height*2+1);ray.setFromCamera(ptr,camera);const f=PlanCore.frame(w),q=PlanCore.point(w,0,side*w.thickness/2),normal=new THREE.Vector3(-f.uy,0,f.ux),plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,new THREE.Vector3(wx(q[0]),0,wz(q[1]))),hit=new THREE.Vector3();if(!ray.ray.intersectPlane(plane,hit))return null;return {wallId:id,side,t:PlanCore.project(w,[hit.x*1000+OX,hit.z*1000+OY]),height:hit.y*1000};}
function pickWallRegion(x,y){if(!active||anim||opt.mode!=='orbit')return null;const rect=renderer.domElement.getBoundingClientRect();ptr.set((x-rect.x)/rect.width*2-1,-(y-rect.y)/rect.height*2+1);ray.setFromCamera(ptr,camera);for(const h of ray.intersectObjects(archUp.children,true)){const id=h.object.userData.wallId;if(!id||!pickVisible(h.object))continue;const w=state.structure.walls.find(w=>w.id===id),normal=h.face.normal.clone().transformDirection(h.object.matrixWorld);if(Math.abs(normal.y)>.3)continue;const f=PlanCore.frame(w),side=normal.x*-f.uy+normal.z*f.ux>=0?1:-1;return {...projectWallRegion(x,y,id,side),regionId:h.object.userData.wallRegion};}return null;}
Object.assign(window.View3D,{pickWallRegion,projectWallRegion,previewWallRegion,inspectWallRegions:()=>{const out=[];archUp?.children.filter(g=>g.userData.wallRegion).forEach(g=>{const materials=new Set();let meshes=0;g.traverse(o=>{if(o.isMesh){meshes++;if(o.userData.regionMaterial)materials.add(o.userData.regionMaterial);}});out.push({id:g.userData.wallRegion,meshes,materials:[...materials]});});return out;}});
Object.assign(window.View3D,{wallRegionScreenPoint:(id,t,h,side=1)=>{if(!inited)return null;const w=state.structure.walls.find(w=>w.id===id),q=PlanCore.point(w,t,side*(w.thickness/2+5)),p=new THREE.Vector3(wx(q[0]),M(h),wz(q[1])).project(camera),r=renderer.domElement.getBoundingClientRect();return [r.x+(p.x+1)*r.width/2,r.y+(1-p.y)*r.height/2];}});

/* Exact visible wall faces, shared by decoration drag, hover and spread animation. */
let wallFinishHover=null,wallFinishAnimation=null;
function wallFaceMaterial(plan,w,side,t){const f=WallFinishCore.resolve(plan,w,side,t),m=f.material==='paint'?new THREE.MeshStandardMaterial({color:f.color,roughness:.92}):floorMat(f.material,f.layout).clone();if(f.material!=='paint')m.color.set(f.color);m.userData.wallFinishOwned=true;m.userData.wallFinish={...f};return m;}
function wallFinishContext(gallery=false){if(gallery)return architectOpened&&architectStudio?{root:architectStudio.root,renderer:architectStudio.renderer,camera:architectStudio.camera,gallery:true}:null;return active&&inited?{root:archUp,renderer,camera,gallery:false}:null;}
function wallFinishFaces(hit){const ctx=wallFinishContext(hit?.gallery);if(!ctx||!hit)return [];const out=[],index=hit.side===1?4:5;ctx.root.traverse(o=>{if(o.isMesh&&o.userData.wallSurface&&o.userData.wallId===hit.wallId&&Array.isArray(o.material)&&o.geometry.groups.some(g=>g.materialIndex===index))out.push({object:o,material:o.material[index],key:o.userData.wallPieceKey,index});});return out;}
function pickWallFinish(x,y,gallery=false){const ctx=wallFinishContext(gallery);if(!ctx||!gallery&&(anim||opt.mode!=='orbit'))return null;const r=ctx.renderer.domElement.getBoundingClientRect();if(x<r.left||x>r.right||y<r.top||y>r.bottom)return null;const rc=new THREE.Raycaster();rc.setFromCamera(new THREE.Vector2((x-r.x)/r.width*2-1,-(y-r.y)/r.height*2+1),ctx.camera);const targets=gallery?[ctx.root]:[archUp,furnG];for(const h of rc.intersectObjects(targets,true)){if(!pickVisible(h.object))continue;const m=Array.isArray(h.object.material)?h.object.material[h.face.materialIndex]:h.object.material;if(!m||m.visible===false||m.transparent&&m.opacity<.15)continue;if(!h.object.userData.wallSurface||![4,5].includes(h.face.materialIndex))return null;const w=state.structure.walls.find(w=>w.id===h.object.userData.wallId);if(!w)return null;return {wallId:w.id,side:h.face.materialIndex===4?1:-1,gallery,point:h.point.toArray()};}return null;}
function highlightWallFinish(hit){if(wallFinishHover?.hit.wallId===hit?.wallId&&wallFinishHover?.hit.side===hit?.side&&wallFinishHover?.hit.gallery===hit?.gallery)return;clearWallFinishHighlight();if(!hit)return;const faces=wallFinishFaces(hit),saved=new Map();for(const {material:m}of faces)if(!saved.has(m)){saved.set(m,{emissive:m.emissive.clone(),intensity:m.emissiveIntensity});m.emissive.set('#53dce6');m.emissiveIntensity=.42;}wallFinishHover={hit:{...hit},saved,faces:faces.length};if(hit.gallery)architectRequest();}
function clearWallFinishHighlight(){if(!wallFinishHover)return;for(const [m,v]of wallFinishHover.saved){m.emissive.copy(v.emissive);m.emissiveIntensity=v.intensity;}if(wallFinishHover.hit.gallery)architectRequest();wallFinishHover=null;}
function captureWallFinish(hit){clearWallFinishHighlight();return wallFinishFaces(hit).map(({key,material:m})=>({key,color:m.color.clone(),map:m.map,matrix:m.map?.matrix.clone()}));}
function cancelWallFinishAnimation(){if(!wallFinishAnimation)return;cancelAnimationFrame(wallFinishAnimation.frame);for(const row of wallFinishAnimation.rows){row.m.onBeforeCompile=row.hook;row.m.customProgramCacheKey=row.cache;row.m.needsUpdate=true;}wallFinishAnimation=null;}
function animateWallFinish(hit,before){cancelWallFinishAnimation();const ctx=wallFinishContext(hit.gallery);if(!ctx)return;const origin=new THREE.Vector3(...hit.point),rows=[],box=new THREE.Box3();for(const {object,material:m,key}of wallFinishFaces(hit)){box.expandByObject(object);const old=before.find(r=>r.key===key)||before[0];if(!old)continue;const uniforms={wfOrigin:{value:origin},wfRadius:{value:-.2},wfOldColor:{value:old.color},wfOldMap:{value:old.map||floorMat('wood').map},wfOldUV:{value:old.matrix||new THREE.Matrix3()},wfHasOldMap:{value:old.map?1:0}};const row={m,uniforms,hook:m.onBeforeCompile,cache:m.customProgramCacheKey,compiled:false};m.onBeforeCompile=shader=>{row.hook.call(m,shader);Object.assign(shader.uniforms,uniforms);shader.vertexShader='varying vec2 wfUV; varying vec3 wfWorld;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nwfUV=uv; wfWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');shader.fragmentShader='varying vec2 wfUV; varying vec3 wfWorld; uniform vec3 wfOrigin; uniform float wfRadius; uniform vec3 wfOldColor; uniform sampler2D wfOldMap; uniform mat3 wfOldUV; uniform float wfHasOldMap;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
float wfD=distance(wfWorld,wfOrigin);float wfCoverage=1.0-smoothstep(wfRadius-.12,wfRadius+.12,wfD);vec3 wfPrevious=wfOldColor;if(wfHasOldMap>.5)wfPrevious*=texture2D(wfOldMap,(wfOldUV*vec3(wfUV,1.0)).xy).rgb;diffuseColor.rgb=mix(wfPrevious,diffuseColor.rgb,wfCoverage);`);shader.fragmentShader=shader.fragmentShader.replace('#include <emissivemap_fragment>','#include <emissivemap_fragment>\ntotalEmissiveRadiance+=vec3(.04,.18,.2)*(1.0-smoothstep(.02,.14,abs(wfD-wfRadius)));');row.compiled=true;};m.customProgramCacheKey=()=> 'wall-spread-v1';m.needsUpdate=true;rows.push(row);}
 if(!rows.length)return;let radius=0;for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])radius=Math.max(radius,origin.distanceTo(new THREE.Vector3(x,y,z)));const a=wallFinishAnimation={hit:{...hit},rows,progress:0,frame:0,start:null,duration:matchMedia('(prefers-reduced-motion: reduce)').matches?1:900};const tick=now=>{if(wallFinishAnimation!==a)return;if(!wallFinishContext(hit.gallery)){cancelWallFinishAnimation();return;}if(a.start===null&&rows.every(r=>r.compiled))a.start=now;a.progress=a.start===null?0:Math.max(0,Math.min(1,(now-a.start)/a.duration));for(const row of rows)row.uniforms.wfRadius.value=-.2+(radius+.5)*(1-Math.pow(1-a.progress,2));if(hit.gallery)architectRequest();if(a.progress<1)a.frame=requestAnimationFrame(tick);else{cancelWallFinishAnimation();if(hit.gallery)architectRequest();}};a.frame=requestAnimationFrame(tick);
}
Object.assign(window.View3D,{pickWallFinish,highlightWallFinish,clearWallFinishHighlight,captureWallFinish,animateWallFinish,cancelWallFinishAnimation,inspectWallFinish:()=>({hover:wallFinishHover?{...wallFinishHover.hit,faces:wallFinishHover.faces}:null,animation:wallFinishAnimation?{...wallFinishAnimation.hit,progress:wallFinishAnimation.progress,faces:wallFinishAnimation.rows.length,compiled:wallFinishAnimation.rows.filter(r=>r.compiled).length}:null,faces:archUp?(()=>{const a=[];archUp.traverse(o=>{if(o.userData.wallSurface&&Array.isArray(o.material))for(const side of [1,-1])a.push({wallId:o.userData.wallId,side,color:o.material[side===1?4:5].color.getHexString(),material:o.material[side===1?4:5].userData.wallFinish?.material,texture:!!o.material[side===1?4:5].map,pbr:!!o.material[side===1?4:5].normalMap&&!!o.material[side===1?4:5].roughnessMap,layout:o.material[side===1?4:5].userData.surfaceLayout,period:o.material[side===1?4:5].userData.surfacePeriod});});return a;})():[]})});

Object.assign(window.View3D,{wallFinishScreenPoint:(id,t,h,side=1,gallery=false)=>{const ctx=wallFinishContext(gallery),w=state.structure.walls.find(w=>w.id===id);if(!ctx||!w)return null;const b=PlanCore.bounds(state,false),q=PlanCore.point(w,t,side*(w.thickness/2+5)),p=new THREE.Vector3((q[0]-b.x-b.w/2)/1000,h/1000,(q[1]-b.y-b.h/2)/1000).project(ctx.camera),r=ctx.renderer.domElement.getBoundingClientRect();return [r.x+(p.x+1)*r.width/2,r.y+(1-p.y)*r.height/2];}});

Object.assign(window.View3D,{inspectWallSurfaces:()=>{let meshes=0,triangles=0,walkOnlyLines=0;archUp?.traverse(o=>{if(o.userData.wallSurface){meshes++;triangles+=o.geometry.attributes.position.count/3;}if(o.isLineSegments&&o.userData.walkOnly)walkOnlyLines++;});return {prisms:currentWallSurfaceData?.prisms.length,faces:currentWallSurfaceData?.faces,meshes,triangles,walkOnlyLines};}});
function toggleWindow(model){
 if(model.spec.type==='fixed'){toast('固定窗不可开启，可在窗户属性中更换类型');return;}
 model.open=!model.open;const o=state.structure.openings.find(o=>o.id===model.id);if(o)o.open=model.open;save();renderStructure();if(ui.sel?.kind==='opening'&&ui.sel.id===model.id)renderPanel();
}
function updateWindows(dt){for(const m of windowModels){const target=m.open?1:0;m.cur+=(target-m.cur)*Math.min(1,dt*8);if(Math.abs(m.cur-target)<.0001)m.cur=target;m.pose(m.cur);}}
Object.assign(window.View3D,{
 focusWindow:id=>{const m=windowModels.find(m=>m.id===id);if(!m||!active||opt.mode!=='orbit')return false;const target=m.group.localToWorld(new THREE.Vector3(0,m.spec.height/2,0)),position=m.group.localToWorld(new THREE.Vector3(m.spec.width*.13,m.spec.height*.58,m.spec.insideSide*Math.max(2,m.spec.width*1.4)));flyTo(pose(target,position),500);return true;},
 isWindowActive:id=>active&&windowModels.some(m=>m.id===id),
 toggleWindow:id=>{const m=windowModels.find(m=>m.id===id);if(m)toggleWindow(m);},
 inspectWindows:()=>windowModels.map(m=>({id:m.id,type:m.spec.type,panes:m.spec.panes,color:m.spec.color,insideSide:m.spec.insideSide,open:m.open,progress:m.cur,parts:m.counts,leaves:m.leaves.map(l=>({position:l.leaf.position.toArray(),rotation:l.leaf.rotation.toArray().slice(0,3)}))})),
 windowScreenPoint:id=>{const m=windowModels.find(m=>m.id===id);if(!m)return null;const mesh=m.group.getObjectsByProperty('isMesh',true).find(o=>o.userData.windowPart==='handle')||m.group.children[0],p=mesh.getWorldPosition(new THREE.Vector3()).project(camera),r=renderer.domElement.getBoundingClientRect();return [r.x+(p.x+1)*r.width/2,r.y+(1-p.y)*r.height/2];}
});

let walkEntrance=null;
function positionWalkAtEntrance(){
 walkEntrance=EntranceCore.start(state,(x,y)=>blocked(wx(x),wz(y)));
 const p=walkEntrance.position||findSpawn(),t=walkEntrance.target||(()=>{const r=state.structure.rooms.find(r=>PlanCore.inside(p,r.poly)),center=r?PlanCore.center(r.poly):[p[0]+1000,p[1]];return Math.hypot(center[0]-p[0],center[1]-p[1])>100?center:[p[0]+1000,p[1]];})();
 camera.position.set(wx(p[0]),1.6,wz(p[1]));camera.lookAt(wx(t[0]),1.6,wz(t[1]));camera.updateMatrixWorld(true);syncWalkTexts();
}
Object.assign(window.View3D,{inspectEntrance:()=>({detection:EntranceCore.detect(state),start:walkEntrance,camera:camera?.position.toArray(),direction:camera?.getWorldDirection(new THREE.Vector3()).toArray()})});
const originalEntranceWalkTexts=syncWalkTexts;syncWalkTexts=function(){originalEntranceWalkTexts();if(opt.mode!=='walk'||!walkEntrance)return;$('#wo1').textContent=walkEntrance.position?(walkEntrance.door.explicit?'点击开始，从指定入户门看向室内':walkEntrance.ambiguous?'从外墙门候选看向室内 · 可在门属性中更正':'点击开始，从入户门看向室内'):walkEntrance.reason;};

Object.assign(window.View3D,{
 projectRenderCandidate:(item,roomId)=>{if(!active||anim||['tv','curtain_drape','art_abstract'].includes(item.type))return null;const r=state.structure.rooms.find(r=>r.id===roomId);if(!r)return null;const [x,y,w,h]=item.box,rc=new THREE.Raycaster();rc.setFromCamera(new THREE.Vector2((x+w/2)*2-1,1-Math.min(.985,y+h)*2),camera);const p=new THREE.Vector3();if(!rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-(r.elevation||0)/1000),p))return null;const q=[p.x*1000+OX,p.z*1000+OY];return PlanCore.inside(q,r.poly)?{cx:Math.round(q[0]),cy:Math.round(q[1]),rot:0,elevation:item.elevation||0}:null;},
 focusRenderDesign:view=>{if(!active||!view)return;setMode('orbit');opt.cut=fullHeight();syncCutBtns();sync();fly=null;camera.fov=Math.max(35,Math.min(75,view.fov||FOV));camera.updateProjectionMatrix();const p=view.position,t=view.target;setPose(pose(new THREE.Vector3(wx(t[0]),M(t[1]),wz(t[2])),new THREE.Vector3(wx(p[0]),M(p[1]),wz(p[2]))));orbit.update();}
});
const renderDesignExit=window.View3D.exit;window.View3D.exit=async(...args)=>{if(camera){camera.fov=FOV;camera.updateProjectionMatrix();}return renderDesignExit(...args);};
const renderDesignMode=setMode;setMode=function(mode){if(camera){camera.fov=FOV;camera.updateProjectionMatrix();}return renderDesignMode(mode);};window.View3D.setMode=setMode;
