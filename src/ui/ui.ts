/* DOM 側の UI: HUD、画面、ポップアップ、開始演出 */
import type { RunResult, Snapshot, UiHooks } from '../game/game';
import { CONFIG } from '../game/config';
import { DURATION, STAGES } from '../logic/judge';
import { CREAMS, TOPPINGS, TOPPING_PRICE, creamById, toppingById } from '../game/creams';
import type { SaveData } from '../game/save';

export interface UiActions {
  startStage(index: number): void;
  resume(): void;
  showSelect(): void;
  showShop(tab: 'cream' | 'topping'): void;
  showTitle(): void;
  toggleSound(): void;
  retry(): void;
  setCream(id: string): boolean;
  setTopping(id: string): boolean;
}

const el = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

function starsMarkup(n: number): string {
  let s = '';
  for (let i = 0; i < 3; i++) s += i < n ? '<span>★</span>' : '<span class="off">☆</span>';
  return s;
}

export class Ui implements UiHooks {
  private readonly screens = el<HTMLElement>('screens');
  private readonly hudEl = el<HTMLElement>('hud');
  private readonly readyEl = el<HTMLElement>('ready');
  private readonly readyStage = el<HTMLElement>('readyStage');
  private readonly readyName = el<HTMLElement>('readyName');
  private readonly hintEl = el<HTMLElement>('hint');
  private readonly hudStage = el<HTMLElement>('hudStage');
  private readonly hudName = el<HTMLElement>('hudName');
  private readonly hudScore = el<HTMLElement>('hudScore');
  private readonly hudTime = el<HTMLElement>('hudTime');
  private readonly hudCombo = el<HTMLElement>('hudCombo');
  private readonly popupLayer: HTMLElement;
  private readonly app = el<HTMLElement>('app');

  constructor(
    private readonly save: SaveData,
    private readonly actions: UiActions,
    private readonly muted: () => boolean
  ) {
    this.popupLayer = document.createElement('div');
    this.popupLayer.className = 'popup-layer';
    this.app?.appendChild(this.popupLayer);
    this.bindEvents();
  }

  private bindEvents(): void {
    this.screens?.addEventListener('click', (e) => {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest?.('[data-act]') as HTMLElement | null;
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      switch (act) {
        case 'select':
          this.actions.showSelect();
          break;
        case 'title':
          this.actions.showTitle();
          break;
        case 'shop':
          this.actions.showShop('cream');
          break;
        case 'tab': {
          const tab = btn.getAttribute('data-tab') === 'topping' ? 'topping' : 'cream';
          this.actions.showShop(tab);
          break;
        }
        case 'play': {
          const idx = Number.parseInt(btn.getAttribute('data-stage') ?? '-1', 10);
          if (Number.isNaN(idx) || idx + 1 > this.save.unlocked) return;
          this.actions.startStage(idx);
          break;
        }
        case 'retry':
          this.actions.retry();
          break;
        case 'resume':
          this.actions.resume();
          break;
        case 'toggle-sound':
          this.actions.toggleSound();
          break;
        case 'cream':
        case 'topping': {
          const id = btn.getAttribute('data-id') ?? '';
          const ok = act === 'cream' ? this.actions.setCream(id) : this.actions.setTopping(id);
          if (ok) this.actions.showShop(act === 'cream' ? 'cream' : 'topping');
          break;
        }
        default:
          break;
      }
    });
  }

  onScreen(html: string): void {
    if (!this.screens) return;
    this.screens.className = 'screens active';
    this.screens.innerHTML = html;
    this.screens.scrollTop = 0;
  }

  hideScreen(): void {
    if (!this.screens) return;
    this.screens.className = 'screens';
    this.screens.innerHTML = '';
  }

  hud(on: boolean): void {
    this.hudEl?.classList.toggle('show', on);
    if (!on) this.ready(false);
  }

  ready(on: boolean, cfg?: { n: number; name: string }): void {
    if (!this.readyEl) return;
    this.readyEl.classList.toggle('show', on);
    if (on && cfg) {
      if (this.readyStage) this.readyStage.textContent = `STAGE ${cfg.n}`;
      if (this.readyName) this.readyName.textContent = cfg.name;
      this.readyStage?.classList.remove('fade');
    }
    if (!on) {
      this.readyStage?.classList.remove('fade');
    }
  }

  hint(text: string | null): void {
    if (!this.hintEl) return;
    if (text) {
      this.hintEl.textContent = text;
      this.hintEl.classList.add('show');
    } else {
      this.hintEl.classList.remove('show');
    }
  }

  celebrate(large: boolean): void {
    if (!this.app || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const burst = document.createElement('div');
    burst.className = 'confetti-burst';
    burst.setAttribute('aria-hidden', 'true');
    const colors = ['#ff719b', '#ffce49', '#61d8c4', '#9e8bf1', '#fff4dc'];
    const width = this.app.clientWidth;
    const height = this.app.clientHeight;
    for (let i = 0; i < (large ? 52 : 16); i++) {
      const bit = document.createElement('i');
      const side = i % 2 === 0 ? -1 : 1;
      bit.style.left = side < 0 ? '2%' : '98%';
      bit.style.top = large ? '44%' : '57%';
      bit.style.background = colors[i % colors.length];
      burst.appendChild(bit);
      const x = -side * (0.15 + Math.random() * 0.45) * width;
      const rise = height * (0.12 + Math.random() * (large ? 0.32 : 0.15));
      bit.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${x*0.64}px,${-rise}px) rotate(${side*170}deg)`, opacity: 1, offset: 0.39 },
        { transform: `translate(${x}px,${height*0.40}px) rotate(${side*470}deg)`, opacity: 0 }
      ], { duration: (large ? 1350 : 850) + Math.random()*180, fill: 'both' });
    }
    this.app.appendChild(burst);
    window.setTimeout(() => burst.remove(), large ? 1560 : 1060);
  }

  popup(world: { x: number; y: number; z: number }, main: string, sub: string, color: string): void {
    const scene = this.projector;
    if (!scene) return;
    const p = scene(world);
    if (!p) return;
    const node = document.createElement('div');
    node.className = 'pop';
    node.innerHTML = `<span>${main}</span>${sub ? `<b>${sub}</b>` : ''}`;
    node.style.borderColor = color;
    node.style.color = color;
    node.style.left = `${p.x}px`;
    node.style.top = `${p.y}px`;
    this.popupLayer.appendChild(node);
    const t0 = performance.now();
    const life = 1100;
    const step = (now: number): void => {
      const k = Math.min(1, (now - t0) / life);
      node.style.transform = `translate(-50%,-50%) translateY(${-k * 44}px) scale(${1 + (1 - k) * 0.14})`;
      node.style.opacity = String(1 - k * k);
      if (k < 1) requestAnimationFrame(step);
      else node.remove();
    };
    requestAnimationFrame(step);
  }

  /** 3D 座標 → 画面上の px。main.ts から差し込む */
  projector: ((world: { x: number; y: number; z: number }) => { x: number; y: number } | null) | null = null;

  refresh(snap: Snapshot): void {
    if (this.hudScore) this.hudScore.textContent = String(snap.score);
    if (this.hudTime && snap.stage > 0) {
      const ratio = Math.max(0, Math.min(1, snap.timeLeft / (snap.state === 'topping' ? CONFIG.toppingSeconds : DURATION)));
      this.hudTime.style.width = `${ratio * 100}%`;
      this.hudTime.parentElement?.classList.toggle('low', snap.timeLeft <= (snap.state === 'topping' ? 1 : 8));
    }
    if (this.hudStage && snap.stage > 0) {
      this.hudStage.textContent = snap.state === 'topping' ? 'トッピング' : `STAGE ${snap.stage}`;
    }
    if (this.hudName && snap.stageName) this.hudName.textContent = snap.stageName;
    if (this.hudCombo) {
      if (snap.state === 'topping') this.hudCombo.textContent = `ふりかけた数 ${snap.toppingTaps}`;
      else if (snap.combo >= 2) this.hudCombo.textContent = `${snap.combo} れんぞく ×${(1 + Math.min(snap.combo, 10) * 0.05).toFixed(2)}`;
      else if (snap.timeLeft <= 8) this.hudCombo.textContent = 'ラストスパート!';
      else this.hudCombo.textContent = '';
    }
    const hud = el<HTMLElement>('hud');
    if (hud) hud.classList.toggle('piping', snap.piping);
  }

  title(): void {
    const muted = this.muted();
    this.onScreen(`
      <div class="card">
        <p class="kicker">1分間 ・ ぜん10ステージ ・ 3D</p>
        <h1>完璧な<br><span class="accent">クリーム</span></h1>
        <p class="lead">お菓子は左からベルトに乗って流れてきます。押さえているあいだクリームが連続で出るので、
        お菓子が真下にいるあいだに量を調整して、土台からこぼれないように仕上げてください。
        最後はトッピングを振りかけて完成です。</p>
        <ul class="tips">
          <li>お菓子がノズルの真下に来たら、押したまま動かさずに塗る</li>
          <li>押している時間でクリームの量が決まる</li>
          <li>最後はタップでトッピングを振りかける</li>
        </ul>
        <div class="btn-row">
          <button class="btn primary" data-act="select">ステージをえらぶ</button>
          <button class="btn" data-act="shop">ショップ</button>
        </div>
        <p class="tiny">音: ${muted ? 'オフ' : 'オン'}
          <button class="btn ghost tiny-btn" data-act="toggle-sound">音を${muted ? 'オン' : 'オフ'}にする</button>
        </p>
      </div>`);
  }

  select(): void {
    const cleared = Object.values(this.save.stars).filter((v) => v > 0).length;
    const cards = STAGES.map((cfg, i) => {
      const unlocked = i + 1 <= this.save.unlocked;
      const stars = this.save.stars[i] ?? 0;
      const best = this.save.best[i] ?? 0;
      const cls = `stage-card${unlocked ? (stars > 0 ? ' cleared' : '') : ' locked'}`;
      const body = unlocked
        ? `<span class="no">STAGE ${cfg.n}</span><span class="nm">${cfg.name}</span>
           <span class="st">${starsMarkup(stars)}</span><span class="bs">ベスト ${best}てん</span>`
        : `<span class="no">STAGE ${cfg.n}</span><span class="nm">？？？</span>
           <span class="bs">もくひょう ${cfg.quota}てん</span>`;
      return `<button class="${cls}" data-act="play" data-stage="${i}" ${unlocked ? '' : 'disabled'}>${body}</button>`;
    }).join('');
    this.onScreen(`
      <div class="card">
        <div class="topbar"><h2>ステージをえらぶ</h2><span class="coins">${this.save.coins}</span></div>
        <p class="tiny" style="margin:0 0 10px">${cleared} / 10 クリア。★1つ以上で次が開きます。</p>
        <div class="stage-grid">${cards}</div>
        <div class="btn-row">
          <button class="btn ghost" data-act="title">タイトルへ</button>
          <button class="btn" data-act="shop">ショップ</button>
        </div>
      </div>`);
  }

  shop(tab: 'cream' | 'topping'): void {
    const body =
      tab === 'cream'
        ? CREAMS.map((c) => {
            const owned = this.save.ownedCreams.includes(c.id);
            const on = this.save.cream === c.id;
            const swatch = c.rainbow
              ? 'linear-gradient(135deg,#ff9ec4,#ffd27a,#a7e8b0,#9ed8ff,#c9a7ff)'
              : `radial-gradient(circle at 34% 28%,${c.c.light},${c.c.main} 58%,${c.c.dark})`;
            return `<button class="item${owned ? (on ? ' on' : ' owned') : ' locked-price'}" data-act="cream" data-id="${c.id}">
              <span class="swatch" style="background:${swatch}"></span>
              <span><span class="nm">${c.name}</span><br><span class="pr">${owned ? (on ? 'そうびちゅう' : 'もっている') : `● ${c.price}`}</span></span>
            </button>`;
          }).join('')
        : TOPPINGS.map((t) => {
            const owned = this.save.ownedToppings.includes(t.id);
            const on = this.save.topping === t.id;
            const price = TOPPING_PRICE[t.id] ?? 300;
            return `<button class="item${owned ? (on ? ' on' : ' owned') : ' locked-price'}" data-act="topping" data-id="${t.id}">
              <span class="swatch" style="background:radial-gradient(circle at 36% 30%,#ffffffcc,${t.color} 66%)"></span>
              <span><span class="nm">${t.name}</span><br><span class="pr">${owned ? (on ? 'そうびちゅう' : 'もっている') : `● ${price}`}</span></span>
            </button>`;
          }).join('');
    this.onScreen(`
      <div class="card">
        <div class="topbar"><h2>ショップ</h2><span class="coins">${this.save.coins}</span></div>
        <div class="tabs">
          <button class="tab${tab === 'cream' ? ' on' : ''}" data-act="tab" data-tab="cream">クリーム</button>
          <button class="tab${tab === 'topping' ? ' on' : ''}" data-act="tab" data-tab="topping">トッピング</button>
        </div>
        <div class="item-grid">${body}</div>
        <p class="tiny">クリアでもらえるコインで増やせます。トッピングは成功したお菓子にだけ振りかけられます。</p>
        <div class="btn-row">
          <button class="btn ghost" data-act="select">ステージへ</button>
          <button class="btn" data-act="title">タイトルへ</button>
        </div>
      </div>`);
  }

  pause(snap: Snapshot): void {
    this.onScreen(`
      <div class="card">
        <p class="kicker">STAGE ${snap.stage}</p>
        <h2>ひとやすみ</h2>
        <p class="lead">${snap.stageName}<br>ここまでの得点 ${snap.score}てん</p>
        <div class="btn-row">
          <button class="btn primary" data-act="resume">つづける</button>
          <button class="btn" data-act="retry">やりなおす</button>
        </div>
        <div class="btn-row">
          <button class="btn ghost" data-act="select">ステージをえらぶ</button>
          <button class="btn ghost" data-act="toggle-sound">音: ${this.muted() ? 'オフ' : 'オン'}</button>
        </div>
      </div>`);
  }

  result(res: RunResult): void {
    const next = res.cleared && res.index + 1 < STAGES.length;
    const rows = `
      <li><span>かんぺき</span><b>${res.counts.perfect} こ</b></li>
      <li><span>おしい</span><b>${res.counts.great} こ</b></li>
      <li><span>まあまあ</span><b>${res.counts.good} こ</b></li>
      <li><span>ざんねん</span><b>${res.counts.miss} こ</b></li>
      <li><span>トッピング</span><b>${res.toppingTaps} こ</b></li>
      <li><span>さいだいコンボ</span><b>${res.bestCombo} れんぞく</b></li>
      <li><span>もくひょう</span><b>${res.quota} てん</b></li></ul>`;
    this.onScreen(`
      <div class="card">
        <div class="result-head">
          <span class="result-emoji">${res.cleared ? (res.stars >= 3 ? '🏆' : '🎉') : '😢'}</span>
          <div class="result-rank">${res.cleared ? (res.stars >= 3 ? 'パーフェクトクリア!' : 'ステージクリア!') : 'もういちど挑戦'}</div>
          <div class="result-stage">STAGE ${res.cfg.n}　${res.cfg.name}</div>
        </div>
        <div class="stars">${starsMarkup(res.stars)}</div>
        <div class="score-line"><span class="num">${res.score}</span><span class="unit">てん</span></div>
        <div style="text-align:center"><span class="pill">コイン +${res.coins}</span></div>
        <ul class="breakdown">${rows}</ul>
        <div class="btn-row">
          ${next
            ? `<button class="btn primary" data-act="play" data-stage="${res.index + 1}">つぎのステージ</button>`
            : '<button class="btn primary" data-act="retry">もういちど</button>'}
          <button class="btn" data-act="select">ステージをえらぶ</button>
        </div>
        ${next ? '' : '<div class="btn-row"><button class="btn ghost" data-act="retry">やりなおす</button></div>'}
      </div>`);
  }
}

export { creamById, toppingById };
