/** The browser's default audio input is the phone mic when no accessory is connected. */
export async function openMicrophone(devices: Pick<MediaDevices, 'getUserMedia'>): Promise<MediaStream> {
  try {
    return await devices.getUserMedia({
      audio: { echoCancellation: { ideal: true }, noiseSuppression: { ideal: true }, autoGainControl: { ideal: true } },
      video: false,
    });
  } catch (error) {
    // Some mobile browsers cannot apply audio processing; still request the default mic.
    if ((error as DOMException)?.name !== 'OverconstrainedError') throw error;
    return devices.getUserMedia({ audio: true, video: false });
  }
}
