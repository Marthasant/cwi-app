export const CriticalityLevel = {
  LEVEL_1: 'Risk Level 1: CRITICAL (Immediate Structural Hazard)',
  LEVEL_2: 'Risk Level 2: HIGH (Significant Section Loss)',
  LEVEL_3: 'Risk Level 3: MODERATE (Surface Deterioration)',
  LEVEL_4: 'Risk Level 4: LOW (Cosmetic / Early-Stage)',
  LEVEL_5: 'Risk Level 5: LIFE SAFETY (Sprinkler Pipe Hazard)',
  LEVEL_6: 'Risk Level 6: EXTREME DANGER (Flammable Gas Hazard)',
} as const;

export type CriticalityLevel = typeof CriticalityLevel[keyof typeof CriticalityLevel];

export interface Floor {
  id: string;
  name: string;
  planImage: string | null;       // local blob URL or cloud URL used for rendering
  imageDimensions: { width: number; height: number } | null;
  floorPlanUrl?: string | null;   // Supabase Storage public URL (persisted to DB)
}

export interface Finding {
  id: string;
  floorId: string;
  x: number;
  y: number;
  photoUrl: string | null;
  description: string;
  criticalityLevel: string;
  recommendations: string;
  locationLabel?: string;
  affectedArea?: string;
  pinNumber?: number;             // sequential pin label (1-based, per floor)
}

export interface ImageDimensions {
  width: number;
  height: number;
}

export type MapMode = 'view' | 'add' | 'edit';
