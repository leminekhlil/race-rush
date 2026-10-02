import { clamp, type VehicleTuning } from '@race-rush/shared';
import { settingsStore } from '../../state/settings';

/**
 * Web Audio mixer: master → (sfx bus, music bus, voice bus) → compressor.
 * Engines, skids and impacts use recorded CC0 samples (Kenney Racing Kit, see docs/CREDITS.md) layered with
 * light synthesis; UI blips, boost whoosh, wind and the music are synthesised (no extra downloads).
 * The AudioContext is created lazily and resumed on the first user gesture (mobile autoplay rules).
 */

type SampleName = 'engine' | 'engine-motorcycle' | 'skid' | 'impact';
const SAMPLES: SampleName[] = ['engine', 'engine-motorcycle', 'skid', 'impact'];

class AudioEngineImpl {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  sfx: GainNode | null = null;
  music: GainNode | null = null;
  voice: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private buffers = new Map<SampleName, AudioBuffer>();
  private loading: Promise<void> | null = null;
  private unlockListeners = new Set<() => void>();

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
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.sfx = ctx.createGain();
    this.music = ctx.createGain();
    this.voice = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    this.sfx.connect(this.master);
    this.music.connect(this.master);
    this.voice.connect(this.master);
    this.master.connect(comp).connect(ctx.destination);
    const apply = () => {
      const s = settingsStore.get();
      this.master!.gain.value = s.masterVolume;
      this.sfx!.gain.value = s.sfxVolume;
      this.music!.gain.value = s.musicVolume;
      this.voice!.gain.value = Math.min(1, s.sfxVolume * 1.1);
    };
    apply();
    settingsStore.subscribe(apply);
    ctx.addEventListener?.('statechange', () => {
      if (ctx.state === 'running') this.unlockListeners.forEach((f) => f());
    });
    void this.preload();
    return ctx;
  }

  /** Called when the context starts running (after the first user gesture). */
  onUnlock(f: () => void): () => void {
    this.unlockListeners.add(f);
    if (this.ctx?.state === 'running') f();
    return () => this.unlockListeners.delete(f);
  }

  /** Decodes the CC0 samples (OGG, AAC fallback for browsers without Vorbis). */
  preload(): Promise<void> {
    if (this.loading) return this.loading;
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve();
    const load = async (name: SampleName) => {
      for (const ext of ['ogg', 'm4a']) {
        try {
          const r = await fetch(new URL(`audio/${name}.${ext}`, document.baseURI));
          if (!r.ok) continue;
          const buf = await ctx.decodeAudioData(await r.arrayBuffer());
          this.buffers.set(name, buf);
          return;
        } catch {
          /* try the next codec */
        }
      }
    };
    this.loading = Promise.all(SAMPLES.map(load)).then(() => undefined);
    return this.loading;
  }

  sample(name: SampleName): AudioBuffer | null {
    return this.buffers.get(name) ?? null;
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
    if (!ctx || !this.sfx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noiseBurst(dur: number, gain: number, filter: BiquadFilterType, freq: number, q = 1, freqEnd?: number): void {
    const ctx = this.ensure();
    const buf = this.noise();
    if (!ctx || !this.sfx || !buf) return;
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
    src.connect(f).connect(g).connect(this.sfx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  private oneShot(name: SampleName, gain: number, rate = 1): void {
    const ctx = this.ensure();
    const buf = this.sample(name);
    if (!ctx || !this.sfx || !buf) return;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.sfx);
    src.start();
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
    if (this.sample('impact')) this.oneShot('impact', 0.35 + 0.65 * k, 0.85 + Math.random() * 0.3);
    this.noiseBurst(0.2 + k * 0.2, 0.3 * k, 'lowpass', 900 + k * 1600, 0.7, 200);
    this.tone(90 + k * 40, 0.25, 'sine', 0.45 * k, 40);
  }

  boost(): void {
    this.noiseBurst(0.9, 0.35, 'bandpass', 600, 0.8, 3200);
    this.tone(180, 0.5, 'sawtooth', 0.06, 520);
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

export interface VehicleAudioInput {
  rpm: number;
  throttle: number;
  speed: number;
  drifting: boolean;
  boosting: boolean;
  offroad: boolean;
  /** Brake input 0..1 (squeal + skid at speed). */
  brake?: number;
  x?: number;
  y?: number;
  z?: number;
}

/**
 * Continuous engine + tyres + wind voice for one vehicle. The engine is the recorded loop pitched with RPM
 * (motorcycle loop for the bike, octave-down layer for the monster truck) over a filtered synth layer that adds
 * the character of each class. Remote vehicles use a spatial panner.
 */
export class VehicleAudio {
  private osc1: OscillatorNode | null = null;
  private osc2: OscillatorNode | null = null;
  private filter: BiquadFilterNode | null = null;
  private synthGain: GainNode | null = null;
  private loop: AudioBufferSourceNode | null = null;
  private loopSub: AudioBufferSourceNode | null = null;
  private loopGain: GainNode | null = null;
  private skid: AudioBufferSourceNode | null = null;
  private skidGain: GainNode | null = null;
  private tireGain: GainNode | null = null;
  private windGain: GainNode | null = null;
  private squealGain: GainNode | null = null;
  private squeal: OscillatorNode | null = null;
  private panner: PannerNode | null = null;
  private out: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];

  constructor(
    private readonly tuning: VehicleTuning,
    private readonly spatial: boolean,
    volume = 1,
  ) {
    const ctx = AudioEngine.ensure();
    const bus = AudioEngine.sfx;
    const noise = AudioEngine.noise();
    if (!ctx || !bus || !noise) return;
    this.out = ctx.createGain();
    this.out.gain.value = volume;
    if (spatial) {
      this.panner = ctx.createPanner();
      this.panner.panningModel = 'equalpower';
      this.panner.distanceModel = 'inverse';
      this.panner.refDistance = 6;
      this.panner.rolloffFactor = 1.4;
      this.out.connect(this.panner).connect(bus);
    } else this.out.connect(bus);
    const t = ctx.currentTime;
    const tone = tuning.audio.tone;

    // Recorded engine loop (+ octave-down layer for the deep monster truck).
    const engineBuf = AudioEngine.sample(tone === 'buzz' ? 'engine-motorcycle' : 'engine');
    if (engineBuf) {
      this.loopGain = ctx.createGain();
      this.loopGain.gain.value = 0;
      this.loop = ctx.createBufferSource();
      this.loop.buffer = engineBuf;
      this.loop.loop = true;
      this.loop.connect(this.loopGain).connect(this.out);
      this.loop.start(t, Math.random() * engineBuf.duration);
      this.sources.push(this.loop);
      if (tone === 'deep') {
        this.loopSub = ctx.createBufferSource();
        this.loopSub.buffer = engineBuf;
        this.loopSub.loop = true;
        const sg = ctx.createGain();
        sg.gain.value = 0.8;
        this.loopSub.connect(sg).connect(this.loopGain);
        this.loopSub.start(t, Math.random() * engineBuf.duration);
        this.sources.push(this.loopSub);
      }
    }

    // Synth layer (main voice when samples are unavailable).
    this.osc1 = ctx.createOscillator();
    this.osc1.type = tone === 'buzz' ? 'square' : 'sawtooth';
    this.osc2 = ctx.createOscillator();
    this.osc2.type = tone === 'deep' ? 'sawtooth' : 'square';
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = tone === 'deep' ? 6 : 3;
    this.synthGain = ctx.createGain();
    this.synthGain.gain.value = 0;
    const g2 = ctx.createGain();
    g2.gain.value = tone === 'deep' ? 0.7 : 0.35;
    this.osc1.connect(this.filter);
    this.osc2.connect(g2).connect(this.filter);
    this.filter.connect(this.synthGain).connect(this.out);
    this.osc1.start(t);
    this.osc2.start(t);
    this.sources.push(this.osc1, this.osc2);

    // Tyre skid: recorded loop, synth noise fallback.
    const skidBuf = AudioEngine.sample('skid');
    this.skidGain = ctx.createGain();
    this.skidGain.gain.value = 0;
    this.skid = ctx.createBufferSource();
    if (skidBuf) {
      this.skid.buffer = skidBuf;
    } else {
      this.skid.buffer = noise;
      const tf = ctx.createBiquadFilter();
      tf.type = 'bandpass';
      tf.frequency.value = 1700;
      tf.Q.value = 3;
      this.skid.connect(tf).connect(this.skidGain);
    }
    this.skid.loop = true;
    if (skidBuf) this.skid.connect(this.skidGain);
    this.skidGain.connect(this.out);
    this.skid.start(t, Math.random());
    this.sources.push(this.skid);

    // Off-road rumble (filtered noise).
    const rumble = ctx.createBufferSource();
    rumble.buffer = noise;
    rumble.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 320;
    this.tireGain = ctx.createGain();
    this.tireGain.gain.value = 0;
    rumble.connect(rf).connect(this.tireGain).connect(this.out);
    rumble.start(t, Math.random());
    this.sources.push(rumble);

    // Brake squeal (narrow sine, only audible when braking hard at speed).
    this.squeal = ctx.createOscillator();
    this.squeal.type = 'sine';
    this.squeal.frequency.value = 2400 + Math.random() * 600;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    this.squeal.connect(this.squealGain).connect(this.out);
    this.squeal.start(t);
    this.sources.push(this.squeal);

    // Wind for the player only.
    if (!spatial) {
      const wind = ctx.createBufferSource();
      wind.buffer = noise;
      wind.loop = true;
      const wf = ctx.createBiquadFilter();
      wf.type = 'lowpass';
      wf.frequency.value = 500;
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      wind.connect(wf).connect(this.windGain).connect(this.out);
      wind.start(t, Math.random());
      this.sources.push(wind);
    }
  }

  update(p: VehicleAudioInput): void {
    const ctx = AudioEngine.ctx;
    if (!ctx || !this.osc1 || !this.osc2 || !this.filter || !this.synthGain) return;
    const t = ctx.currentTime;
    const a = this.tuning.audio;
    const rpm = clamp(p.rpm, 0, 1.15);
    const hz = a.idleHz + (a.maxHz - a.idleHz) * rpm + (p.boosting ? 25 : 0);
    const sampled = !!this.loop;
    this.osc1.frequency.setTargetAtTime(hz, t, 0.03);
    this.osc2.frequency.setTargetAtTime(hz * (a.tone === 'deep' ? 0.5 : 1.005), t, 0.03);
    this.filter.frequency.setTargetAtTime(300 + rpm * 2400 + p.throttle * 900 + (p.boosting ? 1200 : 0), t, 0.05);
    const load = 0.06 + p.throttle * 0.07 + rpm * 0.05;
    this.synthGain.gain.setTargetAtTime(load * (sampled ? 0.35 : 1) * (this.spatial ? 1.6 : 1), t, 0.05);
    if (this.loop && this.loopGain) {
      const base = a.tone === 'deep' ? 0.55 : a.tone === 'buzz' ? 0.75 : 0.65;
      const rate = base + rpm * (a.tone === 'deep' ? 0.9 : 1.35) + (p.boosting ? 0.12 : 0);
      this.loop.playbackRate.setTargetAtTime(rate, t, 0.04);
      this.loopSub?.playbackRate.setTargetAtTime(rate * 0.5, t, 0.04);
      this.loopGain.gain.setTargetAtTime((0.22 + p.throttle * 0.35 + rpm * 0.2) * (this.spatial ? 1.4 : 1), t, 0.05);
    }
    const braking = (p.brake ?? 0) > 0.3 && p.speed > 12;
    const skid = p.drifting ? 0.55 : braking ? 0.32 : 0;
    this.skidGain?.gain.setTargetAtTime(skid, t, 0.05);
    if (this.skid) this.skid.playbackRate.setTargetAtTime(0.85 + clamp(p.speed / 70, 0, 0.4), t, 0.1);
    this.tireGain?.gain.setTargetAtTime(p.offroad && p.speed > 8 ? 0.35 : 0, t, 0.08);
    this.squealGain?.gain.setTargetAtTime(braking && p.speed > 22 ? 0.025 : 0, t, 0.06);
    this.windGain?.gain.setTargetAtTime(clamp((p.speed / 70) ** 2, 0, 1) * 0.16, t, 0.2);
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
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const g of [this.synthGain, this.loopGain, this.skidGain, this.tireGain, this.windGain, this.squealGain]) g?.gain.setTargetAtTime(0, t, 0.1);
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
