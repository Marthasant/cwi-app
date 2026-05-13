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
  canvasHeight: number,
  floorFindings: Finding[]
) => {
  floorFindings.forEach((finding, i) => {
    const pinColorHex = getMarkerColor(finding.criticalityLevel || '');
    const x = finding.x;
    const y = canvasHeight - finding.y;

    ctx.beginPath();
    ctx.arc(x, y, 16, 0, 2 * Math.PI);
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
    return [
      (i + 1).toString(),
      floorName,
      f.locationLabel || 'Unnamed',
      f.criticalityLevel ? f.criticalityLevel.split(' - ')[0] : 'Unassigned',
    ];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['#', 'Floor', 'Location Label', 'Criticality']],
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
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const img = new Image();
          img.crossOrigin = 'Anonymous';
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = floor.planImage!;
          });

          canvas.width = floor.imageDimensions!.width;
          canvas.height = floor.imageDimensions!.height;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          drawPinsOnCanvas(ctx, canvas.height, floorFindings);

          const imgData = canvas.toDataURL('image/jpeg', 0.9);
          const availH = lsPageHeight - currentY - margin;
          let imgW = lsContentWidth;
          let imgH = (canvas.height * imgW) / canvas.width;
          if (imgH > availH) {
            imgH = availH;
            imgW = (canvas.width * imgH) / canvas.height;
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

        checkPageBreak(1.5);

        // Finding header (colored by criticality)
        const colorHex = getMarkerColor(finding.criticalityLevel || '');
        const [r, g, b] = hexToRgb(colorHex);
        doc.setFontSize(14);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(r, g, b);
        const headerText = `Finding #${findingNum} — ${finding.locationLabel || 'Unnamed'}`;
        const splitHeader = doc.splitTextToSize(headerText, contentWidth);
        checkPageBreak(splitHeader.length * 0.25 + 0.1);
        doc.text(splitHeader, margin, currentY);
        currentY += (splitHeader.length * 0.25) + 0.1;

        // Photo (Direct jsPDF draw — bypasses html2canvas to avoid CORS canvas tainting)
        if (finding.photoUrl) {
          try {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = finding.photoUrl!;
            });

            // Draw onto a white-filled canvas → clean JPEG (no transparency)
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0);
              const imgData = canvas.toDataURL('image/jpeg', 0.9);

              const maxImgWidth = 4;
              let imgWidth = maxImgWidth;
              let imgHeight = (canvas.height * imgWidth) / canvas.width;
              if (imgHeight > 4) {
                imgHeight = 4;
                imgWidth = (canvas.width * imgHeight) / canvas.height;
              }
              checkPageBreak(imgHeight + 0.3);
              doc.addImage(imgData, 'JPEG', margin, currentY, imgWidth, imgHeight);
              currentY += imgHeight + 0.2;
            }
          } catch (e) {
            console.error("Failed to capture finding photo", e);
          }
        }

        // Details block with text wrapping
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);

        const writeDetail = (label: string, text: string) => {
          if (!text) return;
          doc.setFont("helvetica", "bold");
          checkPageBreak(0.3);
          doc.text(`${label}: `, margin, currentY);
          doc.setFont("helvetica", "normal");
          const splitText = doc.splitTextToSize(text, contentWidth);
          checkPageBreak(splitText.length * 0.18 + 0.1);
          doc.text(splitText, margin, currentY + 0.15);
          currentY += (splitText.length * 0.18) + 0.2;
        };

        // Criticality with text wrap
        if (finding.criticalityLevel) {
          doc.setFont("helvetica", "bold");
          doc.setTextColor(0, 0, 0);
          doc.setFontSize(10);
          const splitCrit = doc.splitTextToSize(`Criticality: ${finding.criticalityLevel}`, contentWidth);
          checkPageBreak(splitCrit.length * 0.18 + 0.1);
          doc.text(splitCrit, margin, currentY);
          doc.setFont("helvetica", "normal");
          currentY += (splitCrit.length * 0.18) + 0.15;
        }

        writeDetail("Description", finding.description);
        writeDetail("Recommendations", finding.recommendations);
        if (finding.affectedArea) writeDetail("Affected Area", finding.affectedArea);

        // Separator
        currentY += 0.1;
        checkPageBreak(0.2);
        doc.setDrawColor(200, 200, 200);
        doc.line(margin, currentY, pageWidth - margin, currentY);
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
  const lineLength = 3;

  // Signature — white-canvas re-encode to obliterate any transparency before jsPDF injection
  doc.text('Inspector Signature:', margin, currentY);
  if (signatureDataUrl) {
    try {
      const sigImg = new Image();
      sigImg.crossOrigin = 'Anonymous';
      await new Promise((resolve, reject) => {
        sigImg.onload = resolve;
        sigImg.onerror = reject;
        sigImg.src = signatureDataUrl;
      });

      const sigCanvas = document.createElement('canvas');
      sigCanvas.width = sigImg.width || 400;
      sigCanvas.height = sigImg.height || 160;
      const sigCtx = sigCanvas.getContext('2d');
      if (sigCtx) {
        sigCtx.fillStyle = '#ffffff';
        sigCtx.fillRect(0, 0, sigCanvas.width, sigCanvas.height);
        sigCtx.drawImage(sigImg, 0, 0);
        const safeSigDataUrl = sigCanvas.toDataURL('image/jpeg', 1.0);
        doc.addImage(safeSigDataUrl, 'JPEG', margin + 1.5, currentY - 0.4, 2, 0.8);
      }
    } catch (e) {
      console.error("Failed to render signature", e);
    }
  }
  doc.setDrawColor(0, 0, 0);
  doc.line(margin + 1.5, currentY + 0.1, margin + 1.5 + lineLength, currentY + 0.1);
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

  // ─── Final Summary Table ──────────────────────────────────────────────────
  checkPageBreak(2.5);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text('Final Summary by Criticality', margin, currentY);
  currentY += 0.15;

  const finalCounts = {
    [CriticalityLevel.LEVEL_1]: 0,
    [CriticalityLevel.LEVEL_2]: 0,
    [CriticalityLevel.LEVEL_3]: 0,
    [CriticalityLevel.LEVEL_4]: 0,
  };
  allFindings.forEach(f => {
    if (f.criticalityLevel && Object.values(CriticalityLevel).includes(f.criticalityLevel as CriticalityLevel)) {
      finalCounts[f.criticalityLevel as CriticalityLevel]++;
    }
  });
  const finalBody = Object.values(CriticalityLevel).map(level => [
    level.split(' - ')[0],
    finalCounts[level] || 0,
  ]);
  finalBody.push(['TOTAL', allFindings.length]);

  autoTable(doc, {
    startY: currentY,
    head: [['Criticality Level', 'Count']],
    body: finalBody,
    theme: 'grid',
    headStyles: { fillColor: [40, 40, 40] },
    margin: { left: margin, right: margin },
  });

  const sanitizedTitle = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'inspection_report';
  doc.save(`${sanitizedTitle}.pdf`);
};
