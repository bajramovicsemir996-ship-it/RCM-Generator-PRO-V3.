import * as XLSX from 'xlsx';
import { RCMItem } from '../types';

export const exportTechnicalTechnicalToExcel = (data: RCMItem[], studyName: string) => {
  const headers = [
    "Function", 
    "Functional failure", 
    "Component", 
    "Component Description",
    "Failure mode", 
    "ISO 14224 Code",
    "Proposed Task", 
    "Frequency",
    "Step", 
    "Action",
    "Responsibility",
    "Duration",
    "Acceptance Criteria"
  ];
  
  const rows: any[][] = [];
  
  let lastFunc = "";
  let lastFF = "";
  let lastComp = "";
  let lastFM = "";

  const sortedForExport = [...data].sort((a, b) => {
      const ft = (a.functionType || '').localeCompare(b.functionType || '');
      if (ft !== 0) return ft;
      const f = (a.function || '').localeCompare(b.function || '');
      if (f !== 0) return f;
      const ff = (a.functionalFailure || '').localeCompare(b.functionalFailure || '');
      if (ff !== 0) return ff;
      const comp = (a.component || '').localeCompare(b.component || '');
      if (comp !== 0) return comp;
      return (a.failureMode || '').localeCompare(b.failureMode || '');
  });

  sortedForExport.forEach(item => {
    const steps = item.inspectionSheet?.steps || [];
    const responsibility = item.inspectionSheet?.responsibility || "";
    const duration = item.inspectionSheet?.estimatedTime || "";

    const showFunc = item.function !== lastFunc;
    const showFF = showFunc || item.functionalFailure !== lastFF;
    const showComp = showFF || item.component !== lastComp;
    const showFM = showComp || item.failureMode !== lastFM;

    lastFunc = item.function;
    lastFF = item.functionalFailure;
    lastComp = item.component;
    lastFM = item.failureMode;

    const metadataCols = [
      showFunc ? item.function : "",
      showFF ? item.functionalFailure : "",
      showComp ? item.component : "",
      showComp ? (item.componentIntel?.description || "") : "",
      showFM ? item.failureMode : "",
      showFM ? item.iso14224Code : ""
    ];

    if (steps.length > 0) {
      steps.forEach((step, idx) => {
        const taskInfo = idx === 0 ? [item.maintenanceTask, item.interval] : ["", ""];
        const headerInfo = (idx === 0 && showFM) ? metadataCols : ["", "", "", "", "", ""];
        
        const rowData = [
          ...headerInfo,
          ...taskInfo,
          step.step,
          step.description,
          idx === 0 ? responsibility : "",
          idx === 0 ? duration : "",
          step.criteria
        ];
        
        rows.push(rowData);
      });
    } else {
      const rowData = [
        showFM ? item.function : "",
        showFF ? item.functionalFailure : "",
        showComp ? item.component : "",
        showComp ? (item.componentIntel?.description || "") : "",
        showFM ? item.failureMode : "",
        showFM ? item.iso14224Code : "",
        item.maintenanceTask,
        item.interval,
        "", "", "", "", ""
      ];
      rows.push(rowData);
    }
  });

  try {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "RCM Decision Sheet");
    
    const fileNameBase = studyName ? studyName.trim().replace(/\s+/g, '_') : 'RCM_Decision_Sheet';
    XLSX.writeFile(wb, `${fileNameBase}_Decision_Sheet.xlsx`);
  } catch (err) {
    console.error("Excel generation failed", err);
    throw err;
  }
};
