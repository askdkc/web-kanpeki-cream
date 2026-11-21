/* Babylon のシーン構築: カメラ、ライト、ベルト（レーン）、背景、ノズル。
   レーンは X 軸方向に伸び、お菓子は -X から +X へ流れる。ノズルは原点の真上。 */
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { RawCubeTexture } from '@babylonjs/core/Materials/Textures/rawCubeTexture';
import { Constants } from '@babylonjs/core/Engines/constants';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CONFIG, COLORS } from '../game/config';

export interface World {
  engine: Engine;
  scene: Scene;
  shadows: ShadowGenerator;
  nozzle: Mesh;
  beltTop: Mesh;
  beltTexture: DynamicTexture;
  changeBackdrop(): void;
  setFinishing(on: boolean, dt: number): void;
  setViewport(width: number, height: number): void;
}

const backgrounds = [
  ['#50b9f2', '#82ddfb', '#4f9ddf'],
  ['#43db87', '#9cdd53', '#40b990'],
  ['#a190ef', '#e5b7f6', '#9a80d5'],
  ['#ffad91', '#ffdb9d', '#ee9798'],
  ['#ef92ba', '#ffc1d2', '#d77fb8'],
  ['#59d4c3', '#adf1e3', '#52b5c4']
];

function paintBackdrop(tex: DynamicTexture, palette: string[]): void {
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const { width, height } = tex.getSize();
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(0.5, palette[1]);
  gradient.addColorStop(1, palette[0]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  tex.update(false);
}

function beltTexture(scene: Scene): DynamicTexture {
  const w = 512;
  const h = 64;
  const tex = new DynamicTexture('beltTex', { width: w, height: h }, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#f3ecff');
  grad.addColorStop(0.5, '#e7dcfa');
  grad.addColorStop(1, '#dccff6');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // 走行方向の細い筋
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 8; i++) ctx.fillRect(0, 6 + i * 8, w, 1);
  tex.update(false);
  tex.wrapU = 1;
  tex.wrapV = 1;
  tex.uScale = 10;
  tex.vScale = 1;
  return tex;
}

/** 空と地面の明るさを持つ簡易スタジオ環境。PBR の映り込み用。 */
function studioEnvironment(scene: Scene): RawCubeTexture {
  const size = 16;
  const faces: ArrayBufferView[] = [];
  const stops: Array<[number, number, number]> = [
    [0.93, 0.97, 0.92], // 天井
    [1.0, 1.0, 0.99],   // 地平線
    [0.78, 0.75, 0.70]   // 地面
  ];
  for (let f = 0; f < 6; f++) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      // 側面 4 枚は上→下のグラデーション。上下の面は単色。
      const t = f === 2 ? 0 : f === 3 ? 1 : y / (size - 1);
      const from = t < 0.45 ? stops[0]! : stops[1]!;
      const to = t < 0.45 ? stops[1]! : stops[2]!;
      const k = t < 0.45 ? (t / 0.45) * 0.35 : 0.35 + ((t - 0.45) / 0.55) * 0.65;
      const r = from[0] + (to[0] - from[0]) * k;
      const g = from[1] + (to[1] - from[1]) * k;
      const b = from[2] + (to[2] - from[2]) * k;
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        data[i] = Math.round(r * 255);
        data[i + 1] = Math.round(g * 255);
        data[i + 2] = Math.round(b * 255);
        data[i + 3] = 255;
      }
    }
    faces.push(data);
  }
  const cube = new RawCubeTexture(
    scene,
    faces,
    size,
    Constants.TEXTUREFORMAT_RGBA,
    Constants.TEXTURETYPE_UNSIGNED_BYTE,
    true,
    false,
    Constants.TEXTURE_TRILINEAR_SAMPLINGMODE
  );
  cube.name = 'studioEnv';
  cube.gammaSpace = true;
  return cube;
}

export function createWorld(canvas: HTMLCanvasElement): World {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: false,
    stencil: false,
    antialias: true,
    alpha: false
  });
  engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene(engine);
  // three.js / Blender と同じ右手系に揃える（+X が画面右、流れは左から右）
  scene.useRightHandedSystem = true;
  scene.clearColor = Color4.FromHexString('#48d990ff');
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = Color3.FromHexString('#48d990');
  scene.fogDensity = 0.022;
  scene.ambientColor = new Color3(0.82, 0.88, 0.8);
  scene.environmentTexture = studioEnvironment(scene);
  scene.environmentIntensity = 0.32;
  const ip = scene.imageProcessingConfiguration;
  ip.toneMappingEnabled = false;
  ip.contrast = 1.08;

  const cam = new FreeCamera('fixed', new Vector3(-4.8, 5.5, 8.1), scene);
  cam.setTarget(new Vector3(0.42, 1.52, -1.2));
  cam.fov = 0.907;
  cam.minZ = 0.1;
  cam.maxZ = 200;
  scene.activeCamera = cam;

  const hemi = new HemisphericLight('hemi', new Vector3(0.1, 1, 0.2), scene);
  hemi.intensity = 0.72;
  hemi.diffuse = Color3.FromHexString('#fffdf4');
  hemi.groundColor = Color3.FromHexString('#e3c7a8');

  const key = new DirectionalLight('key', new Vector3(0.4, -1, -0.5), scene);
  key.position = new Vector3(-4, 12, 7);
  key.intensity = 1.35;
  key.diffuse = Color3.FromHexString('#fff6e6');

  const rim = new DirectionalLight('rim', new Vector3(-0.6, -0.4, 0.8), scene);
  rim.position = new Vector3(7, 4, -8);
  rim.intensity = 0.45;
  rim.diffuse = Color3.FromHexString('#ffe6f2');

  const shadows = new ShadowGenerator(1024, key);
  shadows.useBlurExponentialShadowMap = true;
  shadows.blurKernel = 24;
  shadows.darkness = 0.22;

  // 地面
  const ground = MeshBuilder.CreateGround('ground', { width: 180, height: 180 }, scene);
  const groundMat = new StandardMaterial('groundMat', scene);
  const backdrop = new DynamicTexture('backdrop', 128, scene, false);
  backdrop.uScale = 3;
  backdrop.vScale = 5;
  groundMat.diffuseTexture = backdrop;
  let theme = 0;
  function applyBackdrop(): void {
    const palette = backgrounds[theme];
    paintBackdrop(backdrop, palette);
    scene.fogColor = Color3.FromHexString(palette[0]);
    scene.clearColor = Color4.FromHexString(palette[0] + 'ff');
    groundMat.emissiveColor = Color3.FromHexString(palette[0]).scale(0.18);
    document.documentElement.style.setProperty('--surround', palette[2]);
  }
  function changeBackdrop(): void {
    theme = (theme + 1 + Math.floor(Math.random() * (backgrounds.length - 1))) % backgrounds.length;
    applyBackdrop();
  }
  theme = Math.floor(Math.random() * backgrounds.length);
  applyBackdrop();
  groundMat.specularColor = new Color3(0.02, 0.04, 0.02);
  groundMat.diffuseColor = new Color3(1, 1, 1);
  ground.position.y = -0.02;
  ground.material = groundMat;
  ground.receiveShadows = true;

  // ベルト（レーン）
  const half = CONFIG.laneHalf;
  const tex = beltTexture(scene);
  const topMat = new StandardMaterial('beltTopMat', scene);
  topMat.diffuseTexture = tex;
  topMat.specularColor = new Color3(0.1, 0.09, 0.12);
  topMat.specularPower = 48;
  const beltTop = MeshBuilder.CreateBox(
    'beltTop',
    { width: CONFIG.beltLength, height: 0.1, depth: half * 2 },
    scene
  );
  beltTop.position.y = CONFIG.beltY - 0.05;
  beltTop.material = topMat;
  beltTop.receiveShadows = true;

  const sideMat = new PBRMaterial('beltSide', scene);
  sideMat.albedoColor = Color3.FromHexString(COLORS.beltSide);
  sideMat.metallic = 0;
  sideMat.roughness = 0.55;

  const body = MeshBuilder.CreateBox(
    'beltBody',
    { width: CONFIG.beltLength, height: 0.86, depth: half * 2 + 0.34 },
    scene
  );
  body.position.y = CONFIG.beltY - 0.53;
  body.material = sideMat;
  body.receiveShadows = true;

  // 白い縁（レール）。お菓子はこの内側に収まる
  const railMat = new StandardMaterial('railMat', scene);
  railMat.diffuseColor = Color3.FromHexString(COLORS.rail);
  railMat.specularColor = new Color3(0.16, 0.16, 0.18);
  railMat.specularPower = 64;
  for (const z of [-(half + 0.09), half + 0.09]) {
    const rail = MeshBuilder.CreateBox(
      'rail',
      { width: CONFIG.beltLength, height: 0.16, depth: 0.2 },
      scene
    );
    rail.position.set(0, CONFIG.beltY + 0.05, z);
    rail.material = railMat;
    rail.receiveShadows = true;
  }

  // 走行ライン（中央の白い帯）
  const stripe = MeshBuilder.CreateBox('stripe', { width: CONFIG.beltLength, height: 0.012, depth: 0.1 }, scene);
  stripe.position.y = CONFIG.beltY + 0.003;
  const stripeMat = new StandardMaterial('stripeMat', scene);
  stripeMat.diffuseColor = new Color3(1, 1, 1);
  stripeMat.alpha = 0.75;
  stripeMat.specularColor = new Color3(0, 0, 0);
  stripe.material = stripeMat;

  // ノズル
  const nozzle = buildNozzle(scene);
  shadows.addShadowCaster(nozzle);

  let normalFov = cam.fov;
  let closeUp = 0;
  const beltTarget = new Vector3(0.42, 1.52, -1.2);
  const cakeTarget = new Vector3(CONFIG.stationX, 2.04, -0.22);
  const focus = new Vector3();
  function setFinishing(on: boolean, dt: number): void {
    if (!on && closeUp === 0) return;
    closeUp = on ? Math.min(1, closeUp + dt * 2) : 0;
    const mix = closeUp * closeUp * (3 - 2 * closeUp);
    Vector3.LerpToRef(beltTarget, cakeTarget, mix, focus);
    cam.setTarget(focus);
    cam.fov = normalFov * (1 - mix * 0.28);
    nozzle.setEnabled(!on);
  }

  function setViewport(width: number, height: number): void {
    engine.setSize(width, height, true);
    const aspect = width / Math.max(1, height);
    // 縦長（スマホ）では画角を広げ、横長では少し狭める
    normalFov = aspect < 0.62 ? 0.78 : 0.74;
    cam.fov = normalFov;
  }

  return {
    engine,
    scene,
    shadows,
    nozzle,
    beltTop,
    beltTexture: tex,
    changeBackdrop,
    setFinishing,
    setViewport
  };
}

function buildNozzle(scene: Scene): Mesh {
  const shell = new PBRMaterial('nozzleShell', scene);
  shell.albedoColor = Color3.FromHexString('#dae2ff');
  shell.metallic = 0.06;
  shell.roughness = 0.14;
  shell.clearCoat.isEnabled = true;
  shell.clearCoat.intensity = 0.85;
  shell.clearCoat.roughness = 0.08;

  const accent = new PBRMaterial('nozzleAccent', scene);
  accent.albedoColor = Color3.FromHexString('#999be6');
  accent.metallic = 0.1;
  accent.roughness = 0.22;

  const parts: Mesh[] = [];
  const body = MeshBuilder.CreateCylinder('nozzleBody', { height: 6.3, diameter: 0.86, tessellation: 28 }, scene);
  body.position.y = 4.05;
  body.material = shell;
  parts.push(body);

  const cap = MeshBuilder.CreateCylinder('nozzleCap', { height: 0.26, diameterTop: 0.84, diameterBottom: 1.0, tessellation: 28 }, scene);
  cap.position.y = 0.98;
  cap.material = accent;
  parts.push(cap);

  const collar = MeshBuilder.CreateCylinder('nozzleCollar', { height: 0.4, diameter: 1.36, tessellation: 28 }, scene);
  collar.position.y = 0.66;
  collar.material = shell;
  parts.push(collar);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const tooth = MeshBuilder.CreateBox('tooth', { width: 0.2, height: 0.34, depth: 0.2 }, scene);
    tooth.position.set(Math.cos(a) * 0.66, 0.66, Math.sin(a) * 0.66);
    tooth.rotation.y = -a;
    tooth.material = accent;
    parts.push(tooth);
  }

  const cone = MeshBuilder.CreateCylinder(
    'nozzleCone',
    { height: 0.78, diameterTop: 0.8, diameterBottom: CONFIG.streamRadius * 2.15, tessellation: 24 },
    scene
  );
  cone.position.y = 0.2;
  cone.material = shell;
  parts.push(cone);

  const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true);
  if (!merged) throw new Error('ノズルのメッシュ結合に失敗した');
  merged.name = 'nozzle';
  merged.position.set(CONFIG.stationX, CONFIG.nozzleTipY + 0.19 * 0.95, 0);
  merged.scaling.setAll(0.95);
  merged.isPickable = false;
  return merged;
}
