/**
 * Parses raw file content into a structured format.
 * @param content - The raw file content as a string.
 * @param type - The type of file (e.g., 'json', 'csv').
 * @returns An array of objects representing the data.
 */
export function parseFileContent(content: string, type: 'json' | 'csv' = 'json'): Record<string, any>[] {
  if (type === 'json') {
    try {
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (e) {
      console.error('Error parsing JSON', e);
      return [];
    }
  }
  
  // Basic CSV parser placeholder
  if (type === 'csv') {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length === 0) return [];
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const values = line.split(',');
      const row: Record<string, any> = {};
      headers.forEach((h, i) => {
        row[h] = values[i]?.trim();
      });
      return row;
    });
  }

  return [];
}
