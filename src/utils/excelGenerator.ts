import * as XLSX from 'xlsx';
import type { Finding } from '../types';

export const exportToExcel = (findings: Finding[], projectTitle: string) => {
  // Or actually, if we want sequential dynamic numbering based on array order as requested (1, 2, 3), 
  // we shouldn't sort by locationLabel in the UI map without syncing it. Let's just use the array index for sequence.

  const data = findings.map((finding, index) => ({
    'Finding #': index + 1,
    'Location': finding.locationLabel || 'Unnamed',
    'Affected Area / Dimensions': finding.affectedArea || 'N/A',
    'Criticality Level': finding.criticalityLevel ? finding.criticalityLevel.split(' - ')[0] : 'Unassigned',
    'Description': finding.description || '',
    'Recommendations': finding.recommendations || ''
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Findings');

  // Generate file and trigger download
  const sanitizedTitle = projectTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'inspection_report';
  XLSX.writeFile(workbook, `${sanitizedTitle}.xlsx`);
};
