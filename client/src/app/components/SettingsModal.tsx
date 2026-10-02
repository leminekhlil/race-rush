import { useState } from 'react';
import { useStore } from '../../state/store';
import { settingsStore, type QualityProfile } from '../../state/settings';
import { appStore } from '../../state/appStore';
import { api } from '../../net/api';
import { actions } from '../actions';
import { Button, Panel, SectionTitle } from './ui';
import { getEngineHost } from '../../game/engine/EngineHost';
import { MUSIC_TRACKS } from '../../game/audio/MusicPlayer';
import { AudioEngine } from '../../game/audio/AudioEngine';
import { SIGNATURE, SUPPORT_EMAIL, SUPPORT_MAILTO } from '../brand';

const QUALITIES: { id: QualityProfile; label: string; hint: string }[] = [
  { id: 'auto', label: 'AUTO', hint: 'Adapté à ton appareil' },
  { id: 'eco', label: 'ECO', hint: 'Batterie / petits mobiles' },
  { id: 'standard', label: 'STANDARD', hint: 'Équilibré' },
  { id: 'high', label: 'HIGH', hint: 'Ombres, glow, détails' },
];

const Slider = ({ label, value, onChange, testId }: { label: string; value: number; onChange: (v: number) => void; testId?: string }) => (
  <label className="flex items-center justify-between gap-3 py-1">
    <span className="font-semibold text-white/85">{label}</span>
    <input
      type="range"
      min={0}
      max={1}
      step={0.05}
      value={value}
      data-testid={testId}
      aria-label={label}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-40 accent-gold-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-volt-400"
    />
  </label>
);

const Toggle = ({ label, checked, onChange, testId }: { label: string; checked: boolean; onChange: (v: boolean) => void; testId?: string }) => (
  <label className="flex cursor-pointer items-center justify-between gap-3 py-1.5">
    <span className="font-semibold text-white/85">{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      data-testid={testId}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition-colors ${checked ? 'bg-gold-500' : 'bg-night-700'}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-6' : 'left-1'}`} />
    </button>
  </label>
);

export const SettingsModal = ({ onClose }: { onClose: () => void }) => {
  const s = useStore(settingsStore, (x) => x);
  const profile = useStore(appStore, (x) => x.profile);
  const [name, setName] = useState(profile?.name ?? s.playerName);
  const resolved = getEngineHost().quality.name;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-night-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Paramètres" data-testid="settings-modal">
      <Panel className="scroll-y max-h-full w-[min(94vw,520px)] p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl italic">PARAMÈTRES</h2>
          <button type="button" aria-label="Fermer" onClick={onClose} className="h-10 w-10 rounded-xl bg-night-950/60 text-xl active:scale-90">
            ✕
          </button>
        </div>

        <SectionTitle className="mt-4">Qualité graphique</SectionTitle>
        <div className="grid grid-cols-4 gap-1.5">
          {QUALITIES.map((q) => (
            <button
              key={q.id}
              type="button"
              aria-pressed={s.quality === q.id}
              data-testid={`quality-${q.id}`}
              onClick={() => settingsStore.set({ quality: q.id })}
              className={`rounded-xl px-1 py-2 text-center transition-all active:scale-95 ${s.quality === q.id ? 'bg-volt-500 shadow-lg shadow-volt-500/30' : 'bg-night-950/55 hover:bg-night-800'}`}
            >
              <div className="font-display text-sm">{q.label}</div>
              <div className="text-[10px] leading-tight text-white/60">{q.hint}</div>
            </button>
          ))}
        </div>
        <div className="mt-1 text-xs text-white/50">Profil actif : {resolved.toUpperCase()}</div>

        <SectionTitle className="mt-4">Conduite & confort</SectionTitle>
        <Toggle label="Accélération automatique (mobile)" checked={s.autoAccelerate} onChange={(v) => settingsStore.set({ autoAccelerate: v })} testId="toggle-autoaccel" />
        <Toggle label="Vibrations" checked={s.haptics} onChange={(v) => settingsStore.set({ haptics: v })} />
        <Toggle label="Afficher les FPS" checked={s.showFps} onChange={(v) => settingsStore.set({ showFps: v })} />
        <SectionTitle className="mt-4">Ambiance</SectionTitle>
        <Toggle label="Ville de nuit (néons, fenêtres éclairées)" checked={s.timeOfDay === 'night'} onChange={(v) => settingsStore.set({ timeOfDay: v ? 'night' : 'day' })} testId="toggle-night" />
        <Toggle label="Voix de l'annonceur et des rivaux" checked={s.announcer} onChange={(v) => settingsStore.set({ announcer: v })} testId="toggle-announcer" />

        <SectionTitle className="mt-4">Son & musique</SectionTitle>
        <Toggle label="Couper tout le son" checked={s.muted} onChange={(v) => settingsStore.set({ muted: v })} testId="toggle-mute" />
        <Slider label="Volume général" value={s.masterVolume} onChange={(v) => settingsStore.set({ masterVolume: v })} testId="vol-master" />
        <Slider label="Moteurs" value={s.engineVolume} onChange={(v) => settingsStore.set({ engineVolume: v })} testId="vol-engine" />
        <Slider label="Effets (freins, chocs, boost…)" value={s.sfxVolume} onChange={(v) => settingsStore.set({ sfxVolume: v })} testId="vol-sfx" />
        <Slider label="Musique" value={s.musicVolume} onChange={(v) => settingsStore.set({ musicVolume: v })} testId="vol-music" />
        <Slider label="Chat vocal" value={s.voiceVolume} onChange={(v) => settingsStore.set({ voiceVolume: v })} testId="vol-voice" />
        <div className="mt-1 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Musique de fond" data-testid="music-list">
          {[{ id: 'shuffle', title: 'Aléatoire', mood: 'Toute la playlist' }, ...MUSIC_TRACKS, { id: 'off', title: 'Aucune', mood: 'Silence' }].map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={s.musicTrack === t.id}
              data-testid={`music-${t.id}`}
              onClick={() => {
                AudioEngine.unlock();
                settingsStore.set({ musicTrack: t.id });
              }}
              className={`rounded-xl px-2 py-1.5 text-left transition-all active:scale-95 ${s.musicTrack === t.id ? 'bg-gold-500 text-night-950' : 'bg-night-950/55 hover:bg-night-800'}`}
            >
              <div className="text-sm font-bold">♪ {t.title}</div>
              <div className={`text-[11px] ${s.musicTrack === t.id ? 'text-night-950/70' : 'text-white/55'}`}>{t.mood}</div>
            </button>
          ))}
        </div>

        {profile && (
          <>
            <SectionTitle className="mt-4">Pilote</SectionTitle>
            <div className="flex gap-2">
              <input
                value={name}
                maxLength={16}
                aria-label="Pseudo"
                onChange={(e) => setName(e.target.value.replace(/[^\p{L}\p{N} _.-]/gu, ''))}
                className="min-w-0 flex-1 rounded-xl border border-white/15 bg-night-950/70 px-3 py-2 font-semibold focus:border-gold-400 focus:outline-none"
              />
              <Button size="sm" variant="volt" disabled={name.trim().length < 2 || name === profile.name} onClick={() => actions.garage(api.rename, name.trim())}>
                OK
              </Button>
            </div>
          </>
        )}

        <SectionTitle className="mt-4">Commandes</SectionTitle>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-white/70">
          <li>↑ / W — accélérer</li>
          <li>← → / A D — tourner</li>
          <li>↓ / S — frein / drift</li>
          <li>Espace / Shift — boost</li>
          <li>R — se replacer</li>
          <li>Échap — pause</li>
        </ul>
        <SectionTitle className="mt-4">Aide</SectionTitle>
        <p className="text-sm leading-relaxed text-white/75">
          En cas de problème, contactez :{' '}
          <a href={SUPPORT_MAILTO} className="font-bold text-gold-300 underline-offset-2 hover:underline" data-testid="support-email">
            {SUPPORT_EMAIL}
          </a>
        </p>
        <p className="mt-4 text-xs leading-relaxed text-white/45">{SIGNATURE}</p>
        <p className="mt-1 text-xs leading-relaxed text-white/40">Race Rush beta — par Zahra Khlil. v-MRU est une monnaie virtuelle de jeu, sans valeur monétaire. Crédits des assets : docs/CREDITS.md.</p>
      </Panel>
    </div>
  );
};
