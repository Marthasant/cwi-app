export const getMarkerColor = (level: string): string => {
  if (!level) return '#334155'; // default gray
  if (level.includes('Level 1')) return '#ef4444'; // Red
  if (level.includes('Level 2')) return '#f59e0b'; // Amber/Orange
  if (level.includes('Level 3')) return '#3b82f6'; // Blue
  if (level.includes('Level 4')) return '#eab308'; // Yellow
  return '#334155'; // fallback
};
