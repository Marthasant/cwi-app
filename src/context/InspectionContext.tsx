/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { Finding, Floor } from '../types/index';
import {
  ensureBuilding,
  updateBuilding,
  fetchFloors,
  fetchFindings,
  insertFloor,
  insertFinding,
  upsertFinding,
  deleteFindingFromDb,
} from '../lib/api';

// ---------------------------------------------------------------------------
// Context shape
// ---------------------------------------------------------------------------
interface InspectionContextType {
  projectTitle: string;
  setProjectTitle: (title: string) => void;
  inspectorName: string;
  setInspectorName: (name: string) => void;

  // Cloud status
  buildingId: string | null;
  isSyncing: boolean;

  // Multi-floor
  floors: Floor[];
  currentFloorId: string;
  setCurrentFloorId: (id: string) => void;
  addFloor: () => Promise<void>;
  updateFloor: (id: string, updates: Partial<Floor>) => void;

  // Legacy single-floor helpers (derived from currentFloor)
  planImage: string | null;
  setPlanImage: (url: string | null) => void;
  imageDimensions: { width: number; height: number } | null;
  setImageDimensions: (dims: { width: number; height: number } | null) => void;

  findings: Finding[];
  setFindings: React.Dispatch<React.SetStateAction<Finding[]>>;
  addFinding: (finding: Finding) => Promise<void>;
  updateFinding: (id: string, updates: Partial<Finding>) => void;
  saveFinding: (id: string) => Promise<void>;
  deleteFinding: (id: string) => Promise<void>;
  activeFindingId: string | null;
  setActiveFindingId: (id: string | null) => void;
  isAddingMode: boolean;
  setIsAddingMode: (mode: boolean) => void;
  clearInspection: () => void;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
const DEFAULT_FLOOR: Floor = { id: '1', name: 'Floor 1', planImage: null, imageDimensions: null };

const InspectionContext = createContext<InspectionContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'cwi_inspection_data_v2';

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export const InspectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projectTitle, setProjectTitleState] = useState<string>('Structural Inspection Report');
  const [inspectorName, setInspectorNameState] = useState<string>('');
  const [floors, setFloors] = useState<Floor[]>([DEFAULT_FLOOR]);
  const [currentFloorId, setCurrentFloorId] = useState<string>('1');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Cloud state
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Debounce refs for title / inspector name
  const titleDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inspectorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Always-current ref to findings — prevents stale-closure bugs in saveFinding
  const findingsRef = useRef<Finding[]>(findings);
  useEffect(() => { findingsRef.current = findings; }, [findings]);

  // ----- Setters that debounce cloud sync -----------------------------------
  const setProjectTitle = (title: string) => {
    setProjectTitleState(title);
    if (buildingId) {
      if (titleDebounceRef.current) clearTimeout(titleDebounceRef.current);
      titleDebounceRef.current = setTimeout(() => updateBuilding(buildingId, { name: title }), 1000);
    }
  };

  const setInspectorName = (name: string) => {
    setInspectorNameState(name);
    if (buildingId) {
      if (inspectorDebounceRef.current) clearTimeout(inspectorDebounceRef.current);
      inspectorDebounceRef.current = setTimeout(() => updateBuilding(buildingId, { inspector: name }), 1000);
    }
  };

  // ----- Boot: localStorage first, then cloud hydration --------------------
  useEffect(() => {
    // 1. Load local cache so the UI is never blank
    try {
      const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (storedData) {
        const parsed = JSON.parse(storedData);
        setProjectTitleState(parsed.projectTitle || 'Structural Inspection Report');
        setInspectorNameState(parsed.inspectorName || '');
        setFloors(parsed.floors?.length ? parsed.floors : [DEFAULT_FLOOR]);
        setCurrentFloorId(parsed.currentFloorId || '1');
        setFindings(parsed.findings || []);
      }
    } catch (err) {
      console.error('[ctx] localStorage load failed:', err);
    }
    setIsLoaded(true);

    // 2. Hydrate from Supabase (runs async, overlays cloud data on top)
    const hydrateFromCloud = async () => {
      setIsSyncing(true);
      try {
        // Use whatever title is stored (from local state above; safe to read via closure)
        const cachedData = (() => {
          try { return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}'); } catch { return {}; }
        })();
        const title = cachedData.projectTitle || 'Structural Inspection Report';
        const inspector = cachedData.inspectorName || '';

        const bId = await ensureBuilding(title, inspector);
        if (!bId) return; // Supabase not configured yet — stay local

        setBuildingId(bId);

        const [cloudFloors, cloudFindings] = await Promise.all([
          fetchFloors(bId),
          fetchFindings(bId),
        ]);

        // If cloud has data, use it (cloud is authoritative)
        if (cloudFloors.length > 0) {
          // Preserve imageDimensions from local cache (not stored in DB)
          const localFloors: Floor[] = (() => {
            try { return JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '{}').floors || []; } catch { return []; }
          })();
          const mergedFloors = cloudFloors.map(cf => {
            const local = localFloors.find(lf => lf.id === cf.id);
            return {
              ...cf,
              planImage: cf.floorPlanUrl || local?.planImage || null,
              imageDimensions: local?.imageDimensions || null,
            };
          });
          setFloors(mergedFloors);
          setCurrentFloorId(mergedFloors[0].id);
        }

        if (cloudFindings.length > 0) {
          setFindings(cloudFindings);
        }
      } catch (err) {
        console.error('[ctx] cloud hydration failed:', err);
      } finally {
        setIsSyncing(false);
      }
    };

    hydrateFromCloud();
  }, []);

  // ----- Persist to localStorage on every change ---------------------------
  useEffect(() => {
    if (isLoaded) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
          projectTitle,
          inspectorName,
          floors,
          currentFloorId,
          findings,
        }));
      } catch (err) {
        console.error('[ctx] localStorage save failed:', err);
      }
    }
  }, [projectTitle, inspectorName, floors, currentFloorId, findings, isLoaded]);

  // ----- Floor helpers ------------------------------------------------------
  const addFloor = async () => {
    if (floors.length >= 10) return;
    const newIndex = floors.length;
    const newName = `Floor ${newIndex + 1}`;

    if (buildingId) {
      // Cloud-first: insert in DB then use the returned UUID
      const created = await insertFloor(buildingId, newName, newIndex);
      if (created) {
        setFloors(prev => [...prev, { ...created, imageDimensions: null }]);
        setCurrentFloorId(created.id);
        return;
      }
    }

    // Fallback: local only
    const newId = String(Date.now());
    const newFloor: Floor = { id: newId, name: newName, planImage: null, imageDimensions: null };
    setFloors(prev => [...prev, newFloor]);
    setCurrentFloorId(newId);
  };

  const updateFloor = (id: string, updates: Partial<Floor>) => {
    setFloors(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  // ----- Legacy single-floor shims -----------------------------------------
  const currentFloor = floors.find(f => f.id === currentFloorId) ?? floors[0];

  const setPlanImage = (url: string | null) => {
    updateFloor(currentFloorId, { planImage: url });
  };

  const setImageDimensions = (dims: { width: number; height: number } | null) => {
    updateFloor(currentFloorId, { imageDimensions: dims });
  };

  // ----- Finding helpers ----------------------------------------------------
  const addFinding = async (finding: Finding) => {
    const floorFindings = findings.filter(f => f.floorId === finding.floorId);
    const pinNumber = floorFindings.length + 1;
    const findingWithPin = { ...finding, pinNumber };

    // Optimistic UI update first
    setFindings(prev => [...prev, findingWithPin]);

    if (buildingId) {
      await insertFinding(buildingId, findingWithPin, pinNumber);
    }
  };

  const updateFinding = (id: string, updates: Partial<Finding>) => {
    setFindings(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  /** Call when the user presses "Save Changes" — syncs the full finding to the DB.
   *  Reads from findingsRef.current so it always gets the LATEST state,
   *  not a stale closure captured at render time (fixes the photo_url race condition). */
  const saveFinding = async (id: string) => {
    if (!buildingId) return;
    const finding = findingsRef.current.find(f => f.id === id);
    if (!finding) return;
    const floorFindings = findingsRef.current.filter(f => f.floorId === finding.floorId);
    const pinNumber = finding.pinNumber ?? (floorFindings.findIndex(f => f.id === id) + 1);
    await upsertFinding(buildingId, finding, pinNumber);
  };

  const deleteFinding = async (id: string) => {
    setFindings(prev => prev.filter(f => f.id !== id));
    if (activeFindingId === id) setActiveFindingId(null);
    if (buildingId) {
      await deleteFindingFromDb(id);
    }
  };

  const clearInspection = () => {
    if (confirm('Are you sure you want to clear all inspection data? This cannot be undone.')) {
      setFloors([DEFAULT_FLOOR]);
      setCurrentFloorId('1');
      setFindings([]);
      setActiveFindingId(null);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  };

  if (!isLoaded) return null;

  return (
    <InspectionContext.Provider
      value={{
        projectTitle, setProjectTitle,
        inspectorName, setInspectorName,
        buildingId, isSyncing,
        floors, currentFloorId, setCurrentFloorId, addFloor, updateFloor,
        planImage: currentFloor?.planImage ?? null,
        setPlanImage,
        imageDimensions: currentFloor?.imageDimensions ?? null,
        setImageDimensions,
        findings,
        setFindings,
        addFinding,
        updateFinding,
        saveFinding,
        deleteFinding,
        activeFindingId, setActiveFindingId,
        isAddingMode, setIsAddingMode,
        clearInspection,
      }}
    >
      {children}
    </InspectionContext.Provider>
  );
};

export const useInspection = () => {
  const context = useContext(InspectionContext);
  if (context === undefined) {
    throw new Error('useInspection must be used within an InspectionProvider');
  }
  return context;
};
