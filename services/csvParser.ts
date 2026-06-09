export interface FunctionalLocation {
  code: string;
  level: string;
  name: string;
}

export const parseCSV = (csvText: string): FunctionalLocation[] => {
  const lines = csvText.split('\n').filter(line => line.trim() !== '');
  if (lines.length < 2) return [];
  
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
  const codeIdx = headers.findIndex(h => h.includes('code') || h.includes('id') || h.includes('loc'));
  const levelIdx = headers.findIndex(h => h.includes('level'));
  const nameIdx = headers.findIndex(h => h.includes('name') || h.includes('desc'));

  const locs: FunctionalLocation[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(cell => cell.replace(/^"|"$/g, '').trim());
    
    locs.push({
      code: codeIdx >= 0 ? row[codeIdx] || '' : row[0] || '',
      level: levelIdx >= 0 ? row[levelIdx] || '' : row[1] || '',
      name: nameIdx >= 0 ? row[nameIdx] || '' : row[2] || ''
    });
  }
  return locs;
};
