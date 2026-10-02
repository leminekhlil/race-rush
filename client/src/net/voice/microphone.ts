/** Request the native permission immediately, with the simplest mobile-compatible constraints. */
export function openMicrophone(devices: Pick<MediaDevices, 'getUserMedia'>): Promise<MediaStream> {
  // Omit video entirely: some iOS WebKit versions reject even video:false.
  const permission = devices.getUserMedia({ audio: true });
  return permission.then((stream) => {
    const track = stream.getAudioTracks()[0];
    // Processing is optional and applied only after capture/permission succeeded.
    if (typeof track?.applyConstraints === 'function') {
      try {
        void track.applyConstraints({ echoCancellation: true, noiseSuppression: true, autoGainControl: true }).catch(() => undefined);
      } catch { /* Unsupported processing must never prevent an authorized mic from opening. */ }
    }
    return stream;
  });
}

export function microphoneError(error: unknown): { name: string; message: string } {
  const raw = typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : 'UnknownError';
  const name = /^[A-Za-z]{1,40}$/.test(raw) ? raw : 'UnknownError';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return { name, message: 'Accès micro bloqué. Sur iPhone : Réglages > Confidentialité et sécurité > Microphone, autorise ton navigateur. Vérifie aussi l’autorisation Microphone de ce site, puis retouche Micro.' };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return { name, message: 'Aucun micro disponible sur cet appareil.' };
  if (name === 'NotReadableError' || name === 'AbortError') return { name, message: 'Micro indisponible. Ferme les autres applications qui utilisent le micro, puis réessaie.' };
  if (name === 'InvalidStateError') return { name, message: 'Le navigateur ne peut pas démarrer la capture audio (InvalidStateError). Recharge le jeu, puis retouche Micro.' };
  return { name, message: `Le navigateur n’a pas ouvert le micro (${name}). Vérifie son accès au micro dans les réglages du téléphone. Sur iPhone, essaie aussi d’ouvrir racerush.pro.mr dans Safari.` };
}
