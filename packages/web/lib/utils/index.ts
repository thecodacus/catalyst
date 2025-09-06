export function generateDiff(oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');
  const diff: string[] = [];
  
  // Simple diff implementation - for production, consider using a proper diff library
  let oldIndex = 0;
  let newIndex = 0;
  
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex >= oldLines.length) {
      // Remaining new lines
      diff.push(`+ ${newLines[newIndex]}`);
      newIndex++;
    } else if (newIndex >= newLines.length) {
      // Remaining old lines
      diff.push(`- ${oldLines[oldIndex]}`);
      oldIndex++;
    } else if (oldLines[oldIndex] === newLines[newIndex]) {
      // Matching lines
      diff.push(`  ${oldLines[oldIndex]}`);
      oldIndex++;
      newIndex++;
    } else {
      // Different lines - simple approach, show as removed then added
      diff.push(`- ${oldLines[oldIndex]}`);
      diff.push(`+ ${newLines[newIndex]}`);
      oldIndex++;
      newIndex++;
    }
  }
  
  return diff.join('\n');
}