const STORAGE_KEY = 'autospf_notif_sound';

export function isNotificationSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(STORAGE_KEY) !== 'off';
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
}

/** Short two-tone chime for booking approval alerts (no audio file required). */
export async function playBookingApprovalAlert(): Promise<void> {
  if (!isNotificationSoundEnabled()) return;
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;
    const tone = (freq: number, start: number, duration: number, peak = 0.09) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration + 0.02);
    };

    tone(880, now, 0.14);
    tone(1174.66, now + 0.16, 0.22);

    window.setTimeout(() => {
      void ctx.close();
    }, 600);
  } catch {
    // Browser may block audio until a user gesture — safe to ignore.
  }
}
