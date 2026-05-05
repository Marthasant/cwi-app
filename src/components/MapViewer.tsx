import React, { useMemo } from 'react';
import { MapContainer, ImageOverlay, Marker, useMapEvents, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useInspection } from '../context/InspectionContext';
import { v4 as uuidv4 } from 'uuid';

const MapEvents = () => {
  const { addFinding, setActiveFindingId, isAddingMode, setIsAddingMode } = useInspection();

  useMapEvents({
    click(e) {
      if (!isAddingMode) return;

      const { lat, lng } = e.latlng;
      const newFindingId = uuidv4();
      addFinding({
        id: newFindingId,
        x: lng, // X maps to Lng in Leaflet CRS.Simple
        y: lat, // Y maps to Lat in Leaflet CRS.Simple
        locationLabel: '',
        photoUrl: null,
        description: '',
        criticalityLevel: '',
        recommendations: ''
      });
      setActiveFindingId(newFindingId);
      setIsAddingMode(false); // Turn off adding mode after placing pin
    },
  });

  return null;
};

// Define colors based on Criticality Level
export const getPinColor = (level: string) => {
  if (level.includes('Level 1')) return '#ef4444'; // Red
  if (level.includes('Level 2')) return '#f97316'; // Orange
  if (level.includes('Level 3')) return '#3b82f6'; // Blue
  if (level.includes('Level 4')) return '#facc15'; // Yellow
  return '#64748b'; // Gray for unassigned
};

// Create a numbered and colored pin icon
export const createPinIcon = (sequenceNumber: number, criticalityLevel: string, isActive: boolean) => {
  const fillColor = getPinColor(criticalityLevel);
  const strokeColor = isActive ? '#ffffff' : '#000000';
  const strokeWidth = isActive ? '3' : '2';

  return L.divIcon({
    html: `
      <div style="position: relative; top: -32px; left: -16px; width: 32px; height: 32px; filter: drop-shadow(0px 4px 4px rgba(0,0,0,0.5));">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="${fillColor}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3" fill="#ffffff" stroke="none"></circle>
          <text x="12" y="14" font-family="sans-serif" font-size="10" font-weight="bold" fill="#000000" text-anchor="middle">${sequenceNumber}</text>
        </svg>
      </div>
    `,
    className: 'custom-pin-icon',
    iconSize: [32, 32],
    iconAnchor: [0, 0] // Anchor logic adjusted in the inner div
  });
};

export const MapViewer: React.FC = () => {
  const { planImage, imageDimensions, findings, activeFindingId, setActiveFindingId } = useInspection();

  // Define bounds based on image dimensions
  const bounds = useMemo(() => {
    if (!imageDimensions) return null;
    return new L.LatLngBounds(
      [0, 0], // Bottom-Left (Leaflet coords: Lat 0, Lng 0)
      [imageDimensions.height, imageDimensions.width] // Top-Right (Lat = height, Lng = width)
    );
  }, [imageDimensions]);

  if (!planImage || !bounds) return null;

  return (
    <div className="w-full h-full relative bg-dark-bg z-0">
      <MapContainer
        crs={L.CRS.Simple}
        bounds={bounds}
        maxBounds={bounds}
        zoom={-1}
        minZoom={-3}
        maxZoom={3}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%', background: '#0f1115' }}
        attributionControl={false}
      >
        <ImageOverlay url={planImage} bounds={bounds} />
        <MapEvents />

        {findings.map((finding, index) => (
          <Marker
            key={finding.id}
            position={[finding.y, finding.x]}
            icon={createPinIcon(index + 1, finding.criticalityLevel || '', finding.id === activeFindingId)}
            eventHandlers={{
              click: (e) => {
                L.DomEvent.stopPropagation(e); // Prevent map click event
                setActiveFindingId(finding.id);
              },
            }}
          >
            <Tooltip direction="top" offset={[0, -28]} opacity={1}>
              <div className="text-center font-bold">
                #{index + 1}
                <div className="text-xs font-normal">{finding.locationLabel || 'Unnamed Finding'}</div>
              </div>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};
