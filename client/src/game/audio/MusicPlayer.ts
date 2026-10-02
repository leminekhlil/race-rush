import { createStore } from '../../state/store';
import { settingsStore } from '../../state/settings';
import { AudioEngine } from './AudioEngine';

/**
 * Original soundtrack, synthesised live with Web Audio (no downloads, no licences): five tracks in different
 * moods. A look-ahead scheduler queues 16th-note steps; each track is a 16-bar loop (intro, drive, break) with
 * drums, bass, pad, arpeggio and a lead motif generated deterministically from the track seed.
 */

type Style = 'synthwave' | 'edm' | 'chill' | 'funk' | 'dark';

export interface MusicTrack {
  id: string;
  title: string;
  mood: string;
  bpm: number;
  /** MIDI note of the key root. */
  root: number;
  minor: boolean;
  /** Chord roots as scale degrees (0-based), one per bar, cycled. */
  progression: number[];
  style: Style;
  seed: number;
}

export const MUSIC_TRACKS: MusicTrack[] = [
  { id: 'neon-boulevard', title: 'Neon Boulevard', mood: 'Synthwave', bpm: 100, root: 57, minor: true, progression: [0, 5, 2, 6], style: 'synthwave', seed: 11 },
  { id: 'turbo-rush', title: 'Turbo Rush', mood: 'Électro', bpm: 128, root: 54, minor: true, progression: [0, 5, 2, 6], style: 'edm', seed: 23 },
  { id: 'palm-breeze', title: 'Palm Breeze', mood: 'Chill', bpm: 94, root: 62, minor: false, progression: [0, 5, 3, 4], style: 'chill', seed: 37 },
  { id: 'desert-heat', title: 'Desert Heat', mood: 'Funk', bpm: 116, root: 52, minor: true, progression: [0, 3, 5, 4], style: 'funk', seed: 41 },
  { id: 'midnight-run', title: 'Midnight Run', mood: 'Nuit', bpm: 110, root: 48, minor: true, progression: [0, 5, 2, 6], style: 'dark', seed: 53 },
];

export interface NowPlaying {
  trackId: string | null;
  playing: boolean;
}

export const musicStore = createStore<NowPlaying>({ trackId: null, playing: false });
if (typeof window !== 'undefined') (window as unknown as { __raceRushMusic: unknown }).__raceRushMusic = musicStore;

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const mtof = (m: number) => 440 * 2 ** ((m - 69) / 12);

const rngFrom = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

interface Patterns {
  kick: number[];
  snare: number[];
  hat: number[];
  open: number[];
  bass: number[];
  arp: number[];
  swing: number;
}

const PATTERNS: Record<Style, Patterns> = {
  synthwave: { kick: [0, 8], snare: [4, 12], hat: [0, 2, 4, 6, 8, 10, 12, 14], open: [], bass: [0, 2, 4, 6, 8, 10, 12, 14], arp: [...Array(16).keys()], swing: 0 },
  edm: { kick: [0, 4, 8, 12], snare: [4, 12], hat: [1, 3, 5, 7, 9, 11, 13, 15], open: [2, 6, 10, 14], bass: [2, 3, 6, 7, 10, 11, 14, 15], arp: [0, 3, 6, 8, 11, 14], swing: 0 },
  chill: { kick: [0, 7, 10], snare: [4, 12], hat: [...Array(16).keys()], open: [], bass: [0, 3, 8, 11, 14], arp: [0, 2, 4, 6, 8, 10, 12, 14], swing: 0.12 },
  funk: { kick: [0, 3, 8, 10], snare: [4, 12, 15], hat: [...Array(16).keys()], open: [6, 14], bass: [0, 3, 5, 7, 8, 10, 13], arp: [2, 6, 10, 14], swing: 0.08 },
  dark: { kick: [0, 4, 8, 12, 14], snare: [12], hat: [2, 6, 10, 14], open: [], bass: [...Array(16).keys()], arp: [0, 3, 6, 9, 12], swing: 0 },
};

class MusicPlayerImpl {
  private track: MusicTrack | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private bus: GainNode | null = null;
  private delay: DelayNode | null = null;
  private lead: number[] = [];
  private duck = 1;
  private shuffleIndex = Math.floor(Math.random() * MUSIC_TRACKS.length);

  isPlaying(): boolean {
    return this.track !== null;
  }

  /** Applies the user's music setting (called on unlock and whenever settings change). */
  sync(): void {
    const pref = settingsStore.get().musicTrack;
    if (pref === 'off') {
      this.stop();
      return;
    }
    if (pref === 'shuffle') {
      if (!this.track) this.play(MUSIC_TRACKS[this.shuffleIndex % MUSIC_TRACKS.length].id);
      return;
    }
    if (this.track?.id !== pref) this.play(pref);
  }

  play(id: string): void {
    const ctx = AudioEngine.ensure();
    const out = AudioEngine.music;
    const track = MUSIC_TRACKS.find((t) => t.id === id);
    if (!ctx || !out || !track) return;
    this.stop(0.4);
    this.track = track;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.gain.setTargetAtTime(0.55 * this.duck, ctx.currentTime + 0.05, 0.6);
    // Tempo-synced feedback delay for arps and lead.
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = (60 / track.bpm) * 0.75;
    const fb = ctx.createGain();
    fb.gain.value = 0.32;
    const wet = ctx.createGain();
    wet.gain.value = 0.28;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 500;
    this.delay.connect(fb).connect(hp).connect(this.delay);
    this.delay.connect(wet).connect(this.bus);
    this.bus.connect(out);
    const r = rngFrom(track.seed);
    this.lead = Array.from({ length: 32 }, () => (r() < 0.35 ? -1 : Math.floor(r() * 6)));
    this.step = 0;
    this.nextTime = ctx.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
    musicStore.set({ trackId: track.id, playing: true });
  }

  next(dir = 1): void {
    const i = MUSIC_TRACKS.findIndex((t) => t.id === this.track?.id);
    const n = MUSIC_TRACKS[(i + dir + MUSIC_TRACKS.length) % MUSIC_TRACKS.length];
    this.shuffleIndex = MUSIC_TRACKS.indexOf(n);
    if (settingsStore.get().musicTrack !== 'shuffle') settingsStore.set({ musicTrack: n.id });
    else this.play(n.id);
  }

  stop(fade = 0.6): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    const ctx = AudioEngine.ctx;
    const bus = this.bus;
    if (ctx && bus) {
      bus.gain.setTargetAtTime(0, ctx.currentTime, fade / 3);
      window.setTimeout(() => bus.disconnect(), fade * 1000 + 200);
    }
    this.bus = null;
    this.track = null;
    musicStore.set({ trackId: null, playing: false });
  }

  /** Lowers the music under race action / voice (0..1). */
  setDuck(level: number): void {
    this.duck = level;
    const ctx = AudioEngine.ctx;
    if (ctx && this.bus) this.bus.gain.setTargetAtTime(0.55 * level, ctx.currentTime, 0.4);
  }

  private schedule(): void {
    const ctx = AudioEngine.ctx;
    const t = this.track;
    if (!ctx || !t || !this.bus) return;
    const sixteenth = 60 / t.bpm / 4;
    while (this.nextTime < ctx.currentTime + 0.15) {
      const swing = this.step % 2 === 1 ? PATTERNS[t.style].swing * sixteenth : 0;
      this.playStep(this.step, this.nextTime + swing, sixteenth);
      this.nextTime += sixteenth;
      this.step = (this.step + 1) % (16 * 16);
      // Shuffle: move to the next track after two full loops.
      if (this.step === 0 && settingsStore.get().musicTrack === 'shuffle') {
        this.loops = (this.loops + 1) % 2;
        if (this.loops === 0) {
          this.shuffleIndex++;
          window.setTimeout(() => this.play(MUSIC_TRACKS[this.shuffleIndex % MUSIC_TRACKS.length].id), 0);
          return;
        }
      }
    }
  }

  private loops = 0;

  private playStep(step: number, time: number, sixteenth: number): void {
    const t = this.track!;
    const p = PATTERNS[t.style];
    const bar = Math.floor(step / 16);
    const s = step % 16;
    // 16-bar form: 0–3 intro, 4–11 drive, 12–15 break.
    const intro = bar < 4;
    const brk = bar >= 12;
    const scale = t.minor ? MINOR : MAJOR;
    const degree = t.progression[bar % t.progression.length];
    const chordRoot = t.root + scale[degree % 7] + (degree >= 7 ? 12 : 0);
    const chord = [0, 2, 4].map((k) => t.root + scale[(degree + k) % 7] + Math.floor((degree + k) / 7) * 12);

    if (!brk && (!intro || bar >= 2)) {
      if (p.kick.includes(s)) this.kick(time);
      if (!intro && p.snare.includes(s)) this.snare(time, t.style === 'chill' ? 0.5 : 1);
    }
    if (p.hat.includes(s) && !(brk && s % 4 !== 0)) this.hat(time, t.style === 'chill' ? 0.5 : 0.8, 0.04);
    if (!intro && p.open.includes(s)) this.hat(time, 0.6, 0.22);
    if (!intro && !brk && p.bass.includes(s)) {
      const oct = t.style === 'funk' && s % 8 === 7 ? 12 : 0;
      this.bass(mtof(chordRoot - 24 + oct), time, sixteenth * (t.style === 'dark' ? 0.9 : 1.6));
    }
    if (s === 0) this.pad(chord.map((n) => mtof(n)), time, sixteenth * 16, brk ? 0.9 : 0.6);
    if ((bar >= 2 || brk) && p.arp.includes(s)) {
      const n = chord[s % 3] + (s % 6 >= 3 ? 12 : 0);
      this.pluck(mtof(n + 12), time, t.style === 'edm' ? 0.16 : 0.22);
    }
    // Lead motif during the drive section, on 8th notes.
    if (!intro && !brk && s % 2 === 0) {
      const idx = (bar % 2) * 8 + s / 2;
      const deg = this.lead[idx];
      if (deg >= 0) this.lead1(mtof(t.root + 12 + scale[(degree + deg) % 7] + (degree + deg >= 7 ? 12 : 0)), time, sixteenth * 1.8);
    }
  }

  /* ---------------------------------------------------------- instruments */

  private env(g: GainNode, time: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + attack + decay);
  }

  private kick(time: number) {
    const ctx = AudioEngine.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(150, time);
    o.frequency.exponentialRampToValueAtTime(45, time + 0.12);
    this.env(g, time, 0.9, 0.002, 0.32);
    o.connect(g).connect(this.bus!);
    o.start(time);
    o.stop(time + 0.4);
  }

  private snare(time: number, k: number) {
    const ctx = AudioEngine.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = AudioEngine.noise();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1900;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    this.env(g, time, 0.45 * k, 0.002, 0.18);
    n.connect(f).connect(g).connect(this.bus!);
    n.start(time, Math.random());
    n.stop(time + 0.25);
    const o = ctx.createOscillator();
    o.frequency.value = 185;
    const og = ctx.createGain();
    this.env(og, time, 0.25 * k, 0.002, 0.08);
    o.connect(og).connect(this.bus!);
    o.start(time);
    o.stop(time + 0.12);
  }

  private hat(time: number, k: number, decay: number) {
    const ctx = AudioEngine.ctx!;
    const n = ctx.createBufferSource();
    n.buffer = AudioEngine.noise();
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    const g = ctx.createGain();
    this.env(g, time, 0.12 * k, 0.001, decay);
    n.connect(f).connect(g).connect(this.bus!);
    n.start(time, Math.random());
    n.stop(time + decay + 0.05);
  }

  private bass(freq: number, time: number, dur: number) {
    const ctx = AudioEngine.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 4;
    f.frequency.setValueAtTime(900, time);
    f.frequency.exponentialRampToValueAtTime(180, time + dur);
    const g = ctx.createGain();
    this.env(g, time, 0.28, 0.005, dur);
    o.connect(f).connect(g).connect(this.bus!);
    o.start(time);
    o.stop(time + dur + 0.05);
  }

  private pad(freqs: number[], time: number, dur: number, k: number) {
    const ctx = AudioEngine.ctx!;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(0.06 * k, time + dur * 0.25);
    g.gain.setValueAtTime(0.06 * k, time + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur * 1.05);
    f.connect(g).connect(this.bus!);
    for (const fr of freqs)
      for (const det of [-7, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        o.detune.value = det;
        o.connect(f);
        o.start(time);
        o.stop(time + dur * 1.1);
      }
  }

  private pluck(freq: number, time: number, decay: number) {
    const ctx = AudioEngine.ctx!;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3200, time);
    f.frequency.exponentialRampToValueAtTime(500, time + decay);
    const g = ctx.createGain();
    this.env(g, time, 0.07, 0.003, decay);
    o.connect(f).connect(g);
    g.connect(this.bus!);
    if (this.delay) g.connect(this.delay);
    o.start(time);
    o.stop(time + decay + 0.05);
  }

  private lead1(freq: number, time: number, dur: number) {
    const ctx = AudioEngine.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vg = ctx.createGain();
    vg.gain.value = 6;
    vib.connect(vg).connect(o.detune);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2600;
    const g = ctx.createGain();
    this.env(g, time, 0.06, 0.02, dur);
    o.connect(f).connect(g);
    g.connect(this.bus!);
    if (this.delay) g.connect(this.delay);
    o.start(time);
    vib.start(time);
    o.stop(time + dur + 0.1);
    vib.stop(time + dur + 0.1);
  }
}

export const MusicPlayer = new MusicPlayerImpl();
