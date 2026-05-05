import React from 'react';
import type { Finding, ImageDimensions } from '../types';
import { getPinColor } from './MapViewer';

const MasterMap: React.FC<{ findings: Finding[]; planImage: string; imageDimensions: ImageDimensions }> = ({ findings, planImage, imageDimensions }) => {
  // We want to render the full image and place all pins on it.
  // To ensure good resolution but fit within an offscreen container, we can just use the natural dimensions.
  const containerWidth = imageDimensions.width;
  const containerHeight = imageDimensions.height;
  
  return (
    <div id="pdf-master-map" style={{ width: containerWidth, height: containerHeight, position: 'relative', backgroundColor: '#fff' }}>
      <img 
        src={planImage} 
        alt="Master Map" 
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: containerWidth,
          height: containerHeight,
          maxWidth: 'none',
        }} 
      />
      {findings.map((finding, index) => {
        const pinColor = getPinColor(finding.criticalityLevel || '');
        // Pin X is distance from left (finding.x)
        // Pin Y is distance from bottom, so top = containerHeight - finding.y
        const top = containerHeight - finding.y;
        const left = finding.x;

        return (
          <div key={finding.id} style={{
            position: 'absolute',
            top: top,
            left: left,
            transform: 'translate(-50%, -100%)', // align bottom tip of pin to the coordinate
            filter: 'drop-shadow(0px 4px 4px rgba(0,0,0,0.5))'
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill={pinColor} stroke="#000" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3" fill="#ffffff" stroke="none"></circle>
              <text x="12" y="14" fontFamily="sans-serif" fontSize="10" fontWeight="bold" fill="#000" textAnchor="middle">{index + 1}</text>
            </svg>
          </div>
        );
      })}
    </div>
  );
};

export const PdfTemplates: React.FC<{
  findings: Finding[];
  planImage: string | null;
  imageDimensions: ImageDimensions | null;
}> = ({ findings, planImage, imageDimensions }) => {
  if (!planImage || !imageDimensions) return null;

  return (
    <div id="pdf-templates" style={{ position: 'absolute', left: '-9999px', top: 0, width: Math.max(imageDimensions.width, 1000) }}>
      <MasterMap findings={findings} planImage={planImage} imageDimensions={imageDimensions} />
      
      {/* Render each photo for html2canvas to capture */}
      {findings.map(finding => (
        <div key={finding.id} id={`pdf-photo-${finding.id}`} style={{ padding: '20px', background: '#fff', color: '#000' }}>
          {finding.photoUrl && (
            <img src={finding.photoUrl} alt="Finding Photo" style={{ maxWidth: '600px', maxHeight: '400px', objectFit: 'contain' }} />
          )}
        </div>
      ))}
    </div>
  );
};
