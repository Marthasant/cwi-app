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
  certNumber: string = '',
  generalComments: string = '' // New parameter
) => {
  // Helper to rank criticality (Level 1 is most critical)
  const getCritRank = (crit: string | undefined | null) => {
    if (!crit) return 99;
    if (crit.includes('Level 1')) return 1;
    if (crit.includes('Level 2')) return 2;
    if (crit.includes('Level 3')) return 3;
    if (crit.includes('Level 4')) return 4;
    if (crit.includes('Level 5')) return 5;
    if (crit.includes('Level 6')) return 6;
    return 99;
  };

  // Deep sort all findings: Floor Order -> Criticality
  const sortedFindings = [...allFindings].sort((a, b) => {
    const floorIndexA = floors.findIndex(fl => fl.id === a.floorId);
    const floorIndexB = floors.findIndex(fl => fl.id === b.floorId);
    if (floorIndexA !== floorIndexB) return floorIndexA - floorIndexB;
    return getCritRank(a.criticalityLevel) - getCritRank(b.criticalityLevel);
  });

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

  const globalCounts: Record<string, number> = {
    [CriticalityLevel.LEVEL_1]: 0,
    [CriticalityLevel.LEVEL_2]: 0,
    [CriticalityLevel.LEVEL_3]: 0,
    [CriticalityLevel.LEVEL_4]: 0,
    [CriticalityLevel.LEVEL_5]: 0,
    [CriticalityLevel.LEVEL_6]: 0,
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const indexBody: any[] = [];

  // Build index per floor to guarantee the Finding # perfectly matches the Map Pins
  floors.forEach(floor => {
    const floorFindings = sortedFindings.filter(f => f.floorId === floor.id);
    floorFindings.forEach((f, i) => {
      const shortFloor = floor.name.replace(/floor\s*/i, '').trim() || '1';

      // Clean and strip the word "Risk" to leave only "Level X"
      let shortCrit = f.criticalityLevel ? f.criticalityLevel.split(/[:\-]/)[0].trim() : 'Unassigned';
      shortCrit = shortCrit.replace(/risk\s*/i, '').trim(); // Removes 'Risk' or 'risk'

      indexBody.push([
        shortFloor,
        shortCrit, // Now yields "Level 1", "Level 2", etc.
        (i + 1).toString(),
        f.locationLabel || 'Unnamed',
        f.affectedArea || 'N/A',
      ]);
    });
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Floor', 'Criticality', 'Finding #', 'Location Label', 'Affected Area']],
    body: indexBody,
    theme: 'striped',
    headStyles: { fillColor: [60, 60, 60] },
    margin: { left: margin, right: margin },
  });


  // ─── METHODOLOGY & RISK MATRIX PAGE ────────────────────────────────────────
  doc.addPage('letter', 'portrait');
  currentY = margin;

  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  // Updated Spanish Title
  doc.text("6.0 MATRIZ DE EVALUACI\u00d3N DE RIESGO ESTRUCTURAL", margin, currentY);
  currentY += 0.3;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  const introText = "Based on the field findings, base metal degradation, and the repair parameters outlined in AWS D1.1 (Clause 8), AWS D1.3, and AWS D1.4, the following 6-tier risk classification system has been established to guide the facility's maintenance schedule. MEP hazards (Gas/Sprinklers) are evaluated under NFPA guidelines.";

  // Use native jsPDF justification options instead of manual pre-splitting
  doc.text(introText, margin, currentY, { maxWidth: contentWidth, align: 'justify' });
  const splitIntroLines = doc.splitTextToSize(introText, contentWidth);
  currentY += (splitIntroLines.length * 0.18) + 0.2;

  const riskMatrix = [
    {
      title: "Risk Level 1: CRITICAL (Immediate Structural Hazard)",
      body: "Condition: Complete perforation of the metal deck across wide areas, or >25% section loss on primary/secondary structural framing.\nCode Implication: AWS D1.3: Sheet steel too degraded for repair. AWS D1.4: Spalled concrete/exposed rebar. AWS D1.1 (Clause 8.3): Inadequate base metal.\nRequired Action: Immediate. Erect temporary shoring beneath the affected area immediately. Isolate the zone."
    },
    {
      title: "Risk Level 2: HIGH (Significant Section Loss & Capacity Reduction)",
      body: "Condition: Localized perforations in metal deck or 10% to 25% section loss on structural connections. Active water intrusion.\nCode Implication: AWS D1.1 / D1.3: Retrofit plates or angles must be installed. Requires strict thermal control to prevent burn-through.\nRequired Action: 30 to 90 Days. Stop water intrusion immediately. Mechanical cleaning to bare metal is mandatory prior to welding sistering angles."
    },
    {
      title: "Risk Level 3: MODERATE (Surface Deterioration & Impaired Weldability)",
      body: "Condition: Heavy surface rust, flaking, and complete loss of the galvanized coating. Section loss is minimal (<10%).\nCode Implication: AWS D1.1 (Clause 8.5): Base metal is structurally sound but contaminated surface prohibits safe welding without aggressive prep.\nRequired Action: 6 to 12 Months. Wire brushing or abrasive blasting to remove rust and scale, followed by high-zinc-content cold galvanizing compound."
    },
    {
      title: "Risk Level 4: LOW (Cosmetic / Early-Stage Oxidation)",
      body: "Condition: Superficial surface oxidation, staining, or localized failure of the paint/galvanized coating. No measurable section loss.\nCode Implication: Base metal remains fully compliant with original design specifications. No structural intervention required.\nRequired Action: Monitor. Include in annual visual inspection cycle. Spot cleaning and touch-up painting recommended."
    },
    {
      title: "Risk Level 5: LIFE SAFETY (Sprinkler Pipe Hazard)",
      body: "Condition: Severe corrosion, pitting, or loss of structural support on fire sprinkler piping.\nCode Implication: NFPA 25: Impaired fire protection system. Welding near pressurized water lines requires strict safety protocols.\nRequired Action: Immediate. Notify building management. Isolate/drain affected zone to replace compromised hangers or pipe sections."
    },
    {
      title: "Risk Level 6: EXTREME DANGER (Flammable Gas Hazard)",
      body: "Condition: Degradation, severe corrosion, or failing supports on natural gas supply lines within the structure.\nCode Implication: NFPA 54 / ASME B31.8: Imminent explosion/fire hazard. Absolutely NO HOT WORK (welding/grinding) permitted in vicinity.\nRequired Action: EMERGENCY. Evacuate immediate area. Shut off main valves. Contact utility provider and certified gas fitters immediately."
    }
  ];

  riskMatrix.forEach(risk => {
    checkPageBreak(1.5);
    doc.setFont("helvetica", "bold");
    doc.text(risk.title, margin, currentY);
    currentY += 0.2;
    doc.setFont("helvetica", "normal");

    // Apply justified alignment to risk definitions
    doc.text(risk.body, margin, currentY, { maxWidth: contentWidth, align: 'justify' });
    const splitBodyLines = doc.splitTextToSize(risk.body, contentWidth);
    currentY += (splitBodyLines.length * 0.18) + 0.2;
  });

  // ─── PER-FLOOR LOOP ──────────────────────────────────────────────────────

  for (const floor of floors) {
    // CRITICAL: Use sortedFindings here so Map Pins and Photo Details perfectly sync with the Index
    const floorFindings = sortedFindings.filter(f => f.floorId === floor.id);

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

        // 1. Criticality immediately below title (Truncated to name only)
        if (finding.criticalityLevel) {
          const shortCritLabel = finding.criticalityLevel.split('(')[0].trim();
          doc.setFontSize(10);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(0, 0, 0);
          doc.text(`Criticality: ${shortCritLabel}`, margin, currentY);
          currentY += 0.25;
        }

        const startBlockY = currentY;
        let leftColBottom = startBlockY;
        let rightColBottom = startBlockY;

        // 2. Photo on the Left (Aggressively compressed for memory safety)
        if (finding.photoUrl) {
          try {
            const img = new Image();
            img.crossOrigin = 'Anonymous';
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = finding.photoUrl!;
            });

            // --- ULTRA-DOWNSCALE LOGIC FOR HUGE REPORTS ---
            const canvas = document.createElement('canvas');
            // Restrict to max 800px to save massive amounts of RAM during 40+ photo loops
            const MAX_PHOTO_DIM = 800;
            let pScale = 1;
            if (img.width > MAX_PHOTO_DIM || img.height > MAX_PHOTO_DIM) {
              pScale = Math.min(MAX_PHOTO_DIM / img.width, MAX_PHOTO_DIM / img.height);
            }
            canvas.width = img.width * pScale;
            canvas.height = img.height * pScale;

            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (ctx) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

              // Aggressive compression: 0.6 is visually fine for PDF reports but saves ~50% string length
              const imgData = canvas.toDataURL('image/jpeg', 0.6);

              const maxImgWidth = 3.5;
              const maxImgHeight = 2.5;
              let imgWidth = maxImgWidth;
              let imgHeight = (canvas.height * imgWidth) / canvas.width;

              if (imgHeight > maxImgHeight) {
                imgHeight = maxImgHeight;
                imgWidth = (canvas.width * imgHeight) / canvas.height;
              }

              doc.addImage(imgData, 'JPEG', margin, startBlockY, imgWidth, imgHeight);
              leftColBottom = startBlockY + imgHeight + 0.2;

              // FORCE GARBAGE COLLECTION HINTS
              canvas.width = 0;
              canvas.height = 0;
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



  // ─── General Comments ─────────────────────────────────────────────────────
  checkPageBreak(2.0);
  currentY += 0.5;
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text('General Comments:', margin, currentY);
  currentY += 0.3;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  if (generalComments && generalComments.trim().length > 0) {
    // Print typed comments perfectly justified
    doc.text(generalComments, margin, currentY, { maxWidth: contentWidth, align: 'justify' });
    const splitCommentLines = doc.splitTextToSize(generalComments, contentWidth);
    currentY += (splitCommentLines.length * 0.18) + 0.4;
  } else {
    // Fallback: draw blank lines if no comments were typed
    doc.setDrawColor(150, 150, 150);
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 0.4;
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 0.4;
    doc.line(margin, currentY, pageWidth - margin, currentY);
    currentY += 0.5;
  }

  const sanitizedTitle = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'inspection_report';
  doc.save(`${sanitizedTitle}.pdf`);
};
