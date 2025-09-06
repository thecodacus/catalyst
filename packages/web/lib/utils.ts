import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  let diff = '';

  // Very simple diff implementation - you might want to use a proper diff library
  for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
    if (i >= oldLines.length) {
      diff += `+ ${newLines[i]}\n`;
    } else if (i >= newLines.length) {
      diff += `- ${oldLines[i]}\n`;
    } else if (oldLines[i] !== newLines[i]) {
      diff += `- ${oldLines[i]}\n+ ${newLines[i]}\n`;
    } else {
      diff += `  ${oldLines[i]}\n`;
    }
  }

  return diff;
}
