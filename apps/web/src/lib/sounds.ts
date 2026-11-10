// Sonidos y vibración (mejora 4). Sonidos generados con WebAudio
// (pitidos), sin archivos de audio. Sonidos y vibración DESACTIVADOS
// por defecto (doc 04 D12); se respetan prefers-reduced-motion.
// Las preferencias viven en localStorage (elreto.prefs).
import { getPrefs, prefersReducedMotion, setPrefs } from './session';

export function soundsEnabled(): boolean {
  return getPrefs().sounds === true;
}

export function vibrationEnabled(): boolean {
  return getPrefs().vibration === true;
}

export function setSoundsEnabled(on: boolean): void {
  setPrefs({ sounds: on });
}

export function setVibrationEnabled(on: boolean): void {
  setPrefs({ vibration: on });
}

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

function beep(frequency: number, startAt: number, duration: number): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.12, ctx.currentTime + startAt);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime + startAt);
  osc.stop(ctx.currentTime + startAt + duration);
}

export type SoundKind = 'countdown' | 'move' | 'win' | 'lose';

/** Reproduce un sonido solo si está activado y no hay movimiento reducido. */
export function playSound(kind: SoundKind): void {
  if (!soundsEnabled() || prefersReducedMotion()) return;
  try {
    switch (kind) {
      case 'countdown':
        beep(660, 0, 0.12);
        break;
      case 'move':
        beep(440, 0, 0.15);
        beep(880, 0.05, 0.12);
        break;
      case 'win':
        beep(523, 0, 0.15);
        beep(659, 0.12, 0.15);
        beep(784, 0.24, 0.3);
        break;
      case 'lose':
        beep(392, 0, 0.2);
        beep(311, 0.15, 0.3);
        break;
    }
  } catch {
    // El audio no debe romper nunca el juego.
  }
}

/** Vibración al ganar o perder, solo si está activada. */
export function vibrate(pattern: number | number[]): void {
  if (!vibrationEnabled() || prefersReducedMotion()) return;
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {
    // La vibración no debe romper nunca el juego.
  }
}

export function vibrateWin(): void {
  vibrate([60, 40, 60]);
}

export function vibrateLose(): void {
  vibrate(120);
}
