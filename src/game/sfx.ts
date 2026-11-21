/* サウンド: 効果音は Web Audio、BGM はステージ中にループ再生する。 */
const TRACKS = ['bakery-loop', 'vanilla-waltz', 'citrus-bossa', 'cocoa-bounce', 'berry-lullaby'];

export class Sfx {
  private ctx: AudioContext | null = null;
  private readonly music = new Audio();
  private musicActive = false;
  private silent = false;
  private remaining: string[] = [];
  private lastTrack = '';

  constructor() {
    this.music.loop = true;
    this.music.volume = 0.32;
  }

  get muted(): boolean {
    return this.silent;
  }

  set muted(value: boolean) {
    this.silent = value;
    this.syncMusic();
  }

  startStageMusic(): void {
    if (!this.remaining.length) this.remaining = [...TRACKS];
    const choices = this.remaining.filter(track => track !== this.lastTrack);
    const next = choices[Math.floor(Math.random() * choices.length)];
    this.remaining.splice(this.remaining.indexOf(next), 1);
    this.lastTrack = next;
    this.music.src = import.meta.env.BASE_URL + 'audio/' + next + '.mp3';
    this.setMusic(true);
  }

  setMusic(active: boolean): void {
    this.musicActive = active;
    this.syncMusic();
  }

  syncMusic(): void {
    if (this.musicActive && !this.muted && !document.hidden) {
      void this.music.play().catch(() => {});
    } else {
      this.music.pause();
    }
  }

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  resume(): void {
    const ac = this.ensure();
    if (ac && ac.state === 'suspended') void ac.resume();
  }

  tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.08, delay = 0): void {
    if (this.muted) return;
    const ac = this.ensure();
    if (!ac) return;
    if (ac.state === 'suspended') void ac.resume();
    const t0 = ac.currentTime + delay;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.04);
  }

  judge(rank: string): void {
    if (rank === 'perfect') {
      this.tone(880, 0.12, 'triangle', 0.09);
      this.tone(1320, 0.16, 'triangle', 0.07, 0.09);
    } else if (rank === 'great') {
      this.tone(720, 0.13, 'triangle', 0.08);
    } else if (rank === 'good') {
      this.tone(540, 0.13, 'triangle', 0.07);
    } else {
      this.tone(200, 0.2, 'sawtooth', 0.05);
    }
  }

  creamTick(amount: number): void {
    this.tone(520 + Math.min(amount, 1.5) * 160, 0.045, 'sine', 0.028);
  }
}
