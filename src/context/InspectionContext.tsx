/* eslint-disable react-refresh/only-export-components */
/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react-hooks/set-state-in-effect */
import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Finding, ImageDimensions } from '../types/index';

interface InspectionContextType {
  projectTitle: string;
  setProjectTitle: (title: string) => void;
  inspectorName: string;
  setInspectorName: (name: string) => void;
  planImage: string | null;
  setPlanImage: (url: string | null) => void;
  imageDimensions: ImageDimensions | null;
  setImageDimensions: (dims: ImageDimensions | null) => void;
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

const InspectionContext = createContext<InspectionContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'cwi_inspection_data';

export const InspectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [projectTitle, setProjectTitle] = useState<string>("Structural Inspection Report");
  const [inspectorName, setInspectorName] = useState<string>("");
  const [planImage, setPlanImage] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<ImageDimensions | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    try {
      const storedData = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (storedData) {
        const parsed = JSON.parse(storedData);
        setProjectTitle(parsed.projectTitle || "Structural Inspection Report");
        setInspectorName(parsed.inspectorName || "");
        setPlanImage(parsed.planImage || null);
        setImageDimensions(parsed.imageDimensions || null);
        setFindings(parsed.findings || []);
      }
    } catch (error) {
      console.error('Failed to load inspection data from localStorage:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save to localStorage whenever state changes
  useEffect(() => {
    if (isLoaded) {
      try {
        const dataToSave = {
          projectTitle,
          inspectorName,
          planImage,
          imageDimensions,
          findings,
        };
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dataToSave));
      } catch (error) {
        console.error('Failed to save inspection data to localStorage:', error);
      }
    }
  }, [planImage, imageDimensions, findings, isLoaded]);

  const addFinding = (finding: Finding) => {
    setFindings(prev => [...prev, finding]);
  };

  const updateFinding = (id: string, updates: Partial<Finding>) => {
    setFindings(prev => prev.map(f => (f.id === id ? { ...f, ...updates } : f)));
  };

  const deleteFinding = (id: string) => {
    setFindings(prev => prev.filter(f => f.id !== id));
    if (activeFindingId === id) {
      setActiveFindingId(null);
    }
  };

  const clearInspection = () => {
    if (confirm('Are you sure you want to clear all inspection data? This cannot be undone.')) {
      setPlanImage(null);
      setImageDimensions(null);
      setFindings([]);
      setActiveFindingId(null);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    }
  };

  if (!isLoaded) return null; // Avoid hydration mismatch or overwriting with initial empty state

  return (
    <InspectionContext.Provider
      value={{
        projectTitle,
        setProjectTitle,
        inspectorName,
        setInspectorName,
        planImage,
        setPlanImage,
        imageDimensions,
        setImageDimensions,
        findings,
        setFindings,
        addFinding,
        updateFinding,
        deleteFinding,
        activeFindingId,
        setActiveFindingId,
        isAddingMode,
        setIsAddingMode,
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
