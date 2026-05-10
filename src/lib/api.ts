/**
 * src/lib/api.ts
 * All Supabase CRUD and Storage operations for the CWI Inspection App.
 * Keeps DB column snake_case isolated from the rest of the codebase.
 */
import { supabase } from './supabase';
import type { Floor, Finding } from '../types/index';

// ---------------------------------------------------------------------------
// Types that mirror the DB rows (snake_case)
// ---------------------------------------------------------------------------

interface DbFloor {
  id: string;
  building_id: string;
  name: string;
  floor_index: number;
  floor_plan_url: string | null;
}

interface DbFinding {
  id: string;
  floor_id: string;
  building_id: string;
  pin_x: number;
  pin_y: number;
  pin_number: number;
  status: string;
  description: string | null;
  category: string | null;     // mapped from criticalityLevel
  notes: string | null;        // mapped from recommendations
  photo_url: string | null;
  inspector_signature_url: string | null;
  weld_id: string | null;      // mapped from locationLabel
  severity: string | null;     // mapped from affectedArea
}

// ---------------------------------------------------------------------------
// Mappers – DB row ↔ local type
// ---------------------------------------------------------------------------
function dbFloorToLocal(row: DbFloor): Floor {
  return {
    id: row.id,
    name: row.name,
    // CRITICAL FIX: Map the DB column to the local state property
    planImage: row.floor_plan_url || null,
    imageDimensions: null, // loaded locally; not stored in DB
    floorPlanUrl: row.floor_plan_url || null,
  };
}

function dbFindingToLocal(row: DbFinding, index: number): Finding {
  return {
    id: row.id,
    floorId: row.floor_id,
    x: row.pin_x,
    y: row.pin_y,
    photoUrl: row.photo_url,
    description: row.description ?? '',
    criticalityLevel: row.category ?? '',
    recommendations: row.notes ?? '',
    locationLabel: row.weld_id ?? '',
    affectedArea: row.severity ?? '',
    pinNumber: row.pin_number ?? index + 1,
  };
}

// ---------------------------------------------------------------------------
// Building helpers
// ---------------------------------------------------------------------------

/**
 * Ensures a default building exists. Returns its ID.
 * Call once on app mount.
 */
export async function ensureBuilding(projectTitle: string, inspectorName: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from('buildings').select('id').limit(1).maybeSingle();
    if (error) {
      alert('DB Error (Select Building): ' + JSON.stringify(error));
      throw error;
    }
    if (data) return data.id;

    const { data: inserted, error: insertError } = await supabase
      .from('buildings')
      .insert({ name: projectTitle || 'Main Inspection', inspector: inspectorName })
      .select('id')
      .single();

    if (insertError) {
      alert('DB Error (Insert Building): ' + insertError.message);
      throw insertError;
    }
    return inserted.id;
  } catch (err: any) {
    alert('[api] ensureBuilding CRITICAL failure: ' + err.message);
    return null;
  }
}

/** Update the building's name / inspector fields. */
export async function updateBuilding(
  buildingId: string,
  fields: { name?: string; inspector?: string },
): Promise<void> {
  try {
    const { error } = await supabase
      .from('buildings')
      .update(fields)
      .eq('id', buildingId);
    if (error) throw error;
  } catch (err) {
    console.error('[api] updateBuilding failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Floor helpers
// ---------------------------------------------------------------------------

/** Fetch all floors for a building, ordered by floor_index. */
export async function fetchFloors(buildingId: string): Promise<Floor[]> {
  const { data, error } = await supabase
    .from('floors')
    .select('*')
    .eq('building_id', buildingId)
    .order('floor_index', { ascending: true });

  if (error) {
    console.error('[api] fetchFloors failed:', error);
    return [];
  }

  return (data as DbFloor[]).map(dbFloorToLocal);
}

/** Insert a new floor row. Returns the created floor or null. */
export async function insertFloor(
  buildingId: string,
  name: string,
  floorIndex: number,
): Promise<Floor | null> {
  try {
    const { data, error } = await supabase
      .from('floors')
      .insert({ building_id: buildingId, name, floor_index: floorIndex })
      .select('*')
      .single();

    if (error) throw error;
    return dbFloorToLocal(data as DbFloor);
  } catch (err) {
    console.error('[api] insertFloor failed:', err);
    return null;
  }
}

/** Upload a floor-plan image blob to Storage and persist the URL on the floor row. */
export async function uploadFloorPlan(
  buildingId: string,
  floorId: string,
  file: File | Blob,
  fileExt: string = 'png',
): Promise<string | null> {
  try {
    const path = `${buildingId}/${floorId}.${fileExt}`;
    const { error: uploadError } = await supabase.storage
      .from('floor_plans')
      .upload(path, file, { upsert: true, contentType: `image/${fileExt}` });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('floor_plans')
      .getPublicUrl(path);

    const publicUrl = urlData.publicUrl;

    // Persist URL on the floor row
    const { error: updateError } = await supabase
      .from('floors')
      .update({ floor_plan_url: publicUrl })
      .eq('id', floorId);

    if (updateError) throw updateError;
    return publicUrl;
  } catch (err) {
    console.error('[api] uploadFloorPlan failed:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Finding helpers
// ---------------------------------------------------------------------------

/** Fetch all findings for a building. */
export async function fetchFindings(buildingId: string): Promise<Finding[]> {
  const { data, error } = await supabase
    .from('findings')
    .select('*')
    .eq('building_id', buildingId)
    .order('pin_number', { ascending: true });

  if (error) {
    console.error('[api] fetchFindings failed:', error);
    return [];
  }

  return (data as DbFinding[]).map((row, i) => dbFindingToLocal(row, i));
}

/** Insert a brand-new finding. The provided finding must already have a UUID id. */
export async function insertFinding(
  buildingId: string,
  finding: Finding,
  pinNumber: number,
): Promise<void> {
  try {
    const { error } = await supabase.from('findings').insert({
      id: finding.id,
      floor_id: finding.floorId,
      building_id: buildingId,
      pin_x: finding.x,
      pin_y: finding.y,
      pin_number: pinNumber,
      description: finding.description || null,
      category: finding.criticalityLevel || null,
      notes: finding.recommendations || null,
      photo_url: finding.photoUrl || null,
      weld_id: finding.locationLabel || null,
      severity: finding.affectedArea || null,
    });
    if (error) throw error;
  } catch (err) {
    console.error('[api] insertFinding failed:', err);
  }
}

/** Upsert all fields of a finding (called from "Save Changes"). */
export async function upsertFinding(
  buildingId: string,
  finding: Finding,
  pinNumber: number,
): Promise<void> {
  try {
    const { error } = await supabase.from('findings').upsert({
      id: finding.id,
      floor_id: finding.floorId,
      building_id: buildingId,
      pin_x: finding.x,
      pin_y: finding.y,
      pin_number: pinNumber,
      description: finding.description || null,
      category: finding.criticalityLevel || null,
      notes: finding.recommendations || null,
      photo_url: finding.photoUrl || null,
      weld_id: finding.locationLabel || null,
      severity: finding.affectedArea || null,
    });
    if (error) throw error;
  } catch (err) {
    console.error('[api] upsertFinding failed:', err);
  }
}

/** Delete a finding by ID. */
export async function deleteFindingFromDb(findingId: string): Promise<void> {
  try {
    const { error } = await supabase.from('findings').delete().eq('id', findingId);
    if (error) throw error;
  } catch (err) {
    console.error('[api] deleteFindingFromDb failed:', err);
  }
}

/**
 * Uploads a finding photo File directly to the `finding_photos` bucket.
 * Returns the public URL or null on failure.
 */
export async function uploadFindingPhoto(file: File): Promise<string | null> {
  try {
    const fileExt = file.name.split('.').pop() ?? 'jpg';
    const fileName = `${Math.random().toString(36).slice(2)}.${fileExt}`;

    const { error } = await supabase.storage
      .from('finding_photos')
      .upload(fileName, file);

    if (error) {
      console.error('[api] uploadFindingPhoto upload error:', error);
      return null;
    }

    const { data } = supabase.storage
      .from('finding_photos')
      .getPublicUrl(fileName);

    return data.publicUrl;
  } catch (err) {
    console.error('[api] uploadFindingPhoto failed:', err);
    return null;
  }
}

/**
 * Converts a base64 data-URL (signature) to a Blob and uploads it to the
 * `signatures` bucket. Returns the public URL or null on failure.
 */
export async function uploadSignature(
  buildingId: string,
  dataUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const path = `${buildingId}/signature_${Date.now()}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('signatures')
      .upload(path, blob, { upsert: true, contentType: 'image/jpeg' });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('signatures')
      .getPublicUrl(path);

    return urlData.publicUrl;
  } catch (err) {
    console.error('[api] uploadSignature failed:', err);
    return null;
  }
}
