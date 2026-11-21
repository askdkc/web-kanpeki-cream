/* エントリポイント: Babylon のセットアップ、ゲームと UI の接続、入力 */
import './style.css';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { createWorld } from './scene/world';
import { Dispensers } from './scene/dispensers';
import { Game, type Snapshot } from './game/game';
import { Ui } from './ui/ui';
import { loadSave, persistSave } from './game/save';
import { Sfx } from './game/sfx';
import { creamById, TOPPING_PRICE } from './game/creams';
import { CONFIG } from './game/config';

const canvasEl = document.getElementById('stage');
if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('canvas #stage が見つからない');
const canvas: HTMLCanvasElement = canvasEl;

const world = createWorld(canvas);
const save = loadSave();
const sfx = new Sfx();
sfx.muted = save.muted;

let game: Game | null = null;

const ui = new Ui(
  save,
  {
    startStage: (i) => game?.startStage(i),
    resume: () => game?.resume(),
    showSelect: () => {
      game?.goTitle();
      ui.select();
    },
    showShop: (tab) => {
      game?.goTitle();
      ui.shop(tab);
    },
    showTitle: () => {
      game?.goTitle();
      ui.title();
    },
    toggleSound: () => {
      save.muted = !save.muted;
      sfx.muted = save.muted;
      persistSave(save);
      const btn = document.getElementById('sound');
      if (btn) btn.textContent = save.muted ? '×' : '♪';
      if (game?.currentState() === 'pause' && game) ui.pause(game.snapshot());
      else if (game?.currentState() === 'title') ui.title();
      else ui.shop('cream');
    },
    retry: () => {
      const snap = game?.snapshot();
      game?.startStage(snap ? snap.stage - 1 : 0);
    },
    setCream: (id) => {
      const owned = save.ownedCreams.includes(id);
      if (owned) {
        save.cream = id;
        sfx.tone(880, 0.08, 'triangle', 0.06);
      } else {
        const def = creamById(id);
        if (save.coins < def.price) {
          sfx.tone(200, 0.12, 'sawtooth', 0.05);
          return false;
        }
        save.coins -= def.price;
        save.ownedCreams.push(id);
        save.cream = id;
        sfx.tone(660, 0.1, 'triangle', 0.08);
      }
      persistSave(save);
      return true;
    },
    setTopping: (id) => {
      const owned = save.ownedToppings.includes(id);
      if (owned) {
        save.topping = id;
        sfx.tone(880, 0.08, 'triangle', 0.06);
      } else {
        const price = TOPPING_PRICE[id] ?? 300;
        if (save.coins < price) {
          sfx.tone(200, 0.12, 'sawtooth', 0.05);
          return false;
        }
        save.coins -= price;
        save.ownedToppings.push(id);
        save.topping = id;
        sfx.tone(660, 0.1, 'triangle', 0.08);
      }
      persistSave(save);
      return true;
    }
  },
  () => save.muted
);

// 3D 座標 → 画面 px
ui.projector = (p: { x: number; y: number; z: number }) => {
  const cam = world.scene.activeCamera;
  if (!cam) return null;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const projected = Vector3.Project(
    new Vector3(p.x, p.y, p.z),
    Matrix.Identity(),
    world.scene.getTransformMatrix(),
    cam.viewport.toGlobal(width, height)
  );
  if (projected.z < 0 || projected.z > 1) return null;
  return { x: projected.x, y: projected.y };
};

game = new Game(
  world.scene,
  world.shadows,
  world.beltTexture,
  new Dispensers(world.scene, world.nozzle),
  world.changeBackdrop,
  sfx,
  save,
  ui
);

function resize(): void {
  const rect = canvas.getBoundingClientRect();
  world.setViewport(Math.max(1, Math.floor(rect.width)), Math.max(1, Math.floor(rect.height)));
  world.engine.resize();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => window.setTimeout(resize, 120));
resize();

// 入力: 押しているあいだ連続で絞る
const hold = { active: false, pointerId: -1 };

function press(e: PointerEvent): void {
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  if (hold.active) return;
  hold.active = true;
  hold.pointerId = e.pointerId;
  if (canvas.setPointerCapture) {
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // キャプチャできない環境では window のイベントで離す
    }
  }
  game?.press();
  e.preventDefault();
}

function release(e?: PointerEvent): void {
  if (!hold.active) return;
  if (e && e.pointerId !== hold.pointerId) return;
  hold.active = false;
  hold.pointerId = -1;
  game?.release();
}

canvas.addEventListener('pointerdown', press);
canvas.addEventListener('pointerup', release);
canvas.addEventListener('pointercancel', release);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('pointerup', release);
window.addEventListener('blur', () => release());

// ポーズボタンとサウンドボタン
document.getElementById('pause')?.addEventListener('click', () => {
  release();
  game?.pause();
  const snap = game?.snapshot();
  if (snap?.state === 'pause') ui.pause(snap);
});
const soundBtn = document.getElementById('sound');
if (soundBtn) soundBtn.textContent = save.muted ? '×' : '♪';
soundBtn?.addEventListener('click', () => {
  save.muted = !save.muted;
  sfx.muted = save.muted;
  persistSave(save);
  soundBtn.textContent = save.muted ? '×' : '♪';
  if (!save.muted) sfx.tone(880, 0.08, 'triangle', 0.06);
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    release();
    game?.pause();
    if (game?.currentState() === 'pause') ui.pause(game.snapshot());
  }
  sfx.syncMusic();
});

// 起動
export const ready = (async () => {
  await game?.boot();
  ui.title();
  if (save.unlocked > 1) {
    const params = new URLSearchParams(location.search);
    if (params.has('stage')) {
      const idx = Number.parseInt(params.get('stage') ?? '1', 10);
      game?.startStage(idx - 1);
    }
  }
})();

// ループ
let last = performance.now();
world.engine.runRenderLoop(() => {
  const now = performance.now();
  const elapsed = (now - last) / 1000;
  const dt = Math.min(0.05, elapsed);
  last = now;
  game?.update(dt, elapsed);
  game?.updateHud(dt);
  const state = game?.currentState();
  world.setFinishing(state === 'topping' || state === 'final' || state === 'result', dt);
  world.scene.render();
  publishDebug();
});

function publishDebug(): void {
  if (!game) return;
  const snap: Snapshot = game.snapshot();
  document.body.setAttribute('data-debug', JSON.stringify(snap));
}

// テストとデバッグ用のフック
declare global {
  interface Window {
    KANPEKI: {
      state: () => string;
      snapshot: () => Snapshot;
      startStage: (i: number) => void;
      press: () => void;
      release: () => void;
      config: typeof CONFIG;
      scene: unknown;
      camera: unknown;
      project: (x: number, y: number, z: number) => { x: number; y: number; w: number; h: number } | null;
    };
  }
}
window.KANPEKI = {
  state: () => game?.currentState() ?? 'loading',
  snapshot: () => game?.snapshot() ?? ({} as Snapshot),
  startStage: (i: number) => game?.startStage(i),
  press: () => game?.press(),
  release: () => game?.release(),
  config: CONFIG,
  scene: world.scene,
  camera: world.scene.activeCamera,
  project: (x: number, y: number, z: number) => {
    const cam = world.scene.activeCamera;
    const r = canvas.getBoundingClientRect();
    if (!cam) return null;
    const view = cam.getViewMatrix(true);
    const proj = cam.getProjectionMatrix(true);
    const transform = view.multiply(proj);
    const p = Vector3.Project(
      new Vector3(x, y, z),
      Matrix.Identity(),
      transform,
      cam.viewport.toGlobal(r.width, r.height)
    );
    return { x: Math.round(p.x), y: Math.round(p.y), w: Math.round(r.width), h: Math.round(r.height) };
  }
};
