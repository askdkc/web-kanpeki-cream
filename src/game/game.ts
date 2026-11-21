/* ゲーム進行: ステージ、入力、採点、HUD、画面遷移 */
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import type { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import {
  STAGES,
  DURATION,
  candyScore,
  creamState,
  deposit,
  judgeCream,
  starsFor,
  type StageConfig
} from '../logic/judge';
import { CONFIG } from './config';
import { creamById, toppingById, type CreamDef, type ToppingDef } from './creams';
import type { Sfx } from './sfx';
import type { SaveData } from './save';
import {
  placeSweet,
  preloadSweets,
  spawnSweet,
  type SweetInstance
} from './sweetsRuntime';
import { CreamMesh, createCreamStream } from '../scene/creamMesh';
import { Dispensers } from '../scene/dispensers';
import { surfaceRow } from './icingSurface';
import { trayItems } from './menu';
import { makeTopping } from '../scene/toppings';

export type GameState = 'loading' | 'title' | 'select' | 'shop' | 'ready' | 'play' | 'topping' | 'pause' | 'final' | 'result';

export interface UiHooks {
  onScreen(html: string): void;
  hideScreen(): void;
  hud(on: boolean): void;
  ready(on: boolean, cfg?: StageConfig): void;
  celebrate(large: boolean): void;
  hint(text: string | null): void;
  popup(world: Vector3, main: string, sub: string, color: string): void;
  refresh(snapshot: Snapshot): void;
  result(res: RunResult): void;
  title(): void;
  select(): void;
  shop(tab: 'cream' | 'topping'): void;
  pause(snap: Snapshot): void;
}

export interface Snapshot {
  state: GameState;
  stage: number;
  stageName: string;
  score: number;
  timeLeft: number;
  combo: number;
  toppingTaps: number;
  piping: boolean;
  sweets: Array<{
    x: number;
    z: number;
    amount: number;
    cover: number;
    spill: number;
    halfX: number;
    halfZ: number;
    judged: string | null;
    reason: string | null;
    decor: number;
  }>;
  result?: RunResult;
}

export interface RunResult {
  index: number;
  cfg: StageConfig;
  score: number;
  quota: number;
  cleared: boolean;
  stars: number;
  counts: { perfect: number; great: number; good: number; miss: number };
  bestCombo: number;
  toppingTaps: number;
  coins: number;
  wasted: number;
}

interface RunningSweet extends SweetInstance {
  fruitRow: number | null;
  creamMesh: CreamMesh;
}

interface Run {
  index: number;
  cfg: StageConfig;
  t: number;
  timeLeft: number;
  score: number;
  combo: number;
  bestCombo: number;
  counts: { perfect: number; great: number; good: number; miss: number };
  spawned: number;
  keepsake: RunningSweet | null;
  strokeTarget: RunningSweet | null;
  gapTime: number;
  dirtyStroke: boolean;
  pendingDoses: number;
  falling: Array<{ mesh: Mesh; start: Vector3; landing: Vector3; elapsed: number; duration: number }>;
  spawnT: number;
  hold: boolean;
  holdT: number;
  shakeT: number;
  readyT: number;
  finalT: number;
  toppingEndsAt: number;
  toppingTaps: number;
  finalSweet: RunningSweet | null;
  result: RunResult | null;
  dripT: number;
  wasted: number;
  spills: Mesh[];
  sweets: RunningSweet[];
  streamMesh: AbstractMesh | null;
  streamNode: TransformNode | null;
}

export class Game {
  private state: GameState = 'loading';
  private prevState: GameState = 'play';
  private run: Run | null = null;
  private hudAcc = 0;
  private stageCream: CreamDef;
  private stageTopping: ToppingDef;

  constructor(
    private readonly scene: Scene,
    private readonly shadows: ShadowGenerator,
    private readonly beltTexture: { uOffset: number },
    private readonly machines: Dispensers,
    private readonly changeBackdrop: () => void,
    private readonly sfx: Sfx,
    private readonly save: SaveData,
    private readonly ui: UiHooks
  ) {
    this.stageCream = creamById(save.cream);
    this.stageTopping = toppingById(save.topping);
  }

  async boot(): Promise<void> {
    await Promise.all([preloadSweets(this.scene), this.machines.load()]);
    this.state = 'title';
    this.ui.hud(false);
  }

  currentState(): GameState {
    return this.state;
  }

  snapshot(): Snapshot {
    const run = this.run;
    const base: Snapshot = {
      state: this.state,
      stage: run ? run.cfg.n : 0,
      stageName: run ? run.cfg.name : '',
      score: run ? run.score : 0,
      timeLeft: this.state === 'topping' && run
        ? Math.max(0, (run.toppingEndsAt - performance.now()) / 1000)
        : run?.timeLeft ?? 0,
      combo: run ? run.combo : 0,
      toppingTaps: run ? run.toppingTaps : 0,
      piping: !!(run && run.hold),
      sweets: run
        ? run.sweets.map((s) => {
            const st = creamState(s.cream);
            return {
              x: Math.round(s.beltX * 100) / 100,
              z: Math.round(s.beltZ * 100) / 100,
              amount: Math.round(st.amount * 100) / 100,
              cover: Math.round(st.cover * 100) / 100,
              spill: Math.round(st.spill * 100) / 100,
              halfX: Math.round(s.halfX * 100) / 100,
              halfZ: Math.round(s.halfZ * 100) / 100,
              judged: s.judgedRank,
              reason: s.judgedReason,
              decor: s.decor.length
            };
          })
        : []
    };
    if (run && run.result) base.result = run.result;
    return base;
  }

  goTitle(): void {
    this.sfx.setMusic(false);
    this.state = 'title';
    this.clearRun();
    this.ui.hud(false);
    this.ui.ready(false);
  }

  startStage(index: number): void {
    const safe = Math.max(0, Math.min(STAGES.length - 1, Math.floor(index)));
    this.clearRun();
    const run: Run = {
      index: safe,
      cfg: STAGES[safe]!,
      t: 0,
      timeLeft: DURATION,
      score: 0,
      combo: 0,
      bestCombo: 0,
      counts: { perfect: 0, great: 0, good: 0, miss: 0 },
      spawned: 0,
      keepsake: null, strokeTarget: null, gapTime: 0, dirtyStroke: false,
      pendingDoses: 0, falling: [],
      spawnT: 0,
      hold: false,
      holdT: 0,
      shakeT: 0,
      readyT: 1.8,
      finalT: 0,
      toppingEndsAt: 0,
      toppingTaps: 0,
      finalSweet: null,
      result: null,
      dripT: 0,
      wasted: 0,
      spills: [],
      sweets: [],
      streamMesh: null,
      streamNode: null
    };
    this.run = run;
    this.changeBackdrop();
    this.stageCream = creamById(this.save.cream);
    this.stageTopping = toppingById(this.save.topping);
    this.state = 'ready';
    this.prevState = 'play';
    this.ui.hideScreen();
    this.ui.hud(true);
    this.ui.ready(true, run.cfg);
    this.sfx.startStageMusic();
    this.sfx.resume();
  }

  resume(): void {
    this.sfx.setMusic(true);
    this.state = this.prevState === 'ready' ? 'ready' : 'play';
    this.ui.hideScreen();
    this.ui.hud(true);
    if (this.prevState === 'ready' && this.run) this.ui.ready(true, this.run.cfg);
  }

  pause(): void {
    if (this.state !== 'play' && this.state !== 'ready') return;
    this.prevState = this.state;
    this.sfx.setMusic(false);
    this.state = 'pause';
    this.endHold();
    this.machines.reset();
    this.ui.hud(false);
  }

  /** 押した瞬間 */
  press(): void {
    if (this.state === 'topping') {
      this.shakeTopping();
      return;
    }
    if (this.state !== 'play' || !this.run) return;
    this.run.hold = true;
    this.run.holdT = 0;
    this.ensureStream();
  }

  /** 離した瞬間 */
  release(): void {
    this.endHold();
  }

  private endHold(): void {
    if (!this.run) return;
    this.run.hold = false;
    this.run.holdT = 0;
    this.run.strokeTarget = null;
    this.run.gapTime = 0;
    this.run.dirtyStroke = false;
    this.run.dripT = 0;
    this.hideStream();
  }

  private ensureStream(): void {
    const run = this.run;
    if (!run) return;
    if (run.streamMesh) return;
    const node = new TransformNode('streamNode', this.scene);
    const mesh = createCreamStream(this.scene, this.stageCream, CONFIG.streamRadius);
    mesh.parent = node;
    mesh.isPickable = false;
    run.streamNode = node;
    run.streamMesh = mesh;
  }

  private hideStream(): void {
    const run = this.run;
    if (!run) return;
    run.streamMesh?.dispose(false, true);
    run.streamNode?.dispose();
    run.streamMesh = null;
    run.streamNode = null;
  }

  /** 押しているあいだの連続絞り。時間に比例した量をノズル直下へ流す。 */
  private flow(dt: number): void {
    const run = this.run;
    if (!run) return;
    const rate = Math.min(CONFIG.flowMax, run.cfg.speed * CONFIG.flowK);
    const target = this.sweetUnderStation();
    if (target) {
      run.dripT = 0;
      if (run.strokeTarget && run.strokeTarget !== target &&
          (target.fruitRow === null || target.fruitRow !== run.strokeTarget.fruitRow)) {
        run.strokeTarget.cream.offTarget = true;
        run.dirtyStroke = true;
      }
      run.strokeTarget = target;
      run.gapTime = 0;
      if (run.dirtyStroke) target.cream.offTarget = true;
      const u = (CONFIG.stationX - target.beltX) / target.halfX;
      const previousDrops = target.cream.drops;
      deposit(target.cream, u, rate * dt / target.halfX);
      if (target.cream.drops > previousDrops) this.keepForFinishing(run, target);
      const st = creamState(target.cream);
      target.creamMesh.update(st, target.surface.halfX, target.surface.halfZ, this.stageCream.style, target.phase);
      if (st.amount > 2.2) this.judge(target);
    } else {
      // Empty belt between members of this particular arrival is an intentional part of the stroke.
      const row = run.strokeTarget?.fruitRow;
      if (row != null && run.sweets.some(s => s.fruitRow === row && s.beltX < CONFIG.stationX && !s.judged)) return;
      run.gapTime += dt;
      if (run.gapTime > 0.07) {
        run.dirtyStroke = true;
        if (run.strokeTarget) run.strokeTarget.cream.offTarget = true;
      }
      run.dripT += dt;
      if (run.dripT >= CONFIG.dripInterval) {
        run.dripT = 0;
        run.wasted += 1;
        this.spillOnBelt();
      }
    }
  }

  private sweetUnderStation(): RunningSweet | null {
    const run = this.run;
    if (!run) return null;
    let best: RunningSweet | null = null;
    let bestD = Infinity;
    for (const s of run.sweets) {
      if (s.judged) continue;
      const d = Math.abs(CONFIG.stationX - s.beltX);
      const u = (CONFIG.stationX - s.beltX) / s.halfX;
      if (d <= s.halfX && surfaceRow(s.surface, u)[0] > 0 && d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }

  private spillOnBelt(): void {
    const run = this.run;
    if (!run) return;
    const mesh = MeshBuilder.CreateSphere('spill', { diameter: 0.5, segments: 10 }, this.scene);
    mesh.scaling.set(1.3, 0.18, 1.05);
    const mat = new PBRMaterial('spillMat', this.scene);
    mat.albedoColor = Color3.FromHexString(this.stageCream.c.main);
    mat.metallic = 0;
    mat.roughness = 0.3;
    mat.alpha = 0.92;
    mesh.material = mat;
    mesh.position.set(CONFIG.stationX, CONFIG.beltY + 0.05, 0);
    run.spills.push(mesh);
  }

  spawn(): void {
    const run = this.run;
    if (!run) return;
    const arrival = trayItems(run.index, run.spawned++);
    let previous: RunningSweet | null = null;
    for (const id of arrival) {
      const s = spawnSweet(this.shadows, id) as RunningSweet;
      s.fruitRow = arrival.length > 1 ? run.spawned : null;
      s.creamMesh = new CreamMesh(this.scene, this.stageCream, s.surface);
      s.creamMesh.mesh.parent = s.node;
      if (!run.keepsake) this.keepForFinishing(run, s);
      if (previous) s.beltX = previous.beltX - previous.halfX - s.halfX - 0.12;
      placeSweet(s);
      run.sweets.push(s);
      previous = s;
    }
  }

  private keepForFinishing(run: Run, sweet: RunningSweet): void {
    if (run.keepsake === sweet) return;
    if (run.keepsake && !run.sweets.includes(run.keepsake)) this.disposeSweet(run.keepsake);
    run.keepsake = sweet;
  }

  private judge(sweet: RunningSweet): void {
    const run = this.run;
    if (!run || sweet.judged) return;
    const st = creamState(sweet.cream);
    const res = judgeCream(st, run.cfg);
    sweet.judged = true;
    sweet.judgedRank = res.rank;
    sweet.judgedReason = res.reason;
    run.counts[res.rank] += 1;
    if (res.rank === 'miss') {
      run.combo = 0;
      run.shakeT = 0.28;
      this.ui.popup(new Vector3(sweet.beltX, CONFIG.beltY + (sweet.meta.creamY + 0.9) * sweet.scale, sweet.beltZ), `${res.emoji} ${res.detail}`, '', res.color);
      this.sfx.judge('miss');
      return;
    }
    run.combo += 1;
    run.bestCombo = Math.max(run.bestCombo, run.combo);
    const n = res.rank === 'perfect' ? 8 : res.rank === 'great' ? 5 : 3;
    const sc = candyScore(res, run.combo, n);
    run.score += sc.total;
    this.addToppings(sweet, n);
    this.ui.popup(new Vector3(sweet.beltX, CONFIG.beltY + (sweet.meta.creamY + 0.9) * sweet.scale, sweet.beltZ), `${res.emoji} ${res.label}`, `+${sc.total}`, res.color);
    this.sfx.judge(res.rank);
    if (res.rank === 'perfect') this.ui.celebrate(false);
  }

  private addToppings(sweet: RunningSweet, count: number): void {
    for (let i = 0; i < count; i++) {
      const top = makeTopping(this.scene, this.stageTopping);
      top.parent = sweet.node;
      top.position.copyFrom(this.toppingLanding(sweet));
      top.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      sweet.decor.push(top);
    }
    while (sweet.decor.length > 34) {
      const old = sweet.decor.shift();
      old?.dispose(false, true);
    }
  }

  private toppingLanding(s: RunningSweet): Vector3 {
    const rows = s.surface.rows;
    const candidates = rows.map(([width, base], i) => {
      const u = 2*i/(rows.length-1)-1;
      return { u, width, base, iced: s.creamMesh.heightAt(u, 0) > base + 0.01 };
    }).filter(row => row.width > 0);
    const iced = candidates.filter(row => row.iced);
    const choices = iced.length ? iced : candidates;
    const row = choices[Math.floor(Math.random()*choices.length)];
    let z = (Math.random()*2-1) * Math.min(row.width, s.surface.halfZ * 0.28);
    let y = s.creamMesh.heightAt(row.u, z);
    if (row.iced && y <= row.base + 0.01) {
      z = 0;
      y = s.creamMesh.heightAt(row.u, z);
    }
    return new Vector3(row.u * s.surface.halfX, Math.max(y, row.base) + 0.028, z);
  }

  private shakeTopping(): void {
    const run = this.run;
    if (!run || !run.finalSweet || performance.now() >= run.toppingEndsAt) return;
    run.pendingDoses++;
    run.toppingTaps++;
    this.machines.shakeShaker();
    this.sfx.tone(620 + Math.min(run.toppingTaps, 8) * 55, 0.08, 'triangle', 0.06);
  }

  private dispenseDose(run: Run, s: RunningSweet): void {
    for (let i = 0; i < 3; i++) {
      const top = makeTopping(this.scene, this.stageTopping);
      const landing = this.toppingLanding(s);
      const start = this.machines.outlet();
      const end = Vector3.TransformCoordinates(landing, s.node.computeWorldMatrix(true));
      const duration = Math.sqrt(2 * Math.max(0.01, start.y - end.y) / 9.81);
      top.name = 'fallingGarnish';
      top.position.copyFrom(start);
      top.scaling.copyFrom(s.node.scaling);
      top.rotation.set(Math.random()*3, 0, Math.random()*3);
      run.falling.push({ mesh: top, start, landing, elapsed: 0, duration });
    }
  }

  private updateFalling(run: Run, dt: number): void {
    const sweet = run.finalSweet;
    if (!sweet || !run.falling.length) return;
    const transform = sweet.node.computeWorldMatrix(true);
    for (let i = run.falling.length - 1; i >= 0; i--) {
      const drop = run.falling[i];
      drop.elapsed += dt;
      const t = Math.min(1, drop.elapsed / drop.duration);
      const end = Vector3.TransformCoordinates(drop.landing, transform);
      Vector3.LerpToRef(drop.start, end, t, drop.mesh.position);
      drop.mesh.position.y = drop.start.y + (end.y - drop.start.y) * t * t;
      drop.mesh.rotation.z += dt * 7;
      if (t === 1) {
        drop.mesh.parent = sweet.node;
        drop.mesh.position.copyFrom(drop.landing);
        drop.mesh.scaling.setAll(1);
        drop.mesh.metadata.pop = 1;
        sweet.decor.push(drop.mesh);
        run.falling.splice(i, 1);
      }
    }
  }

  /** お菓子のクリーム表面の高さ（ノズルから帯を落とす先） */
  private creamTopY(sweet: RunningSweet, u: number): number {
    const h = sweet.creamMesh.heightAt(u, 0);
    return CONFIG.beltY + Math.max(surfaceRow(sweet.surface, u)[1], h) * sweet.scale;
  }

  private startToppingPhase(): void {
    const run = this.run;
    if (!run) return;
    for (const spill of run.spills) spill.dispose(false, true);
    run.spills.length = 0;
    this.state = 'topping';
    this.endHold();
    run.toppingTaps = 0;
    for (const s of run.sweets) if (!s.judged && s.cream.drops > 0) this.judge(s);
    const s = run.keepsake;
    if (!s) return;
    for (const other of run.sweets) if (other !== s) this.disposeSweet(other);
    run.sweets = [s];
    s.node.setEnabled(true);
    s.isFinal = true;
    s.beltX = CONFIG.stationX;
    placeSweet(s);
    run.finalSweet = s;
    this.machines.showShaker();
    run.toppingEndsAt = performance.now() + CONFIG.toppingSeconds * 1000;
    this.ui.hint('5秒間タップしてトッピング！');
    this.sfx.tone(760, 0.12, 'triangle', 0.08);
  }

  private finishStage(): void {
    const run = this.run;
    if (!run) return;
    this.machines.shaker.setEnabled(false);
    this.ui.celebrate(true);
    run.score += run.toppingTaps * 18;
    const cleared = run.score >= run.cfg.quota;
    const stars = starsFor(run.score, run.cfg.quota);
    const coins = cleared ? 40 + Math.round(run.score / 10) + stars * 25 : Math.round(run.score / 12);
    this.save.coins += coins;
    if (stars > (this.save.stars[run.index] ?? 0)) this.save.stars[run.index] = stars;
    if (run.score > (this.save.best[run.index] ?? 0)) this.save.best[run.index] = run.score;
    if (stars >= 1 && run.index + 1 < STAGES.length) {
      this.save.unlocked = Math.max(this.save.unlocked, run.index + 2);
    }
    run.result = {
      index: run.index,
      cfg: run.cfg,
      score: run.score,
      quota: run.cfg.quota,
      cleared,
      stars,
      counts: run.counts,
      bestCombo: run.bestCombo,
      toppingTaps: run.toppingTaps,
      coins,
      wasted: run.wasted
    };
    this.sfx.setMusic(false);
    this.state = 'final';
    run.finalT = 0;
    this.ui.hint(null);
    this.sfx.tone(cleared ? 660 : 440, 0.16, 'triangle', 0.1);
    this.sfx.tone(cleared ? 880 : 330, 0.18, 'triangle', 0.09, 0.14);
  }

  private clearSweets(): void {
    const run = this.run;
    if (!run) return;
    if (run.keepsake && !run.sweets.includes(run.keepsake)) this.disposeSweet(run.keepsake);
    run.keepsake = null;
    for (const s of run.sweets) {
      s.creamMesh.dispose();
      for (const d of s.decor) d.dispose(false, true);
      s.node.getChildMeshes().forEach((m) => m.dispose());
      s.node.dispose();
    }
    run.sweets = [];
    run.finalSweet = null;
  }

  private clearRun(): void {
    for (const spill of this.run?.spills ?? []) spill.dispose(false, true);
    for (const drop of this.run?.falling ?? []) drop.mesh.dispose(false, true);
    this.machines.reset();
    this.clearSweets();
    this.hideStream();
    this.run = null;
  }

  update(dt: number, elapsed = dt): void {
    const run = this.run;
    this.beltTexture.uOffset -= dt * 0.06;
    if (!run) return;

    this.updateFalling(run, dt);
    // トッピングのポップ
    for (const s of run.sweets) {
      for (const d of s.decor) {
        const meta = d.metadata as { pop?: number } | null;
        const pop = Math.min(1, (meta?.pop ?? 0) + dt * 5.5);
        if (meta) meta.pop = pop;
        const k = 0.35 + 0.65 * pop + Math.sin(pop * Math.PI) * 0.22;
        d.scaling.setAll(k);
      }
    }

    if (this.state === 'pause' || this.state === 'result' || this.state === 'title' || this.state === 'select' || this.state === 'shop') return;

    run.t += dt;
    run.shakeT = Math.max(0, run.shakeT - dt);
    this.applyShake(run);

    if (this.state === 'final') {
      run.finalT += dt;
      if (run.finalT > 1.4 && run.result) {
        this.state = 'result';
        this.ui.hud(false);
        this.ui.result(run.result);
        this.ui.refresh(this.snapshot());
      }
      return;
    }

    if (this.state === 'ready') {
      run.readyT -= dt;
      if (run.readyT <= 0) {
        this.state = 'play';
        this.ui.ready(false);
      }
      return;
    }

    if (this.state === 'topping') {
      if (this.machines.updateShaker(dt) && run.finalSweet) {
        while (run.pendingDoses > 0) {
          this.dispenseDose(run, run.finalSweet);
          run.pendingDoses--;
        }
      }
      this.updateTopping(dt);
      return;
    }

    if (this.state !== 'play') return;

    run.timeLeft -= elapsed;

    run.spawnT -= dt;
    if (run.spawnT <= 0 && run.timeLeft > 2.0) {
      if (run.sweets.length < CONFIG.maxSweets) this.spawn();
      run.spawnT = (run.index === 0 ? 1.82 : run.cfg.gap) * (0.94 + Math.random() * 0.12);
    }

    const speed = run.cfg.speed;
    for (let i = run.spills.length - 1; i >= 0; i--) {
      const spill = run.spills[i]!;
      spill.position.x += speed * dt;
      if (spill.position.x > CONFIG.exitX) {
        spill.dispose(false, true);
        run.spills.splice(i, 1);
      }
    }
    for (let i = run.sweets.length - 1; i >= 0; i--) {
      const s = run.sweets[i]!;
      s.beltX += speed * dt;
      placeSweet(s);
      if (s.cream.amount > 0.005) {
        const st = creamState(s.cream);
        s.creamMesh.update(st, s.surface.halfX, s.surface.halfZ, this.stageCream.style, s.phase);
      } else {
        s.creamMesh.mesh.isVisible = false;
      }

      if (!s.judged && s.beltX >= CONFIG.judgeX) this.judge(s);

      if (s.beltX > CONFIG.exitX || (!s.isFinal && s.judged && s.beltX > CONFIG.exitX - 4)) {
        if (s === run.keepsake) s.node.setEnabled(false);
        else this.disposeSweet(s);
        run.sweets.splice(i, 1);
      }
    }

    if (run.hold) {
      run.holdT += dt;
      this.flow(dt);
      this.updateStream(dt);
      if (Math.floor(run.holdT * 8) !== Math.floor((run.holdT - dt) * 8)) {
        const t = this.sweetUnderStation();
        if (t) this.sfx.creamTick(creamState(t.cream).amount);
      }
    }

    if (!run.hold) this.machines.updateNozzle(false, 0, run.t, dt);
    if (run.timeLeft <= 0) {
      run.timeLeft = 0;
      this.startToppingPhase();
    }
  }

  private updateTopping(dt: number): void {
    const run = this.run;
    if (!run) return;
    const s = run.finalSweet;
    if (s) {
      const dx = CONFIG.stationX - s.beltX;
      if (Math.abs(dx) > 0.01) {
        s.beltX += Math.sign(dx) * Math.min(Math.abs(dx), dt * 7);
        placeSweet(s);
      }
      s.creamMesh.update(creamState(s.cream), s.surface.halfX, s.surface.halfZ, this.stageCream.style, s.phase);
    }
    if (performance.now() >= run.toppingEndsAt && run.pendingDoses === 0) this.finishStage();
  }

  private updateStream(dt: number): void {
    const run = this.run;
    if (!run || !run.streamMesh) return;
    const target = this.sweetUnderStation();
    let toY = CONFIG.beltY + 0.05;
    if (target) {
      const u = Math.max(-1, Math.min(1, (CONFIG.stationX - target.beltX) / target.halfX));
      toY = this.creamTopY(target, u);
    }
    const fromY = this.machines.updateNozzle(true, toY, run.t, dt);
    const height = Math.max(0.06, fromY - toY);
    run.streamMesh.scaling.y = height;
    run.streamMesh.scaling.x = 1;
    run.streamMesh.scaling.z = 1;
    run.streamMesh.position.y = -height / 2;
    if (run.streamNode) run.streamNode.position.set(CONFIG.stationX, fromY, 0);
  }

  private applyShake(run: Run): void {
    const cam = this.scene.activeCamera;
    if (!cam) return;
    const amp = run.shakeT > 0 ? run.shakeT * 0.35 : 0;
    if (amp <= 0) return;
    cam.position.x = -4.8 + (Math.random() * 2 - 1) * amp;
    cam.position.y = 5.5 + (Math.random() * 2 - 1) * amp * 0.6;
  }

  private disposeSweet(s: RunningSweet): void {
    s.creamMesh.dispose();
    for (const d of s.decor) d.dispose(false, true);
    s.node.getChildMeshes().forEach((m) => {
      this.shadows.removeShadowCaster(m);
      m.dispose();
    });
    s.node.dispose();
  }

  updateHud(dt: number): void {
    const run = this.run;
    if (!run) return;
    this.hudAcc += dt;
    if (this.hudAcc < 0.05) return;
    this.hudAcc = 0;
    this.ui.refresh(this.snapshot());
  }
}


