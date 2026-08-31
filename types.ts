
export interface InspectionStep {
  id?: string;
  step: number;
  description: string;
  criteria: string;
  technique: string;
}

export interface InspectionSheet {
  responsibility: string;
  estimatedTime: string;
  safetyPrecautions: string;
  toolsRequired: string;
  steps: InspectionStep[];
  
  checkPointDescription?: string;
  type?: 'Qualitative' | 'Quantitative';
  criteriaLimits?: string; 
  normalCondition?: string; 
}

export interface ComponentIntel {
  description: string;
  location: string;
  visualCues: string;
}

export type ConsequenceCategory = 
  | 'Hidden - Safety/Env' 
  | 'Hidden - Operational' 
  | 'Evident - Safety/Env' 
  | 'Evident - Operational'
  | 'Evident - Non-Operational';

export interface RBIAnalysis {
  probabilityOfFailure: number; // 1-5
  consequenceOfFailure: number; // 1-5
  riskScore: number;
  riskCategory: 'Low' | 'Medium' | 'Medium-High' | 'High';
  damageMechanisms: string[];
  recommendedInspectionType: string;
  recommendedInspectionInterval: string;
  aiJustification: string;
}

export interface RCMItem {
  id: string;
  component: string;
  componentType: 'Electrical' | 'Mechanical';
  functionType: 'Primary' | 'Secondary';
  function: string;
  functionalFailure: string;
  failureMode: string;
  failureEffect: string;
  criticality: 'High' | 'Medium' | 'Low';
  
  consequenceCategory: ConsequenceCategory;
  iso14224Code: string;

  severity: number;
  occurrence: number;
  detection: number;
  rpn: number;

  maintenanceTask: string;
  interval: string;
  pfInterval?: string; // New field for reliability optimization
  taskType: 'Condition Monitoring' | 'Time-Based' | 'Run-to-Failure' | 'Redesign' | 'Failure Finding' | 'Lubrication' | 'Servicing' | 'Restoration' | 'Replacement' | 'Training' | 'Procedural Change';
  inspectionSheet?: InspectionSheet;
  componentIntel?: ComponentIntel;
  rbiAnalysis?: RBIAnalysis;
  
  // LCC and Resource Management Fields
  responsibleGroup?: 'Mechanic' | 'Electric' | 'Hydraulic' | 'Automation';
  pmParts?: { name: string; cost: number }[];
  rtfParts?: { name: string; cost: number }[];
  pmPersonnelCount?: number;
  rtfPersonnelCount?: number;
  pmTaskDuration?: string; // Standard format for LCC
  annualRunningHours?: number; // Specific for asset-level LCC
  
  isNew?: boolean;
  isMiraGenerated?: boolean;
  isApproved?: boolean;
  sourceStudyName?: string;
}

export interface AnalysisStats {
  totalItems: number;
  highRisk: number;
  mediumRisk: number;
  lowRisk: number;
}

export type InputMode = 'manual' | 'upload';

export interface DrawingPoint {
  x: number;
  y: number;
}

export interface DrawingShape {
  id: string;
  type: 'freehand' | 'circle' | 'rectangle';
  color: string;
  strokeWidth: number;
  points: DrawingPoint[]; // For freehand, circle (2 points: center, edge), rectangle (2 points: topleft, bottomright)
  x?: number;
  y?: number;
}

export interface FileData {
  name: string;
  mimeType: string;
  data: string;
  extractedText?: string;
  pins?: ImagePin[];
  drawings?: DrawingShape[];
}

export interface ImagePin {
  id: string;
  x: number;
  y: number;
  note: string;
}

export interface Folder {
  id: string;
  name: string;
  timestamp: number;
}

export interface SavedStudy {
  id: string;
  name: string;
  timestamp: number;
  items: RCMItem[];
  contextText: string;
  language?: string;
  fileName?: string;
  folderId?: string;
  isFinished?: boolean;
  filesData?: FileData[];
  scheduledTasks?: Record<string, string[]>;
  techCounts?: Record<string, { dayshift: number, rotating: number, brigadeCount: number }>;
  executionConditions?: Record<string, { condition: 'running' | 'stopped', startDate?: string, dayOfWeek?: string, shiftType?: 'dayshift' | 'rotating' }>;
  globalStoppageStartDate?: string;
  globalStoppageDayOfWeek?: string;
}

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
      getApiKey?: () => string | undefined; // Added getApiKey
    };
  }
}