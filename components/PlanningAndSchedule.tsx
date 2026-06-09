import React, { useState, useMemo } from 'react';
import { RCMItem, SavedStudy } from '../types';
import { 
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, 
  Users, ClipboardList, Clock, Zap, AlertCircle, Loader2, X, Trash2, CheckCircle2,
  Layers, Settings2, Plus, ArrowRight, BarChart, TrendingDown, Settings, Info, Sparkles
} from 'lucide-react';
import { 
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { optimizeSchedule, classifyTasksExecution, suggestTaskBundles, rationalizeTasks } from '../services/geminiService';

const getLocalDateString = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export type Bundle = {
  id: string;
  name: string;
  interval: string;
  taskIds: string[];
};

interface PlanningAndScheduleProps {
  data: RCMItem[];
  currentDate: Date;
  setCurrentDate: React.Dispatch<React.SetStateAction<Date>>;
  viewMode: 'year' | 'month' | 'week' | 'day';
  setViewMode: React.Dispatch<React.SetStateAction<'year' | 'month' | 'week' | 'day'>>;
  scheduledTasks: Record<string, string[]>;
  setScheduledTasks: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  executionConditions: Record<string, { condition: 'running' | 'stopped', startDate?: string, dayOfWeek?: string, shiftType?: 'dayshift' | 'rotating' }>;
  setExecutionConditions: React.Dispatch<React.SetStateAction<Record<string, { condition: 'running' | 'stopped', startDate?: string, dayOfWeek?: string, shiftType?: 'dayshift' | 'rotating' }>>>;
  globalStoppageStartDate: string;
  setGlobalStoppageStartDate: React.Dispatch<React.SetStateAction<string>>;
  globalStoppageDayOfWeek: string;
  setGlobalStoppageDayOfWeek: React.Dispatch<React.SetStateAction<string>>;
  techCounts: Record<string, { dayshift: number, rotating: number, brigadeCount: number }>;
  setTechCounts: React.Dispatch<React.SetStateAction<Record<string, { dayshift: number, rotating: number, brigadeCount: number }>>>;
  studies?: SavedStudy[];
  onUpdate?: (newData: RCMItem[]) => void;
  onCreateNewStudy?: (newData: RCMItem[], studyName: string) => void;
  onAddToExistingStudy?: (bundleItem: RCMItem, originalItemIds: string[], targetStudyId: string) => void;
  language?: string;
}

export const getNormalizedInterval = (intervalStr: string | undefined): string => {
  const s = (intervalStr || 'As required').toLowerCase();
  const numMatch = s.match(/\d+/);
  const num = numMatch ? parseInt(numMatch[0]) : 1;
  
  if (s.includes('quarter') || s.includes('trimestral') || (s.includes('month') && num === 3) || (s.includes('mes') && num === 3)) return 'Quarterly';
  if (s.includes('half') || s.includes('semestral') || (s.includes('month') && num === 6) || (s.includes('mes') && num === 6)) return 'Semi-Annually';
  if (s.includes('year') && num === 1) return 'Annually';
  if (s.includes('anual') && !s.includes('manual')) return 'Annually';
  if (s.includes('year') || s.includes('año')) return `Every ${num} Years`;
  if (s.includes('month') && num === 1) return 'Monthly';
  if (s.includes('mensual')) return 'Monthly';
  if (s.includes('month') || s.includes('mes')) return `Every ${num} Months`;
  if (s.includes('week') && num === 1) return 'Weekly';
  if (s.includes('semanal')) return 'Weekly';
  if (s.includes('week') || s.includes('semana')) return `Every ${num} Weeks`;
  if (s.includes('day') && num === 1) return 'Daily';
  if (s.includes('diario')) return 'Daily';
  if (s.includes('day') || s.includes('dia') || s.includes('día')) return `Every ${num} Days`;
  return intervalStr || 'As required';
};

export const PlanningAndSchedule: React.FC<PlanningAndScheduleProps> = ({ 
  data, 
  currentDate, 
  setCurrentDate, 
  viewMode, 
  setViewMode, 
  scheduledTasks, 
  setScheduledTasks, 
  executionConditions,
  setExecutionConditions,
  globalStoppageStartDate,
  setGlobalStoppageStartDate,
  globalStoppageDayOfWeek,
  setGlobalStoppageDayOfWeek,
  techCounts, 
  setTechCounts,
  studies = [],
  onUpdate,
  onCreateNewStudy,
  onAddToExistingStudy,
  language = 'English'
}) => {
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [showWorkforceModal, setShowWorkforceModal] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showExecutionConditionsModal, setShowExecutionConditionsModal] = useState(false);
  const [plannedStoppageFrequency, setPlannedStoppageFrequency] = useState<string>('30');
  const [plannedStoppageDuration, setPlannedStoppageDuration] = useState<string>('8');
  const [isClassifying, setIsClassifying] = useState(false);
  const [classificationComplete, setClassificationComplete] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<'schedule' | 'consolidation' | 'macro'>('macro');
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [activeBundleId, setActiveBundleId] = useState<string | null>(null);
  const [isSuggestingBundles, setIsSuggestingBundles] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveModalName, setSaveModalName] = useState("Bundled Workspace");
  const [selectedExistingStudyId, setSelectedExistingStudyId] = useState<string>("");
  const [pendingBundleItem, setPendingBundleItem] = useState<{ newRCMItem: RCMItem, originalItemIds: string[] } | null>(null);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editInterval, setEditInterval] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editPersonnel, setEditPersonnel] = useState(1);
  const [macroTimeframe, setMacroTimeframe] = useState<'weekly' | 'monthly' | 'quarterly'>('weekly');
  
  const monthNames = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const handlePrev = () => {
    if (viewMode === 'year') {
      setCurrentDate(new Date(currentDate.getFullYear() - 1, currentDate.getMonth(), 1));
    } else if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 7));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() - 1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'year') {
      setCurrentDate(new Date(currentDate.getFullYear() + 1, currentDate.getMonth(), 1));
    } else if (viewMode === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else if (viewMode === 'week') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 7));
    } else {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Extract tasks
  const tasks = useMemo(() => {
    return data.map((item, index) => ({
      id: item.id || `T-${item.iso14224Code || '1.1.1'}.${index + 1}`,
      title: item.maintenanceTask,
      component: item.component,
      criticality: item.criticality,
      failureEffect: item.failureEffect,
      type: item.taskType || 'Corrective',
      duration: item.inspectionSheet?.estimatedTime || '2 hours',
      interval: item.interval || 'As required',
      personnelCount: item.pmPersonnelCount || 1,
      responsibility: item.inspectionSheet?.responsibility || 'Maintenance Technician',
      sourceStudyName: item.sourceStudyName,
      originalItem: item
    }));
  }, [data]);

  const [rationalizationSuggestions, setRationalizationSuggestions] = useState<any[]>([]);
  const [isRationalizing, setIsRationalizing] = useState(false);

  const macroFeasibilityData = useMemo(() => {
    const weeks = Array.from({ length: 52 }, (_, i) => ({
      week: `W${i + 1}`,
      Mechanical: 0,
      Electrical: 0,
      Automation: 0,
      Hydraulics: 0,
      capacity: 0,
      required: 0
    }));
    
    // Calculate average weekly capacity
    // Day shift: 40 hours/week
    // Rotating: 24/7 operation. Each brigade works average 42h or 40h.
    // If we have rotating techs per brigade, and they cover 24/7, 
    // then we have (rotating * 24 * 7) total hours available in the rotating pool weekly.
    const totalDayShiftHours = Object.values(techCounts).reduce((a, b) => a + (b.dayshift * 40 * 0.8), 0); // 80% efficiency
    const totalRotatingHours = Object.values(techCounts).reduce((a, b) => a + (b.rotating * 24 * 7 * 0.8), 0); // 80% efficiency
    const weeklyCapacity = totalDayShiftHours + totalRotatingHours;    
    // Parse each task
    tasks.forEach(task => {
      const intervalStr = (task.interval || '1 month').toLowerCase();
      let weeksInterval = 4; // default
      
      const numMatch = intervalStr.match(/\d+/);
      const num = numMatch ? parseInt(numMatch[0]) : 1;

      if (intervalStr.includes('week')) weeksInterval = num;
      else if (intervalStr.includes('quarter') || (intervalStr.includes('month') && num === 3)) weeksInterval = 13;
      else if (intervalStr.includes('month')) weeksInterval = num * 4.33;
      else if (intervalStr.includes('year')) weeksInterval = num * 52;
      
      const durParts = String(task.duration || '1').match(/[\d.]+/);
      const hoursPerPerson = durParts ? parseFloat(durParts[0]) : 1;
      const hours = hoursPerPerson * (task.personnelCount || 1);
      const group = (task.originalItem.responsibleGroup || '').toLowerCase();
      const resp = (task.responsibility || '').toLowerCase();
      
      let role = '';
      if (group === 'mechanic' || resp.includes('mechanic')) role = 'Mechanical';
      else if (group === 'electric' || resp.includes('electric')) role = 'Electrical';
      else if (group === 'automation' || resp.includes('automat')) role = 'Automation';
      else if (group === 'hydraulic' || resp.includes('hydraulic')) role = 'Hydraulics';
      
      let currentWeek = (Math.floor(Math.random() * weeksInterval) + 1); // starting offset
      while(currentWeek <= 52) {
        const weekIdx = Math.floor(currentWeek) - 1;
        if (weekIdx >= 0 && weekIdx < 52) {
          if (role && (weeks[weekIdx] as any)[role] !== undefined) {
             (weeks[weekIdx] as any)[role] += hours;
          } else {
             weeks[weekIdx].Mechanical += hours; // fallback
          }
          weeks[weekIdx].required += hours;
        }
        currentWeek += weeksInterval;
      }
    });

    weeks.forEach(w => w.capacity = weeklyCapacity);

    const totalRequired = weeks.reduce((sum, w) => sum + w.required, 0);
    const totalCapacity = weeklyCapacity * 52;
    
    return { weeks, weeklyCapacity, totalRequired, totalCapacity };
  }, [tasks, techCounts]);

  const macroChartData = useMemo(() => {
    if (macroTimeframe === 'weekly') return macroFeasibilityData.weeks;
    
    if (macroTimeframe === 'monthly') {
      const months: any[] = [];
      const monthNamesAbbr = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      for (let m = 0; m < 12; m++) {
        // approx 4.33 weeks per month: months 0,1,2 (13 weeks) -> m0: 4, m1: 4, m2: 5
        const weeksInMonth = (m + 1) % 3 === 0 ? 5 : 4;
        const startIndex = months.reduce((acc, curr) => acc + curr._weekCount, 0);
        const thisMonthWeeks = macroFeasibilityData.weeks.slice(startIndex, startIndex + weeksInMonth);
        
        months.push({
          week: monthNamesAbbr[m], // repurpose 'week' key for XAxis
          Mechanical: thisMonthWeeks.reduce((sum, w) => sum + w.Mechanical, 0),
          Electrical: thisMonthWeeks.reduce((sum, w) => sum + w.Electrical, 0),
          Automation: thisMonthWeeks.reduce((sum, w) => sum + w.Automation, 0),
          Hydraulics: thisMonthWeeks.reduce((sum, w) => sum + w.Hydraulics, 0),
          capacity: macroFeasibilityData.weeklyCapacity * weeksInMonth,
          required: thisMonthWeeks.reduce((sum, w) => sum + w.required, 0),
          _weekCount: weeksInMonth
        });
      }
      return months;
    }

    if (macroTimeframe === 'quarterly') {
      const quarters: any[] = [];
      for (let q = 0; q < 4; q++) {
        const thisQuarterWeeks = macroFeasibilityData.weeks.slice(q * 13, (q + 1) * 13);
        quarters.push({
          week: `Q${q + 1}`,
          Mechanical: thisQuarterWeeks.reduce((sum, w) => sum + w.Mechanical, 0),
          Electrical: thisQuarterWeeks.reduce((sum, w) => sum + w.Electrical, 0),
          Automation: thisQuarterWeeks.reduce((sum, w) => sum + w.Automation, 0),
          Hydraulics: thisQuarterWeeks.reduce((sum, w) => sum + w.Hydraulics, 0),
          capacity: macroFeasibilityData.weeklyCapacity * 13,
          required: thisQuarterWeeks.reduce((sum, w) => sum + w.required, 0)
        });
      }
      return quarters;
    }

    return macroFeasibilityData.weeks;
  }, [macroTimeframe, macroFeasibilityData]);

  const handleRationalize = async () => {
    setIsRationalizing(true);
    try {
      const suggestions = await rationalizeTasks(tasks, macroFeasibilityData.totalRequired, macroFeasibilityData.totalCapacity, language);
      setRationalizationSuggestions(suggestions);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRationalizing(false);
    }
  };

  const handleUpdateTask = () => {
    if (!editingTaskId || !onUpdate) return;
    
    const newData = data.map(item => {
      const taskInMemo = tasks.find(t => t.id === editingTaskId);
      if (taskInMemo && (item.id === taskInMemo.originalItem.id)) {
        return {
          ...item,
          interval: editInterval,
          pmPersonnelCount: editPersonnel,
          inspectionSheet: {
            ...item.inspectionSheet,
            estimatedTime: editDuration
          } as any
        };
      }
      return item;
    });
    
    onUpdate(newData);
    setEditingTaskId(null);
  };

  const includedStudies = useMemo(() => {
    const studies = new Set<string>();
    data.forEach(item => {
      if (item.sourceStudyName) studies.add(item.sourceStudyName);
    });
    return Array.from(studies);
  }, [data]);

  const backlogTasks = tasks.filter(t => !scheduledTasks[t.id] || scheduledTasks[t.id].length === 0);
  
  const getDaysToRender = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const date = currentDate.getDate();
    const dayOfWeek = currentDate.getDay();

    if (viewMode === 'year') {
      return []; // Handled separately
    } else if (viewMode === 'month') {
      const firstDay = new Date(year, month, 1).getDay();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const days = [];
      for (let i = 0; i < firstDay; i++) {
        days.push(new Date(year, month, -firstDay + i + 1));
      }
      for (let i = 1; i <= daysInMonth; i++) {
        days.push(new Date(year, month, i));
      }
      const remaining = (days.length % 7 === 0) ? 0 : 7 - (days.length % 7);
      for (let i = 1; i <= remaining; i++) {
        days.push(new Date(year, month + 1, i));
      }
      return days;
    } else if (viewMode === 'week') {
      const startOfWeek = new Date(year, month, date - dayOfWeek);
      return Array.from({ length: 7 }).map((_, i) => new Date(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate() + i));
    } else {
      return [new Date(year, month, date)];
    }
  };

  const daysToRender = getDaysToRender();
  const selectedTaskData = tasks.find(t => t.id === selectedTask);

  const handleDragStart = (e: React.DragEvent, taskId: string, oldDate?: string) => {
    e.dataTransfer.setData('taskId', taskId);
    if (oldDate) {
      e.dataTransfer.setData('oldDate', oldDate);
    }
  };

  const handleDrop = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    const oldDate = e.dataTransfer.getData('oldDate');
    if (taskId) {
      setScheduledTasks(prev => {
        const next = { ...prev };
        let dates = next[taskId] ? [...next[taskId]] : [];
        if (oldDate) {
          dates = dates.filter(d => d !== oldDate);
        }
        if (!dates.includes(dateStr)) {
          dates.push(dateStr);
        }
        next[taskId] = dates;
        return next;
      });
    }
  };

  const handleDropToBacklog = (e: React.DragEvent) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId');
    const oldDate = e.dataTransfer.getData('oldDate');
    if (taskId) {
      setScheduledTasks(prev => {
        const next = { ...prev };
        if (oldDate && next[taskId]) {
          next[taskId] = next[taskId].filter(d => d !== oldDate);
          if (next[taskId].length === 0) {
            delete next[taskId];
          }
        } else {
          delete next[taskId];
        }
        return next;
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleCreateBundle = () => {
    const newBundle: Bundle = {
      id: `B-${Date.now()}`,
      name: `New Bundle ${bundles.length + 1}`,
      interval: 'As required',
      taskIds: []
    };
    setBundles([...bundles, newBundle]);
    setActiveBundleId(newBundle.id);
  };

  const handleAddToBundle = (taskId: string, taskInterval: string) => {
    if (!activeBundleId) {
       const newBundle: Bundle = {
         id: `B-${Date.now()}`,
         name: `Bundle for ${taskInterval}`,
         interval: taskInterval,
         taskIds: [taskId]
       };
       setBundles([...bundles, newBundle]);
       setActiveBundleId(newBundle.id);
    } else {
       setBundles(bundles.map(b => {
         if (b.id === activeBundleId) {
            return { 
              ...b, 
              taskIds: [...new Set([...b.taskIds, taskId])], 
              interval: b.taskIds.length === 0 ? taskInterval : b.interval 
            };
         }
         return b;
       }));
    }
  };

  const handleRemoveFromBundle = (bundleId: string, taskId: string) => {
    setBundles(bundles.map(b => {
      if (b.id === bundleId) {
        return { ...b, taskIds: b.taskIds.filter(id => id !== taskId) };
      }
      return b;
    }));
  };

  const handleDeleteBundle = (bundleId: string) => {
    setBundles(bundles.filter(b => b.id !== bundleId));
    if (activeBundleId === bundleId) {
      setActiveBundleId(null);
    }
  };

  const handleMakePermanentClick = () => {
    if (!activeBundleId) return;
    
    const bundle = bundles.find(b => b.id === activeBundleId);
    if (!bundle) return;
    
    const bundledTasks = tasks.filter(t => bundle.taskIds.includes(t.id));
    if (bundledTasks.length === 0) return;
    
    const originalItems = bundledTasks.map(t => t.originalItem).filter(Boolean) as RCMItem[];
    if (originalItems.length === 0) return;
    
    const newId = `bundled-${Date.now()}`;
    
    const allSteps: any[] = [];
    let stepCounter = 1;
    originalItems.forEach(item => {
      if(item.inspectionSheet?.steps) {
        item.inspectionSheet.steps.forEach(s => {
          allSteps.push({ ...s, step: stepCounter++ });
        });
      } else {
        allSteps.push({
          step: stepCounter++,
          description: `Perform ${item.maintenanceTask} on ${item.component}`,
          criteria: 'As expected',
          technique: 'Visual'
        });
      }
    });

    const newRCMItem: RCMItem = {
      id: newId,
      component: `Bundled: ${bundle.name}`,
      componentType: originalItems[0]?.componentType || 'Mechanical',
      functionType: 'Primary',
      function: 'Bundled Maintenance Routine',
      functionalFailure: 'Multiple failures avoided',
      failureMode: 'Various',
      failureEffect: 'Various',
      criticality: originalItems.some(i => i.criticality === 'High') ? 'High' : (originalItems.some(i => i.criticality === 'Medium') ? 'Medium' : 'Low'),
      consequenceCategory: originalItems[0]?.consequenceCategory || 'Evident - Operational',
      iso14224Code: originalItems[0]?.iso14224Code || 'N/A',
      severity: Math.max(...originalItems.map(i => i.severity || 1)),
      occurrence: Math.max(...originalItems.map(i => i.occurrence || 1)),
      detection: Math.max(...originalItems.map(i => i.detection || 1)),
      rpn: Math.max(...originalItems.map(i => i.rpn || 1)),
      maintenanceTask: `Execute bundled routine: ${bundle.name}`,
      interval: bundle.interval,
      taskType: 'Time-Based', 
      inspectionSheet: {
        responsibility: originalItems.map(i => i.inspectionSheet?.responsibility).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ') || 'Maintenance',
        estimatedTime: 'To be determined',
        safetyPrecautions: [...new Set(originalItems.map(i => i.inspectionSheet?.safetyPrecautions).filter(Boolean))].join(' | '),
        toolsRequired: [...new Set(originalItems.map(i => i.inspectionSheet?.toolsRequired).filter(Boolean))].join(', '),
        steps: allSteps
      },
      isNew: true
    };
    
    setPendingBundleItem({ newRCMItem, originalItemIds: bundledTasks.map(t => t.id) });
    setSaveModalName(`Bundled Workspace: ${bundle.name}`);
    setShowSaveModal(true);
  };

  const handleConfirmSave = (action: 'new' | 'existing') => {
    if (!pendingBundleItem) return;
    
    // Use exact reference mapping to filter out bundled items, falling back to id if necessary
    const originalIdsFromTasks = pendingBundleItem.originalItemIds;
    const newData = data.filter((item, index) => {
      const fallbackId = `T-${item.iso14224Code || '1.1.1'}.${index + 1}`;
      const effectiveId = item.id || fallbackId;
      return !originalIdsFromTasks.includes(effectiveId);
    });
    
    setBundles(bundles.filter(b => b.id !== activeBundleId));
    setActiveBundleId(bundles.filter(b => b.id !== activeBundleId)[0]?.id || null);
    setShowSaveModal(false);
    
    if (action === 'new') {
      if (onCreateNewStudy) {
        onCreateNewStudy([pendingBundleItem.newRCMItem], saveModalName);
        if (onUpdate) onUpdate(newData); // update current study to remove them
      } else {
        alert("Create new study feature requires app connection.");
      }
    } else if (action === 'existing') {
      if (onAddToExistingStudy) {
        if (!selectedExistingStudyId) {
          alert("Please select a workspace to add to.");
          return;
        }
        onAddToExistingStudy(pendingBundleItem.newRCMItem, pendingBundleItem.originalItemIds, selectedExistingStudyId);
        if (onUpdate) onUpdate(newData); // update current study to remove them
      } else {
        alert("Add to existing workspace feature requires app connection.");
      }
    }
  };

  const handleAutoBundle = async () => {
    setIsSuggestingBundles(true);
    try {
      const suggestions = await suggestTaskBundles(tasks, language);
      if (suggestions && suggestions.length > 0) {
        const newBundles = suggestions.map((s: any, i: number) => ({
          ...s,
          id: `B-${Date.now()}-${i}`
        }));
        setBundles([...bundles, ...newBundles]);
        setActiveBundleId(newBundles[0].id);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSuggestingBundles(false);
    }
  };

  const getTechRole = (task: any) => {
    const resp = (task.responsibility || '').toLowerCase();
    if (resp.includes('mechanic')) return 'Mechanical';
    if (resp.includes('electric')) return 'Electrical';
    if (resp.includes('automat')) return 'Automation';
    if (resp.includes('hydraulic')) return 'Hydraulics';
    if (task.originalItem?.componentType === 'Electrical') return 'Electrical';
    return 'Mechanical';
  };

  const handleAutoOptimize = async () => {
    setIsOptimizing(true);
    
    let currentTaskConditions = executionConditions;
    if (Object.keys(currentTaskConditions).length === 0) {
      const results = await classifyTasksExecution(tasks);
      const formattedResults: Record<string, { condition: 'running' | 'stopped', startDate?: string, dayOfWeek?: string, shiftType?: 'dayshift' | 'rotating' }> = {};
      Object.entries(results).forEach(([id, res]) => {
        formattedResults[id] = { 
          condition: res.condition,
          shiftType: res.shiftType
        };
      });
      currentTaskConditions = formattedResults;
      setExecutionConditions(formattedResults);
    }
    
    setTimeout(() => {
      const newSchedule = { ...scheduledTasks };
      
      const getCapacity = (role: string, date: Date, shiftType?: 'dayshift' | 'rotating') => {
        let counts = { dayshift: 1, rotating: 0, brigadeCount: 4 }; // default
        for (const key in techCounts) {
          if (role.toLowerCase().includes(key.toLowerCase())) {
            counts = techCounts[key];
            break;
          }
        }
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        
        if (shiftType === 'dayshift') {
          if (isWeekend) return 0;
          return counts.dayshift * 8;
        } else if (shiftType === 'rotating') {
          // Rotating team works 24/7
          return counts.rotating * 24;
        }

        if (isWeekend) {
          return counts.rotating * 24;
        }
        // During weekdays, both day shift (8h) and rotating (24h) are available
        return (counts.dayshift * 8) + (counts.rotating * 24);
      };

      const dailyLoad: Record<string, Record<string, number>> = {};

      const getLoad = (dateStr: string, role: string) => {
        if (!dailyLoad[dateStr]) dailyLoad[dateStr] = {};
        return dailyLoad[dateStr][role] || 0;
      };

      const addLoad = (dateStr: string, role: string, hours: number) => {
        if (!dailyLoad[dateStr]) dailyLoad[dateStr] = {};
        dailyLoad[dateStr][role] = (dailyLoad[dateStr][role] || 0) + hours;
      };

      const getTaskLoad = (task: any) => {
        const durMatch = String(task.duration).match(/[\d.]+/);
        const hours = durMatch ? parseFloat(durMatch[0]) : 2;
        return hours * (task.personnelCount || 1);
      };

      const stoppageFreq = parseInt(plannedStoppageFrequency) || 30;
      const stoppageDur = parseInt(plannedStoppageDuration) || 8;
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const isStoppageDay = (date: Date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        
        let anchorDate = new Date(today);
        if (globalStoppageStartDate) {
          const sd = new Date(globalStoppageStartDate);
          if (!isNaN(sd.getTime())) {
            anchorDate = sd;
            anchorDate.setHours(0, 0, 0, 0);
          }
        }

        if (globalStoppageDayOfWeek && dayMap[globalStoppageDayOfWeek] !== undefined) {
          const targetDay = dayMap[globalStoppageDayOfWeek];
          let currentDay = anchorDate.getDay();
          let daysUntil = (targetDay - currentDay + 7) % 7;
          anchorDate.setDate(anchorDate.getDate() + daysUntil);
        }

        const diffTime = d.getTime() - anchorDate.getTime();
        const diffDays = Math.floor(diffTime / (1000 * 3600 * 24));
        
        if (diffDays < 0) return false;
        return diffDays % stoppageFreq === 0;
      };

      const stoppageLoad: Record<string, number> = {};
      const getStoppageLoad = (dateStr: string) => stoppageLoad[dateStr] || 0;
      const addStoppageLoad = (dateStr: string, hours: number) => {
         stoppageLoad[dateStr] = (stoppageLoad[dateStr] || 0) + hours;
      };

      const parseIntervalToDays = (interval: string) => {
        if (!interval) return 30;
        const lower = interval.toLowerCase();
        
        // Handle specific text intervals first
        if (lower.includes('semi-annual') || lower.includes('semi annual') || lower.includes('biannual')) return 182;
        if (lower.includes('quarterly')) return 91;
        if (lower.includes('bi-monthly') || lower.includes('bi monthly') || lower.includes('bimonthly')) return 60;
        if (lower.includes('bi-weekly') || lower.includes('bi weekly') || lower.includes('biweekly')) return 14;
        if (lower.includes('annually') || lower.includes('annual')) return 365;
        if (lower.includes('monthly')) return 30;
        if (lower.includes('weekly')) return 7;
        if (lower.includes('daily')) return 1;

        // Parse numeric intervals
        let num = 1;
        const match = lower.match(/[\d.]+/);
        if (match) num = parseFloat(match[0]);

        if (lower.includes('year')) return num * 365;
        if (lower.includes('month')) return num * 30;
        if (lower.includes('week')) return num * 7;
        if (lower.includes('day')) return num * 1;
        if (lower.includes('shift')) return num * 1;
        if (lower.includes('hour')) return num * 1;
        
        return 30; // default
      };

      const dayMap: Record<string, number> = {
        'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4, 'Friday': 5, 'Saturday': 6
      };

      // Pre-fill load from already scheduled tasks
      tasks.forEach(task => {
        if (newSchedule[task.id]) {
          const duration = getTaskLoad(task);
          newSchedule[task.id].forEach(dateStr => {
            addLoad(dateStr, getTechRole(task), duration);
          });
        }
      });

      const twoYearsFromNow = new Date(today);
      twoYearsFromNow.setFullYear(today.getFullYear() + 2);

      backlogTasks.forEach(task => {
        const duration = getTaskLoad(task);
        const role = getTechRole(task);
        
        const daysOffset = parseIntervalToDays(task.interval);
        
        if (daysOffset <= 0) return;

        const pref = currentTaskConditions[task.id] || { condition: 'running' };
        const condition = pref.condition;
        
        let targetDate = new Date(today);
        
        // If "Stopped", align with global stoppage window
        if (condition === 'stopped') {
          let anchorDate = new Date(today);
          if (globalStoppageStartDate) {
            const sd = new Date(globalStoppageStartDate);
            if (!isNaN(sd.getTime())) {
              anchorDate = sd;
              anchorDate.setHours(0, 0, 0, 0);
            }
          }

          if (globalStoppageDayOfWeek && dayMap[globalStoppageDayOfWeek] !== undefined) {
            const targetDay = dayMap[globalStoppageDayOfWeek];
            let currentDay = anchorDate.getDay();
            let daysUntil = (targetDay - currentDay + 7) % 7;
            anchorDate.setDate(anchorDate.getDate() + daysUntil);
          }
          
          targetDate = anchorDate;
        } else {
          // If "Running", use specific task preferences if set
          if (pref.startDate) {
            const userStartDate = new Date(pref.startDate);
            if (!isNaN(userStartDate.getTime())) {
              targetDate = userStartDate;
            }
          }

          if (pref.dayOfWeek && dayMap[pref.dayOfWeek] !== undefined) {
            const targetDay = dayMap[pref.dayOfWeek];
            let currentDay = targetDate.getDay();
            let daysUntil = (targetDay - currentDay + 7) % 7;
            targetDate.setDate(targetDate.getDate() + daysUntil);
          }

          // Random distribution if no manual override for running tasks
          if (!pref.startDate && !pref.dayOfWeek) {
            let firstOffset = Math.floor(Math.random() * Math.min(daysOffset, 365));
            targetDate.setDate(targetDate.getDate() + firstOffset);
          }
        }

        const dates: string[] = [];

        if (daysOffset > 730) {
            // Schedule once if interval is very large
            let searchDate = new Date(targetDate);
            let scheduled = false;
            const searchWindow = condition === 'stopped' ? Math.max(30, stoppageFreq * 2) : 30;
            for (let i = 0; i < searchWindow; i++) {
              let sd = new Date(searchDate);
              sd.setDate(sd.getDate() + i);
              
              if (condition === 'stopped' && !isStoppageDay(sd)) {
                  continue;
              }
              
              const cap = getCapacity(role, sd, pref.shiftType);
              if (cap > 0) {
                const dateStr = getLocalDateString(sd);
                if (getLoad(dateStr, role) + duration <= cap) {
                  if (condition === 'stopped' && getStoppageLoad(dateStr) + duration > stoppageDur) {
                      continue;
                  }

                  dates.push(dateStr);
                  addLoad(dateStr, role, duration);
                  if (condition === 'stopped') {
                      addStoppageLoad(dateStr, duration);
                  }
                  scheduled = true;
                  break;
                }
              }
            }
            if (!scheduled) {
               dates.push(getLocalDateString(targetDate));
            }
        } else {
            // Loop and schedule multiple times up to 2 years
            while (targetDate <= twoYearsFromNow) {
              let scheduled = false;
              let scheduledDate = new Date(targetDate);
              
              const searchWindow = condition === 'stopped' ? Math.max(30, stoppageFreq * 2) : 30;
              for (let i = 0; i < searchWindow; i++) {
                let searchDate = new Date(targetDate);
                searchDate.setDate(searchDate.getDate() + i);
                
                if (condition === 'stopped' && !isStoppageDay(searchDate)) {
                    continue;
                }
                
                // If dayOfWeek is specified, we must respect it
                if (pref.dayOfWeek && dayMap[pref.dayOfWeek] !== undefined) {
                    if (searchDate.getDay() !== dayMap[pref.dayOfWeek]) {
                        continue;
                    }
                }

                const cap = getCapacity(role, searchDate, pref.shiftType);
                if (cap > 0) {
                  const dateStr = getLocalDateString(searchDate);
                  if (getLoad(dateStr, role) + duration <= cap) {
                    if (condition === 'stopped' && getStoppageLoad(dateStr) + duration > stoppageDur) {
                        continue;
                    }

                    dates.push(dateStr);
                    addLoad(dateStr, role, duration);
                    if (condition === 'stopped') {
                        addStoppageLoad(dateStr, duration);
                    }
                    scheduled = true;
                    scheduledDate = new Date(searchDate);
                    break;
                  }
                }
              }

              if (!scheduled) {
                 const dateStr = getLocalDateString(targetDate);
                 dates.push(dateStr);
                 scheduledDate = new Date(targetDate);
              }

              targetDate = new Date(scheduledDate);
              targetDate.setDate(targetDate.getDate() + daysOffset);
            }
        }

        if (dates.length > 0) {
          newSchedule[task.id] = dates;
        }
      });

      setScheduledTasks(newSchedule);
      setIsOptimizing(false);
    }, 100);
  };

  const roleColors: Record<string, string> = {
    Mechanical: 'text-blue-700 bg-blue-100 border-blue-200',
    Electrical: 'text-amber-700 bg-amber-100 border-amber-200',
    Automation: 'text-purple-700 bg-purple-100 border-purple-200',
    Hydraulics: 'text-cyan-700 bg-cyan-100 border-cyan-200',
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-slate-50/50 p-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <CalendarIcon className="text-indigo-600" size={24} />
          <div>
            <h2 className="text-xl font-black text-slate-800">Strategy Load leveler</h2>
            {includedStudies.length > 0 && (
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1 flex items-center gap-2">
                <span>Included Studies:</span>
                <div className="flex gap-1 flex-wrap">
                  {includedStudies.map(study => (
                    <span key={study} className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100">{study}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex bg-slate-200/50 p-1 rounded-xl">
          <button 
            onClick={() => setWorkspaceMode('macro')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${workspaceMode === 'macro' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <BarChart size={16} />
            Strategy Load Analysis
          </button>
          <button 
            onClick={() => setWorkspaceMode('schedule')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${workspaceMode === 'schedule' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <CalendarIcon size={16} />
            Resource Scheduling
          </button>
          <button 
            onClick={() => setWorkspaceMode('consolidation')}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-all ${workspaceMode === 'consolidation' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Layers size={16} />
            Task Consolidation Workspace
          </button>
        </div>
      </div>

      {workspaceMode === 'schedule' && (
        <div className="mb-4 flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-6">
             <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Optimal Load (&lt;80%)</span>
             </div>
             <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Heavy Load (80-100%)</span>
             </div>
             <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Overloaded (&gt;100%)</span>
             </div>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
             <Info size={12} />
             <span>Click any date to see load breakdown & tasks</span>
          </div>
        </div>
      )}

      {workspaceMode === 'schedule' && (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <button onClick={handleToday} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-lg transition-colors">
                Today
              </button>
              <div className="flex items-center gap-4 ml-4">
                <button onClick={handlePrev} className="p-1 hover:bg-slate-100 rounded-md text-slate-500 transition-colors">
                  <ChevronLeft size={20} />
                </button>
                <h3 className="text-xl font-black text-slate-800 min-w-[140px] text-center">
                  {viewMode === 'year' ? currentDate.getFullYear() : 
                   viewMode === 'month' ? `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}` : 
                   viewMode === 'week' ? `Week of ${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}` :
                   `${monthNames[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`}
                </h3>
                <button onClick={handleNext} className="p-1 hover:bg-slate-100 rounded-md text-slate-500 transition-colors">
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-lg">
              <button onClick={() => setViewMode('year')} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${viewMode === 'year' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Year</button>
              <button onClick={() => setViewMode('month')} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${viewMode === 'month' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Month</button>
              <button onClick={() => setViewMode('week')} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${viewMode === 'week' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Week</button>
              <button onClick={() => setViewMode('day')} className={`px-4 py-1.5 text-sm font-bold rounded-md transition-colors ${viewMode === 'day' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}>Day</button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button onClick={() => setShowClearConfirm(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 hover:bg-red-50 text-red-600 text-sm font-bold rounded-xl shadow-sm transition-colors">
              <Trash2 size={16} />
              Clear Schedule
            </button>
            <button onClick={() => setShowExecutionConditionsModal(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-xl shadow-sm transition-colors">
              <AlertCircle size={16} className="text-amber-500" />
              Task Execution Conditions
            </button>
            <button onClick={() => setShowWorkforceModal(true)} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-bold rounded-xl shadow-sm transition-colors">
              <Users size={16} className="text-indigo-500" />
              Workforce Settings
            </button>
            <button onClick={handleAutoOptimize} disabled={isOptimizing} className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md shadow-indigo-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
              {isOptimizing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} className="fill-white" />}
              {isOptimizing ? 'Optimizing...' : 'Auto-Optimize Schedule'}
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left Sidebar */}
          <div className="w-80 border-r border-slate-100 flex flex-col bg-slate-50/30 overflow-y-auto">
            {/* Task Backlog */}
            <div 
              className="p-5 flex-1 overflow-y-auto"
              onDragOver={handleDragOver}
              onDrop={handleDropToBacklog}
            >
              <div className="flex items-center justify-between mb-4 text-slate-700">
                <div className="flex items-center gap-2">
                  <ClipboardList size={18} />
                  <h4 className="font-bold">Task Backlog</h4>
                </div>
                <span className="text-xs font-black bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">
                  {backlogTasks.length}
                </span>
              </div>

              <div className="space-y-3">
                {backlogTasks.map((task) => (
                  <div 
                    key={task.id} 
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onClick={() => setSelectedTask(task.id)}
                    className={`bg-white border rounded-xl p-3 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing ${selectedTask === task.id ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-slate-200 hover:border-indigo-300'}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-black text-indigo-700 truncate max-w-[150px]" title={task.component}>{task.component}</span>
                        {executionConditions[task.id] && (
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${executionConditions[task.id]?.condition === 'running' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                            {executionConditions[task.id]?.condition}
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0">{task.type}</span>
                    </div>
                    <p className="text-xs text-slate-700 mb-3 line-clamp-2">{task.title}</p>
                    {task.sourceStudyName && !task.sourceStudyName.startsWith('study-') && (
                      <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2 truncate">
                        From: {task.sourceStudyName}
                      </div>
                    )}
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      <div className="flex items-center gap-1"><Clock size={12} /> {task.duration}</div>
                      <div className="flex items-center gap-1"><AlertCircle size={12} /> {task.interval}</div>
                    </div>
                  </div>
                ))}
                {backlogTasks.length === 0 && (
                  <div className="text-center p-4 text-sm text-slate-400 font-medium">
                    All tasks scheduled!
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="flex-1 flex flex-col bg-white">
            {viewMode === 'year' ? (
              <div className="flex-1 grid grid-cols-3 grid-rows-4 gap-4 p-4 overflow-y-auto bg-slate-50/50">
                {monthNames.map((month, index) => {
                  const tasksForMonth = tasks.filter(t => {
                    const dates = scheduledTasks[t.id];
                    if (!dates) return false;
                    return dates.some(date => {
                      const d = new Date(date);
                      return d.getFullYear() === currentDate.getFullYear() && d.getMonth() === index;
                    });
                  });
                  
                  return (
                    <div 
                      key={month} 
                      onClick={() => {
                        const targetDate = new Date(currentDate.getFullYear(), index, 1);
                        setCurrentDate(targetDate);
                        setViewMode('month');
                      }}
                      className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col shadow-sm hover:shadow-md transition-all cursor-pointer group"
                    >
                      <div className="flex justify-between items-center mb-3">
                        <h4 className="font-black text-slate-800 group-hover:text-indigo-600 transition-colors uppercase text-xs tracking-widest">{month}</h4>
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">{tasksForMonth.length} tasks</span>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                        {tasksForMonth.map(task => {
                          const datesInMonth = scheduledTasks[task.id].filter(date => {
                            const d = new Date(date);
                            return d.getFullYear() === currentDate.getFullYear() && d.getMonth() === index;
                          });
                          return datesInMonth.map(dateStr => ({ task, dateStr }));
                        }).flat().sort((a, b) => new Date(a.dateStr).getDate() - new Date(b.dateStr).getDate()).map(({ task, dateStr }) => (
                            <div 
                              key={`${task.id}-${dateStr}`} 
                              onClick={() => setSelectedTask(task.id)}
                              className={`text-[10px] flex flex-col font-bold px-2 py-1.5 rounded cursor-pointer transition-colors shadow-sm gap-1 ${selectedTask === task.id ? 'bg-indigo-600 text-white' : 'text-indigo-700 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100'}`}
                              title={task.title}
                            >
                              <div className="flex justify-between items-center gap-1 w-full">
                                <span className="truncate">{task.component} - {new Date(dateStr).getDate()} {month.substring(0,3)}</span>
                                {executionConditions[task.id] && (
                                  <span className={`shrink-0 text-[8px] uppercase tracking-widest px-1 py-0.5 rounded ${selectedTask === task.id ? (executionConditions[task.id]?.condition === 'running' ? 'bg-indigo-700 text-emerald-300' : 'bg-indigo-700 text-red-300') : (executionConditions[task.id]?.condition === 'running' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}`} title={executionConditions[task.id]?.condition}>
                                    {executionConditions[task.id]?.condition}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        {tasksForMonth.length === 0 && (
                          <div className="text-xs text-slate-400 font-medium text-center py-4">No tasks</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
                <div className={`grid border-b border-slate-100 ${viewMode === 'day' ? 'grid-cols-1' : 'grid-cols-7'}`}>
                  {viewMode === 'day' ? (
                    <div className="py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][currentDate.getDay()]}
                    </div>
                  ) : (
                    ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(day => (
                      <div key={day} className="py-3 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {day}
                      </div>
                    ))
                  )}
                </div>
                
                <div className={`flex-1 grid ${viewMode === 'day' ? 'grid-cols-1' : 'grid-cols-7'}`}>
                  {daysToRender.map((day, i) => {
                    const dateStr = getLocalDateString(day);
                    const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                    const tasksForDay = tasks.filter(t => scheduledTasks[t.id]?.includes(dateStr));
                    
                    // Calculate load for the day
                    let totalLoad = 0;
                    let totalCap = 0;
                    let isOverloaded = false;
                    let stoppedTasksCount = 0;
                    
                    const roleLoads: Record<string, number> = {};
                    tasksForDay.forEach(t => {
                      if (executionConditions[t.id]?.condition === 'stopped') {
                        stoppedTasksCount++;
                      }
                      const match = t.duration.match(/[\d.]+/);
                      const dur = match ? parseFloat(match[0]) : 2;
                      const role = getTechRole(t);
                      roleLoads[role] = (roleLoads[role] || 0) + dur;
                      totalLoad += dur;
                    });

                    Object.entries(techCounts).forEach(([role, counts]) => {
                      const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                      const cap = isWeekend ? (counts.rotating * 24) : (counts.dayshift * 8 + counts.rotating * 24);
                      totalCap += cap;

                      const loadForRole = roleLoads[role] || 0;
                      
                      if (loadForRole > cap) isOverloaded = true;
                    });

                    const loadPercentage = totalCap > 0 ? (totalLoad / totalCap) * 100 : (totalLoad > 0 ? 100 : 0);
                    const isIsolatedStoppage = stoppedTasksCount > 0 && stoppedTasksCount < 3; // Defines a conflict

                    return (
                      <div 
                        key={dateStr} 
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, dateStr)}
                        onClick={() => setSelectedCalendarDate(day)}
                        className={`border-r border-b border-slate-100 p-2 flex flex-col cursor-pointer transition-colors hover:bg-slate-50 ${!isCurrentMonth && viewMode === 'month' ? 'bg-slate-50/50' : ''} ${isIsolatedStoppage ? 'bg-orange-50/30' : ''}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className={`text-xs font-bold ${day.toDateString() === new Date().toDateString() ? 'bg-indigo-600 text-white px-2 py-0.5 rounded-full' : 'text-slate-600'}`}>
                            {viewMode === 'month' ? day.getDate() : `${day.getDate()} ${monthNames[day.getMonth()].substring(0, 3)}`}
                          </span>
                          {stoppedTasksCount > 0 && (
                             <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${isIsolatedStoppage ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-red-100 text-red-700 border border-red-200'}`} title={isIsolatedStoppage ? 'Conflict: Isolated Machine Stop - Consider Grouping Tasks' : 'Turnaround / Shutdown Day'}>
                                {isIsolatedStoppage ? 'Conflict: Isolated Stop' : 'Turnaround'}
                             </span>
                          )}
                        </div>
                        
                        {/* Load Indicator Breakdown */}
                        <div className="flex gap-0.5 mt-auto h-3">
                          {Object.entries(techCounts).map(([role, counts]) => {
                            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                            const cap = isWeekend ? (counts.rotating * 24) : (counts.dayshift * 8 + counts.rotating * 24);
                            if (cap === 0) return null;
                            const load = roleLoads[role] || 0;
                            const pct = Math.min(100, (load / cap) * 100);
                            
                            return (
                              <div key={role} className="flex-1 h-full bg-slate-50 rounded-sm overflow-hidden border border-slate-100" title={`${role}: ${load.toFixed(1)}/${cap}h`}>
                                <div 
                                  className={`w-full h-full transition-all ${load > cap ? 'bg-red-500' : pct > 80 ? 'bg-amber-400' : load > 0 ? 'bg-emerald-400' : 'bg-transparent'}`}
                                  style={{ marginTop: `${100 - pct}%` }}
                                />
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[120px] pr-1">
                          {tasksForDay.map((task) => (
                            <div 
                              key={task.id} 
                              draggable
                              onDragStart={(e) => handleDragStart(e, task.id, dateStr)}
                              onClick={() => setSelectedTask(task.id)}
                              className={`text-[10px] flex flex-col font-bold px-2 py-1.5 rounded cursor-grab active:cursor-grabbing transition-colors shadow-sm gap-1 ${selectedTask === task.id ? 'bg-indigo-600 text-white' : 'text-indigo-700 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100'}`}
                              title={task.title}
                            >
                              <div className="flex justify-between items-center gap-1 w-full">
                                <span className="truncate">{task.component} - {task.duration}</span>
                                {executionConditions[task.id] && (
                                  <span className={`shrink-0 text-[8px] uppercase tracking-widest px-1 py-0.5 rounded ${selectedTask === task.id ? (executionConditions[task.id]?.condition === 'running' ? 'bg-indigo-700 text-emerald-300' : 'bg-indigo-700 text-red-300') : (executionConditions[task.id]?.condition === 'running' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700')}`} title={executionConditions[task.id]?.condition}>
                                    {executionConditions[task.id]?.condition}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {/* Footer */}
            <div className="p-2 border-t border-slate-100 flex justify-between items-center text-[10px] text-slate-400 font-medium whitespace-nowrap">
              <span>* 08:00 - 17:00 Working Window</span>
              <div className="flex items-center gap-4 overflow-x-auto hide-scrollbar">
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full border border-red-300 shrink-0" /> Overloaded</div>
                <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full border border-slate-300 shrink-0" /> Available</div>
                <div className="h-3 w-px bg-slate-300"></div>
                <div className="flex items-center gap-1.5"><span className="px-1 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[8px] uppercase tracking-widest font-bold">RUNNING</span></div>
                <div className="flex items-center gap-1.5"><span className="px-1 py-0.5 rounded bg-red-100 text-red-700 text-[8px] uppercase tracking-widest font-bold">STOPPED</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Task Details Modal */}
      {selectedTaskData && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-xs font-black text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded uppercase tracking-wider truncate max-w-[200px]" title={selectedTaskData.id}>{selectedTaskData.id}</span>
                  <span className="text-xs font-black text-white bg-indigo-600 px-3 py-0.5 rounded uppercase tracking-wider">{selectedTaskData.component}</span>
                  <span className="text-xs font-bold text-slate-500 bg-slate-200 px-2 py-0.5 rounded uppercase tracking-wider">{selectedTaskData.type}</span>
                  {executionConditions[selectedTaskData.id] && (
                    <span className={`text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider ${executionConditions[selectedTaskData.id]?.condition === 'running' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      Machine {executionConditions[selectedTaskData.id]?.condition}
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-black text-slate-800">{selectedTaskData.title}</h3>
              </div>
              <button onClick={() => setSelectedTask(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4 mb-6">
                {selectedTaskData.sourceStudyName && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 col-span-2">
                    <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Source Study</div>
                    <div className="text-sm font-medium text-slate-800 flex items-center gap-2">
                      <ClipboardList size={14} className="text-indigo-500"/> 
                      {selectedTaskData.sourceStudyName}
                    </div>
                  </div>
                )}
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Technician Type</div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    <span className={`px-2.5 py-0.5 rounded-md border text-xs font-black ${roleColors[getTechRole(selectedTaskData)] || 'text-slate-700 bg-slate-100 border-slate-200'}`}>
                      {getTechRole(selectedTaskData)}
                    </span>
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Responsibility</div>
                  <div className="text-sm font-medium text-slate-800 flex items-center gap-2">
                    <Users size={14} className="text-indigo-500"/> 
                    {selectedTaskData.responsibility}
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">People Needed</div>
                  <div className="text-sm font-medium text-slate-800 flex items-center gap-2">
                    <Users size={14} className="text-indigo-500"/> 
                    {parseInt(selectedTaskData.responsibility) || 1}
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">Duration & Interval</div>
                  <div className="text-sm font-medium text-slate-800 flex items-center gap-4">
                    <span className="flex items-center gap-1"><Clock size={14} className="text-indigo-500"/> {selectedTaskData.duration}</span>
                    <span className="flex items-center gap-1"><AlertCircle size={14} className="text-indigo-500"/> {selectedTaskData.interval}</span>
                  </div>
                </div>
              </div>

              {selectedTaskData.originalItem.inspectionSheet && (
                <div className="space-y-6">
                  {selectedTaskData.originalItem.inspectionSheet.safetyPrecautions && (
                    <div>
                      <h4 className="text-sm font-black text-slate-800 mb-2 flex items-center gap-2">
                        <AlertCircle size={16} className="text-red-500" /> Safety Precautions
                      </h4>
                      <p className="text-sm text-slate-600 bg-red-50 p-3 rounded-xl border border-red-100">{selectedTaskData.originalItem.inspectionSheet.safetyPrecautions}</p>
                    </div>
                  )}
                  
                  {selectedTaskData.originalItem.inspectionSheet.toolsRequired && (
                    <div>
                      <h4 className="text-sm font-black text-slate-800 mb-2 flex items-center gap-2">
                        <Zap size={16} className="text-amber-500" /> Tools Required
                      </h4>
                      <p className="text-sm text-slate-600 bg-amber-50 p-3 rounded-xl border border-amber-100">{selectedTaskData.originalItem.inspectionSheet.toolsRequired}</p>
                    </div>
                  )}

                  {selectedTaskData.originalItem.inspectionSheet.steps && selectedTaskData.originalItem.inspectionSheet.steps.length > 0 && (
                    <div>
                      <h4 className="text-sm font-black text-slate-800 mb-3 flex items-center gap-2">
                        <ClipboardList size={16} className="text-indigo-500" /> Execution Steps
                      </h4>
                      <div className="space-y-3">
                        {selectedTaskData.originalItem.inspectionSheet.steps.map((step, idx) => (
                          <div key={idx} className="flex gap-3 bg-white border border-slate-200 p-3 rounded-xl shadow-sm">
                            <div className="flex-shrink-0 w-6 h-6 bg-indigo-100 text-indigo-700 font-black text-xs rounded-full flex items-center justify-center">
                              {step.step || idx + 1}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800 mb-1">{step.description}</p>
                              <div className="flex flex-col gap-1 text-xs text-slate-500">
                                {step.technique && <span><strong className="text-slate-600">Technique:</strong> {step.technique}</span>}
                                {step.criteria && <span><strong className="text-slate-600">Criteria:</strong> {step.criteria}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Task Consolidation Workspace */}
      {workspaceMode === 'consolidation' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden p-8 relative">
          <div className="absolute inset-0 z-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, slate-800 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
          
          <div className="flex items-start justify-between mb-6 relative z-10">
            <div>
              <h3 className="text-2xl font-black text-slate-800 flex items-center gap-3">
                <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
                  <Layers size={24} />
                </div>
                Task Consolidation Workspace
              </h3>
              <p className="text-slate-500 font-medium text-sm mt-2 max-w-3xl leading-relaxed">
                Combine overlapping tasks into a unified maintenance routine. Consolidating work reduces technician context-switching and machine downtime. You can select tasks manually or use AI suggestions.
              </p>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleAutoBundle}
                disabled={isSuggestingBundles}
                className="flex items-center gap-2 px-6 py-3 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 text-sm font-bold rounded-xl transition-all shadow-sm active:scale-95"
              >
                {isSuggestingBundles ? <Loader2 size={18} className="animate-spin" /> : <Settings2 size={18} />}
                {isSuggestingBundles ? 'Analyzing...' : 'AI Auto-Bundle Suggestions'}
              </button>
            </div>
          </div>

          <div className="mb-8 relative z-10 flex gap-4">
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex-1 flex flex-col justify-center">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Total Tasks</div>
              <div className="text-xl font-black text-slate-800">{tasks.length}</div>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex-[2] flex flex-col justify-center overflow-hidden">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Source Workspaces Merged ({includedStudies.length})</div>
              {includedStudies.length > 0 ? (
                <div className="text-sm font-bold text-slate-700 truncate">
                  {includedStudies.join(', ')}
                </div>
              ) : (
                <div className="text-sm font-medium text-slate-400">None</div>
              )}
            </div>
          </div>

          <div className="flex-1 grid grid-cols-2 gap-8 relative z-10 overflow-hidden min-h-0">
            {/* Step 1: Task Backlog */}
            <div className="bg-slate-50/70 border border-slate-200 rounded-3xl p-6 flex flex-col h-full overflow-hidden min-h-0 relative shadow-sm">
              <div className="absolute top-0 right-0 p-8 pointer-events-none opacity-5 text-slate-900">
                <ClipboardList size={100} />
              </div>
              <h4 className="font-black mb-1 text-slate-800 flex justify-between items-center shrink-0 text-lg relative z-10">
                <span className="flex items-center gap-3">
                  <span className="bg-white border text-slate-600 rounded-full w-8 h-8 flex items-center justify-center text-sm shadow-sm border-slate-300">1</span>
                  Available Tasks
                </span>
                <span className="text-xs font-black bg-indigo-100 border border-indigo-200 text-indigo-700 px-3 py-1 rounded-full">{tasks.length} total</span>
              </h4>
              <p className="text-sm font-medium text-slate-500 mb-5 relative z-10">Select tasks from the backlog to group them together.</p>
              
              <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar relative z-10">
                {tasks.reduce((groups, task) => {
                  const key = getNormalizedInterval(task.interval);
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(task);
                  return groups;
                }, {} as Record<string, typeof tasks>).map ? null : Object.entries(tasks.reduce((groups, task) => {
                  const key = getNormalizedInterval(task.interval);
                  if (!groups[key]) groups[key] = [];
                  groups[key].push(task);
                  return groups;
                }, {} as Record<string, typeof tasks>)).map(([interval, intervalTasks]: [string, any]) => (
                  <div key={interval} className="mb-4">
                    <div className="flex items-center gap-2 mb-2 sticky top-0 bg-slate-50/90 backdrop-blur-sm py-1 z-10">
                      <Clock size={14} className="text-indigo-600" />
                      <h5 className="text-xs font-black text-slate-600 uppercase tracking-widest">{interval}</h5>
                      <div className="h-px bg-slate-200 flex-1 ml-2"></div>
                    </div>
                    <div className="space-y-2">
                      {intervalTasks.map((task: any) => (
                        <div key={task.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm hover:border-indigo-300 transition-colors cursor-pointer group">
                          <div className="flex justify-between items-start mb-1 gap-2">
                            <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded truncate max-w-[140px]" title={task.component}>{task.component}</span>
                            <span className="text-[9px] font-bold text-slate-500 uppercase truncate" title={task.sourceStudyName}>{task.sourceStudyName && !task.sourceStudyName.startsWith('study-') ? task.sourceStudyName : ''}</span>
                          </div>
                          <p className="text-xs font-bold text-slate-800 line-clamp-2">{task.title}</p>
                          <div className="flex items-center gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => handleAddToBundle(task.id, task.interval)}
                              className="flex-1 py-1 text-[10px] uppercase tracking-wider font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded transition-colors"
                            >
                              Add to Bundle
                            </button>
                            <button className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Step 2: Bundle Drafts */}
            <div className="bg-indigo-50/40 border-2 border-indigo-200 rounded-3xl p-6 flex flex-col h-full overflow-hidden min-h-0 shadow-sm relative">
              <div className="absolute top-0 right-0 p-8 pointer-events-none opacity-5 text-indigo-900">
                <Layers size={100} />
              </div>
              <h4 className="font-black mb-1 text-indigo-950 flex justify-between items-center shrink-0 text-lg relative z-10">
                <div className="flex items-center gap-3">
                  <span className="bg-indigo-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm shadow-sm font-black border border-indigo-700">2</span>
                  <span>Active Bundle Draft</span>
                </div>
                {activeBundleId && <button onClick={handleMakePermanentClick} className="text-xs text-white hover:bg-indigo-700 font-bold bg-indigo-600 px-4 py-2 rounded-full flex items-center gap-2 transition-all shadow-sm hover:shadow-md hover:-translate-y-0.5 active:scale-95">
                  <CheckCircle2 size={14} /> Create Bundle
                </button>}
              </h4>
              <p className="text-sm font-medium text-indigo-600/70 mb-5 relative z-10">
                {activeBundleId ? `Working on: ${bundles.find(b => b.id === activeBundleId)?.name || 'Draft'} | Frequency: ${bundles.find(b => b.id === activeBundleId)?.interval || 'Mixed'}` : 'Review the bundled tasks and create a new unified study.'}
              </p>
              
              {bundles.length > 0 && (
                <div className="flex gap-2 mb-5 overflow-x-auto pb-2 custom-scrollbar shrink-0 relative z-10">
                  {bundles.map(b => (
                    <button 
                      key={b.id}
                      onClick={() => setActiveBundleId(b.id)}
                      className={`shrink-0 px-4 py-2 text-xs font-bold rounded-xl border-2 transition-all ${activeBundleId === b.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-indigo-700 border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50 shadow-sm'}`}
                    >
                      {b.name} <span className="ml-1.5 opacity-80 px-1.5 py-0.5 bg-black/10 rounded-md">{b.taskIds.length}</span>
                    </button>
                  ))}
                </div>
              )}
              
              {activeBundleId ? (
                <div className="flex-1 flex flex-col gap-5 overflow-hidden min-h-0 relative z-10">
                  <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                    {bundles.find(b => b.id === activeBundleId)?.taskIds.map(taskId => {
                       const task = tasks.find(t => t.id === taskId);
                       if (!task) return null;
                       return (
                         <div key={task.id} className="bg-white border border-indigo-200 rounded-xl p-3 shadow-sm group">
                           <div className="flex justify-between items-start mb-1">
                             <span className="text-[10px] font-black text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded truncate max-w-[200px]" title={task.component}>{task.component}</span>
                             <button onClick={() => handleRemoveFromBundle(activeBundleId, task.id)} className="text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                               <X size={14} />
                             </button>
                           </div>
                           <p className="text-xs font-bold text-slate-800 line-clamp-2">{task.title}</p>
                         </div>
                       );
                    })}
                    {bundles.find(b => b.id === activeBundleId)?.taskIds.length === 0 && (
                      <div className="text-center text-indigo-400/70 text-sm py-12 font-medium border-2 border-dashed border-indigo-200/50 rounded-xl h-full flex items-center justify-center">
                         Click "Add to Bundle" on a task from the backlog to add it here.
                      </div>
                    )}
                  </div>
                  <div className="pt-5 border-t-2 border-indigo-100 flex justify-between items-center shrink-0">
                     <button onClick={() => handleDeleteBundle(activeBundleId)} className="text-red-500 text-sm font-bold hover:text-red-700 hover:bg-red-50 px-4 py-2 rounded-xl transition-colors flex items-center gap-2">
                       <Trash2 size={16} /> Discard Draft
                     </button>
                     <button onClick={() => handleCreateBundle()} className="flex items-center gap-2 px-5 py-2.5 bg-white border border-indigo-200 text-indigo-700 font-bold rounded-xl hover:bg-indigo-50 hover:border-indigo-300 transition-all shadow-sm text-sm active:scale-95">
                       <Plus size={16} /> New Draft
                     </button>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col border-2 border-dashed border-indigo-200 bg-white/50 rounded-2xl p-8 items-center justify-center text-center relative z-10 transition-colors hover:bg-indigo-50/50">
                  <div className="w-20 h-20 bg-white border-2 border-indigo-100 rounded-3xl shadow-sm flex items-center justify-center mb-6 text-indigo-400">
                    <Layers size={40} className="stroke-[1.5]" />
                  </div>
                  <h5 className="font-black text-indigo-900 text-xl tracking-tight">Create a Task Bundle</h5>
                  <p className="text-slate-500 font-medium text-sm mt-3 max-w-sm leading-relaxed">
                    Click 'Add to Bundle' on tasks from the backlog to combine them. We'll automatically merge their inspection steps into a single check-list.
                  </p>
                  <button onClick={handleCreateBundle} className="mt-8 flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 active:scale-95 text-sm">
                    <Plus size={18} /> Start New Bundle
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Macro Feasibility Workspace */}
      {workspaceMode === 'macro' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col flex-1 min-h-0 overflow-hidden p-6 relative">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-8">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                  <BarChart size={20} />
                </div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">Macro Strategy Load Analysis</h3>
              </div>
              <p className="text-slate-500 font-medium text-sm ml-11">
                Rolling 52-week labor capacity vs. required maintenance load.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  onClick={() => setMacroTimeframe('weekly')}
                  className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${macroTimeframe === 'weekly' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Weekly
                </button>
                <button
                  onClick={() => setMacroTimeframe('monthly')}
                  className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${macroTimeframe === 'monthly' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Monthly
                </button>
                <button
                  onClick={() => setMacroTimeframe('quarterly')}
                  className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${macroTimeframe === 'quarterly' ? 'bg-white shadow-md text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  Quarterly
                </button>
              </div>

              <button 
                onClick={handleRationalize}
                disabled={isRationalizing}
                className="group relative flex items-center gap-3 px-6 py-3 overflow-hidden rounded-xl transition-all duration-300 active:scale-95 shadow-lg border border-indigo-500/10 disabled:opacity-50"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-600 via-violet-600 to-indigo-600 bg-[length:200%_auto] animate-[gradient_3s_linear_infinite] group-hover:scale-105 transition-transform duration-500 opacity-90"></div>
                <div className="relative flex items-center gap-2">
                  {isRationalizing ? <Loader2 size={16} className="text-white animate-spin" /> : <Sparkles size={16} className="text-white fill-white" />}
                  <span className="text-[10px] font-black text-white uppercase tracking-[0.1em]">
                    {isRationalizing ? 'Processing Algorithms...' : 'AI Strategy Rationalization'}
                  </span>
                </div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Load Factor</span>
                <div className={`w-2 h-2 rounded-full ${(macroFeasibilityData.totalRequired / macroFeasibilityData.totalCapacity) > 0.9 ? 'bg-rose-500' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`}></div>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-slate-800 tracking-tighter">
                  {((macroFeasibilityData.totalRequired / macroFeasibilityData.totalCapacity) * 100).toFixed(1)}%
                </span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">utilization</span>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Required Capacity</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-indigo-600 tracking-tighter">
                  {macroFeasibilityData.totalRequired.toFixed(0)}
                </span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">hours / yr</span>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Resource Baseline</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-emerald-600 tracking-tighter">
                  {macroFeasibilityData.totalCapacity.toFixed(0)}
                </span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">net hours / yr</span>
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-100 p-4 rounded-2xl">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Optimization Opportunity</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-amber-600 tracking-tighter">
                   {Math.max(0, macroFeasibilityData.totalCapacity - macroFeasibilityData.totalRequired).toFixed(0)}
                </span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">hr buffer</span>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col gap-6 overflow-hidden min-h-0">
            <div className="h-80 shrink-0 bg-white border border-slate-200 shadow-sm rounded-3xl p-6 relative">
              <div className="absolute top-4 left-6 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-indigo-600"></div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">Mechanical</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-cyan-500"></div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">Electrical</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">Automation</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-tight">Hydraulics</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={macroChartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis 
                    dataKey="week" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#94A3B8', fontWeight: 700 }} 
                    interval="preserveStartEnd" 
                    minTickGap={20} 
                  />
                  <YAxis 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#94A3B8', fontWeight: 700 }} 
                  />
                  <Tooltip 
                    cursor={{ fill: '#F8FAFC' }}
                    contentStyle={{ 
                      borderRadius: '16px', 
                      border: '1px solid #E2E8F0', 
                      boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
                      fontSize: '11px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em'
                    }}
                  />
                  
                  <Bar dataKey="Mechanical" stackId="a" fill="#4F46E5" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Electrical" stackId="a" fill="#06B6D4" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Automation" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Hydraulics" stackId="a" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  
                  <Line 
                    dataKey="capacity" 
                    type="stepAfter" 
                    dot={false} 
                    stroke="#EF4444" 
                    strokeWidth={2} 
                    strokeDasharray="6 4" 
                    tooltipType="none" 
                    name="Max Availability" 
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {rationalizationSuggestions.length > 0 ? (
              <div className="flex-1 flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-black text-slate-800 flex items-center gap-2 uppercase text-xs tracking-tight">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                      <Zap size={14} className="fill-white" />
                    </div>
                    Engineered Scoping Suggestions
                  </h4>
                  <div className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
                    Saves approx. {rationalizationSuggestions.reduce((acc, s) => acc + s.hoursSaved, 0).toFixed(0)} hours / yr
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto pr-2 space-y-4 custom-scrollbar pb-6">
                  {rationalizationSuggestions.map((suggestion, i) => {
                     const task = tasks.find(t => t.id === suggestion.taskId);
                     return (
                       <div key={i} className="bg-white border border-slate-200 rounded-[2rem] p-5 shadow-sm hover:shadow-md transition-all group flex flex-col md:flex-row md:items-center gap-6 relative overflow-hidden">
                         <div className={`absolute top-0 left-0 w-1.5 h-full ${suggestion.action === 'delete' ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
                         
                         <div className="flex-1 min-w-0">
                           <div className="flex items-center gap-3 mb-2">
                             <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm ${suggestion.action === 'delete' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                               {suggestion.action === 'delete' ? <Trash2 size={20} /> : <TrendingDown size={20} />}
                             </div>
                             <div>
                               <div className="flex items-center gap-2 mb-0.5">
                                 <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{suggestion.taskId}</span>
                                 <span className="text-slate-300">•</span>
                                 <span className={`text-[10px] font-black uppercase tracking-widest ${suggestion.action === 'delete' ? 'text-rose-600' : 'text-amber-600'}`}>
                                   {suggestion.action === 'delete' ? 'Scope Deletion' : `Interval Optimization`}
                                 </span>
                               </div>
                               <h5 className="text-base font-black text-slate-800 leading-tight truncate pr-20">{task?.title || 'System Task'}</h5>
                             </div>
                           </div>
                           <p className="text-slate-500 text-sm font-medium leading-relaxed pl-13 pr-4">{suggestion.justification}</p>
                         </div>

                         <div className="shrink-0 flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-slate-100 min-w-[140px]">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Efficiency Gain</span>
                            <span className="text-xl font-black text-indigo-600 tracking-tighter">-{suggestion.hoursSaved} hrs</span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase">per annum</span>
                         </div>

                         <div className="flex flex-col gap-2 shrink-0 md:border-l md:border-slate-100 md:pl-6">
                            <button 
                              onClick={() => {
                                if (onUpdate && task && task.originalItem) {
                                  const newData = [...data];
                                  const itemIndex = newData.findIndex(item => item === task.originalItem);
                                  if (itemIndex >= 0) {
                                    if (suggestion.action === 'delete') {
                                      newData.splice(itemIndex, 1);
                                    } else if (suggestion.action === 'extend' && suggestion.suggestedInterval) {
                                      const itemToUpdate = { ...newData[itemIndex] };
                                      itemToUpdate.interval = suggestion.suggestedInterval;
                                      newData[itemIndex] = itemToUpdate;
                                    }
                                    onUpdate(newData);
                                    setRationalizationSuggestions(rationalizationSuggestions.filter((_, idx) => idx !== i));
                                  }
                                }
                              }} 
                              className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-lg active:scale-95 text-center"
                            >
                              Execute Change
                            </button>
                            <button 
                              onClick={() => setRationalizationSuggestions(rationalizationSuggestions.filter((_, idx) => idx !== i))}
                              className="px-6 py-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 transition-all text-center"
                            >
                              Archive Trace
                            </button>
                         </div>
                       </div>
                     );
                  })}
                </div>
              </div>
            ) : (
               <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/50 border-2 border-dashed border-slate-200 rounded-[3rem] p-10 animate-in fade-in duration-700">
                 <div className="relative mb-8">
                    <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full scale-150"></div>
                    <div className="relative w-20 h-20 bg-white shadow-2xl shadow-indigo-100 rounded-[2.5rem] flex items-center justify-center text-indigo-500 border border-indigo-50">
                      <Sparkles size={40} className="fill-indigo-500/10" />
                    </div>
                 </div>
                 <h5 className="text-xl font-black text-slate-800 tracking-tight uppercase mb-2">Strategy Scoping Engine Ready</h5>
                 <p className="text-slate-500 font-medium text-sm max-w-md text-center leading-relaxed">
                   Initiate the RCM rationalization algorithm to detect performance bottlenecks and interval optimization opportunities across your asset structure.
                 </p>
                 <button 
                   onClick={handleRationalize}
                   disabled={isRationalizing}
                   className="mt-8 px-8 py-4 bg-indigo-600 text-white rounded-[1.5rem] text-[11px] font-black uppercase tracking-[0.2em] hover:bg-indigo-700 active:scale-95 transition-all shadow-xl shadow-indigo-100 flex items-center gap-3"
                 >
                   {isRationalizing ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} className="fill-white" />}
                   {isRationalizing ? 'Analyzing Workflows...' : 'Unlock Strategy Optimization'}
                 </button>
               </div>
            )}
          </div>
        </div>
      )}

      {/* Workforce Settings Modal */}
      {showWorkforceModal && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2 text-slate-800">
                <Users size={20} className="text-indigo-600" />
                <h3 className="text-lg font-black">Workforce Capacity</h3>
              </div>
              <button onClick={() => setShowWorkforceModal(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-500 transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-5 overflow-y-auto max-h-[70vh]">
              <p className="text-sm text-slate-500 mb-6">
                Configure your daily available technicians. Auto-optimization will use these limits to schedule tasks without overloading your team.
              </p>
              <div className="space-y-6">
                {Object.entries(techCounts).map(([role, counts]) => (
                  <div key={role} className="bg-white border border-slate-200 rounded-2xl p-5 mb-4 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="flex items-center gap-3 mb-5 pb-3 border-b border-slate-100">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100">
                        <Users size={20} className="text-indigo-600" />
                      </div>
                      <div>
                        <h5 className="font-black text-slate-800 text-base leading-tight">{role}</h5>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">MAINTENANCE TEAM CONFIG</p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 mb-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block pl-1">Fixed Day Shift</label>
                        <input 
                          type="number" 
                          min="0" 
                          value={counts.dayshift} 
                          onChange={(e) => setTechCounts(prev => ({ ...prev, [role]: { ...prev[role], dayshift: parseInt(e.target.value) || 0 } }))}
                          className="w-full text-center text-sm font-black text-slate-700 bg-slate-50 border border-slate-200 rounded-xl py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner"
                        />
                        <p className="text-[9px] text-slate-400 font-medium text-center">Mon-Fri / 8h</p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block pl-1">Staff / Brigade</label>
                        <input 
                          type="number" 
                          min="0" 
                          value={counts.rotating} 
                          onChange={(e) => setTechCounts(prev => ({ ...prev, [role]: { ...prev[role], rotating: parseInt(e.target.value) || 0 } }))}
                          className="w-full text-center text-sm font-black text-amber-600 bg-amber-50/50 border border-amber-100 rounded-xl py-3 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:bg-white transition-all shadow-inner"
                        />
                        <p className="text-[9px] text-slate-400 font-medium text-center">Rotating pool</p>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block pl-1">Brigades</label>
                        <input 
                          type="number" 
                          min="1" 
                          value={counts.brigadeCount || 4} 
                          onChange={(e) => setTechCounts(prev => ({ ...prev, [role]: { ...prev[role], brigadeCount: parseInt(e.target.value) || 4 } }))}
                          className="w-full text-center text-sm font-black text-indigo-600 bg-indigo-50/50 border border-indigo-100 rounded-xl py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner"
                        />
                        <p className="text-[9px] text-slate-400 font-medium text-center">Def: 4 (24/7)</p>
                      </div>
                    </div>

                    <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-lg border border-slate-800">
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-700/50">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                          <Info size={12} className="text-indigo-400" /> Coverage Metrics
                        </span>
                        <strong className="text-lg font-black text-white">{counts.dayshift + (counts.rotating * (counts.brigadeCount || 4))} <span className="text-xs font-normal text-slate-400 uppercase tracking-widest">Total Staff</span></strong>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/30">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2 opacity-70">Weekday Cap</span>
                          <div className="flex items-baseline gap-1">
                            <span className="text-lg font-black text-emerald-400">{(counts.dayshift * 8) + (counts.rotating * 24)}h</span>
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">/ day</span>
                          </div>
                        </div>
                        <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/30">
                          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2 opacity-70">Weekend Cap</span>
                          <div className="flex items-baseline gap-1">
                            <span className="text-lg font-black text-amber-400">{counts.rotating * 24}h</span>
                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">/ day</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button onClick={() => setShowWorkforceModal(false)} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Schedule Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm flex flex-col overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-red-50 text-red-700">
              <AlertCircle size={24} />
              <h3 className="text-lg font-black">Clear Schedule</h3>
            </div>
            <div className="p-5">
              <p className="text-sm text-slate-600">
                Are you sure you want to remove all scheduled tasks from the calendar? This will move all tasks back to the backlog.
              </p>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
              <button onClick={() => setShowClearConfirm(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-200 font-bold rounded-xl transition-colors">
                Cancel
              </button>
              <button 
                onClick={() => {
                  setScheduledTasks({});
                  setShowClearConfirm(false);
                }} 
                className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl shadow-sm transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task Execution Conditions Modal */}
      {showExecutionConditionsModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3 text-indigo-700">
                <AlertCircle size={24} />
                <h3 className="text-xl font-black">Task Execution Conditions & Planned Stoppage</h3>
              </div>
              <button onClick={() => setShowExecutionConditionsModal(false)} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
                    <Clock size={40} className="text-slate-900" />
                  </div>
                  <h4 className="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest relative z-10">Stoppage Freq.</h4>
                  <div className="flex items-baseline gap-1 relative z-10">
                    <input 
                      type="number" 
                      value={plannedStoppageFrequency} 
                      onChange={e => setPlannedStoppageFrequency(e.target.value)} 
                      className="w-20 text-2xl font-black text-indigo-600 bg-transparent border-none p-0 focus:ring-0"
                    />
                    <span className="text-sm font-bold text-slate-400">days</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:scale-110 transition-transform">
                    <Zap size={40} className="text-slate-900" />
                  </div>
                  <h4 className="text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest relative z-10">Stoppage Dur.</h4>
                  <div className="flex items-baseline gap-1 relative z-10">
                    <input 
                      type="number" 
                      value={plannedStoppageDuration} 
                      onChange={e => setPlannedStoppageDuration(e.target.value)} 
                      className="w-20 text-2xl font-black text-amber-600 bg-transparent border-none p-0 focus:ring-0"
                    />
                    <span className="text-sm font-bold text-slate-400">hours</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm relative overflow-hidden group border-t-4 border-t-indigo-500">
                  <h4 className="text-[10px] font-black text-indigo-400 mb-1 uppercase tracking-widest flex items-center gap-1 relative z-10">
                    <CalendarIcon size={12} /> Stoppage Sync Date
                  </h4>
                  <input 
                    type="date"
                    value={globalStoppageStartDate}
                    onChange={(e) => setGlobalStoppageStartDate(e.target.value)}
                    className="w-full text-sm font-black text-slate-700 bg-transparent border-none p-0 focus:ring-0"
                  />
                </div>

                <div className="bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm relative overflow-hidden group border-t-4 border-t-indigo-500">
                  <h4 className="text-[10px] font-black text-indigo-400 mb-1 uppercase tracking-widest flex items-center gap-1 relative z-10">
                    <Layers size={12} /> Recurring Day
                  </h4>
                  <select
                    value={globalStoppageDayOfWeek}
                    onChange={(e) => setGlobalStoppageDayOfWeek(e.target.value)}
                    className="w-full text-sm font-black text-slate-700 bg-transparent border-none p-0 focus:ring-0 appearance-none cursor-pointer"
                  >
                    <option value="">Any day</option>
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                    <option value="Sunday">Sunday</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-black text-slate-800">Task Conditions</h4>
                <button 
                  onClick={async () => {
                    setIsClassifying(true);
                    setClassificationComplete(false);
                    const results = await classifyTasksExecution(tasks);
                    const formattedResults: Record<string, { condition: 'running' | 'stopped', startDate?: string, dayOfWeek?: string, shiftType?: 'dayshift' | 'rotating' }> = {};
                    Object.entries(results).forEach(([id, res]) => {
                      formattedResults[id] = { 
                        condition: res.condition,
                        startDate: executionConditions[id]?.startDate,
                        dayOfWeek: executionConditions[id]?.dayOfWeek,
                        shiftType: res.shiftType
                      };
                    });
                    setExecutionConditions(prev => ({ ...prev, ...formattedResults }));
                    setIsClassifying(false);
                    setClassificationComplete(true);
                    setTimeout(() => setClassificationComplete(false), 5000);
                  }}
                  disabled={isClassifying}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
                >
                  {isClassifying ? <Loader2 size={16} className="animate-spin" /> : classificationComplete ? <CheckCircle2 size={16} className="text-emerald-500" /> : <Zap size={16} />}
                  {isClassifying ? 'Classifying...' : classificationComplete ? 'Classification Complete!' : 'AI Auto-Classify Tasks'}
                </button>
              </div>

              {classificationComplete && (
                <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3 animate-in slide-in-from-top-2 fade-in duration-300">
                  <CheckCircle2 className="text-emerald-500 mt-0.5 shrink-0" size={20} />
                  <div>
                    <h5 className="text-emerald-800 font-bold text-sm">AI Classification Successful</h5>
                    <p className="text-emerald-600 text-xs mt-1">
                      Tasks have been automatically organized into "Running" and "Stopped" categories based on the standard maintenance procedures. Please review the choices below.
                    </p>
                  </div>
                </div>
              )}

              <div className="space-y-3">
                {tasks.map(task => (
                  <div key={task.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all group border-l-4 border-l-indigo-600">
                    <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                      {/* Left: Task Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3 mb-2">
                          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100 shrink-0 shadow-sm group-hover:bg-indigo-100 transition-colors mt-1">
                            <Settings size={18} className="text-indigo-600" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{task.component}</span>
                              <span className="text-slate-300">•</span>
                              <span className="text-[10px] font-bold text-slate-400 capitalize">{task.type}</span>
                            </div>
                            <h5 className="text-base font-black text-slate-800 leading-tight truncate" title={task.title}>{task.title}</h5>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2">
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-100 rounded-lg">
                                <Users size={12} className="text-slate-400" />
                                <span className="text-[10px] font-bold text-slate-600">{task.responsibility}</span>
                              </div>
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-100 rounded-lg">
                                <Clock size={12} className="text-slate-400" />
                                <span className="text-[10px] font-bold text-slate-600">{task.duration}</span>
                              </div>
                              <div className="flex items-center gap-1.5 px-2 py-1 bg-slate-50 border border-slate-100 rounded-lg">
                                <CalendarIcon size={12} className="text-slate-400" />
                                <span className="text-[10px] font-bold text-slate-600">{task.interval}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right: Selectors */}
                      <div className="flex flex-col sm:flex-row gap-6 shrink-0 lg:border-l lg:border-slate-100 lg:pl-6">
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Operational State</label>
                          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50 shadow-inner w-fit">
                            <button 
                              onClick={() => setExecutionConditions(prev => ({ 
                                ...prev, 
                                [task.id]: { ...(prev[task.id] || { condition: 'running' }), condition: 'running' } 
                              }))}
                              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${executionConditions[task.id]?.condition === 'running' ? 'bg-emerald-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                            >
                              Running
                            </button>
                            <button 
                              onClick={() => setExecutionConditions(prev => ({ 
                                ...prev, 
                                [task.id]: { ...(prev[task.id] || { condition: 'running' }), condition: 'stopped' } 
                              }))}
                              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${executionConditions[task.id]?.condition === 'stopped' ? 'bg-rose-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                            >
                              Stopped
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest pl-1">Assigned Shift</label>
                          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200/50 shadow-inner w-fit">
                            <button 
                              onClick={() => setExecutionConditions(prev => ({ 
                                ...prev, 
                                [task.id]: { ...(prev[task.id] || { condition: 'running' }), shiftType: 'dayshift' } 
                              }))}
                              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${executionConditions[task.id]?.shiftType === 'dayshift' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                            >
                              Fixed Day
                            </button>
                            <button 
                              onClick={() => setExecutionConditions(prev => ({ 
                                ...prev, 
                                [task.id]: { ...(prev[task.id] || { condition: 'running' }), shiftType: 'rotating' } 
                              }))}
                              className={`px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${executionConditions[task.id]?.shiftType === 'rotating' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'}`}
                            >
                              Rotating
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-white flex justify-end">
              <button onClick={() => setShowExecutionConditionsModal(false)} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-sm transition-colors">
                Save & Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showSaveModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex bg-indigo-600 p-4 items-center justify-between">
              <h3 className="text-white font-black flex items-center gap-2"><CheckCircle2 size={20} /> Save Bundled Task</h3>
              <button onClick={() => setShowSaveModal(false)} className="text-indigo-200 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-sm font-medium text-slate-600 mb-5">
                You've combined several tasks into a single composite task. How would you like to save this new bundle?
              </p>

              <div className="space-y-4">
                <div className="p-4 rounded-xl border-2 border-indigo-100 bg-indigo-50/30">
                  <h4 className="font-bold text-indigo-900 mb-1">Add to existing Bundled Workspace</h4>
                  <p className="text-xs text-slate-500 mb-3">Moves the selected items into an already created workspace and bundles them.</p>
                  
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-indigo-700 mb-1">Select Workspace</label>
                    <select 
                      value={selectedExistingStudyId}
                      onChange={(e) => setSelectedExistingStudyId(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white text-slate-800"
                    >
                      <option value="" disabled>Select a workspace...</option>
                      {studies.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>

                  <button 
                    onClick={() => handleConfirmSave('existing')}
                    disabled={!selectedExistingStudyId}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
                  >
                    Add to Workspace
                  </button>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200"></div>
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-white px-2 text-slate-400 font-bold uppercase tracking-wider">or</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border-2 border-emerald-100 bg-emerald-50/30">
                  <h4 className="font-bold text-emerald-900 mb-1">Create a new Bundled Workspace</h4>
                  <p className="text-xs text-slate-500 mb-3">Creates a new workspace containing your backlog and the new bundle.</p>
                  
                  <div className="mb-4">
                    <label className="block text-xs font-bold text-emerald-700 mb-1">New Workspace Name</label>
                    <input 
                      type="text" 
                      value={saveModalName}
                      onChange={(e) => setSaveModalName(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-emerald-200 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>

                  <button 
                    onClick={() => handleConfirmSave('new')}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold rounded-lg transition-colors shadow-sm"
                  >
                    Create New Workspace
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Date Info Modal */}
      {selectedCalendarDate && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in zoom-in-95">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 p-8 flex justify-between items-center text-white shrink-0">
               <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-900/20">
                     <CalendarIcon size={28} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-black tracking-tight">{selectedCalendarDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] mt-1">Resource Utilization Report</p>
                  </div>
               </div>
               <button onClick={() => setSelectedCalendarDate(null)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
                 <X size={24} />
               </button>
            </div>

            <div className="p-8 overflow-y-auto flex-1 custom-scrollbar space-y-8 bg-slate-50/30">
               {/* Resource Breakdown */}
               <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Users size={16} className="text-indigo-600" />
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Technician Workload</h4>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {Object.entries(techCounts).map(([role, counts]) => {
                      const isWeekend = selectedCalendarDate.getDay() === 0 || selectedCalendarDate.getDay() === 6;
                      const cap = isWeekend ? (counts.rotating * 24) : (counts.dayshift * 8 + counts.rotating * 24);
                      if (cap === 0) return null;

                      // Calculate load for the day and role
                      const dateStr = getLocalDateString(selectedCalendarDate);
                      const tasksForDayAndRole = tasks.filter(t => 
                        scheduledTasks[t.id]?.includes(dateStr) && 
                        getTechRole(t) === role
                      );
                      const load = tasksForDayAndRole.reduce((acc, t) => {
                        const match = t.duration.match(/[\d.]+/);
                        const dur = match ? parseFloat(match[0]) : 2;
                        return acc + (dur * (t.personnelCount || 1));
                      }, 0);

                      const pct = Math.min(100, (load / cap) * 100);
                      const isOverloaded = load > cap;

                      return (
                        <div key={role} className="bg-white p-5 rounded-3xl border border-slate-200 shadow-sm group hover:border-indigo-200 transition-all">
                          <div className="flex justify-between items-center mb-3">
                             <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{role}</span>
                             <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg border ${isOverloaded ? 'bg-red-50 text-red-600 border-red-100' : pct > 80 ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100 uppercase'}`}>
                               {isOverloaded ? 'Overloaded' : pct > 80 ? 'Heavy' : 'Optimal'}
                             </span>
                          </div>
                          <div className="flex items-baseline gap-1 mb-2">
                             <span className="text-2xl font-black text-slate-900 tracking-tighter">{load.toFixed(1)}</span>
                             <span className="text-xs font-medium text-slate-400">/ {cap}h available</span>
                          </div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                             <div 
                               className={`h-full transition-all duration-500 ${isOverloaded ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                               style={{ width: `${pct}%` }}
                             />
                          </div>
                        </div>
                      );
                    })}
                  </div>
               </section>

               {/* Tasks List */}
               <section>
                  <div className="flex items-center gap-2 mb-4">
                    <ClipboardList size={16} className="text-indigo-600" />
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Scheduled Tasks ({tasks.filter(t => scheduledTasks[t.id]?.includes(getLocalDateString(selectedCalendarDate))).length})</h4>
                  </div>
                  <div className="space-y-3">
                    {tasks.filter(t => scheduledTasks[t.id]?.includes(getLocalDateString(selectedCalendarDate))).length > 0 ? (
                      tasks.filter(t => scheduledTasks[t.id]?.includes(getLocalDateString(selectedCalendarDate))).map(task => {
                        const isEditing = editingTaskId === task.id;
                        
                        return (
                          <div key={task.id} className={`bg-white border rounded-2xl p-4 transition-all ${isEditing ? 'border-indigo-400 ring-2 ring-indigo-50 shadow-lg' : 'border-slate-200 group hover:shadow-md'}`}>
                             <div className="flex items-start justify-between gap-4">
                               <div className="flex items-start gap-4">
                                  <div className={`p-3 rounded-xl border shrink-0 ${roleColors[getTechRole(task)] || 'bg-slate-50 border-slate-100'}`}>
                                     <Settings size={18} />
                                  </div>
                                  <div>
                                     <div className="flex items-center gap-2 mb-0.5">
                                        <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{task.component}</span>
                                        <span className="text-slate-300">•</span>
                                        {!isEditing && <span className="text-[10px] font-bold text-slate-400 uppercase">{task.interval}</span>}
                                        {isEditing && (
                                          <input 
                                            type="text" 
                                            value={editInterval} 
                                            onChange={(e) => setEditInterval(e.target.value)}
                                            placeholder="Interval (e.g. 3 months)"
                                            className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 focus:outline-none w-32"
                                            autoFocus
                                          />
                                        )}
                                     </div>
                                     <h5 className="text-sm font-black text-slate-800 leading-tight mb-2">{task.title}</h5>
                                  </div>
                               </div>
                               
                               <div className="text-right shrink-0">
                                   {!isEditing ? (
                                    <button 
                                      onClick={() => {
                                        setEditingTaskId(task.id);
                                        setEditInterval(task.interval);
                                        setEditDuration(task.duration);
                                        setEditPersonnel(task.personnelCount || 1);
                                      }}
                                      className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all mb-1"
                                      title="Edit Task Resources"
                                    >
                                      <Settings2 size={16} />
                                    </button>
                                  ) : (
                                    <div className="flex items-center gap-2 mb-1">
                                      <button 
                                        onClick={() => setEditingTaskId(null)}
                                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                      >
                                        <X size={16} />
                                      </button>
                                      <button 
                                        onClick={handleUpdateTask}
                                        className="p-1.5 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-all"
                                      >
                                        <CheckCircle2 size={16} />
                                      </button>
                                    </div>
                                  )}
                                  
                                  <div className="flex flex-col items-end gap-1">
                                    {!isEditing ? (
                                      <div className="flex flex-col items-end">
                                        <div className="flex items-center gap-1 text-slate-400">
                                          <Clock size={12} />
                                          <span className="text-[10px] font-black uppercase tracking-widest">{task.duration}</span>
                                        </div>
                                        <div className="flex items-center gap-1 text-slate-400">
                                          <Users size={12} />
                                          <span className="text-[10px] font-black uppercase tracking-widest">{task.personnelCount || 1} PAX</span>
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="flex flex-col items-end gap-2">
                                        <div className="flex items-center gap-1">
                                          <Clock size={12} className="text-indigo-400" />
                                          <input 
                                            type="text" 
                                            value={editDuration} 
                                            onChange={(e) => setEditDuration(e.target.value)}
                                            placeholder="Duration"
                                            className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 focus:outline-none w-24 text-right uppercase tracking-widest"
                                          />
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <Users size={12} className="text-indigo-400" />
                                          <input 
                                            type="number" 
                                            min="1"
                                            value={editPersonnel} 
                                            onChange={(e) => setEditPersonnel(parseInt(e.target.value) || 1)}
                                            className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 focus:outline-none w-16 text-right uppercase tracking-widest"
                                          />
                                          <span className="text-[10px] font-black text-slate-400 tracking-widest">PAX</span>
                                        </div>
                                      </div>
                                    )}
                                    <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[9px] font-black rounded border border-slate-200 uppercase tracking-widest mt-1">{task.type}</span>
                                  </div>
                               </div>
                             </div>
                             
                             {isEditing && (
                               <div className="mt-3 p-3 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                 <p className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2">PRO-TIP: Reducing frequency or hours helps balance overloaded days.</p>
                                 <div className="flex items-center gap-4">
                                    <div className="flex-1">
                                       <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Frequency (Adjust Load Distribution)</label>
                                       <div className="flex gap-1 flex-wrap">
                                          {['Monthly', 'Quarterly', 'Semi-Annually', 'Annually'].map(freq => (
                                            <button 
                                              key={freq}
                                              onClick={() => setEditInterval(freq)}
                                              className={`text-[8px] font-black px-2 py-1 rounded border transition-all ${editInterval === freq ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300'}`}
                                            >
                                              {freq}
                                            </button>
                                          ))}
                                       </div>
                                    </div>
                                 </div>
                               </div>
                             )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-12 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-center opacity-40">
                         <Clock size={48} className="text-slate-300 mb-4" />
                         <p className="text-sm font-black text-slate-800 uppercase tracking-widest">No tasks scheduled</p>
                         <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-tight">Resources are available for corrective actions</p>
                      </div>
                    )}
                  </div>
               </section>
            </div>
            <div className="p-8 bg-slate-50 border-t border-slate-100 shrink-0 flex justify-end">
               <button 
                 onClick={() => setSelectedCalendarDate(null)} 
                 className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-200"
               >
                 Close Report
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
