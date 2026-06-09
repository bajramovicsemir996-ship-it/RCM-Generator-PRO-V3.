import React, { useState } from 'react';
import { RCMItem, RBIAnalysis } from '../types';
import { generateRBIAnalysis } from '../services/geminiService';
import { 
  ShieldAlert, 
  Search, 
  Zap, 
  Loader2, 
  CheckCircle2, 
  AlertTriangle, 
  Info, 
  Activity, 
  ArrowRight,
  Sparkles,
  BarChart3,
  Calendar,
  Save,
  RotateCcw
} from 'lucide-react';

interface RBIDashboardProps {
  items: RCMItem[];
  onUpdate: (newData: RCMItem[]) => void;
  onUndo: () => void;
  canUndo: boolean;
  language?: string;
}

export const RBIDashboard: React.FC<RBIDashboardProps> = ({ items, onUpdate, onUndo, canUndo, language = 'English' }) => {
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [isBulkAnalyzing, setIsBulkAnalyzing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [localIntervals, setLocalIntervals] = useState<Record<string, string>>({});

  const calculateRiskCategory = (pof: number, cof: number): 'Low' | 'Medium' | 'Medium-High' | 'High' => {
    const score = pof * cof;
    if (score >= 15) return 'High';
    if (score >= 10) return 'Medium-High';
    if (score >= 5) return 'Medium';
    return 'Low';
  };

  const handleManualUpdate = (itemId: string, field: 'probabilityOfFailure' | 'consequenceOfFailure', value: number) => {
    const updatedItems = items.map(item => {
      if (item.id === itemId && item.rbiAnalysis) {
        const newAnalysis = { ...item.rbiAnalysis, [field]: value };
        newAnalysis.riskScore = newAnalysis.probabilityOfFailure * newAnalysis.consequenceOfFailure;
        newAnalysis.riskCategory = calculateRiskCategory(newAnalysis.probabilityOfFailure, newAnalysis.consequenceOfFailure);
        return { ...item, rbiAnalysis: newAnalysis };
      }
      return item;
    });
    onUpdate(updatedItems);
  };

  const handleSyncToStudy = (item: RCMItem) => {
    if (!item.rbiAnalysis) return;
    
    const interval = localIntervals[item.id] || item.rbiAnalysis.recommendedInspectionInterval;
    const task = item.rbiAnalysis.recommendedInspectionType || item.maintenanceTask;

    const updatedItems = items.map(i => {
      if (i.id === item.id) {
        return {
          ...i,
          interval: interval,
          maintenanceTask: task, // Optional: Usually RBI suggests a specific type of inspection
          rbiAnalysis: {
            ...i.rbiAnalysis!,
            recommendedInspectionInterval: interval
          }
        };
      }
      return i;
    });
    
    onUpdate(updatedItems);
    
    // Clear local state for this item
    const nextIntervals = { ...localIntervals };
    delete nextIntervals[item.id];
    setLocalIntervals(nextIntervals);
  };

  const handleRunRBI = async (item: RCMItem) => {
    setAnalyzingId(item.id);
    try {
      const analysis = await generateRBIAnalysis(item, language);
      const updatedItems = items.map(i => 
        i.id === item.id ? { ...i, rbiAnalysis: analysis } : i
      );
      onUpdate(updatedItems);
      return analysis;
    } catch (error) {
      console.error("RBI Analysis failed", error);
      return null;
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleRunAllRBI = async () => {
    const pendingItems = filteredItems.filter(i => !i.rbiAnalysis);
    if (pendingItems.length === 0) return;

    setIsBulkAnalyzing(true);
    
    // We update items one by one to show progress
    let currentResults = [...items];
    
    for (const item of pendingItems) {
      setAnalyzingId(item.id);
      try {
        const analysis = await generateRBIAnalysis(item, language);
        currentResults = currentResults.map(i => 
          i.id === item.id ? { ...i, rbiAnalysis: analysis } : i
        );
        // We sync to the parent on every successful analysis
        onUpdate([...currentResults]);
      } catch (err) {
        console.error(`Bulk RBI failed for ${item.id}`, err);
      }
    }
    
    setAnalyzingId(null);
    setIsBulkAnalyzing(false);
  };

  const filteredItems = items.filter(item => {
    const isSearchMatch = item.component.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.failureMode.toLowerCase().includes(searchTerm.toLowerCase());
    
    // Filter out non-periodic tasks (One-time, As Required, On Failure, etc.)
    const intervalStr = (item.interval || '').toLowerCase();
    const isNonPeriodic = 
      intervalStr === '' ||
      intervalStr.includes('one-time') || 
      intervalStr.includes('one time') || 
      intervalStr.includes('as required') || 
      intervalStr.includes('on failure') || 
      intervalStr.includes('run to failure') || 
      intervalStr.includes('ad-hoc') || 
      intervalStr.includes('as needed');
      
    return isSearchMatch && !isNonPeriodic;
  });

  const getRiskColor = (category?: string) => {
    switch (category) {
      case 'High': return 'text-rose-600 bg-rose-50 border-rose-100';
      case 'Medium-High': return 'text-orange-600 bg-orange-50 border-orange-100';
      case 'Medium': return 'text-amber-600 bg-amber-50 border-amber-100';
      case 'Low': return 'text-emerald-600 bg-emerald-50 border-emerald-100';
      default: return 'text-slate-400 bg-slate-50 border-slate-100';
    }
  };

  const getRiskBadgeColor = (category?: string) => {
    switch (category) {
      case 'High': return 'bg-rose-500';
      case 'Medium-High': return 'bg-orange-500';
      case 'Medium': return 'bg-amber-500';
      case 'Low': return 'bg-emerald-500';
      default: return 'bg-slate-400';
    }
  };

  return (
    <div className="flex flex-col gap-8 w-full animate-in fade-in duration-500 pb-20 px-2 sm:px-6">
      <div className="w-full flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 border-b border-slate-200 pb-8 mt-4">
        <div className="max-w-2xl text-left">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-slate-900 rounded-2xl text-rose-400 shadow-xl shadow-rose-100/20">
              <ShieldAlert size={28} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                Risk Based <span className="text-rose-600">Inspection</span>
              </h2>
              <p className="text-slate-500 font-medium">PoF & CoF validation with AI-driven inspection intervals</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 w-full xl:w-auto">
          {canUndo && (
            <button 
              onClick={onUndo}
              className="flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl font-black uppercase tracking-wider text-xs transition-all shadow-lg active:scale-95 bg-white text-slate-600 border-2 border-slate-200"
            >
              <RotateCcw size={18} />
              Undo
            </button>
          )}
          <button 
            onClick={() => setShowGuide(!showGuide)}
            className={`flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl font-black uppercase tracking-wider text-xs transition-all shadow-lg active:scale-95 ${showGuide ? 'bg-rose-600 text-white' : 'bg-white text-rose-600 border-2 border-rose-600'}`}
          >
            <Info size={18} />
            Risk Criteria Guide
          </button>
          
          {filteredItems.some(i => !i.rbiAnalysis) && (
            <button 
              onClick={handleRunAllRBI}
              disabled={isBulkAnalyzing}
              className="flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl font-black uppercase tracking-wider text-xs transition-all shadow-lg active:scale-95 bg-slate-900 text-white hover:bg-rose-600 disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              {isBulkAnalyzing ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Zap size={18} className="fill-white border-none" />
              )}
              {isBulkAnalyzing ? 'Bulk Analyzing...' : 'Bulk AI Analysis'}
            </button>
          )}

          <div className="relative w-full md:w-80">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400">
              <Search size={18} />
            </div>
            <input 
              type="text" 
              placeholder="Search components..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border-2 border-slate-100 rounded-2xl py-3 pl-12 pr-4 text-slate-900 font-bold focus:border-rose-500 outline-none transition-all shadow-sm"
            />
          </div>
        </div>
      </div>

      {showGuide && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in slide-in-from-top-4 duration-500">
          <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
              <BarChart3 size={16} className="text-rose-500" />
              Probability of Failure (PoF) Guide
            </h4>
            <div className="space-y-3">
              {[
                { s: 5, t: 'Very High', d: 'Failure almost certain (multiple times per year)' },
                { s: 4, t: 'High', d: 'Likely to occur (once per year)' },
                { s: 3, t: 'Medium', d: 'Historical occurrences (once every 2-3 years)' },
                { s: 2, t: 'Low', d: 'Unlikely but possible (once in 5+ years)' },
                { s: 1, t: 'Very Low', d: 'Rare or never recorded in industry' },
              ].map(row => (
                <div key={row.s} className="flex gap-4 text-[11px]">
                  <span className="w-4 font-black text-rose-600">{row.s}</span>
                  <span className="w-20 font-black text-slate-700 uppercase">{row.t}</span>
                  <span className="flex-1 text-slate-500 font-medium">{row.d}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-500" />
              Consequence of Failure (CoF) Guide
            </h4>
            <div className="space-y-3">
              {[
                { s: 5, t: 'Catastrophic', d: 'Massive safety/env impact or total plant shutdown' },
                { s: 4, t: 'Major', d: 'Significant environmental impact or severe production loss' },
                { s: 3, t: 'Moderate', d: 'Local environmental impact or partial area shutdown' },
                { s: 2, t: 'Minor', d: 'Minor impact on production or short-term disturbance' },
                { s: 1, t: 'Insignificant', d: 'No impact on safety/env/production' },
              ].map(row => (
                <div key={row.s} className="flex gap-4 text-[11px]">
                  <span className="w-4 font-black text-rose-600">{row.s}</span>
                  <span className="w-20 font-black text-slate-700 uppercase">{row.t}</span>
                  <span className="flex-1 text-slate-500 font-medium">{row.d}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white border-2 border-dashed border-slate-200 rounded-[2.5rem] opacity-50">
            <Search size={48} className="text-slate-300 mb-4" />
            <p className="text-lg font-black text-slate-400 uppercase tracking-widest">No matching tasks found</p>
          </div>
        ) : (
          filteredItems.map((item) => (
            <div key={item.id} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden hover:shadow-xl transition-all duration-500 group">
              <div className="p-6 sm:p-8 flex flex-col lg:flex-row gap-8">
                {/* Left side: Component Info */}
                <div className="flex-1 space-y-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                          {item.componentType}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                          item.criticality === 'High' ? 'bg-rose-100 text-rose-600' : 
                          item.criticality === 'Medium' ? 'bg-amber-100 text-amber-600' : 
                          'bg-emerald-100 text-emerald-600'
                        }`}>
                          {item.criticality} Criticality
                        </span>
                      </div>
                      <h3 className="text-xl font-black text-slate-900 tracking-tight leading-tight mb-2">
                        {item.component}
                      </h3>
                      <p className="text-slate-500 text-sm font-medium leading-relaxed">
                        <span className="text-slate-900 font-bold">Failure Mode:</span> {item.failureMode}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-50">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">RCM Task</span>
                      <span className="text-xs font-bold text-slate-700">{item.maintenanceTask}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Interval</span>
                      <span className="text-xs font-bold text-slate-700">{item.interval}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">ISO 14224</span>
                      <span className="text-xs font-bold text-slate-700">{item.iso14224Code}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">RPN Score</span>
                      <span className="text-xs font-black text-indigo-600">{item.rpn}</span>
                    </div>
                  </div>
                </div>

                {/* Right side: RBI Analysis Result */}
                <div className={`lg:w-96 rounded-2xl border p-6 transition-all duration-500 flex flex-col justify-center ${item.rbiAnalysis ? getRiskColor(item.rbiAnalysis.riskCategory) : 'bg-slate-50 border-slate-100'}`}>
                  {item.rbiAnalysis ? (
                    <div className="space-y-4 animate-in zoom-in-95 duration-500">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Activity size={18} />
                          <span className="text-[10px] font-black uppercase tracking-[0.2em]">Risk Profile</span>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white ${getRiskBadgeColor(item.rbiAnalysis.riskCategory)}`}>
                          {item.rbiAnalysis.riskCategory}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 py-4 border-y border-black/5">
                        <div className="text-center group/pof">
                          <div className="flex items-center justify-center gap-2">
                             <input 
                               type="number" 
                               min="1" max="5" 
                               value={item.rbiAnalysis.probabilityOfFailure} 
                               onChange={(e) => handleManualUpdate(item.id, 'probabilityOfFailure', parseInt(e.target.value) || 1)}
                               className="w-12 text-2xl font-black bg-transparent border-none p-0 text-center focus:ring-0 cursor-pointer hover:bg-black/5 rounded"
                             />
                             <span className="text-sm opacity-40">/ 5</span>
                          </div>
                          <div className="text-[8px] font-black uppercase tracking-widest opacity-60">PoF (Prob)</div>
                        </div>
                        <div className="text-center border-l border-black/5 group/cof">
                          <div className="flex items-center justify-center gap-2">
                             <input 
                               type="number" 
                               min="1" max="5" 
                               value={item.rbiAnalysis.consequenceOfFailure} 
                               onChange={(e) => handleManualUpdate(item.id, 'consequenceOfFailure', parseInt(e.target.value) || 1)}
                               className="w-12 text-2xl font-black bg-transparent border-none p-0 text-center focus:ring-0 cursor-pointer hover:bg-black/5 rounded"
                             />
                             <span className="text-sm opacity-40">/ 5</span>
                          </div>
                          <div className="text-[8px] font-black uppercase tracking-widest opacity-60">CoF (Cons)</div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
                          <div className="text-[11px] font-bold leading-tight">
                            <span className="opacity-60">Inspection:</span> {item.rbiAnalysis.recommendedInspectionType}
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <Calendar size={14} className="mt-0.5 shrink-0" />
                          <div className="text-[11px] font-bold leading-tight flex-1">
                            <span className="opacity-60 block mb-1">Recommended Interval:</span> 
                            <div className="flex items-center gap-2">
                              <input 
                                type="text" 
                                value={localIntervals[item.id] !== undefined ? localIntervals[item.id] : item.rbiAnalysis.recommendedInspectionInterval} 
                                onChange={(e) => setLocalIntervals({ ...localIntervals, [item.id]: e.target.value })}
                                className="flex-1 bg-white border border-black/10 rounded px-2 py-1 text-[11px] font-bold text-black focus:ring-1 focus:ring-black outline-none"
                              />
                              {(localIntervals[item.id] !== undefined || (item.interval !== item.rbiAnalysis.recommendedInspectionInterval)) && (
                                <button 
                                  onClick={() => handleSyncToStudy(item)}
                                  className="p-1 px-2 bg-black text-white rounded text-[8px] font-black uppercase tracking-widest hover:bg-zinc-800 transition-all flex items-center gap-1"
                                  title="Push to Study"
                                >
                                  <Save size={10} /> Sync
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <button 
                        onClick={() => {
                          // Reset local interval if user wants to re-evaluate from scratch
                          const nextIntervals = { ...localIntervals };
                          delete nextIntervals[item.id];
                          setLocalIntervals(nextIntervals);
                          handleRunRBI(item);
                        }}
                        disabled={analyzingId === item.id}
                        className="w-full mt-4 flex items-center justify-center gap-2 py-3 rounded-xl bg-black/5 hover:bg-black/10 transition-all text-[10px] font-black uppercase tracking-widest"
                      >
                        {analyzingId === item.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        Re-evaluate
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center py-6">
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm">
                        <Zap size={20} className="text-rose-500 border-none fill-rose-500" />
                      </div>
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-2">RBI Incomplete</h4>
                      <p className="text-[10px] text-slate-500 font-bold leading-relaxed mb-6 px-4">
                        Perform a Risk-Based Inspection analysis to determine PoF/CoF and optimize inspection frequencies.
                      </p>
                      <button 
                        onClick={() => handleRunRBI(item)}
                        disabled={analyzingId === item.id}
                        className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 transition-all shadow-lg active:scale-95"
                      >
                        {analyzingId === item.id ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                        {analyzingId === item.id ? "Analyzing..." : "Initiate AI Analysis"}
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Justification Footer */}
              {item.rbiAnalysis && (
                <div className="bg-slate-50 border-t border-slate-100 p-6 flex items-start gap-4 animate-in slide-in-from-top-2 duration-500">
                  <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-slate-400 shrink-0">
                    <Info size={16} />
                  </div>
                  <div className="flex-1">
                    <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">AI Risk Justification & Damage Mechanisms</div>
                    <p className="text-xs text-slate-600 font-medium leading-relaxed">
                      {item.rbiAnalysis.aiJustification}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {item.rbiAnalysis.damageMechanisms.map((dm, i) => (
                        <span key={i} className="px-2 py-0.5 bg-white border border-slate-200 rounded text-[9px] font-black text-slate-500 uppercase tracking-tighter">
                          {dm}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Summary Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-slate-900 rounded-[2rem] p-8 text-white flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 opacity-10 text-white group-hover:scale-110 transition-transform duration-500">
            <BarChart3 size={120} />
          </div>
          <div>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-6">Risk Distribution</div>
            <div className="space-y-3">
              {[
                { label: 'High', count: filteredItems.filter(i => i.rbiAnalysis?.riskCategory === 'High').length, color: 'bg-rose-500' },
                { label: 'Med-High', count: filteredItems.filter(i => i.rbiAnalysis?.riskCategory === 'Medium-High').length, color: 'bg-orange-500' },
                { label: 'Medium', count: filteredItems.filter(i => i.rbiAnalysis?.riskCategory === 'Medium').length, color: 'bg-amber-500' },
                { label: 'Low', count: filteredItems.filter(i => i.rbiAnalysis?.riskCategory === 'Low').length, color: 'bg-emerald-500' },
              ].map((row, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${row.color}`}></div>
                  <span className="text-[10px] font-bold text-slate-300 w-16">{row.label}</span>
                  <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${row.color}`} style={{ width: `${(row.count / (filteredItems.length || 1)) * 100}%` }}></div>
                   </div>
                  <span className="text-[10px] font-black w-4 text-right">{row.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-[2rem] p-8 border border-slate-200 flex flex-col justify-between">
           <div>
             <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-4">Inspection Backlog</div>
             <div className="text-4xl font-black text-slate-900 tracking-tight">
               {filteredItems.filter(i => !i.rbiAnalysis).length}
             </div>
             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2 leading-tight">Items awaiting risk validation</p>
           </div>
           <div className="text-[10px] font-black text-rose-600 bg-rose-50 px-4 py-2 rounded-xl mt-4">
             AI Assessment Required
           </div>
        </div>

        <div className="md:col-span-2 bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[2rem] p-8 text-white relative overflow-hidden group">
          <div className="absolute right-0 top-0 p-8 opacity-10 group-hover:rotate-12 transition-transform duration-500">
             <AlertTriangle size={80} />
          </div>
          <div className="relative z-10 h-full flex flex-col justify-between">
             <div>
               <h3 className="text-xl font-black tracking-tight mb-2 uppercase">Risk Based Maintenance Pivot</h3>
               <p className="text-indigo-100/80 text-sm font-medium leading-relaxed max-w-md">
                 RBI allows you to focus technical resources where failures are most likely and consequences are most severe. Use AI to bridge the gap between RCM theory and inspection reality.
               </p>
             </div>
             <div className="flex flex-wrap gap-4 mt-6">
               <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl">
                 <Search size={16} className="text-indigo-300" />
                 <span className="text-[10px] font-black uppercase">Identify DM</span>
               </div>
               <ArrowRight size={16} className="text-white/40" />
               <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl">
                 <ShieldAlert size={16} className="text-indigo-300" />
                 <span className="text-[10px] font-black uppercase">Assess Risk</span>
               </div>
               <ArrowRight size={16} className="text-white/40" />
               <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-xl">
                 <Activity size={16} className="text-indigo-300" />
                 <span className="text-[10px] font-black uppercase">Optimize Plan</span>
               </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
