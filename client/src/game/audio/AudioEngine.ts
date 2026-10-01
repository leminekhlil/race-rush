import { clamp, type VehicleTuning } from '@race-rush/shared';
import { settingsStore } from '../../state/settings';

/**
 * Web Audio synthesis (no assets): engines, tires, boost, wind, impacts, UI.
 * The AudioContext is created lazily and resumed on the first user gesture (mobile autoplay rules).
 */
class AudioEngineImpl {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  ensure(): AudioContext | null {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor({ latencyHint: 'interactive' });
    } catch {
      return null;
    }
    this.master = this.ctx.createGain();
    this.master.gain.value = settingsStore.get().masterVolume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    settingsStore.subscribe(() => {
      if (this.master) this.master.gain.value = settingsStore.get().masterVolume;
    });
    return this.ctx;
  }

  noise(): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    if (!this.noiseBuffer) {
      const len = ctx.sampleRate * 2;
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuffer;
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, freqEnd?: number): void {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBurst(dur: number, gain: number, filter: BiquadFilterType, freq: number, q = 1, freqEnd?: number): void {
    const ctx = this.ensure();
    const buf = this.noise();
    if (!ctx || !this.master || !buf) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  click(): void {
    this.tone(880, 0.06, 'triangle', 0.12, 1320);
  }

  confirm(): void {
    this.tone(660, 0.09, 'triangle', 0.14, 990);
    setTimeout(() => this.tone(990, 0.12, 'triangle', 0.14, 1480), 70);
  }

  countdown(go: boolean): void {
    if (go) {
      this.tone(880, 0.6, 'square', 0.16);
      this.tone(1760, 0.6, 'sine', 0.1);
    } else this.tone(440, 0.25, 'square', 0.14);
  }

  impact(strength: number): void {
    const k = clamp(strength / 20, 0.15, 1);
    this.noiseBurst(0.25 + k * 0.2, 0.5 * k, 'lowpass', 900 + k * 1600, 0.7, 200);
    this.tone(90 + k * 40, 0.25, 'sine', 0.5 * k, 40);
  }

  boost(): void {
    this.noiseBurst(0.9, 0.35, 'bandpass', 600, 0.8, 3200);
  }

  land(strength: number): void {
    const k = clamp(strength / 12, 0.1, 1);
    this.tone(70, 0.2, 'sine', 0.45 * k, 35);
    this.noiseBurst(0.18, 0.2 * k, 'lowpass', 500, 0.7);
  }

  checkpoint(): void {
    this.tone(1046, 0.1, 'sine', 0.1, 1568);
  }

  lap(): void {
    [784, 988, 1175].forEach((f, i) => setTimeout(() => this.tone(f, 0.18, 'triangle', 0.13), i * 90));
  }

  finish(): void {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 'triangle', 0.15), i * 120));
  }
}

export const AudioEngine = new AudioEngineImpl();

/**
 * Continuous engine + tires + wind voice for one vehicle. Remote vehicles use a spatial panner.
 */
export class VehicleAudio {
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private tireGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private panner: PannerNode | null = null;
  private out: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];

  constructor(
    private readonly tuning: VehicleTuning,
    private readonly spatial: boolean,
    private readonly volume = 1,
  ) {
    const ctx = AudioEngine.ensure();
    const master = AudioEngine.master;
    const noise = AudioEngine.noise();
    if (!ctx || !master || !noise) return;
    this.out = ctx.createGain();
    this.out.gain.value = volume;
    if (spatial) {
      this.panner = ctx.createPanner();
      this.panner.panningModel = 'equalpower';
      this.panner.distanceModel = 'inverse';
      this.panner.refDistance = 6;
      this.panner.rolloffFactor = 1.4;
      this.out.connect(this.panner).connect(master);
    } else this.out.connect(master);

    const tone = tuning.audio.tone;
    this.osc1 = ctx.createOscillator();
    this.osc1.type = tone === 'buzz' ? 'square' : 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = tone === 'deep' ? 'sawtooth' : 'square';
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = tone === 'deep' ? 6 : 3;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const g2 = ctx.createGain();
    g2.gain.value = tone === 'deep' ? 0.7 : 0.35;
    this.osc1.connect(this.filter);
    this.osc2.connect(g2).connect(this.filter);
    this.filter.connect(this.engineGain).connect(this.out);

    const tire = ctx.createBufferSource();
    tire.buffer = noise;
    tire.loop = true;
    const tf = ctx.createBiquadFilter();
    tf.type = 'bandpass';
    tf.frequency.value = 1700;
    tf.Q.value = 3;
    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0;
    tire.connect(tf).connect(this.tireGain).connect(this.out);

    const wind = ctx.createBufferSource();
    wind.buffer = noise;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 500;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    if (!spatial) wind.connect(wf).connect(this.windGain).connect(this.out);

    const t = ctx.currentTime;
    this.osc1.start(t);
    this.osc2.start(t);
    tire.start(t, Math.random());
    if (!spatial) wind.start(t, Math.random());
    this.sources = spatial ? [this.osc1, this.osc2, tire] : [this.osc1, this.osc2, tire, wind];
  }

  update(p: { rpm: number; throttle: number; speed: number; drifting: boolean; boosting: boolean; offroad: boolean; x?: number; y?: number; z?: number }): void {
    const ctx = AudioEngine.ctx;
    if (!ctx || !this.osc1 || !this.osc2 || !this.filter || !this.engineGain || !this.tireGain) return;
    const t = ctx.currentTime;
    const a = this.tuning.audio;
    const hz = a.idleHz + (a.maxHz - a.idleHz) * p.rpm + (p.boosting ? 25 : 0);
    this.osc1.frequency.setTargetAtTime(hz, t, 0.03);
    this.osc2.frequency.setTargetAtTime(hz * (a.tone === 'deep' ? 0.5 : 1.005), t, 0.03);
    this.filter.frequency.setTargetAtTime(300 + p.rpm * 2400 + p.throttle * 900 + (p.boosting ? 1200 : 0), t, 0.05);
    this.engineGain.gain.setTargetAtTime((0.06 + p.throttle * 0.07 + p.rpm * 0.05) * (this.spatial ? 1.6 : 1), t, 0.05);
    const tire = p.drifting ? 0.16 : p.offroad && p.speed > 8 ? 0.05 : 0;
    this.tireGain.gain.setTargetAtTime(tire, t, 0.06);
    if (this.windGain) this.windGain.gain.setTargetAtTime(clamp((p.speed / 70) ** 2, 0, 1) * 0.18, t, 0.2);
    if (this.panner && p.x !== undefined) {
      this.panner.positionX.setTargetAtTime(p.x, t, 0.05);
      this.panner.positionY.setTargetAtTime(p.y ?? 0, t, 0.05);
      this.panner.positionZ.setTargetAtTime(p.z ?? 0, t, 0.05);
    }
  }

  static setListener(x: number, y: number, z: number, fx: number, fz: number): void {
    const ctx = AudioEngine.ctx;
    if (!ctx) return;
    const l = ctx.listener;
    if (l.positionX) {
      const t = ctx.currentTime;
      l.positionX.setTargetAtTime(x, t, 0.05);
      l.positionY.setTargetAtTime(y, t, 0.05);
      l.positionZ.setTargetAtTime(z, t, 0.05);
      // WebAudio is right-handed; Babylon is left-handed: flip Z.
      l.forwardX.setTargetAtTime(fx, t, 0.05);
      l.forwardY.setTargetAtTime(0, t, 0.05);
      l.forwardZ.setTargetAtTime(-fz, t, 0.05);
    }
  }

  mute(): void {
    const ctx = AudioEngine.ctx;
    if (!ctx || !this.engineGain) return;
    this.engineGain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    this.tireGain?.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    this.windGain?.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
  }

  dispose(): void {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.out?.disconnect();
    this.sources = [];
  }
}

export const haptic = (pattern: number | number[]): void => {
  if (!settingsStore.get().haptics) return;
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (activation && !activation.hasBeenActive) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported: silent fallback */
  }
};
