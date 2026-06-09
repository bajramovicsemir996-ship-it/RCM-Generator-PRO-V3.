import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  
  try {
    if (extension === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    }
    
    if (['xlsx', 'xls', 'csv'].includes(extension || '')) {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      let text = '';
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        text += `\n--- Sheet: ${sheetName} ---\n`;
        text += XLSX.utils.sheet_to_csv(worksheet);
      });
      return text;
    }
    
    if (['txt', 'json', 'md'].includes(extension || '')) {
      return await file.text();
    }
  } catch (err) {
    console.error(`Error parsing ${file.name}:`, err);
  }
  
  return '';
}
