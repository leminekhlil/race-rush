export type TrackTheme = 'city' | 'desert';

/** A control point of the closed centerline. `y` is the road elevation (meters). */
export interface TrackControlPoint {
  x: number;
  z: number;
  y?: number;
  /** Optional local road width override (meters). */
  width?: number;
}

/** A kicker ramp placed across the road. Position is expressed as a lap fraction [0, 1). */
export interface TrackRamp {
  at: number;
  /** Run-up length in meters. */
  length: number;
  /** Lip height in meters. */
  height: number;
}

export interface TrackDefinition {
  id: string;
  name: string;
  theme: TrackTheme;
  /** Closed loop, listed in driving order. The start/finish line sits at the first point. */
  points: TrackControlPoint[];
  /** Default road width (meters). */
  roadWidth: number;
  /** Drivable shoulder (sidewalk / sand) between road edge and barrier, per side. */
  shoulder: number;
  /** Number of checkpoints including the start/finish line (index 0). */
  checkpoints: number;
  laps: number;
  ramps: TrackRamp[];
  /** Seed used for deterministic decoration placement. */
  decorSeed: number;
  /** Distance (meters) past the start line where the first grid row sits. */
  gridOffset: number;
  /** Visual palette hints for the renderer. */
  palette: {
    sky: string;
    horizon: string;
    fog: string;
    ground: string;
    road: string;
    shoulder: string;
    barrierA: string;
    barrierB: string;
  };
}
