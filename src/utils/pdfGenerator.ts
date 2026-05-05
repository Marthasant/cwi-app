import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import html2canvas from 'html2canvas';
import type { Finding } from '../types';
import { CriticalityLevel } from '../types';

export const getHexColor = (level: string): string => {
  if (level.includes('Level 1')) return '#ef4444'; // Red
  if (level.includes('Level 2')) return '#f97316'; // Orange
  if (level.includes('Level 3')) return '#3b82f6'; // Blue
  if (level.includes('Level 4')) return '#facc15'; // Yellow
  return '#64748b'; // Gray
};

const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16)
  ] : [0, 0, 0];
};

export const generatePdfReport = async (
  findings: Finding[], 
  projectName: string = "Structural Inspection Report", 
  inspectorName: string = "",
  planImage: string | null = null,
  imageDimensions: { width: number, height: number } | null = null,
  signatureDataUrl?: string
) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in', // inches for Letter size
    format: 'letter', // 8.5 x 11
  });

  const pageWidth = 8.5;
  const pageHeight = 11;
  const margin = 0.75; // 0.75 inches margin
  const contentWidth = 7.0; // 8.5 - 1.5
  let currentY = margin;

  // Helper to add page if needed
  const checkPageBreak = (requiredSpace: number) => {
    if (currentY + requiredSpace > pageHeight - margin) {
      doc.addPage();
      currentY = margin;
      return true;
    }
    return false;
  };

  // --- PAGE 1: Cover & Executive Summary ---
  
  // Header: Project Title (Centered)
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  const splitTitle = doc.splitTextToSize(projectName, pageWidth - (margin * 2));
  const titleLines = splitTitle.length;
  // Center alignment logic
  splitTitle.forEach((line: string, index: number) => {
    const textWidth = doc.getStringUnitWidth(line) * doc.getFontSize() / 72;
    doc.text(line, (pageWidth - textWidth) / 2, currentY + (index * 0.35) + 0.2);
  });
  currentY += (titleLines * 0.35) + 0.3;

  // Date & Inspector (Centered)
  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  const dateStr = `Date: ${new Date().toLocaleDateString()}`;
  const inspStr = `Inspector: ${inspectorName || 'Not specified'}`;
  
  const dateWidth = doc.getStringUnitWidth(dateStr) * doc.getFontSize() / 72;
  doc.text(dateStr, (pageWidth - dateWidth) / 2, currentY);
  currentY += 0.2;
  
  const inspWidth = doc.getStringUnitWidth(inspStr) * doc.getFontSize() / 72;
  doc.text(inspStr, (pageWidth - inspWidth) / 2, currentY);
  currentY += 0.5;

  // Summary by Criticality (autotable)
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Summary by Criticality", margin, currentY);
  currentY += 0.15;

  const criticalityCounts = {
    [CriticalityLevel.LEVEL_1]: 0,
    [CriticalityLevel.LEVEL_2]: 0,
    [CriticalityLevel.LEVEL_3]: 0,
    [CriticalityLevel.LEVEL_4]: 0,
  };
  findings.forEach(f => {
    if (f.criticalityLevel && Object.values(CriticalityLevel).includes(f.criticalityLevel as CriticalityLevel)) {
      criticalityCounts[f.criticalityLevel as CriticalityLevel]++;
    }
  });

  const summaryBody = Object.values(CriticalityLevel).map(level => {
    return [level.split(' - ')[0], criticalityCounts[level] || 0];
  });

  autoTable(doc, {
    startY: currentY,
    head: [['Criticality Level', 'Count']],
    body: summaryBody,
    theme: 'grid',
    headStyles: { fillColor: [40, 40, 40] },
    margin: { left: margin, right: margin },
  });
  
  currentY = (doc as any).lastAutoTable.finalY + 0.4;

  // General Index (autotable)
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("General Index", margin, currentY);
  currentY += 0.15;

  const indexBody = findings.map((f, i) => [
    (i + 1).toString(),
    f.locationLabel || 'Unnamed',
    f.criticalityLevel ? f.criticalityLevel.split(' - ')[0] : 'Unassigned'
  ]);

  autoTable(doc, {
    startY: currentY,
    head: [['Finding #', 'Location Label', 'Criticality Level']],
    body: indexBody,
    theme: 'striped',
    headStyles: { fillColor: [60, 60, 60] },
    margin: { left: margin, right: margin },
  });


  // --- PAGE 2: The Master Plan (Visual Index) ---
  doc.addPage();
  currentY = margin;
  
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Master Map", margin, currentY + 0.2);
  currentY += 0.4;

  if (planImage && imageDimensions) {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Load image
        const img = new Image();
        img.crossOrigin = 'Anonymous';
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = planImage;
        });

        canvas.width = imageDimensions.width;
        canvas.height = imageDimensions.height;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        // Draw pins directly on canvas at X/Y relative coords
        findings.forEach((finding, i) => {
          const pinColorHex = getHexColor(finding.criticalityLevel || '');
          const x = finding.x;
          const y = canvas.height - finding.y;

          ctx.beginPath();
          ctx.arc(x, y, 16, 0, 2 * Math.PI);
          ctx.fillStyle = pinColorHex;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#000000';
          ctx.stroke();

          ctx.fillStyle = '#000000';
          ctx.font = 'bold 16px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText((i + 1).toString(), x, y);
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.9);
        const imgWidth = contentWidth;
        let imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        const maxAvailableHeight = pageHeight - currentY - margin;
        if (imgHeight > maxAvailableHeight) {
          imgHeight = maxAvailableHeight;
          const scaledWidth = (canvas.width * imgHeight) / canvas.height;
          const offsetX = margin + ((contentWidth - scaledWidth) / 2);
          doc.addImage(imgData, 'JPEG', offsetX, currentY, scaledWidth, imgHeight);
        } else {
          doc.addImage(imgData, 'JPEG', margin, currentY, imgWidth, imgHeight);
        }
      }
    } catch (e) {
      console.error("Failed to capture master map with canvas", e);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(10);
      doc.text("Failed to generate master map image.", margin, currentY);
    }
  }


  // --- PAGE 3+: Detailed Findings Log ---
  if (findings.length > 0) {
    doc.addPage();
    currentY = margin;
    
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text('Detailed Findings Log', margin, currentY + 0.2);
    currentY += 0.5;

    for (let i = 0; i < findings.length; i++) {
      const finding = findings[i];
      const findingNum = i + 1;
      
      // Pre-calculate space needed for Header
      checkPageBreak(1.5); // Minimum space needed to start a finding
      
      // Header: Finding #[Number] - [Location Label]
      const colorHex = getHexColor(finding.criticalityLevel || '');
      const [r, g, b] = hexToRgb(colorHex);
      
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(r, g, b);
      doc.text(`Finding #${findingNum} - ${finding.locationLabel || 'Unnamed'}`, margin, currentY);
      currentY += 0.3;

      // Photo
      if (finding.photoUrl) {
        try {
          const photoElement = document.getElementById(`pdf-photo-${finding.id}`);
          if (photoElement && photoElement.firstElementChild) {
            const imgEl = photoElement.firstElementChild as HTMLImageElement;
            const canvas = await html2canvas(imgEl, { scale: 2, useCORS: true, allowTaint: true });
            const imgData = canvas.toDataURL('image/jpeg', 0.9);
            
            const maxImgWidth = 4; // 4 inches wide
            let imgWidth = maxImgWidth;
            let imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            // If the photo is extremely tall, limit height
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

      // Details Block
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

      if (finding.criticalityLevel) {
        doc.setFont("helvetica", "bold");
        doc.text(`Criticality: `, margin, currentY);
        doc.setFont("helvetica", "normal");
        doc.text(finding.criticalityLevel, margin + 0.8, currentY);
        currentY += 0.25;
      }

      writeDetail("Description", finding.description);
      writeDetail("Recommendations", finding.recommendations);
      if (finding.affectedArea) {
        writeDetail("Affected Area", finding.affectedArea);
      }

      // Separator Line
      currentY += 0.1;
      checkPageBreak(0.2);
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, currentY, pageWidth - margin, currentY);
      currentY += 0.3;
    }
  }

  // --- Sign-off Section ---
  checkPageBreak(2.5); // Ensure space for sign-off
  
  currentY += 0.5;
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text('Inspection Sign-off', margin, currentY);
  currentY += 0.5;

  doc.setFontSize(12);
  doc.setFont("helvetica", "normal");

  const lineLength = 3;

  doc.text('Inspector Signature:', margin, currentY);
  if (signatureDataUrl) {
    doc.addImage(signatureDataUrl, 'PNG', margin + 1.5, currentY - 0.4, 2, 0.8);
  }
  doc.setDrawColor(0, 0, 0);
  doc.line(margin + 1.5, currentY + 0.1, margin + 1.5 + lineLength, currentY + 0.1);
  currentY += 0.5;

  doc.text('Date:', margin, currentY);
  doc.line(margin + 0.5, currentY, margin + 0.5 + lineLength, currentY);
  currentY += 0.5;

  doc.text('CWI Seal / Cert #:', margin, currentY);
  doc.line(margin + 1.5, currentY, margin + 1.5 + lineLength, currentY);

  const sanitizedTitle = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'inspection_report';
  doc.save(`${sanitizedTitle}.pdf`);
};
