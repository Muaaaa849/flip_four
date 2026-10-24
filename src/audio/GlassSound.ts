// Web Audio で合成するガラスの効果音。

/** contact force event の力をこの値で割って音量にする（落とした玉が底に当たる力がおよそこの値） */
const FULL_FORCE = 2500;
const HIT_COOLDOWN = 0.04;
/** C6・E6・G6・C7 */
const CHIME_NOTES = [1046.5, 1318.51, 1567.98, 2093.0];

export class GlassSound {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastHit = new Map<number, number>();
  muted = false;

  /** pointerup の中で呼ぶ。最初の1回で AudioContext を作り、resume する */
  unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.out = this.ctx.createGain();
      this.out.connect(this.ctx.destination);
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') void this.ctx.resume();
  }

  get state(): AudioContextState | 'none' {
    return this.ctx?.state ?? 'none';
  }

  private ready(): { ctx: AudioContext; out: GainNode; noise: AudioBuffer } | null {
    if (this.muted || !this.ctx || !this.out || !this.noise || this.ctx.state !== 'running') return null;
    return { ctx: this.ctx, out: this.out, noise: this.noise };
  }

  /** ガラスの音色: 正弦波 f と 1.432f（音量比 1 : 0.5）を exponential で減衰させる */
  private tone(ctx: AudioContext, out: AudioNode, f: number, volume: number, start: number, decay: number) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    gain.connect(out);
    for (const [ratio, amp] of [
      [1, 1],
      [3150 / 2200, 0.5],
    ]) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.value = amp / 1.5;
      osc.connect(g).connect(gain);
      osc.start(start);
      osc.stop(start + decay + 0.02);
    }
  }

  /** コツッ。force は contact force event の力 */
  hit(marbleId: number, force: number) {
    const a = this.ready();
    if (!a) return;
    const { ctx, out, noise } = a;
    const now = ctx.currentTime;
    const last = this.lastHit.get(marbleId);
    if (last !== undefined && now - last < HIT_COOLDOWN) return;
    this.lastHit.set(marbleId, now);

    const volume = Math.min(0.9, Math.max(0.05, (force / FULL_FORCE) * 0.9));
    const pitch = 1 + (Math.random() * 2 - 1) * 0.04;
    this.tone(ctx, out, 2200 * pitch, volume, now, 0.07);

    // 頭に 4ms の白色雑音（highpass 3000Hz）
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume * 0.6, now);
    g.gain.linearRampToValueAtTime(0, now + 0.004);
    src.connect(hp).connect(g).connect(out);
    src.start(now, Math.random() * 0.4, 0.005);
  }

  /** 反転: bandpass の中心を 400Hz → 1800Hz へ 0.42秒で動かす */
  flip() {
    const a = this.ready();
    if (!a) return;
    const { ctx, out, noise } = a;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(400, now);
    bp.frequency.exponentialRampToValueAtTime(1800, now + 0.42);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.25, now + 0.06);
    g.gain.setValueAtTime(0.25, now + 0.34);
    g.gain.linearRampToValueAtTime(0, now + 0.42);
    src.connect(bp).connect(g).connect(out);
    src.start(now);
    src.stop(now + 0.44);
  }

  /** 勝ち: ガラスのチャイムで C6・E6・G6・C7 を 90ms 間隔で鳴らす */
  win() {
    const a = this.ready();
    if (!a) return;
    const now = a.ctx.currentTime;
    CHIME_NOTES.forEach((f, i) => this.tone(a.ctx, a.out, f, 0.35, now + i * 0.09, 0.6));
  }
}
