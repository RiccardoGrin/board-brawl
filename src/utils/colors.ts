import { colord, extend } from 'colord';
import a11yPlugin from 'colord/plugins/a11y';
import namesPlugin from 'colord/plugins/names';
import labPlugin from 'colord/plugins/lab';

extend([a11yPlugin, namesPlugin, labPlugin]);

// Original predefined colors
const BASE_COLORS = [
  '#ef4444', // red-500
  '#3b82f6', // blue-500
  '#10b981', // emerald-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
  '#6366f1', // indigo-500
  '#14b8a6', // teal-500
];

export const PREDEFINED_COLORS = BASE_COLORS;

// Check if two colors are too similar using Delta E
// A Delta E < 10 is usually considered quite similar to the human eye
export const isSimilarColor = (color1: string, color2: string, threshold = 12): boolean => {
  return colord(color1).delta(color2) < threshold;
};

export const getRandomColor = (existingColors: string[] = []): string => {
  // First try to pick a predefined color that isn't used
  const unusedPredefined = BASE_COLORS.filter(c => 
    !existingColors.some(existing => isSimilarColor(c, existing))
  );
  
  if (unusedPredefined.length > 0) {
    return unusedPredefined[Math.floor(Math.random() * unusedPredefined.length)];
  }

  // If all predefined are used (or similar ones exist), generate a random one
  // that is distinct enough from existing colors
  let attempts = 0;
  let newColor = '';
  
  do {
    newColor = colord({
      h: Math.floor(Math.random() * 360),
      s: Math.floor(Math.random() * 50) + 50, // 50-100% saturation
      l: Math.floor(Math.random() * 40) + 30, // 30-70% lightness
    }).toHex();
    attempts++;
  } while (
    attempts < 50 && 
    existingColors.some(existing => isSimilarColor(newColor, existing))
  );

  return newColor;
};

export const isValidHex = (hex: string): boolean => {
  return colord(hex).isValid();
};
