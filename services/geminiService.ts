import { GoogleGenAI, Type } from "@google/genai";
import { RCMItem, FileData, InspectionSheet, ComponentIntel } from "../types";

// Define the expected output schema for structured JSON
const inspectionSchema = {
  type: Type.OBJECT,
  properties: {
    responsibility: { type: Type.STRING },
    estimatedTime: { type: Type.STRING },
    safetyPrecautions: { type: Type.STRING },
    toolsRequired: { type: Type.STRING },
    steps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          step: { type: Type.INTEGER },
          description: { type: Type.STRING },
          criteria: { type: Type.STRING },
          technique: { type: Type.STRING }
        },
        required: ["step", "description", "criteria", "technique"]
      }
    }
  },
  required: ["responsibility", "estimatedTime", "safetyPrecautions", "toolsRequired", "steps"]
};

const rcmSchema = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      id: {
        type: Type.STRING,
        description: "The unique identifier for the item. Must be preserved exactly."
      },
      functionType: { 
        type: Type.STRING, 
        enum: ['Primary', 'Secondary'],
        description: "The category of the function."
      },
      function: { 
        type: Type.STRING,
        description: "The asset-level function description. Example: 'Maintain 50 bar discharge pressure' or 'Provide structural containment of lubricant'."
      },
      functionalFailure: { 
        type: Type.STRING,
        description: "The specific way the function is lost (e.g., 'Total loss of discharge pressure', 'External lubricant leakage')."
      },
      component: { 
        type: Type.STRING, 
        description: "The specific component within the assembly that contributes to this functional failure." 
      },
      componentType: {
        type: Type.STRING,
        enum: ['Electrical', 'Mechanical'],
        description: "Categorize if the component is primarily electrical or mechanical."
      },
      componentIntel: {
        type: Type.OBJECT,
        properties: {
          description: { 
            type: Type.STRING, 
            description: "A very brief technical summary of the component (1 sentence)." 
          },
          location: { type: Type.STRING, description: "Brief physical location." },
          visualCues: { type: Type.STRING, description: "Key visual identification features." }
        },
        required: ["description", "location", "visualCues"]
      },
      failureMode: { 
        type: Type.STRING,
        description: "[Mechanism] due to [Cause]. Include technical and human-induced causes."
      },
      failureEffect: { 
        type: Type.STRING,
        description: "Operational and safety impact."
      },
      consequenceCategory: {
        type: Type.STRING,
        enum: [
          'Hidden - Safety/Env', 
          'Hidden - Operational', 
          'Evident - Safety/Env', 
          'Evident - Operational',
          'Evident - Non-Operational'
        ]
      },
      iso14224Code: { 
        type: Type.STRING,
        enum: ["BRD", "LOP", "ELP", "INL", "VIB", "OHE", "STP", "FTS", "FTC", "FTO", "UST", "NOI", "LCP", "OTH"],
        description: "Strict ISO 14224 Failure Mechanism Code. Use ONLY the 3-letter shorthand code."
      },
      criticality: { type: Type.STRING, enum: ["High", "Medium", "Low"] },
      severity: { type: Type.INTEGER, description: "1-10 Scale. Rigorous scoring: 9-10 for Safety/Env, 7-8 for total production loss." },
      occurrence: { type: Type.INTEGER, description: "1-10 Scale. Be conservative; assume higher frequencies for complex mechanical wear." },
      detection: { type: Type.INTEGER, description: "1-10 Scale. 7-10 for manual/periodic checks; 1-3 only for continuous automated monitoring." },
      maintenanceTask: { 
        type: Type.STRING,
        description: "Exactly one technical maintenance task."
      },
      interval: { type: Type.STRING },
      taskType: {
        type: Type.STRING,
        enum: [
          'Condition Monitoring', 
          'Time-Based', 
          'Run-to-Failure', 
          'Redesign',
          'Failure Finding',
          'Lubrication',
          'Servicing',
          'Restoration',
          'Replacement',
          'Training',
          'Procedural Change'
        ]
      }
    },
    required: ["id", "functionType", "component", "componentType", "componentIntel", "function", "functionalFailure", "failureMode", "failureEffect", "consequenceCategory", "iso14224Code", "criticality", "severity", "occurrence", "detection", "maintenanceTask", "interval", "taskType"]
  }
};

const componentIntelSchema = {
  type: Type.OBJECT,
  properties: {
    description: { type: Type.STRING },
    location: { type: Type.STRING },
    visualCues: { type: Type.STRING }
  },
  required: ["description", "location", "visualCues"]
};

// Helper function to reliably get the API key
const getApiKey = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === 'undefined') {
    throw new Error("Gemini API Key is missing. Please ensure it is set in your project settings.");
  }
  return key;
};

export const generateRCMAnalysis = async (
  contextText: string,
  filesData: FileData[] | null,
  language: string = 'English',
  existingItems: RCMItem[] = []
): Promise<RCMItem[]> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  const fileParts: any[] = [];
  const textParts: string[] = [];

  if (filesData) {
    for (const file of filesData) {
      const supportedMediaTypes = [
        'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
        'application/pdf', 'text/plain', 'text/csv', 'text/html'
      ];

      if (supportedMediaTypes.includes(file.mimeType)) {
        fileParts.push({
          inlineData: {
            data: file.data,
            mimeType: file.mimeType
          }
        });
      }
      
      if (file.extractedText) {
        textParts.push(`[File Content: ${file.name}]\n${file.extractedText}`);
      }
    }
  }

  const prompt = `
    Analyze this asset as a WHOLE assembly using all provided technical documentation.
    Operational Context: ${contextText}
    ${textParts.join('\n')}
    Target Language: ${language}
    IMPORTANT: You MUST generate at least 35-40 unique and technically detailed failure modes (RCM items). 
    The analysis must be EXHAUSTIVE, covering every critical and secondary component mentioned or implied by the assembly type.
    Ensure each failure mode is distinct and follows SAE JA1011 standards.
    Existing items to avoid duplicates (DO NOT repeat these): ${JSON.stringify(existingItems.map(i => i.failureMode))}

    EXCLUSIVITY RULE: All descriptive text for the RCM analysis MUST be written EXCLUSIVELY in ${language}. 
    Do NOT include English translations or mixed-language descriptions. If the target language is ${language}, provide ONLY ${language}.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [
      { 
        role: 'user', 
        parts: [
          ...fileParts,
          { text: prompt }
        ] 
      }
    ],
    config: {
      systemInstruction: `You are a Lead RCM Engineer specializing in massive asset assemblies. 
      Your task is to provide an EXHAUSTIVE list of at least 35-40 failure modes per request. 
      Do not stop early. Analyze every sub-system and functional failure path in extreme detail.
      Produce valid, high-density technical analysis EXCLUSIVELY in ${language}. 
      NEVER use English words for technical descriptions unless the target language is English or it is a highly standardized technical code.`,
      responseMimeType: "application/json",
      responseSchema: rcmSchema as any,
      temperature: 0.4,
    },
  });

  const parsed = JSON.parse(response.text || "[]") as RCMItem[];
  return parsed.map(item => ({
    ...item,
    id: `rcm-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    rpn: (item.severity || 1) * (item.occurrence || 1) * (item.detection || 1),
    isNew: true,
    isApproved: false
  }));
};

export const extractOperationalContext = async (filesData: FileData[], language: string = 'English'): Promise<string> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  const parts: any[] = [];
  const supportedMediaTypes = [
    'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif',
    'application/pdf', 'text/plain', 'text/csv', 'text/html'
  ];

  for (const file of filesData) {
    if (supportedMediaTypes.includes(file.mimeType)) {
      parts.push({
        inlineData: {
          data: file.data,
          mimeType: file.mimeType
        }
      });
    }
    
    if (file.extractedText) {
      parts.push({ text: `[TEXT CONTENT FROM ${file.name}]:\n${file.extractedText}` });
    }
  }

  const instructionPrompt = `Synthesize a comprehensive "Operational Context" for this asset in ${language}. Section titles in CAPITAL LETTERS. NO markdown.`;
  parts.push({ text: instructionPrompt });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: parts }],
    config: { temperature: 0.1 }
  });

  return response.text || "No context extracted.";
};

export const extractMaintenanceLogic = async (filesData: FileData[], language: string = 'English'): Promise<string> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  const parts: any[] = [];
  for (const file of filesData) {
    if (file.extractedText) {
      parts.push({ text: `[MAINTENANCE PLAN DATA FROM ${file.name}]:\n${file.extractedText}` });
    }
  }

  const instructionPrompt = `Analyze legacy maintenance data and convert it into a "Standard Operational Context" fragment in ${language}. NO markdown. CAPITAL LETTERS for sections.`;
  parts.push({ text: instructionPrompt });

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: parts }],
    config: { temperature: 0.1 }
  });

  return response.text || "No maintenance logic extracted.";
};

export const generateInspectionSheet = async (item: RCMItem, language: string = 'English'): Promise<InspectionSheet> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `Generate technical field inspection sheet for: ${item.component}, ${item.failureMode}. Language: ${language}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: inspectionSchema as any,
      temperature: 0.4
    },
  });

  return JSON.parse(response.text || "{}") as InspectionSheet;
};

export const generateComponentIntel = async (componentName: string, language: string = 'English'): Promise<ComponentIntel> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `
    Provide deep technical engineering intelligence for the component: "${componentName}".
    Language: ${language}
    
    REQUIRED CONTENT:
    1. Comprehensive technical description (3-4 sentences) including material properties, internal architecture, and functional role.
    2. Precise spatial location and typical mounting configuration.
    3. Unique visual identification markers and observable wear/degradation characteristics.
    
    Target Audience: Expert Maintenance Engineers.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: componentIntelSchema as any,
      temperature: 0.3
    }
  });

  return JSON.parse(response.text || "{}") as ComponentIntel;
};

export const classifyTasksExecution = async (tasks: any[]): Promise<Record<string, { condition: 'running' | 'stopped', shiftType: 'dayshift' | 'rotating' }>> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  // Strip tasks to only necessary fields to reduce payload size and improve speed
  const strippedTasks = tasks.map(t => ({
    id: t.id,
    title: t.title,
    component: t.component,
    type: t.type,
    interval: t.interval
  }));

  const prompt = `
    Analyze the following maintenance tasks and determine:
    1. Condition: Whether the task should be performed while the asset is 'running' or 'stopped' (planned stoppage).
    2. Shift Type: Whether it should be done by a fixed 'dayshift' (standard business hours) or a 'rotating' shift (24/7 coverage).
    
    Tasks: ${JSON.stringify(strippedTasks)}
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "You are an expert Maintenance Planner. Formulate technical execution conditions (Running vs Stopped) and Shift Assignments (Day vs Rotating) based on the task description and common industry safety standards.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          additionalProperties: {
            type: Type.OBJECT,
            properties: {
              condition: { type: Type.STRING, enum: ["running", "stopped"] },
              shiftType: { type: Type.STRING, enum: ["dayshift", "rotating"] }
            },
            required: ["condition", "shiftType"]
          }
        } as any,
        temperature: 0.1
      }
    });
    
    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Error classifying tasks execution:", error);
    return {};
  }
};

export const optimizeSchedule = async (
  tasks: any[],
  techCounts: Record<string, number>,
  year: number,
  month: number
): Promise<Record<string, string>> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  const strippedTasks = tasks.map(t => ({
    id: t.id,
    title: t.title,
    duration: t.duration,
    interval: t.interval,
    personnelCount: t.personnelCount
  }));

  const prompt = `Optimize maintenance schedule: ${year}-${month+1}. Techs: ${JSON.stringify(techCounts)}. Tasks: ${JSON.stringify(strippedTasks)}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: "You are a specialized Maintenance Scheduler. Allocate tasks to specific dates in the given month while respecting workforce capacity limits.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          additionalProperties: { type: Type.STRING }
        } as any,
        temperature: 0.1
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Failed to optimize schedule:", error);
    return {};
  }
};

export const rationalizeTasks = async (tasks: any[], requiredHours: number, capacityHours: number, language: string = 'English') => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const strippedTasks = tasks.map(t => ({
    id: t.id,
    title: t.title,
    duration: t.duration,
    interval: t.interval,
    criticality: t.criticality,
    failureEffect: t.failureEffect
  }));

  const prompt = `Rationalize tasks: Required: ${requiredHours}, Capacity: ${capacityHours}. Tasks: ${JSON.stringify(strippedTasks)}. Target Language: ${language}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: `You are a Strategy Asset Auditor. Identify redundant or low-value tasks. All technical justifications and suggested intervals MUST be written EXCLUSIVELY in ${language}.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              taskId: { type: Type.STRING },
              action: { type: Type.STRING, enum: ["extend", "delete"] },
              suggestedInterval: { type: Type.STRING },
              hoursSaved: { type: Type.NUMBER },
              justification: { type: Type.STRING }
            },
            required: ["taskId", "action", "hoursSaved", "justification"]
          }
        } as any,
        temperature: 0.2
      }
    });
    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Error rationalizing tasks:", error);
    return [];
  }
};

export const suggestTaskBundles = async (tasks: any[], language: string = 'English') => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });

  const strippedTasks = tasks.map(t => ({
    id: t.id,
    title: t.title,
    component: t.component,
    interval: t.interval,
    type: t.type
  }));

  const prompt = `Suggest task bundles: ${JSON.stringify(strippedTasks)}. Target Language: ${language}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: `You are a Maintenance Optimization Expert. Group similar tasks. Bundle names and intervals MUST be written EXCLUSIVELY in ${language}.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              interval: { type: Type.STRING },
              taskIds: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["name", "interval", "taskIds"]
          }
        } as any,
        temperature: 0.2
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Error suggesting bundles:", error);
    return [];
  }
};

const rbiSchema = {
  type: Type.OBJECT,
  properties: {
    probabilityOfFailure: { type: Type.INTEGER },
    consequenceOfFailure: { type: Type.INTEGER },
    riskScore: { type: Type.INTEGER },
    riskCategory: { type: Type.STRING, enum: ['Low', 'Medium', 'Medium-High', 'High'] },
    damageMechanisms: { type: Type.ARRAY, items: { type: Type.STRING } },
    recommendedInspectionType: { type: Type.STRING },
    recommendedInspectionInterval: { type: Type.STRING },
    aiJustification: { type: Type.STRING }
  },
  required: ["probabilityOfFailure", "consequenceOfFailure", "riskScore", "riskCategory", "damageMechanisms", "recommendedInspectionType", "recommendedInspectionInterval", "aiJustification"]
};

export const generateRBIAnalysis = async (item: RCMItem, language: string = 'English'): Promise<any> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `Conduct RBI analysis for: ${item.component}. Language: ${language}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
      responseSchema: rbiSchema as any,
      temperature: 0.3
    },
  });

  return JSON.parse(response.text || "{}");
};

export const mapFunctionalLocations = async (
  items: any[],
  functionalLocations: any[],
  studyName: string,
  contextText: string
): Promise<Record<string, string>> => {
  const apiKey = getApiKey();
  const ai = new GoogleGenAI({ apiKey });
  
  const prompt = `Map components to locations: ${studyName}. Context: ${contextText}. Locations: ${JSON.stringify(functionalLocations)}`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              locIndex: { type: Type.INTEGER }
            },
            required: ["id", "locIndex"]
          }
        } as any,
        temperature: 0.1
      }
    });

    const parsed = JSON.parse(response.text || "[]");
    const mapping: Record<string, string> = {};
    const defaultMasterCode = functionalLocations.length > 0 ? functionalLocations[0].code : '';

    if (Array.isArray(parsed)) {
      parsed.forEach(item => {
        if (item.id && typeof item.locIndex === 'number') {
          const loc = functionalLocations[item.locIndex];
          mapping[item.id] = loc ? loc.code : defaultMasterCode;
        }
      });
    }
    return mapping;
  } catch (error) {
    console.error("Failed to map functional locations:", error);
    return {};
  }
};

