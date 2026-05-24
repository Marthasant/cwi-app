import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import type { Finding, Floor } from '../types/index';
import { CriticalityLevel } from '../types/index';
import { getMarkerColor } from './colors';

const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [0, 0, 0];
};

// Draws pins for a floor onto an existing canvas context
const drawPinsOnCanvas = (
  ctx: CanvasRenderingContext2D,
  originalCanvasHeight: number,
  floorFindings: Finding[],
  scale: number = 1
) => {
  floorFindings.forEach((finding, i) => {
    const pinColorHex = getMarkerColor(finding.criticalityLevel || '');
    // Scale the coordinates
    const x = finding.x * scale;
    const y = (originalCanvasHeight - finding.y) * scale;

    ctx.beginPath();
    ctx.arc(x, y, 16, 0, 2 * Math.PI); // Keep pin radius fixed for readability
    ctx.fillStyle = pinColorHex;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000000';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((i + 1).toString(), x, y);
  });
};

export const generatePdfReport = async (
  floors: Floor[],
  allFindings: Finding[],
  projectName: string = "Structural Inspection Report",
  inspectorName: string = "",
  signatureDataUrl?: string,
  inspectionDate: string = new Date().toLocaleDateString(),
  certNumber: string = ''
) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter',
  });

  const pageWidth = 8.5;
  const pageHeight = 11;
  const margin = 0.75;
  const contentWidth = 7.0;
  let currentY = margin;

  // Portrait-aware page break helper (portrait dimensions)
  const checkPageBreak = (requiredSpace: number) => {
    if (currentY + requiredSpace > pageHeight - margin) {
      doc.addPage('letter', 'portrait');
      currentY = margin;
      return true;
    }
    return false;
  };

  // ─── PAGE 1: Cover & Global Executive Summary ────────────────────────────

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  const splitTitle = doc.splitTextToSize(projectName, contentWidth);
  splitTitle.forEach((line: string, idx: number) => {
    const textWidth = doc.getStringUnitWidth(line) * doc.getFontSize() / 72;
    doc.text(line, (pageWidth - textWidth) / 2, currentY + (idx * 0.35) + 0.2);
  });
  currentY += (splitTitle.length * 0.35) + 0.3;

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  const dateStr = `Date: ${inspectionDate}`;
  const inspStr = `Inspector: ${inspectorName || 'Not specified'}`;
  const floorCountStr = `Total Floors Inspected: ${floors.length}`;

  [dateStr, inspStr, floorCountStr].forEach(str => {
    const w = doc.getStringUnitWidth(str) * doc.getFontSize() / 72;
    doc.text(str, (pageWidth - w) / 2, currentY);
    currentY += 0.22;
  });
  currentY += 0.3;

  // Global Summary by Criticality (all findings across all floors)
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Global Summary by Criticality", margin, currentY);
  currentY += 0.15;

  const globalCounts = {
    [CriticalityLevel.LEVEL_1]: 0,
    [CriticalityLevel.LEVEL_2]: 0,
    [CriticalityLevel.LEVEL_3]: 0,
    [CriticalityLevel.LEVEL_4]: 0,
  };
  allFindings.forEach(f => {
    if (f.criticalityLevel && Object.values(CriticalityLevel).includes(f.criticalityLevel as CriticalityLevel)) {
      globalCounts[f.criticalityLevel as CriticalityLevel]++;
    }
  });
  const globalSummaryBody = Object.values(CriticalityLevel).map(level => [
    level.split(' - ')[0],
    globalCounts[level] || 0,
  ]);
  globalSummaryBody.push(['TOTAL', allFindings.length]);

  autoTable(doc, {
    startY: currentY,
    head: [['Criticality Level', 'Count']],
    body: globalSummaryBody,
    theme: 'grid',
    headStyles: { fillColor: [40, 40, 40] },
    margin: { left: margin, right: margin },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  currentY = (doc as any).lastAutoTable.finalY + 0.4;

  // General Index across all floors
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("General Index (All Floors)", margin, currentY);
  currentY += 0.15;

  const indexBody = allFindings.map((f, i) => {
    const floorName = floors.find(fl => fl.id === f.floorId)?.name ?? 'Unknown Floor';
    // Split by colon or dash to get just "Level 1", "Level 2", etc.
    const shortCrit = f.criticalityLevel ? f.criticalityLevel.split(/[:\-]/)[0].trim() : 'Unassigned';
    return [
      (i + 1).toString(),
      floorName,
      f.locationLabel || 'Unnamed',
      f.affectedArea || 'N/A', // New Column
      shortCrit,
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Floor', 'Location Label', 'Affected Area', 'Criticality']],
    body: indexBody,
    theme: 'striped',
    headStyles: { fillColor: [60, 60, 60] },
    margin: { left: margin, right: margin },
  });


  // ─── PER-FLOOR LOOP ──────────────────────────────────────────────────────

  for (const floor of floors) {
    const floorFindings = allFindings.filter(f => f.floorId === floor.id);

    // ── Landscape Map Page ──────────────────────────────────────────────────
    if (floor.planImage && floor.imageDimensions) {
      doc.addPage('letter', 'landscape');
      const lsPageWidth = 11;
      const lsPageHeight = 8.5;
      const lsContentWidth = lsPageWidth - (margin * 2);
      currentY = margin;

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(`Map - ${floor.name}`, margin, currentY + 0.2);
      currentY += 0.5;

      try {
        const canvas = document.createElement('canvas');
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = floor.planImage!;
        });

        // --- DOWNSCALE LOGIC FOR MAP ---
        const MAX_MAP_DIM = 2500;
        let mapScale = 1;
        const origW = floor.imageDimensions!.width;
        const origH = floor.imageDimensions!.height;

        if (origW > MAX_MAP_DIM || origH > MAX_MAP_DIM) {
          mapScale = Math.min(MAX_MAP_DIM / origW, MAX_MAP_DIM / origH);
        }

        canvas.width = origW * mapScale;
        canvas.height = origH * mapScale;

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Pass the original height and the scale factor
          drawPinsOnCanvas(ctx, origH, floorFindings, mapScale);

          // Reduce JPEG quality slightly to save memory
          const imgData = canvas.toDataURL('image/jpeg', 0.8);
          const availH = lsPageHeight - currentY - margin;
          let imgW = lsContentWidth;
          let imgH = (origH * imgW) / origW;
          if (imgH > availH) {
            imgH = availH;
            imgW = (origW * imgH) / origH;
          }
          const offsetX = margin + (lsContentWidth - imgW) / 2;
          doc.addImage(imgData, 'JPEG', offsetX, currentY, imgW, imgH);
        }
      } catch (e) {
        console.error(`Failed to render map for ${floor.name}:`, e);
        doc.setFont("helvetica", "italic");
        doc.setFontSize(10);
        doc.text(`Failed to generate map image for ${floor.name}.`, margin, currentY);
      }
    }

    // ── Portrait Findings Page ──────────────────────────────────────────────
    if (floorFindings.length > 0) {
      doc.addPage('letter', 'portrait');
      currentY = margin;

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(0, 0, 0);
      doc.text(`Detailed Findings — ${floor.name}`, margin, currentY + 0.2);
      currentY += 0.5;

      for (let i = 0; i < floorFindings.length; i++) {
        const finding = floorFindings[i];
        const findingNum = i + 1;

        // 3. Keep finding together: Check for page break BEFORE drawing the block.
        checkPageBreak(3.5);

        // 1. Title
        const colorHex = getMarkerColor(finding.criticalityLevel || '');
        const [r, g, b] = hexToRgb(colorHex);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(r, g, b);
        doc.text(`Finding #${findingNum}`, margin, currentY);
        currentY += 0.25;

        // 1. Criticality immediately below title (with text wrapping)
        if (finding.criticalityLevel) {
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(0, 0, 0);
          const splitCrit = doc.splitTextToSize(`Criticality: ${finding.criticalityLevel}`, contentWidth);
          doc.text(splitCrit, margin, currentY);
          currentY += (splitCrit.length * 0.18) + 0.15;
        }

        const startBlockY = currentY;
        let leftColBottom = startBlockY;
        let rightColBottom = startBlockY;

        // 2. Photo on the Left (Standard render)
        if (finding.photoUrl) {
          try {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = finding.photoUrl!;
            });

            // --- DOWNSCALE LOGIC FOR PHOTOS ---
            const canvas = document.createElement('canvas');
            const MAX_PHOTO_DIM = 1200;
            let pScale = 1;
            if (img.width > MAX_PHOTO_DIM || img.height > MAX_PHOTO_DIM) {
              pScale = Math.min(MAX_PHOTO_DIM / img.width, MAX_PHOTO_DIM / img.height);
            }
            canvas.width = img.width * pScale;
            canvas.height = img.height * pScale;

            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

              // Reduce JPEG quality slightly
              const imgData = canvas.toDataURL('image/jpeg', 0.8);

              const maxImgWidth = 3.5;
              const maxImgHeight = 2.5;
              let imgWidth = maxImgWidth;
              // Use canvas.width/height for aspect ratio math
              let imgHeight = (canvas.height * imgWidth) / canvas.width;
              if (imgHeight > maxImgHeight) {
                imgHeight = maxImgHeight;
                imgWidth = (canvas.width * imgHeight) / canvas.height;
              }
              doc.addImage(imgData, 'JPEG', margin, startBlockY, imgWidth, imgHeight);
              leftColBottom = startBlockY + imgHeight + 0.2;
            }
          } catch (e) {
            console.error("Failed to capture finding photo", e);
            leftColBottom = startBlockY + 0.2;
          }
        }

        // 2. Text Details on the Right
        const rightColX = margin + 3.7; // Start right column after photo
        const rightColWidth = 3.3; // Remaining width (7.0 - 3.7)
        let currentRightY = startBlockY;

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);

        const writeDetailRight = (label: string, text: string | undefined | null) => {
          if (!text) return;
          doc.setFont("helvetica", "bold");
          doc.text(`${label}:`, rightColX, currentRightY);
          currentRightY += 0.15;
          doc.setFont("helvetica", "normal");
          const splitText = doc.splitTextToSize(text, rightColWidth);
          doc.text(splitText, rightColX, currentRightY);
          currentRightY += (splitText.length * 0.18) + 0.15;
        };

        writeDetailRight("Location", finding.locationLabel);
        writeDetailRight("Affected Area", finding.affectedArea);
        writeDetailRight("Description", finding.description);
        writeDetailRight("Recommendations", finding.recommendations);

        rightColBottom = currentRightY;

        // Set Y to the bottom of the longest column
        currentY = Math.max(leftColBottom, rightColBottom);

        // Separator
        currentY += 0.1;
        checkPageBreak(0.2);
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, currentY, 8.5 - margin, currentY);
        currentY += 0.3;
      }
    }
  }

  // ─── Sign-off Section ─────────────────────────────────────────────────────
  checkPageBreak(3.5);
  currentY += 0.5;

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text('Inspection Sign-off', margin, currentY);
  currentY += 0.5;

  doc.setFontSize(12);

  // Signature with PNG format to preserve transparency natively
  doc.text('Inspector Signature:', margin, currentY);
  if (signatureDataUrl) {
    // Use 'PNG' instead of 'JPEG' to avoid black background rendering on transparent pixels
    doc.addImage(signatureDataUrl, 'PNG', margin + 1.5, currentY - 0.4, 2, 0.8);
  }
  doc.setDrawColor(0, 0, 0);
  doc.line(margin + 1.5, currentY + 0.1, margin + 1.5 + 3, currentY + 0.1);
  currentY += 0.5;

  doc.setFont("helvetica", "bold");
  doc.text('Date:', margin, currentY);
  doc.setFont("helvetica", "normal");
  doc.text(inspectionDate || '', margin + 0.6, currentY);
  currentY += 0.5;

  doc.setFont("helvetica", "bold");
  doc.text('CWI Seal / Cert #:', margin, currentY);
  doc.setFont("helvetica", "normal");
  doc.text(certNumber || '', margin + 1.6, currentY);
  currentY += 0.7;



  const sanitizedTitle = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'inspection_report';
  doc.save(`${sanitizedTitle}.pdf`);
};
