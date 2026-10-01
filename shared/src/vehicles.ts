export type VehicleId = 'sport' | 'moto' | 'buggy' | 'monster';
export type UpgradeStat = 'engine' | 'handling' | 'boost';

export const VEHICLE_IDS: VehicleId[] = ['sport', 'moto', 'buggy', 'monster'];
export const UPGRADE_STATS: UpgradeStat[] = ['engine', 'handling', 'boost'];
export const MAX_UPGRADE_LEVEL = 5;

export interface UpgradeLevels {
  engine: number;
  handling: number;
  boost: number;
}

export const NO_UPGRADES: UpgradeLevels = { engine: 0, handling: 0, boost: 0 };

/** Physics + feel parameters. Units: meters, seconds, radians. */
export interface VehicleTuning {
  maxSpeed: number;
  accel: number;
  brake: number;
  reverseMax: number;
  coastDrag: number;
  turnRate: number;
  /** Speed at which steering reaches full authority. */
  turnSpeedRef: number;
  /** Steering reduction at top speed (0..1). */
  highSpeedSteerFalloff: number;
  steerResponse: number;
  grip: number;
  driftGrip: number;
  driftTurnBoost: number;
  /** Fraction of lateral speed converted back to forward speed when gripping. */
  gripTransfer: number;
  mass: number;
  radius: number;
  airControl: number;
  gravityScale: number;
  offroadMaxFactor: number;
  offroadDrag: number;
  boostMul: number;
  boostAccel: number;
  boostCapacity: number;
  boostRegen: number;
  driftBoostCharge: number;
  airBoostCharge: number;
  /** Resistance to impact spin 0..1. */
  stability: number;
  /** Visual-only suspension. */
  suspensionStiffness: number;
  suspensionDamping: number;
  suspensionTravel: number;
  bodyRoll: number;
  /** Lean into turns (motorcycle). */
  lean: number;
  camera: { distance: number; height: number; fov: number };
  audio: { idleHz: number; maxHz: number; gears: number; tone: 'high' | 'buzz' | 'mid' | 'deep' };
}

export interface VehicleSpec {
  id: VehicleId;
  name: string;
  tagline: string;
  /** Display stats 0..10. */
  stats: { speed: number; accel: number; handling: number; stability: number };
  tuning: VehicleTuning;
}

export const VEHICLES: Record<VehicleId, VehicleSpec> = {
  sport: {
    id: 'sport',
    name: 'Sport Car',
    tagline: 'Vitesse pure, précision nerveuse',
    stats: { speed: 9, accel: 8, handling: 8, stability: 6 },
    tuning: {
      maxSpeed: 64,
      accel: 27,
      brake: 42,
      reverseMax: 14,
      coastDrag: 3.5,
      turnRate: 2.15,
      turnSpeedRef: 16,
      highSpeedSteerFalloff: 0.42,
      steerResponse: 11,
      grip: 9.5,
      driftGrip: 1.8,
      driftTurnBoost: 1.35,
      gripTransfer: 0.9,
      mass: 1.0,
      radius: 1.9,
      airControl: 0.25,
      gravityScale: 1,
      offroadMaxFactor: 0.66,
      offroadDrag: 9,
      boostMul: 1.32,
      boostAccel: 22,
      boostCapacity: 3.2,
      boostRegen: 0.11,
      driftBoostCharge: 0.55,
      airBoostCharge: 0.5,
      stability: 0.55,
      suspensionStiffness: 220,
      suspensionDamping: 18,
      suspensionTravel: 0.12,
      bodyRoll: 0.05,
      lean: 0,
      camera: { distance: 7.2, height: 2.6, fov: 0.98 },
      audio: { idleHz: 70, maxHz: 260, gears: 6, tone: 'high' },
    },
  },
  moto: {
    id: 'moto',
    name: 'Motorcycle',
    tagline: 'Ultra légère, virages éclairs',
    stats: { speed: 8, accel: 9, handling: 10, stability: 3 },
    tuning: {
      maxSpeed: 61,
      accel: 31,
      brake: 40,
      reverseMax: 10,
      coastDrag: 3,
      turnRate: 2.65,
      turnSpeedRef: 12,
      highSpeedSteerFalloff: 0.35,
      steerResponse: 15,
      grip: 10.5,
      driftGrip: 2.2,
      driftTurnBoost: 1.3,
      gripTransfer: 0.92,
      mass: 0.55,
      radius: 1.25,
      airControl: 0.4,
      gravityScale: 0.95,
      offroadMaxFactor: 0.7,
      offroadDrag: 8,
      boostMul: 1.3,
      boostAccel: 24,
      boostCapacity: 3,
      boostRegen: 0.12,
      driftBoostCharge: 0.6,
      airBoostCharge: 0.6,
      stability: 0.15,
      suspensionStiffness: 260,
      suspensionDamping: 16,
      suspensionTravel: 0.1,
      bodyRoll: 0,
      lean: 0.55,
      camera: { distance: 6.2, height: 2.2, fov: 1.0 },
      audio: { idleHz: 95, maxHz: 340, gears: 5, tone: 'buzz' },
    },
  },
  buggy: {
    id: 'buggy',
    name: 'Buggy',
    tagline: 'Équilibré, roi du sable',
    stats: { speed: 7, accel: 7, handling: 7, stability: 8 },
    tuning: {
      maxSpeed: 58,
      accel: 24,
      brake: 38,
      reverseMax: 13,
      coastDrag: 3.5,
      turnRate: 2.2,
      turnSpeedRef: 15,
      highSpeedSteerFalloff: 0.35,
      steerResponse: 10,
      grip: 7.2,
      driftGrip: 2.6,
      driftTurnBoost: 1.3,
      gripTransfer: 0.88,
      mass: 0.95,
      radius: 1.9,
      airControl: 0.3,
      gravityScale: 0.92,
      offroadMaxFactor: 0.95,
      offroadDrag: 2,
      boostMul: 1.3,
      boostAccel: 21,
      boostCapacity: 3.4,
      boostRegen: 0.12,
      driftBoostCharge: 0.65,
      airBoostCharge: 0.7,
      stability: 0.7,
      suspensionStiffness: 140,
      suspensionDamping: 11,
      suspensionTravel: 0.28,
      bodyRoll: 0.09,
      lean: 0,
      camera: { distance: 7.4, height: 2.8, fov: 0.98 },
      audio: { idleHz: 60, maxHz: 210, gears: 5, tone: 'mid' },
    },
  },
  monster: {
    id: 'monster',
    name: 'Monster Truck',
    tagline: 'Lourd, stable, inarrêtable',
    stats: { speed: 6, accel: 5, handling: 5, stability: 10 },
    tuning: {
      maxSpeed: 54,
      accel: 17,
      brake: 30,
      reverseMax: 12,
      coastDrag: 4,
      turnRate: 1.75,
      turnSpeedRef: 18,
      highSpeedSteerFalloff: 0.3,
      steerResponse: 7,
      grip: 7.8,
      driftGrip: 2.4,
      driftTurnBoost: 1.25,
      gripTransfer: 0.85,
      mass: 2.3,
      radius: 2.5,
      airControl: 0.18,
      gravityScale: 1.08,
      offroadMaxFactor: 0.9,
      offroadDrag: 3,
      boostMul: 1.3,
      boostAccel: 18,
      boostCapacity: 3.6,
      boostRegen: 0.1,
      driftBoostCharge: 0.5,
      airBoostCharge: 0.55,
      stability: 0.95,
      suspensionStiffness: 90,
      suspensionDamping: 7,
      suspensionTravel: 0.55,
      bodyRoll: 0.13,
      lean: 0,
      camera: { distance: 9, height: 3.8, fov: 0.96 },
      audio: { idleHz: 38, maxHz: 140, gears: 4, tone: 'deep' },
    },
  },
};

export const isVehicleId = (v: unknown): v is VehicleId => typeof v === 'string' && v in VEHICLES;

const clampLevel = (n: number): number => Math.max(0, Math.min(MAX_UPGRADE_LEVEL, Math.floor(n || 0)));

/** Applies upgrade levels on top of the base tuning. Mirrors the server economy (levels only, never prices). */
export const tunedVehicle = (id: VehicleId, upgrades: UpgradeLevels = NO_UPGRADES): VehicleTuning => {
  const base = VEHICLES[id].tuning;
  const e = clampLevel(upgrades.engine);
  const h = clampLevel(upgrades.handling);
  const b = clampLevel(upgrades.boost);
  return {
    ...base,
    maxSpeed: base.maxSpeed * (1 + 0.016 * e),
    accel: base.accel * (1 + 0.04 * e),
    turnRate: base.turnRate * (1 + 0.025 * h),
    grip: base.grip * (1 + 0.04 * h),
    boostCapacity: base.boostCapacity * (1 + 0.08 * b),
    boostMul: base.boostMul + 0.012 * b,
  };
};

/** Highest legit planar speed (m/s) a vehicle can reach — used by anti-cheat. */
export const absoluteMaxSpeed = (id: VehicleId): number => {
  const t = tunedVehicle(id, { engine: MAX_UPGRADE_LEVEL, handling: MAX_UPGRADE_LEVEL, boost: MAX_UPGRADE_LEVEL });
  return t.maxSpeed * t.boostMul;
};

export interface PaintColor {
  id: string;
  name: string;
  hex: string;
  metallic: number;
  premium: boolean;
}

export const PAINTS: PaintColor[] = [
  { id: 'red', name: 'Rouge Rush', hex: '#e3262f', metallic: 0.35, premium: false },
  { id: 'blue', name: 'Bleu Électrique', hex: '#1f6bff', metallic: 0.35, premium: false },
  { id: 'yellow', name: 'Jaune Éclair', hex: '#ffc61a', metallic: 0.3, premium: false },
  { id: 'black', name: 'Noir Carbone', hex: '#17191f', metallic: 0.5, premium: false },
  { id: 'white', name: 'Blanc Glacier', hex: '#eef1f6', metallic: 0.25, premium: false },
  { id: 'gold', name: 'Or Champion', hex: '#d9a521', metallic: 0.95, premium: true },
  { id: 'neon', name: 'Néon Cyan', hex: '#14e1ff', metallic: 0.6, premium: true },
  { id: 'violet', name: 'Violet Nitro', hex: '#7d3cff', metallic: 0.7, premium: true },
];

export const paintById = (id: string): PaintColor => PAINTS.find((p) => p.id === id) ?? PAINTS[0];
