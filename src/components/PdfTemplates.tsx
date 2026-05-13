import React from 'react';
import type { Finding, Floor, ImageDimensions } from '../types/index';
import { getPinColor } from './MapViewer';

const MasterMap: React.FC<{
  findings: Finding[];
  planImage: string;
  imageDimensions: ImageDimensions;
  floorId: string;
}> = ({ findings, planImage, imageDimensions, floorId }) => {
  const containerWidth = imageDimensions.width;
  const containerHeight = imageDimensions.height;

  return (
    <div id={`pdf-master-map-${floorId}`} style={{ width: containerWidth, height: containerHeight, position: 'relative', backgroundColor: '#fff' }}>
      <img
        src={planImage}
        alt="Master Map"
        crossOrigin="anonymous"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: containerWidth,
          height: containerHeight,
          maxWidth: 'none',
          backgroundColor: '#ffffff',
        }}
      />
      {findings.map((finding, index) => {
        const pinColor = getPinColor(finding.criticalityLevel || '');
        const top = containerHeight - finding.y;
        const left = finding.x;

        return (
          <div key={finding.id} style={{
            position: 'absolute',
            top: top,
            left: left,
            transform: 'translate(-50%, -100%)',
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
  floors: Floor[];       // Now takes all floors
  allFindings: Finding[]; // Now takes all findings
}> = ({ floors, allFindings }) => {
  return (
    <div id="pdf-templates" style={{ position: 'absolute', left: '-9999px', top: 0, width: '1200px' }}>
      {floors.map((floor) => {
        const floorFindings = allFindings.filter(f => f.floorId === floor.id);
        if (!floor.planImage || !floor.imageDimensions) return null;

        return (
          <div key={floor.id} className="pdf-floor-section" style={{ background: '#fff', marginBottom: '50px' }}>
            <h1 style={{ color: '#000', fontSize: '28px', padding: '20px' }}>{floor.name} - Overview</h1>

            {/* Render the Master Map for THIS floor */}
            <MasterMap
              findings={floorFindings}
              planImage={floor.planImage}
              imageDimensions={floor.imageDimensions}
              floorId={floor.id}
            />

            {/* Render photos for THIS floor */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px' }}>
              {floorFindings.map(finding => (
                <div key={finding.id} id={`pdf-photo-${finding.id}`} style={{ borderBottom: '1px solid #ccc', paddingBottom: '20px' }}>
                  <h3 style={{ color: '#000' }}>Finding #{finding.pinNumber} - {finding.locationLabel}</h3>
                  {finding.photoUrl && (
                    <img
                      src={finding.photoUrl}
                      alt="Finding"
                      crossOrigin="anonymous"
                      style={{ maxWidth: '800px', borderRadius: '8px', backgroundColor: '#ffffff', display: 'block' }}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
