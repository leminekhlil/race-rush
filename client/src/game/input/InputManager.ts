import { clamp, emptyInput, type VehicleInput } from '@race-rush/shared';
import { settingsStore } from '../../state/settings';

/** Touch buttons state written by the on-screen controls. */
export interface TouchState {
  left: boolean;
  right: boolean;
  boost: boolean;
  brake: boolean;
  throttle: boolean;
}

const KEYMAP: Record<string, keyof typeof keyState> = {
  ArrowUp: 'up',
  KeyW: 'up',
  KeyZ: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  KeyQ: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'boost',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
  KeyX: 'drift',
  KeyC: 'drift',
  ControlLeft: 'drift',
};

const keyState = { up: false, down: false, left: false, right: false, boost: false, drift: false };

/**
 * Unifies keyboard (arrows / WASD / ZQSD), touch buttons and Gamepad API into a VehicleInput.
 * "Brake/Drift" is a single control: at speed with steering it drifts, otherwise it brakes/reverses.
 */
export class InputManager {
  readonly touch: TouchState = { left: false, right: false, boost: false, brake: false, throttle: false };
  private readonly input = emptyInput();
  private enabled = false;
  onRespawn: (() => void) | null = null;
  onPause: (() => void) | null = null;
  lastDevice: 'keyboard' | 'touch' | 'gamepad' = 'keyboard';

  private readonly down = (e: KeyboardEvent) => {
    const k = KEYMAP[e.code];
    if (k) {
      keyState[k] = true;
      this.lastDevice = 'keyboard';
      e.preventDefault();
    }
    if (e.code === 'KeyR' && !e.repeat) this.onRespawn?.();
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat) this.onPause?.();
  };

  private readonly up = (e: KeyboardEvent) => {
    const k = KEYMAP[e.code];
    if (k) keyState[k] = false;
  };

  private readonly blur = () => {
    for (const k of Object.keys(keyState) as (keyof typeof keyState)[]) keyState[k] = false;
    Object.assign(this.touch, { left: false, right: false, boost: false, brake: false, throttle: false });
  };

  attach(): void {
    if (this.enabled) return;
    this.enabled = true;
    window.addEventListener('keydown', this.down);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.blur);
  }

  detach(): void {
    this.enabled = false;
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.blur);
    this.blur();
  }

  private readGamepad(): VehicleInput | null {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const axis = pad.axes[0] ?? 0;
      const steer = Math.abs(axis) > 0.12 ? axis : 0;
      const rt = pad.buttons[7]?.value ?? 0;
      const lt = pad.buttons[6]?.value ?? 0;
      const a = pad.buttons[0]?.pressed ?? false;
      const b = pad.buttons[1]?.pressed ?? false;
      const x = pad.buttons[2]?.pressed ?? false;
      if (pad.buttons[3]?.pressed) this.onRespawn?.();
      const active = steer !== 0 || rt > 0.05 || lt > 0.05 || a || b || x;
      if (!active) continue;
      this.lastDevice = 'gamepad';
      return { throttle: rt, brake: Math.max(lt, b ? 1 : 0), steer, boost: a, drift: b || x || lt > 0.5 };
    }
    return null;
  }

  /** Samples the current input. `autoAccelerate` keeps the throttle pinned unless braking. */
  sample(): VehicleInput {
    const pad = this.readGamepad();
    if (pad) return pad;
    const t = this.touch;
    const touching = t.left || t.right || t.boost || t.brake || t.throttle;
    if (touching) this.lastDevice = 'touch';
    const left = keyState.left || t.left;
    const right = keyState.right || t.right;
    const brake = keyState.down || t.brake;
    const auto = settingsStore.get().autoAccelerate;
    const throttle = keyState.up || t.throttle || (auto && !brake);
    this.input.steer = clamp((right ? 1 : 0) - (left ? 1 : 0), -1, 1);
    this.input.throttle = throttle ? 1 : 0;
    this.input.brake = brake ? 1 : 0;
    this.input.boost = keyState.boost || t.boost;
    // Unified brake/drift: drifting only engages at speed while steering (handled by the simulation).
    this.input.drift = keyState.drift || brake;
    return this.input;
  }
}
