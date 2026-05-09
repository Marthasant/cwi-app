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
    planImage: row.floor_plan_url,
    imageDimensions: null, // loaded locally; not stored in DB
    floorPlanUrl: row.floor_plan_url,
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
export async function ensureBuilding(
  projectTitle: string,
  inspectorName: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('buildings')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    if (data) return data.id;

    // No building yet – create the default one
    const { data: inserted, error: insertError } = await supabase
      .from('buildings')
      .insert({ name: projectTitle || 'Main Inspection Project', inspector: inspectorName })
      .select('id')
      .single();

    if (insertError) throw insertError;
    return inserted.id;
  } catch (err) {
    console.error('[api] ensureBuilding failed:', err);
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

// ---------------------------------------------------------------------------
// Storage – photo upload (blob URL → Supabase Storage)
// ---------------------------------------------------------------------------

/**
 * Converts a local blob/object URL to a Blob and uploads it to the
 * `floor_plans` bucket under the `photos/` prefix.
 * Returns the public URL or null on failure.
 */
export async function uploadFindingPhoto(
  buildingId: string,
  findingId: string,
  blobUrl: string,
): Promise<string | null> {
  try {
    const response = await fetch(blobUrl);
    const blob = await response.blob();
    const ext = blob.type.split('/')[1] || 'jpg';
    const path = `photos/${buildingId}/${findingId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('floor_plans')
      .upload(path, blob, { upsert: true, contentType: blob.type });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from('floor_plans')
      .getPublicUrl(path);

    return urlData.publicUrl;
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
