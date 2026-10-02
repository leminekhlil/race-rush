import { settingsStore } from '../../state/settings';
import { MusicPlayer } from './MusicPlayer';

/**
 * Race announcer and rival radio chatter through the browser's speech synthesis (French voice when available).
 * Lines are queued with priorities and rate-limited so the voice never talks over itself; the music is ducked
 * while a line is spoken. Silently disabled when speech synthesis is unavailable.
 */

type Priority = 0 | 1 | 2;

interface Line {
  text: string;
  priority: Priority;
  pitch: number;
  rate: number;
}

const RIVAL_TAUNTS = [
  'Pas si vite !',
  'Tu ne me rattraperas pas !',
  'À plus tard !',
  'Regarde bien mes feux arrière !',
  'Trop lent !',
];

const RIVAL_RESPECT = ['Joli dépassement…', 'Hé, pas mal !', 'Je vais te reprendre !', 'Tu as de la chance cette fois.'];

class AnnouncerImpl {
  private voice: SpeechSynthesisVoice | null = null;
  private speaking = false;
  private queue: Line[] = [];
  private lastRival = 0;

  constructor() {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      this.voice = voices.find((v) => /^fr(-|_)FR/i.test(v.lang)) ?? voices.find((v) => /^fr/i.test(v.lang)) ?? null;
    };
    pick();
    window.speechSynthesis.addEventListener?.('voiceschanged', pick);
  }

  private get enabled(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && settingsStore.get().announcer && settingsStore.get().sfxVolume > 0.02;
  }

  say(text: string, priority: Priority = 1, pitch = 1, rate = 1.08): void {
    if (!this.enabled) return;
    // A higher-priority line interrupts lower ones (e.g. countdown over chatter).
    if (priority === 2) {
      this.queue = [];
      window.speechSynthesis.cancel();
      this.speaking = false;
    }
    if (this.queue.length > 2) this.queue = this.queue.filter((l) => l.priority >= priority);
    this.queue.push({ text, priority, pitch, rate });
    this.pump();
  }

  private pump(): void {
    if (this.speaking) return;
    const line = this.queue.shift();
    if (!line) {
      MusicPlayer.setDuck(1);
      return;
    }
    const u = new SpeechSynthesisUtterance(line.text);
    u.lang = this.voice?.lang ?? 'fr-FR';
    if (this.voice) u.voice = this.voice;
    u.pitch = line.pitch;
    u.rate = line.rate;
    u.volume = Math.min(1, settingsStore.get().sfxVolume * settingsStore.get().masterVolume * 1.2);
    this.speaking = true;
    MusicPlayer.setDuck(0.55);
    const done = () => {
      this.speaking = false;
      this.pump();
    };
    u.onend = done;
    u.onerror = done;
    try {
      window.speechSynthesis.speak(u);
    } catch {
      done();
    }
    // Safety: some engines never fire onend.
    window.setTimeout(() => this.speaking && done(), 4000);
  }

  /* ---- race lines ---- */

  countdown(n: number | 'GO'): void {
    if (n === 'GO') this.say('Partez !', 2, 1.1, 1.15);
    else this.say(['', 'Un', 'Deux', 'Trois'][n] ?? String(n), 2, 1, 1.2);
  }

  lap(lap: number, laps: number): void {
    if (lap === laps) this.say('Dernier tour !', 1, 1.05);
    else this.say(`Tour ${lap}`, 1);
  }

  bestLap(): void {
    this.say('Meilleur tour !', 0);
  }

  lead(): void {
    this.say('Tu passes en tête !', 1, 1.05);
  }

  finish(position: number): void {
    if (position === 1) this.say('Victoire ! Quelle course !', 2, 1.08);
    else this.say(`Arrivée ! ${position === 2 ? 'Deuxième' : position === 3 ? 'Troisième' : `${position}e`} place.`, 2);
  }

  /** Rival radio line when the player overtakes (respect) or gets overtaken (taunt). Rate-limited. */
  rival(name: string, overtookPlayer: boolean, now: number): string | null {
    if (now - this.lastRival < 9000 || Math.random() < 0.35) return null;
    this.lastRival = now;
    const list = overtookPlayer ? RIVAL_TAUNTS : RIVAL_RESPECT;
    const text = list[Math.floor(Math.random() * list.length)];
    this.say(text, 0, 0.8 + Math.random() * 0.5, 1.15);
    return `${name} : ${text}`;
  }
}

export const Announcer = new AnnouncerImpl();
