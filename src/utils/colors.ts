export const getMarkerColor = (level: string): string => {
  if (!level) return '#334155';
  if (level.includes('Level 1')) return '#ef4444'; // Red
  if (level.includes('Level 2')) return '#f59e0b'; // Amber
  if (level.includes('Level 3')) return '#3b82f6'; // Blue
  if (level.includes('Level 4')) return '#22c55e'; // Green
  if (level.includes('Level 5')) return '#a855f7'; // Purple (Sprinklers)
  if (level.includes('Level 6')) return '#000000'; // Black (Gas)
  return '#334155';
};
