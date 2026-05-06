/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/exhaustive-deps */
import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Finding, Floor } from '../types/index';

interface InspectionContextType {
  projectTitle: string;
  setProjectTitle: (title: string) => void;
  inspectorName: string;
  setInspectorName: (name: string) => void;

  // Multi-floor
  floors: Floor[];
  currentFloorId: string;
  setCurrentFloorId: (id: string) => void;
  addFloor: () => void;
  updateFloor: (id: string, updates: Partial<Floor>) => void;

  // Legacy single-floor helpers (derived from currentFloor)
  planImage: string | null;
  setPlanImage: (url: string | null) => void;
  imageDimensions: { width: number; height: number } | null;
  setImageDimensions: (dims: { width: number; height: number } | null) => void;

  findings: Finding[];
  setFindings: React.Dispatch<React.SetStateAction<Finding[]>>;
  addFinding: (finding: Finding) => void;
  updateFinding: (id: string, updates: Partial<Finding>) => void;
  deleteFinding: (id: string) => void;
  activeFindingId: string | null;
  setActiveFindingId: (id: string | null) => void;
  isAddingMode: boolean;
  setIsAddingMode: (mode: boolean) => void;
  clearInspection: () => void;
}

const DEFAULT_FLOOR: Floor = { id: '1', name: 'Floor 1', planImage: null, imageDimensions: null };

const InspectionContext = createContext<InspectionContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'cwi_inspection_data_v2';

export const InspectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projectTitle, setProjectTitle] = useState<string>("Structural Inspection Report");
  const [inspectorName, setInspectorName] = useState<string>("");
  const [floors, setFloors] = useState<Floor[]>([DEFAULT_FLOOR]);
  const [currentFloorId, setCurrentFloorId] = useState<string>('1');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (storedData) {
        const parsed = JSON.parse(storedData);
        setProjectTitle(parsed.projectTitle || "Structural Inspection Report");
        setInspectorName(parsed.inspectorName || "");
        setFloors(parsed.floors?.length ? parsed.floors : [DEFAULT_FLOOR]);
        setCurrentFloorId(parsed.currentFloorId || '1');
        setFindings(parsed.findings || []);
      }
    } catch (error) {
      console.error('Failed to load inspection data from localStorage:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever relevant state changes
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
      } catch (error) {
        console.error('Failed to save inspection data to localStorage:', error);
      }
    }
  }, [projectTitle, inspectorName, floors, currentFloorId, findings, isLoaded]);

  // --- Floor helpers ---
  const addFloor = () => {
    if (floors.length >= 10) return;
    const newId = String(Date.now());
    const newFloor: Floor = {
      id: newId,
      name: `Floor ${floors.length + 1}`,
      planImage: null,
      imageDimensions: null,
    };
    setFloors(prev => [...prev, newFloor]);
    setCurrentFloorId(newId);
  };

  const updateFloor = (id: string, updates: Partial<Floor>) => {
    setFloors(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  // --- Legacy single-floor shims (derived from currentFloor) ---
  const currentFloor = floors.find(f => f.id === currentFloorId) ?? floors[0];

  const setPlanImage = (url: string | null) => {
    updateFloor(currentFloorId, { planImage: url });
  };

  const setImageDimensions = (dims: { width: number; height: number } | null) => {
    updateFloor(currentFloorId, { imageDimensions: dims });
  };

  // --- Finding helpers ---
  const addFinding = (finding: Finding) => {
    setFindings(prev => [...prev, finding]);
  };

  const updateFinding = (id: string, updates: Partial<Finding>) => {
    setFindings(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const deleteFinding = (id: string) => {
    setFindings(prev => prev.filter(f => f.id !== id));
    if (activeFindingId === id) setActiveFindingId(null);
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
        floors, currentFloorId, setCurrentFloorId, addFloor, updateFloor,
        planImage: currentFloor?.planImage ?? null,
        setPlanImage,
        imageDimensions: currentFloor?.imageDimensions ?? null,
        setImageDimensions,
        findings,
        setFindings,
        addFinding,
        updateFinding,
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
