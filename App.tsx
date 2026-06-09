import React, { useState, useEffect, useRef } from 'react';
import { generateRCMAnalysis, extractOperationalContext, extractMaintenanceLogic } from './services/geminiService';
import { getAllStudies, saveStudyToDB, deleteStudyFromDB, getAllFolders, saveFolderToDB, deleteFolderFromDB } from './services/db';
import { extractTextFromFile } from './src/lib/fileParser';
import { RCMItem, FileData, SavedStudy, Folder } from './types';
import { AnalysisResult } from './components/AnalysisResult';
import { Sidebar } from './components/Sidebar';
import { SODReference } from './components/SODReference';
import { OperationalContextBuilder } from './components/OperationalContextBuilder';
import { AICopilot } from './components/AICopilot';
import { DecisionLogicModal } from './components/DecisionLogicModal';
import { WelcomeModal } from './components/WelcomeModal';
import { MergeStudiesModal } from './components/MergeStudiesModal';
import { PlanningAndSchedule } from './components/PlanningAndSchedule';
import { InteractiveImageModal } from './components/InteractiveImageModal';
import { LCCDashboard } from './components/LCCDashboard';
import { RBIDashboard } from './components/RBIDashboard';
import { KnowledgeHub } from './components/KnowledgeHub';
import { 
  Cpu, 
  Upload, 
  Type, 
  Zap, 
  Loader2, 
  FileCheck,
  Trash2,
  Menu,
  Save,
  Check,
  AlertTriangle,
  BookOpen,
  Sparkles,
  GitBranch,
  Undo2,
  PlusCircle,
  FileSearch,
  CheckCircle2,
  Globe,
  FileText,
  X,
  Plus,
  MapPin,
  Calendar as CalendarIcon,
  Calculator,
  Pencil,
  Bot,
  ShieldAlert,
  PanelLeft,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

const LANGUAGES = [
  { code: 'English', label: 'English', flag: '🇺🇸' },
  { code: 'Spanish', label: 'Español', flag: '🇪🇸' },
  { code: 'French', label: 'Français', flag: '🇫🇷' },
  { code: 'German', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'Polish', label: 'Polski', flag: '🇵🇱' }
];

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'manual' | 'upload'>('manual');
  const [viewMode, setViewMode] = useState<'study' | 'rbi' | 'planning' | 'lcc'>('study');

  const [contextText, setContextText] = useState('');
  const [filesData, setFilesData] = useState<FileData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStepIdx, setLoadingStepIdx] = useState(0);
  const loadingSteps = [
    "Initializing Intelligence Engine...",
    "Scanning P&ID & Schematics...",
    "Parsing Functional Architecture...",
    "Querying Historical Failure Data...",
    "Applying SAE JA1011 Standards...",
    "Synthesizing RCM Output..."
  ];
  const [isExtracting, setIsLoadingExtracting] = useState(false);
  const [activeImagePreview, setActiveImagePreview] = useState<FileData | null>(null);
  const [results, setResults] = useState<RCMItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('English');

  // Undo System State
  const [history, setHistory] = useState<RCMItem[][]>([]);

  // Study Management State
  const [savedStudies, setSavedStudies] = useState<SavedStudy[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [currentStudyId, setCurrentStudyId] = useState<string | null>(null);
  const [studyName, setStudyName] = useState<string>("Untitled Analysis");
  const [isFinished, setIsFinished] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  
  // Reference, Builder & Logic Modal State
  const [showSODReference, setShowSODReference] = useState(false);
  const [showContextBuilder, setShowContextBuilder] = useState(false);
  const [showDecisionLogic, setShowDecisionLogic] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showMergeModal, setShowMergeModal] = useState(false);

  // Planning & Schedule State
  const [planningCurrentDate, setPlanningCurrentDate] = useState(new Date());
  const [planningViewMode, setPlanningViewMode] = useState<'year' | 'month' | 'week' | 'day'>('month');
  const [scheduledTasks, setScheduledTasks] = useState<Record<string, string[]>>({});
  const [executionConditions, setExecutionConditions] = useState<Record<string, { condition: 'running' | 'stopped', startDate?: string, dayOfWeek?: string, shiftType?: 'dayshift' | 'rotating' }>>({});
  const [globalStoppageStartDate, setGlobalStoppageStartDate] = useState<string>('');
  const [globalStoppageDayOfWeek, setGlobalStoppageDayOfWeek] = useState<string>('');
  const [techCounts, setTechCounts] = useState<Record<string, { dayshift: number, rotating: number, brigadeCount: number }>>({
    Mechanical: { dayshift: 2, rotating: 0, brigadeCount: 4 },
    Electrical: { dayshift: 1, rotating: 0, brigadeCount: 4 },
    Automation: { dayshift: 1, rotating: 0, brigadeCount: 4 },
    Hydraulics: { dayshift: 1, rotating: 0, brigadeCount: 4 }
  });

  // Auto-save refs to avoid stale closures in interval
  const resultsRef = useRef(results);
  const contextTextRef = useRef(contextText);
  const filesDataRef = useRef(filesData);
  const studyNameRef = useRef(studyName);
  const currentStudyIdRef = useRef(currentStudyId);
  const savedStudiesRef = useRef(savedStudies);
  const isFinishedRef = useRef(isFinished);
  const selectedLanguageRef = useRef(selectedLanguage);
  const scheduledTasksRef = useRef(scheduledTasks);
  const executionConditionsRef = useRef(executionConditions);
  const globalStoppageStartDateRef = useRef(globalStoppageStartDate);
  const globalStoppageDayOfWeekRef = useRef(globalStoppageDayOfWeek);
  const techCountsRef = useRef(techCounts);

  useEffect(() => {
    resultsRef.current = results;
    contextTextRef.current = contextText;
    filesDataRef.current = filesData;
    studyNameRef.current = studyName;
    currentStudyIdRef.current = currentStudyId;
    savedStudiesRef.current = savedStudies;
    isFinishedRef.current = isFinished;
    selectedLanguageRef.current = selectedLanguage;
    scheduledTasksRef.current = scheduledTasks;
    executionConditionsRef.current = executionConditions;
    globalStoppageStartDateRef.current = globalStoppageStartDate;
    globalStoppageDayOfWeekRef.current = globalStoppageDayOfWeek;
    techCountsRef.current = techCounts;
  }, [results, contextText, filesData, studyName, currentStudyId, savedStudies, isFinished, selectedLanguage, scheduledTasks, executionConditions, globalStoppageStartDate, globalStoppageDayOfWeek, techCounts]);

  // Load studies on initialization
  useEffect(() => {
    const initData = async () => {
      try {
        const [studies, fetchedFolders] = await Promise.all([
          getAllStudies(),
          getAllFolders()
        ]);
        setSavedStudies(studies);
        setFolders(fetchedFolders);
      } catch (e) {
        console.error("Failed to initialize data", e);
        setError("Could not load saved studies. Please refresh.");
      }
    };
    initData();
  }, []);

  // Automatic Save Timer (Every 30 seconds)
  useEffect(() => {
    const autoSaveInterval = setInterval(() => {
      const hasContent = (resultsRef.current && resultsRef.current.length > 0) || contextTextRef.current.trim().length > 0;
      if (hasContent) {
        handleSaveStudy(true);
      }
    }, 30000);

    return () => clearInterval(autoSaveInterval);
  }, []);

  const handleCloseWelcome = () => {
    setShowWelcome(false);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (filesData.length + files.length > 50) {
      setError("Maximum 50 technical documents allowed per analysis (Memory expanded).");
      return;
    }

    const newFiles: FileData[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 50 * 1024 * 1024) {
        setError(`File "${file.name}" exceeds 50MB limit.`);
        continue;
      }

      try {
        const mimeType = file.type || (file.name.endsWith('.dwg') ? 'application/x-dwg' : 'application/octet-stream');
        
        const [base64, textContent] = await Promise.all([
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          }),
          extractTextFromFile(file)
        ]);

        newFiles.push({
          name: file.name,
          mimeType: mimeType,
          data: base64 as string,
          extractedText: textContent as string
        });
      } catch (e) {
        console.error(`Failed to read file: ${file.name}`);
      }
    }

    setFilesData(prev => [...prev, ...newFiles]);
    setError(null);
    
    const firstFile = newFiles[0];
    if (firstFile) {
      setActiveImagePreview(firstFile);
    }

    // Reset input
    event.target.value = '';
  };

  const removeFile = (index: number) => {
    setFilesData(prev => prev.filter((_, i) => i !== index));
  };

  const handleExtractContext = async (targetFiles: FileData[] = filesData, type: 'all' | 'maintenance' = 'all') => {
    if (targetFiles.length === 0) return;
    setIsLoadingExtracting(true);
    setError(null);
    try {
      let extractedText = "";
      if (type === 'maintenance') {
        extractedText = await extractMaintenanceLogic(targetFiles, selectedLanguage);
      } else {
        extractedText = await extractOperationalContext(targetFiles, selectedLanguage);
      }
      
      const cleanText = extractedText.replace(/\*\*/g, '').replace(/### /g, '').replace(/## /g, '').replace(/# /g, '');
      setContextText(prev => prev ? `${prev}\n\n[Technical Extraction System Sync]\n${cleanText}` : cleanText);
      setActiveTab('manual');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error("Extraction error:", err);
      let errorMessage = "Document analysis failed.";
      
      if (err.message?.includes("API_KEY_INVALID")) {
        errorMessage = "Invalid Gemini API Key. Please check your environment settings.";
      } else if (err.message?.includes("SAFETY")) {
        errorMessage = "Analysis blocked by safety filters. Please review the content of your documents.";
      } else if (err.message?.includes("404") || err.message?.includes("not found")) {
        errorMessage = "Gemini model version mismatch or service unavailable in this region.";
      } else if (err.message) {
        errorMessage = `Analysis failed: ${err.message}`;
      } else {
        errorMessage = "Please ensure the files are not corrupted and are supported formats (PDF, DOCX, XLSX, Images).";
      }
      
      setError(errorMessage);
    } finally {
      setIsLoadingExtracting(false);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      setLoadingStepIdx(0);
      interval = setInterval(() => {
        setLoadingStepIdx(prev => {
          if (prev >= loadingSteps.length - 1) return prev;
          return prev + 1;
        });
      }, 3500);
    } else {
      setLoadingStepIdx(0);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  const handleGenerate = async () => {
    if (!contextText && filesData.length === 0) {
      setError("Please provide operational context text or upload at least one technical file.");
      return;
    }

    setIsLoading(true);
    setError(null);
    
    if (!isMerging) {
      setResults(null);
      setHistory([]);
    }
    
    try {
      const data = await generateRCMAnalysis(contextText, filesData.length > 0 ? filesData : null, selectedLanguage, isMerging ? (results || []) : []);
      
      if (isMerging && results) {
        setResults([...results.map(item => ({ ...item, isNew: false })), ...data]);
      } else {
        setResults(data);
      }
      
    } catch (err: any) {
      setError(err.message || "An error occurred during generation.");
    } finally {
      setIsLoading(false);
    }
  };

  const clearAllFiles = () => {
    setFilesData([]);
  };

  // Global Save Function
  const handleSaveStudy = async (isAutoSave: boolean = false) => {
    const currentResults = resultsRef.current;
    const currentContext = contextTextRef.current;
    const currentFiles = filesDataRef.current;
    const currentName = studyNameRef.current;
    const currentId = currentStudyIdRef.current;
    const currentFinished = isFinishedRef.current;
    const studies = savedStudiesRef.current;
    const currentLang = selectedLanguageRef.current;

    if (!currentResults && !currentContext && currentFiles.length === 0) return;

    const nameToSave = currentName.trim() || "Untitled Analysis";
    const idToSave = currentId || `study-${Date.now()}`;

    const existingStudy = studies.find(s => s.id === idToSave);
    const timestampToUse = (isAutoSave && existingStudy) ? existingStudy.timestamp : Date.now();

    const newStudy: SavedStudy = {
      id: idToSave,
      name: nameToSave,
      timestamp: timestampToUse,
      items: (currentResults || []).map(item => ({ ...item, isNew: false })),
      contextText: currentContext,
      language: currentLang,
      fileName: currentFiles.length > 0 ? `${currentFiles.length} files` : undefined,
      folderId: existingStudy?.folderId,
      isFinished: currentFinished,
      filesData: currentFiles,
      scheduledTasks: scheduledTasksRef.current,
      executionConditions: executionConditionsRef.current,
      globalStoppageStartDate: globalStoppageStartDateRef.current,
      globalStoppageDayOfWeek: globalStoppageDayOfWeekRef.current,
      techCounts: techCountsRef.current
    };

    try {
      await saveStudyToDB(newStudy);
      const freshStudies = await getAllStudies();
      setSavedStudies(freshStudies);
      if (!currentId) {
        setCurrentStudyId(idToSave);
      }
      
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
      
    } catch (e) {
      console.error("Save failed", e);
      if (!isAutoSave) setError("Failed to save study.");
    }
  };

  const handleDeleteStudy = async (id: string) => {
    try {
      await deleteStudyFromDB(id);
      const freshStudies = await getAllStudies();
      setSavedStudies(freshStudies);
      if (currentStudyId === id) {
        handleNewStudy();
      }
    } catch (e) {
      console.error("Delete failed", e);
      setError("Failed to delete study.");
    }
  };

  const handleDuplicateStudy = async (study: SavedStudy) => {
    const newId = `study-copy-${Date.now()}`;
    const duplicatedStudy: SavedStudy = {
      ...study,
      id: newId,
      name: `${study.name} (Copy)`,
      timestamp: Date.now(),
      folderId: undefined,
      isFinished: false
    };

    try {
      await saveStudyToDB(duplicatedStudy);
      const freshStudies = await getAllStudies();
      setSavedStudies(freshStudies);
      handleLoadStudy(duplicatedStudy);
    } catch (e) {
      console.error("Duplicate failed", e);
      setError("Failed to duplicate study.");
    }
  };

  const handleLoadStudy = (study: SavedStudy) => {
    setResults(study.items.map(item => ({ ...item, isNew: false })));
    setHistory([]);
    setContextText(study.contextText);
    setCurrentStudyId(study.id);
    setStudyName(study.name);
    setIsFinished(!!study.isFinished);
    setSelectedLanguage(study.language || 'English');
    setFilesData(study.filesData || []);
    setScheduledTasks(study.scheduledTasks || {});
    setExecutionConditions(study.executionConditions || {});
    setGlobalStoppageStartDate(study.globalStoppageStartDate || '');
    setGlobalStoppageDayOfWeek(study.globalStoppageDayOfWeek || '');
    setTechCounts(study.techCounts || {
      Mechanical: { dayshift: 2, rotating: 0, brigadeCount: 4 },
      Electrical: { dayshift: 1, rotating: 0, brigadeCount: 4 },
      Automation: { dayshift: 1, rotating: 0, brigadeCount: 4 },
      Hydraulics: { dayshift: 1, rotating: 0, brigadeCount: 4 }
    });
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleNewStudy = () => {
    setResults(null);
    setHistory([]);
    setContextText('');
    setFilesData([]);
    setCurrentStudyId(null);
    setStudyName("Untitled Analysis");
    setIsFinished(false);
    setSelectedLanguage('English');
    setError(null);
    setScheduledTasks({});
    setTechCounts({
      Mechanical: { dayshift: 2, rotating: 0, brigadeCount: 4 },
      Electrical: { dayshift: 1, rotating: 0, brigadeCount: 4 },
      Automation: { dayshift: 1, rotating: 0, brigadeCount: 4 },
      Hydraulics: { dayshift: 1, rotating: 0, brigadeCount: 4 }
    });
    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  };

  const handleAddToExistingStudy = async (bundleItem: RCMItem, originalItemIds: string[], targetStudyId: string) => {
    const studies = savedStudiesRef.current;
    const targetStudy = studies.find(s => s.id === targetStudyId);
    if (!targetStudy) return;

    const newItems = targetStudy.items.filter((item, index) => {
      const fallbackId = `T-${item.iso14224Code || '1.1.1'}.${index + 1}`;
      const effectiveId = item.id || fallbackId;
      return !originalItemIds.includes(effectiveId);
    });
    newItems.push({ ...bundleItem, isNew: true });

    const updatedStudy = { ...targetStudy, items: newItems, timestamp: Date.now() };
    
    try {
      await saveStudyToDB(updatedStudy);
      const freshStudies = await getAllStudies();
      setSavedStudies(freshStudies);
      
      if (currentStudyIdRef.current === targetStudyId) {
        setResults(newItems);
      }
      alert(`Bundle successfully added to workspace: "${targetStudy.name}"`);
    } catch (e) {
      console.error(e);
      setError("Failed to add bundle to workspace.");
    }
  };

  const handleCreateNewStudy = async (newData: RCMItem[], studyName: string) => {
    const newId = `study-${Date.now()}`;
    const newStudy: SavedStudy = {
      id: newId,
      name: studyName,
      timestamp: Date.now(),
      items: newData,
      contextText: "",
      language: selectedLanguage,
      isFinished: false,
      scheduledTasks: scheduledTasks,
      executionConditions: executionConditions,
      globalStoppageStartDate: globalStoppageStartDate,
      globalStoppageDayOfWeek: globalStoppageDayOfWeek,
      techCounts: techCounts
    };

    try {
      await saveStudyToDB(newStudy);
      const freshStudies = await getAllStudies();
      setSavedStudies(freshStudies);
      alert(`Bundle successfully saved to a new study: "${studyName}"`);
    } catch (e) {
      console.error(e);
      setError("Failed to create new study from workspace.");
    }
  };

  const handleResultsUpdate = (newData: RCMItem[]) => {
    if (results) {
      setHistory(prev => [...prev.slice(-29), results]);
    }
    setResults(newData);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const lastState = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setResults(lastState);
  };

  const handleMergeStudies = async (selectedIds: string[], newName: string) => {
    const selectedStudies = savedStudies.filter(s => selectedIds.includes(s.id));
    if (selectedStudies.length < 2) return;

    const mergedItems: RCMItem[] = [];
    let mergedContext = '';

    selectedStudies.forEach(study => {
      if (study.contextText) {
        mergedContext += `\n\n--- From ${study.name} ---\n${study.contextText}`;
      }
      study.items.forEach(item => {
        mergedItems.push({
          ...item,
          id: `${study.id}-${item.id}`,
          sourceStudyName: item.sourceStudyName || study.name
        });
      });
    });

    const newId = `study-merged-${Date.now()}`;
    const newStudy: SavedStudy = {
      id: newId,
      name: newName,
      timestamp: Date.now(),
      items: mergedItems,
      contextText: mergedContext.trim(),
      language: selectedLanguage,
      isFinished: false
    };

    try {
      await saveStudyToDB(newStudy);
      const freshStudies = await getAllStudies();
      setSavedStudies(freshStudies);
      handleLoadStudy(newStudy);
    } catch (e) {
      console.error("Merge failed", e);
      setError("Failed to merge studies.");
    }
  };

  // Folder Actions
  const handleNewFolder = async (name: string) => {
    const folder: Folder = {
      id: `folder-${Date.now()}`,
      name,
      timestamp: Date.now()
    };
    try {
      await saveFolderToDB(folder);
      const freshFolders = await getAllFolders();
      setFolders(freshFolders);
    } catch (e) {
      console.error("New folder failed", e);
    }
  };

  const handleRenameFolder = async (id: string, name: string) => {
    const folder = folders.find(f => f.id === id);
    if (!folder) return;
    try {
      await saveFolderToDB({ ...folder, name });
      const freshFolders = await getAllFolders();
      setFolders(freshFolders);
    } catch (e) {
      console.error("Rename folder failed", e);
    }
  };

  const handleDeleteFolder = async (id: string) => {
    try {
      const studiesToDelete = savedStudies.filter(s => s.folderId === id);
      for (const study of studiesToDelete) {
        await deleteStudyFromDB(study.id);
      }
      
      await deleteFolderFromDB(id);
      
      const [freshFolders, freshStudies] = await Promise.all([
        getAllFolders(),
        getAllStudies()
      ]);
      setFolders(freshFolders);
      setSavedStudies(freshStudies);

      if (currentStudyId && studiesToDelete.some(s => s.id === currentStudyId)) {
        handleNewStudy();
      }
    } catch (e) {
      console.error("Delete folder failed", e);
    }
  };

  const handleMoveStudyToFolder = async (studyId: string, folderId?: string) => {
    const study = savedStudies.find(s => s.id === studyId);
    if (!study) return;
    
    try {
      await saveStudyToDB({ ...study, folderId });
      const freshStudies = await getAllStudies();
      setSavedStudies(freshStudies);
    } catch (e) {
      console.error("Move to folder failed", e);
    }
  };

  const handleToggleStudyFinished = async (studyId: string) => {
    const study = savedStudies.find(s => s.id === studyId);
    if (!study) return;
    
    const nextStatus = !study.isFinished;
    
    try {
      await saveStudyToDB({ ...study, isFinished: nextStatus });
      const freshStudies = await getAllStudies();
      setSavedStudies(freshStudies);
      
      if (currentStudyId === studyId) {
        setIsFinished(nextStatus);
      }
    } catch (e) {
      console.error("Toggle finished failed", e);
    }
  };

  // Export/Import Logic
  const handleExportStudy = (study: SavedStudy) => {
    const dataStr = JSON.stringify(study, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${study.name.replace(/\s+/g, '_')}_RCM_Analysis.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportFolder = (folder: Folder) => {
    const folderStudies = savedStudies.filter(s => s.folderId === folder.id);
    const bundle = {
      type: 'folder_bundle',
      folder: folder,
      studies: folderStudies
    };
    const dataStr = JSON.stringify(bundle, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${folder.name.replace(/\s+/g, '_')}_RCM_Bundle.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportStudy = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const importedData = JSON.parse(content);
        
        if (importedData.type === 'folder_bundle') {
          const newFolderId = `folder-imported-${Date.now()}`;
          const newFolder: Folder = {
            ...importedData.folder,
            id: newFolderId,
            timestamp: Date.now()
          };
          
          await saveFolderToDB(newFolder);
          
          for (const study of importedData.studies) {
            const finalStudy: SavedStudy = {
              ...study,
              id: `study-imported-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              timestamp: Date.now(),
              folderId: newFolderId
            };
            await saveStudyToDB(finalStudy);
          }
          
          const [freshFolders, freshStudies] = await Promise.all([
            getAllFolders(),
            getAllStudies()
          ]);
          setFolders(freshFolders);
          setSavedStudies(freshStudies);
          
        } else {
          const importedStudy = importedData as SavedStudy;
          if (!importedStudy.name || !importedStudy.items) {
            throw new Error("Invalid study format");
          }

          const finalStudy: SavedStudy = {
            ...importedStudy,
            id: `study-imported-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            timestamp: Date.now(),
            folderId: undefined
          };

          await saveStudyToDB(finalStudy);
          const freshStudies = await getAllStudies();
          setSavedStudies(freshStudies);
          handleLoadStudy(finalStudy);
        }
        
      } catch (err) {
        console.error("Import failed", err);
        setError("Failed to import. Ensure the file is a valid RCM Pro JSON or Bundle.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <WelcomeModal isOpen={showWelcome} onClose={handleCloseWelcome} />
      <MergeStudiesModal 
        isOpen={showMergeModal} 
        onClose={() => setShowMergeModal(false)} 
        studies={savedStudies} 
        onMerge={handleMergeStudies} 
      />
      <SODReference isOpen={showSODReference} onClose={() => setShowSODReference(false)} onUndo={handleUndo} canUndo={history.length > 0} />
      <OperationalContextBuilder 
        isOpen={showContextBuilder} 
        onClose={() => setShowContextBuilder(false)} 
        onComplete={(builtContext) => {
          const cleanText = builtContext.replace(/\*\*/g, '').replace(/### /g, '').replace(/## /g, '').replace(/# /g, '');
          setContextText(cleanText);
        }} 
        onUndo={handleUndo} 
        canUndo={history.length > 0}
        language={selectedLanguage}
      />
      <DecisionLogicModal isOpen={showDecisionLogic} onClose={() => setShowDecisionLogic(false)} onUndo={handleUndo} canUndo={history.length > 0} />
      <AICopilot data={results} onUpdate={handleResultsUpdate} language={selectedLanguage} />

      {(() => {
        const langCode = ({
          'English': 'en',
          'Spanish': 'es',
          'French': 'fr',
          'German': 'de',
          'Polish': 'pl'
        } as Record<string, string>)[selectedLanguage] || 'en';
        
        return (
          <>
            {isSidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 md:hidden animate-fade-in" onClick={() => setIsSidebarOpen(false)} />}

      <div translate="no" className={`fixed lg:relative inset-y-0 left-0 z-50 transform transition-all duration-500 ease-in-out shadow-lg lg:shadow-none bg-white flex-shrink-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${isSidebarCollapsed ? 'lg:w-0 lg:opacity-0 lg:-translate-x-10 invisible' : 'lg:w-72 xl:w-80 lg:opacity-100 visible'}`}>
        <div className="w-72 xl:w-80 h-full overflow-hidden">
          <Sidebar 
            studies={savedStudies} 
            folders={folders}
            currentStudyId={currentStudyId} 
            onSelect={handleLoadStudy} 
            onDelete={handleDeleteStudy} 
            onDuplicate={handleDuplicateStudy}
            onNew={handleNewStudy} 
            onNewFolder={handleNewFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onMoveStudy={handleMoveStudyToFolder}
            onExport={handleExportStudy}
            onExportFolder={handleExportFolder}
            onImport={handleImportStudy}
            onToggleFinished={handleToggleStudyFinished}
            onMergeStudiesClick={() => setShowMergeModal(true)}
            selectedLanguage={selectedLanguage}
            onLanguageChange={setSelectedLanguage}
            languages={LANGUAGES}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col h-full overflow-hidden w-full relative">
        <header translate="no" className="bg-white border-b border-slate-200 shrink-0 z-20 shadow-sm relative">
          <div className="h-20 px-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-6 min-w-0">
              <div className="flex items-center gap-4">
                <button className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-lg lg:hidden" onClick={() => setIsSidebarOpen(true)}><Menu size={24} /></button>
                <div className="relative group/toggle-container">
                  <button 
                    className={`flex items-center justify-center h-14 w-14 rounded-2xl transition-all duration-500 active:scale-95 border-2 shadow-lg group-hover/toggle-container:scale-105 ${
                      isSidebarCollapsed 
                      ? 'bg-indigo-600 text-white border-indigo-400 shadow-indigo-200 ring-4 ring-indigo-50 animate-pulse' 
                      : 'bg-white text-slate-900 border-slate-200 hover:text-indigo-600 hover:border-indigo-400 hover:shadow-xl'
                    }`} 
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    aria-label={isSidebarCollapsed ? "Expand Study Library" : "Collapse Sidebar"}
                  >
                    {isSidebarCollapsed ? (
                      <ChevronRight size={28} className="animate-in slide-in-from-left-2 duration-300" />
                    ) : (
                      <ChevronLeft size={28} className="group-hover:-translate-x-1 transition-transform duration-300" />
                    )}
                  </button>
                  {!isSidebarCollapsed && (
                    <div className="absolute top-1/2 -right-16 -translate-y-1/2 opacity-0 group-hover/toggle-container:opacity-100 transition-all duration-300 pointer-events-none whitespace-nowrap bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl shadow-2xl z-50 translate-x-4 group-hover/toggle-container:translate-x-0">
                      Collapse Sidebar
                    </div>
                  )}
                  {isSidebarCollapsed && (
                    <div className="absolute top-1/2 -right-16 -translate-y-1/2 opacity-0 group-hover/toggle-container:opacity-100 transition-all duration-300 pointer-events-none whitespace-nowrap bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl shadow-2xl z-50 translate-x-4 group-hover/toggle-container:translate-x-0">
                      Open Library
                    </div>
                  )}
                </div>
              </div>
              <div className={`hidden lg:flex items-center gap-4 pr-6 border-r border-slate-100 group text-nowrap transition-all duration-500 ${isSidebarCollapsed ? 'opacity-100' : 'opacity-40 hover:opacity-100'}`}>
                <div className="p-2.5 bg-slate-900 rounded-[1.2rem] text-white shadow-2xl shadow-indigo-100 ring-2 ring-indigo-50/50 group-hover:bg-indigo-600 transition-all duration-500 group-hover:-rotate-6"><Cpu size={22} className="text-indigo-400 group-hover:text-white" /></div>
                <div className="flex flex-col"><span className="text-lg font-black tracking-tighter text-slate-900 leading-none">RCM</span><div className="flex items-center gap-1 mt-1"><span className="text-[11px] font-black tracking-[0.25em] text-indigo-600 leading-none">GENERATOR</span><span className="text-[11px] font-black text-slate-400 leading-none">PRO</span></div></div>
              </div>
              <div className="flex flex-col min-w-0">
                 <div className="flex items-center gap-2">
                   <input type="text" value={studyName} onChange={(e) => setStudyName(e.target.value)} placeholder="Untitled Analysis" className="text-lg font-black text-slate-800 bg-transparent border-b-2 border-transparent hover:border-slate-200 focus:border-indigo-500 focus:outline-none transition-all w-full sm:w-80 truncate" />
                   {isFinished && (
                     <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-md animate-in zoom-in-95">
                        <CheckCircle2 size={12} fill="currentColor" className="fill-emerald-600/20" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Finished</span>
                     </div>
                   )}
                 </div>
                 <p className="hidden sm:block text-[10px] text-slate-400 font-black uppercase tracking-[0.15em] mt-1">{currentStudyId ? "System Repository" : "Temporary Workspace"}</p>
              </div>
            </div>

            <div className="hidden md:flex bg-slate-100 p-1.5 rounded-[1.2rem] border border-slate-200 shadow-inner">
               <button 
                 onClick={() => setViewMode('study')}
                 className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-tight transition-all duration-300 ${viewMode === 'study' ? 'bg-white text-indigo-600 shadow-lg ring-1 ring-slate-100 scale-[1.02]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
               >
                 <FileText size={16} strokeWidth={2.5} />
                 RCM Study
               </button>
               <button 
                 onClick={() => setViewMode('rbi')}
                 className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-tight transition-all duration-300 ${viewMode === 'rbi' ? 'bg-white text-indigo-600 shadow-lg ring-1 ring-slate-100 scale-[1.02]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
               >
                 <ShieldAlert size={16} strokeWidth={2.5} />
                 RBI Analysis
               </button>
               <button 
                 onClick={() => setViewMode('planning')}
                 className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-tight transition-all duration-300 ${viewMode === 'planning' ? 'bg-white text-indigo-600 shadow-lg ring-1 ring-slate-100 scale-[1.02]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
               >
                 <CalendarIcon size={16} strokeWidth={2.5} />
                 Strategy Load leveler
               </button>
               <button 
                 onClick={() => setViewMode('lcc')}
                 className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-tight transition-all duration-300 ${viewMode === 'lcc' ? 'bg-white text-indigo-600 shadow-lg ring-1 ring-slate-100 scale-[1.02]' : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'}`}
               >
                 <Calculator size={16} strokeWidth={2.5} />
                 LCC Dashboard
               </button>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden lg:flex items-center gap-2 pr-3 mr-1">
                <button onClick={() => setShowSODReference(true)} className="flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all font-bold text-xs uppercase tracking-tight"><BookOpen size={16} />S/O/D Guide</button>
                <button onClick={() => setShowDecisionLogic(true)} className="flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all font-bold text-xs uppercase tracking-tight"><GitBranch size={16} />Logic Tree</button>
              </div>
              <div className="hidden sm:flex items-center text-[10px] font-black uppercase tracking-widest transition-opacity duration-300 mr-2">{justSaved ? (<span className="text-emerald-600 flex items-center gap-1.5 font-bold animate-pulse"><Check size={14} strokeWidth={3} /> Synced</span>) : (<span className="text-slate-300">{results ? 'Local draft' : ''}</span>)}</div>
              <div className="flex items-center gap-2">
                <button onClick={handleUndo} disabled={history.length === 0} className={`p-2.5 rounded-xl transition-all ${history.length > 0 ? 'bg-slate-100 text-slate-700 hover:bg-slate-200 shadow-sm' : 'text-slate-200 cursor-not-allowed'}`} title="Undo last action"><Undo2 size={20} /></button>
                <button onClick={() => handleSaveStudy(false)} disabled={!results && !contextText && filesData.length === 0} className={`flex items-center gap-3 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl ${justSaved ? 'bg-emerald-600 text-white border-emerald-600 shadow-emerald-200 scale-[1.02]' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 shadow-indigo-100 hover:shadow-indigo-200'} ${(!results && !contextText && filesData.length === 0) ? 'opacity-30 cursor-not-allowed' : ''}`}>
                   {justSaved ? <Check size={18} /> : <Save size={18} />}
                   <span className="hidden sm:inline">{justSaved ? "Analysis Saved" : "Save Study"}</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <main lang={langCode} className={`flex-1 p-4 sm:px-6 bg-slate-50/50 relative min-h-0 ${viewMode === 'planning' ? 'flex flex-col overflow-hidden' : 'block overflow-y-auto'}`}>
          {viewMode === 'planning' ? (
            <PlanningAndSchedule 
              data={results || []} 
              currentDate={planningCurrentDate}
              setCurrentDate={setPlanningCurrentDate}
              viewMode={planningViewMode}
              setViewMode={setPlanningViewMode}
              scheduledTasks={scheduledTasks}
              setScheduledTasks={setScheduledTasks}
              executionConditions={executionConditions}
              setExecutionConditions={setExecutionConditions}
              globalStoppageStartDate={globalStoppageStartDate}
              setGlobalStoppageStartDate={setGlobalStoppageStartDate}
              globalStoppageDayOfWeek={globalStoppageDayOfWeek}
              setGlobalStoppageDayOfWeek={setGlobalStoppageDayOfWeek}
              techCounts={techCounts}
              setTechCounts={setTechCounts}
              studies={savedStudies}
              onUpdate={handleResultsUpdate}
              onCreateNewStudy={handleCreateNewStudy}
              onAddToExistingStudy={handleAddToExistingStudy}
              language={selectedLanguage}
            />
          ) : viewMode === 'rbi' ? (
            <RBIDashboard items={results || []} onUpdate={handleResultsUpdate} onUndo={handleUndo} canUndo={history.length > 0} language={selectedLanguage} />
          ) : viewMode === 'lcc' ? (
            <LCCDashboard items={results || []} onUpdate={handleResultsUpdate} onUndo={handleUndo} canUndo={history.length > 0} />
          ) : (
            <div className="w-full px-2 py-6">
              {!results && (
                <div className="mb-8 text-center sm:text-left animate-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto">
                  <h2 className="text-3xl font-black text-slate-900 mb-3 tracking-tighter uppercase">Generate Maintenance Strategies</h2>
                  <p className="text-slate-500 max-w-2xl text-lg leading-relaxed font-medium italic opacity-70">Provide operational context to generate a comprehensive Reliability Centered Maintenance analysis based on SAE JA1011 standards.</p>
                </div>
              )}
              <div className={`bg-white rounded-[2rem] shadow-sm border border-slate-200 overflow-hidden mb-10 transition-all duration-300 ${!results ? 'max-w-7xl mx-auto' : ''}`}>
                <div translate="no" className="border-b border-slate-100 bg-slate-50/50 px-8 pt-5 flex gap-8 overflow-x-auto">
                  <button onClick={() => setActiveTab('manual')} className={`pb-5 text-[11px] font-black uppercase tracking-[0.2em] border-b-2 transition-all flex items-center gap-2.5 ${activeTab === 'manual' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><Type size={14} />Manual Synthesis</button>
                  <button onClick={() => setActiveTab('upload')} className={`pb-5 text-[11px] font-black uppercase tracking-[0.2em] border-b-2 transition-all flex items-center gap-2.5 ${activeTab === 'upload' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}><Upload size={14} />Knowledge Hub</button>
                </div>
                <div className="p-8">
                  {activeTab === 'manual' && (
                    <div className="space-y-6 animate-in fade-in duration-300">
                      <div className="flex justify-between items-center bg-white p-4 rounded-3xl border border-slate-200">
                        <div className="flex items-center gap-4">
                          <div className="p-3 bg-indigo-600 rounded-2xl text-white shadow-xl shadow-indigo-100">
                             <Type size={20} />
                          </div>
                          <div>
                            <h4 className="text-[12px] font-black uppercase tracking-[0.1em] text-slate-900">Master Operational Context</h4>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Asset & Strategy Requirements</p>
                          </div>
                        </div>
                        <button onClick={() => setShowContextBuilder(true)} className="group relative flex items-center gap-2.5 px-6 py-3 overflow-hidden rounded-2xl transition-all duration-300 active:scale-95 shadow-lg border border-indigo-500/10 hover:shadow-indigo-100"><div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 bg-[length:200%_auto] animate-[gradient_3s_linear_infinite] group-hover:scale-105 transition-transform duration-500 opacity-90"></div><div className="relative flex items-center gap-2"><Sparkles size={16} className="text-white fill-white" /><span className="text-[10px] font-black text-white uppercase tracking-[0.1em]">Intelligence Assistant</span></div></button>
                      </div>
                      
                      <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 shadow-sm flex flex-col min-h-[600px] transition-all focus-within:border-indigo-400 focus-within:shadow-2xl focus-within:shadow-indigo-50/50">
                        <textarea
                          value={contextText}
                          onChange={(e) => setContextText(e.target.value)}
                          placeholder={`Deep technical synthesis following SAE JA1011 standards... (Enter details in ${selectedLanguage})`}
                          className="flex-1 w-full p-10 focus:outline-none resize-none text-slate-800 placeholder:text-slate-300 font-medium text-lg leading-relaxed bg-transparent"
                          spellCheck={false}
                        />
                        <div className="px-10 py-5 bg-slate-50/50 border-t border-slate-100 rounded-b-[2.5rem] flex items-center justify-between">
                           <div className="flex items-center gap-3">
                              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{contextText.length} Characters Synced</span>
                           </div>
                           <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest cursor-default">Direct Workspace Active</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'upload' && (
                    <KnowledgeHub 
                      filesData={filesData} 
                      setFilesData={setFilesData} 
                      onExtract={handleExtractContext} 
                      isExtracting={isExtracting} 
                      onAnnotate={setActiveImagePreview}
                      selectedLanguage={selectedLanguage}
                    />
                  )}

                  {error && (<div className="mt-6 p-5 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-[11px] font-black uppercase tracking-widest flex items-center gap-3 animate-in shake-in-from-right duration-500"><AlertTriangle size={18} />{error}</div>)}
                  <div className="mt-8 flex flex-col sm:flex-row justify-end items-center gap-4">{results && results.length > 0 && (<label className="flex items-center gap-3 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-white transition-all"><input type="checkbox" checked={isMerging} onChange={(e) => setIsMerging(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500" /><span className="text-xs font-bold text-slate-600 uppercase tracking-tight">Merge with existing items</span></label>)}<button onClick={handleGenerate} disabled={isLoading || isExtracting} className={`flex items-center gap-3 px-10 py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] text-white shadow-2xl transition-all active:scale-95 ${isLoading ? 'bg-indigo-400 shadow-none' : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 shadow-indigo-300 hover:shadow-indigo-300 hover:-translate-y-1'} ${(isLoading || isExtracting) ? 'opacity-50' : ''}`}>{isLoading ? <Loader2 size={20} className="animate-spin" /> : (isMerging ? <PlusCircle size={20} /> : <Zap size={20} className="fill-white" />)}<span>{isLoading ? loadingSteps[loadingStepIdx] : (isMerging ? "Append New Insights" : "Initiate RCM Analysis")}</span></button></div>
                </div>
              </div>
              {results && <AnalysisResult data={results} studyName={studyName} contextText={contextText} filesData={filesData} onUpdate={handleResultsUpdate} onUpdateFiles={setFilesData} onUndo={handleUndo} canUndo={history.length > 0} language={selectedLanguage} />}
            </div>
          )}
        </main>
        {activeImagePreview && (
          <InteractiveImageModal 
            isOpen={!!activeImagePreview} 
            onClose={() => setActiveImagePreview(null)} 
            file={activeImagePreview} 
            onUpdateFile={(updatedFile) => {
              setFilesData(prev => prev.map(f => f.name === updatedFile.name ? updatedFile : f));
              setActiveImagePreview(updatedFile);
            }}
          />
        )}
      </div>
          </>
        );
      })()}
    </div>
  );
};

export default App;
