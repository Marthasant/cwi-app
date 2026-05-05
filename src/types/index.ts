export const CriticalityLevel = {
  LEVEL_1: 'Level 1: Super Critical (Structural Collapse Risk) - Moment Connections, Column Splices, Base Plates, Precast Embed Plate Failures (AWS D1.4)',
  LEVEL_2: 'Level 2: Very Critical (Floor Stability & Hurricanes) - Metal Deck Damage, Concrete Spalling & Exposed Rebar (ACI 318 / AWS D1.4), Framing Integrity (AWS D1.3)',
  LEVEL_3: 'Level 3: Human Life & High Liability - Vehicular Crash Barriers/Cables, Pedestrian Guardrails, Stair Stringers & Landings',
  LEVEL_4: 'Level 4: Operational Critical - Major Pipe Supports, Corrosion under intumescent paint'
} as const;

export type CriticalityLevel = typeof CriticalityLevel[keyof typeof CriticalityLevel];

export interface Finding {
  id: string;
  x: number;
  y: number;
  locationLabel: string;
  // Optional area or dimensions affected by the finding
  affectedArea?: string;
  photoUrl: string | null;
  description: string;
  criticalityLevel: CriticalityLevel | '';
  recommendations: string;
}

export interface ImageDimensions {
  width: number;
  height: number;
}
