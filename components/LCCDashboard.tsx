import React, { useState, useMemo, useEffect } from 'react';
import { RCMItem } from '../types';
import { RotateCcw, DollarSign, TrendingDown, Bell, TrendingUp, Settings2, Download, Table2, ChevronDown, ChevronUp, AlertCircle, Wrench, Package, Info, Users, Plus, Trash2, Clock, Calculator } from 'lucide-react';
import * as XLSX from 'xlsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';

interface LCCDashboardProps {
  items: RCMItem[];
  onUpdate: (newData: RCMItem[]) => void;
  onUndo: () => void;
  canUndo: boolean;
}

interface ItemPart {
  id: string;
  name: string;
  cost: number;
}

interface ItemCostSettings {
  pmHours: number;
  pmFreqPerYear: number;
  pmPeople: number;
  pmParts: ItemPart[];
  correctiveHours: number;
  rtfPeople: number;
  rtfParts: ItemPart[];
  failsPerYearWithoutPM: number;
}

const parseFreq = (interval: string | undefined): number => {
  if (!interval) return 4;
  const str = interval.toLowerCase();
  
  if (str.includes('daily')) return 365;
  if (str.includes('weekly')) return 52;
  if (str.includes('monthly')) return 12;
  if (str.includes('quarterly')) return 4;
  if (str.includes('yearly') || str.includes('annually')) return 1;

  const numMatch = str.match(/(\d+(\.\d+)?)/);
  if (!numMatch) return 4;
  
  const num = parseFloat(numMatch[0]);
  if (num === 0) return 4;

  if (str.includes('month')) return 12 / num;
  if (str.includes('week')) return 52 / num;
  if (str.includes('year')) return 1 / num;
  if (str.includes('day')) return 365 / num;
  
  return num || 4;
};

const parseHours = (timeStr: string | undefined): number => {
  if (!timeStr) return 2;
  const str = timeStr.toLowerCase();
  const match = str.match(/(\d+(\.\d+)?)/);
  if (!match) return 2;
  
  const val = parseFloat(match[0]);
  if (str.includes('min')) return val / 60;
  if (str.includes('day')) return val * 8;
  
  return val;
};

const getDefaults = (item: RCMItem): { correctiveHours: number, failsPerYearWithoutPM: number, rtfPeople: number } => {
  if (item.criticality === 'High') return { correctiveHours: 12, failsPerYearWithoutPM: 4, rtfPeople: item.rtfPersonnelCount || 2 };
  if (item.criticality === 'Medium') return { correctiveHours: 6, failsPerYearWithoutPM: 2, rtfPeople: item.rtfPersonnelCount || 1 };
  return { correctiveHours: 2, failsPerYearWithoutPM: 1, rtfPeople: item.rtfPersonnelCount || 1 };
};

export const LCCDashboard: React.FC<LCCDashboardProps> = ({ items, onUpdate, onUndo, canUndo }) => {
  const [downtimeCost, setDowntimeCost] = useState(10000); // $/hr
  const [laborRate, setLaborRate] = useState(50); // $/hr
  const [annualHours, setAnnualHours] = useState(8760); // 24/7/365

  const [localOverrides, setLocalOverrides] = useState<Record<string, Partial<ItemCostSettings>>>({});
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const getItemSettings = (item: RCMItem): ItemCostSettings => {
    const defaults = getDefaults(item);
    const override = localOverrides[item.id] || {};
    
    return {
      pmHours: override.pmHours ?? parseHours(item.inspectionSheet?.estimatedTime),
      pmFreqPerYear: override.pmFreqPerYear ?? parseFreq(item.interval),
      pmPeople: override.pmPeople ?? item.pmPersonnelCount ?? 1,
      pmParts: (override.pmParts ?? item.pmParts ?? [{ id: '1', name: 'Misc Consumables', cost: 100 }]) as ItemPart[],
      correctiveHours: override.correctiveHours ?? defaults.correctiveHours,
      rtfPeople: override.rtfPeople ?? item.rtfPersonnelCount ?? defaults.rtfPeople,
      rtfParts: (override.rtfParts ?? item.rtfParts ?? [{ id: '1', name: 'Major Spare Parts', cost: 2000 }]) as ItemPart[],
      failsPerYearWithoutPM: override.failsPerYearWithoutPM ?? defaults.failsPerYearWithoutPM
    };
  };

  const handleSyncToStudy = (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const settings = getItemSettings(item);
    
    const updatedItem: RCMItem = {
      ...item,
      pmPersonnelCount: settings.pmPeople,
      rtfPersonnelCount: settings.rtfPeople,
      pmParts: settings.pmParts,
      rtfParts: settings.rtfParts,
      annualRunningHours: annualHours
      // Note: We don't overwrite interval/estimatedTime because they are textual strings in the study
    };

    onUpdate(items.map(i => i.id === id ? updatedItem : i));
    
    // Clear local override for this item as it's now in the study
    const nextOverrides = { ...localOverrides };
    delete nextOverrides[id];
    setLocalOverrides(nextOverrides);
  };

  const calculateItemCosts = (item: RCMItem) => {
    const set = getItemSettings(item);
    const pmPartsSum = set.pmParts.reduce((acc, p) => acc + p.cost, 0);
    const rtfPartsSum = set.rtfParts.reduce((acc, p) => acc + p.cost, 0);
    
    const runningRatio = annualHours / 8760; // Ratio based on standard year
    const adjustedFails = set.failsPerYearWithoutPM * runningRatio;

    const pm = (set.pmHours * laborRate * set.pmPeople * set.pmFreqPerYear) + (pmPartsSum * set.pmFreqPerYear) + (set.pmHours * downtimeCost * set.pmFreqPerYear * 0.1); 
    const corr = (set.correctiveHours * laborRate * set.rtfPeople * adjustedFails) + (rtfPartsSum * adjustedFails) + (set.correctiveHours * downtimeCost * adjustedFails);
    return { pm, corr, save: corr - pm };
  };

  const stats = useMemo(() => {
    let totalPMCost = 0;
    let totalCorrectiveCost = 0;

    items.forEach(item => {
      const costs = calculateItemCosts(item);
      totalPMCost += costs.pm;
      totalCorrectiveCost += costs.corr;
    });

    const netAvoidance = totalCorrectiveCost - totalPMCost;
    const roi = totalPMCost > 0 ? (netAvoidance / totalPMCost) * 100 : 0;

    return { totalPMCost, totalCorrectiveCost, netAvoidance, roi };
  }, [items, localOverrides, downtimeCost, laborRate]);

  const chartData = useMemo(() => {
    return items.map(item => {
      const costs = calculateItemCosts(item);
      const shortName = item.component.length > 15 ? item.component.substring(0, 15) + '...' : item.component;

      return {
        name: shortName,
        fullName: item.component,
        Preventive: Number(costs.pm.toFixed(0)),
        RunToFailure: Number(costs.corr.toFixed(0)),
      }
    });
  }, [items, localOverrides, downtimeCost, laborRate]);

  const updateSetting = (id: string, field: keyof ItemCostSettings, value: any) => {
    setLocalOverrides(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));
  };

  const addPart = (id: string, type: 'pm' | 'rtf') => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const set = getItemSettings(item);
    const field = type === 'pm' ? 'pmParts' : 'rtfParts';
    const currentParts = set[field];
    const newPart: ItemPart = {
      id: Math.random().toString(36).substr(2, 9),
      name: 'New Part',
      cost: 0
    };
    updateSetting(id, field, [...currentParts, newPart]);
  };

  const removePart = (id: string, type: 'pm' | 'rtf', partId: string) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const set = getItemSettings(item);
    const field = type === 'pm' ? 'pmParts' : 'rtfParts';
    const currentParts = set[field];
    updateSetting(id, field, currentParts.filter(p => p.id !== partId));
  };

  const updatePart = (id: string, type: 'pm' | 'rtf', partId: string, updates: Partial<ItemPart>) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const set = getItemSettings(item);
    const field = type === 'pm' ? 'pmParts' : 'rtfParts';
    const currentParts = set[field];
    updateSetting(id, field, currentParts.map(p => p.id === partId ? { ...p, ...updates } : p));
  };

  const handleExport = () => {
    const data = items.map(item => {
      const costs = calculateItemCosts(item);
      const set = getItemSettings(item);
      
      return {
        Component: item.component,
        MaintenanceTask: item.maintenanceTask,
        Criticality: item.criticality,
        TaskType: item.taskType,
        Interval: item.interval,
        PMCostPerYear: costs.pm,
        UnplannedCostPerYear: costs.corr,
        EstimatedSavings: costs.save
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "LCC_Analysis");
    XLSX.writeFile(wb, "RCM_LCC_Analysis.xlsx");
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="flex flex-col gap-8 w-full animate-in fade-in duration-500 pb-20 px-2 sm:px-6">
      <div className="w-full flex flex-col xl:flex-row items-start xl:items-center justify-between gap-6 border-b border-slate-200 pb-8 mt-4">
        <div className="max-w-2xl text-left">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-3 bg-slate-900 rounded-2xl text-emerald-400 shadow-xl shadow-emerald-100/20">
              <Calculator size={28} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                Life Cycle Cost <span className="text-emerald-600">Intelligence</span>
              </h2>
              <p className="text-slate-500 font-medium">Financial modeling and RCM strategy ROI validator</p>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 w-full xl:w-auto">
          {canUndo && (
            <button 
              onClick={onUndo}
              className="flex items-center justify-center gap-3 bg-white text-slate-600 border-2 border-slate-200 px-6 py-3.5 rounded-2xl font-black uppercase tracking-wider text-xs hover:bg-slate-50 transition-all shadow-md active:scale-95"
            >
              <RotateCcw size={18} />
              Undo
            </button>
          )}
          <button 
            onClick={handleExport}
            className="flex items-center justify-center gap-3 bg-slate-900 text-white border-2 border-slate-900 px-8 py-3.5 rounded-2xl font-black uppercase tracking-wider text-xs hover:bg-slate-800 transition-all shadow-xl active:scale-95"
          >
            <Download size={18} />
            Export Full Dataset
          </button>
        </div>
      </div>

      {/* Global Config & Logic Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Global Modifiers */}
        <div className="bg-white p-8 rounded-[2.5rem] border-2 border-slate-900 shadow-xl flex flex-col justify-between">
           <div>
             <h3 className="text-xs font-black text-slate-900 mb-6 flex items-center gap-3 uppercase tracking-widest">
               <Settings2 size={20} className="text-indigo-600" />
               Global Parameters
             </h3>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
               <div>
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Production Loss Rate</label>
                 <div className="relative group">
                    <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500" />
                    <input 
                      type="number" 
                      value={downtimeCost} 
                      onChange={e => setDowntimeCost(Number(e.target.value))} 
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 pl-9 pr-3 text-slate-900 font-black text-lg focus:border-indigo-500 outline-none transition-all"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-bold">/ HR</span>
                 </div>
               </div>
               <div>
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Technical Labor Rate</label>
                 <div className="relative group">
                    <DollarSign size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500" />
                    <input 
                      type="number" 
                      value={laborRate} 
                      onChange={e => setLaborRate(Number(e.target.value))} 
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 pl-9 pr-3 text-slate-900 font-black text-lg focus:border-indigo-500 outline-none transition-all"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-[10px] font-bold">/ HR</span>
                 </div>
               </div>
               <div className="sm:col-span-2">
                 <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 font-black">Annual Operating Hours</label>
                 <div className="relative group">
                    <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-500" />
                    <input 
                      type="number" 
                      max="8760"
                      value={annualHours} 
                      onChange={e => setAnnualHours(Number(e.target.value))} 
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-3 pl-9 pr-3 text-slate-900 font-black text-lg focus:border-indigo-500 outline-none transition-all"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <span className="text-slate-400 text-[10px] font-bold">Hrs / Yr</span>
                      <div className="bg-indigo-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md">
                        {(annualHours/8760*100).toFixed(0)}% Utilization
                      </div>
                    </div>
                 </div>
               </div>
             </div>
           </div>
        </div>

        {/* Calculation Logic Display */}
        <div className="lg:col-span-2 bg-slate-900 rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden group">
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none group-hover:bg-indigo-500/20 transition-all duration-700"></div>
          
          <h3 className="text-sm font-black text-white mb-8 flex items-center gap-3 uppercase tracking-widest text-indigo-400">
            <Info size={20} />
            Calculation Methodology
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="space-y-3">
                <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] flex items-center gap-2">
                  <div className="w-1 h-3 bg-emerald-500 rounded-full"></div>
                  Preventive Maintenance (PM)
                </h4>
                <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700 shadow-inner group-hover:border-emerald-500/30 transition-all">
                  <code className="text-[11px] font-mono leading-relaxed block text-emerald-300">
                    <span className="text-slate-500">// Annualized PM Cost</span><br/>
                    Cost = [(Labor × People × Freq) + (Parts × Freq) + (Time × ProductionLoss × 10%)]
                  </code>
                </div>
                <p className="text-[9px] text-slate-500 font-medium">10% loss factor represents standard strategy disruption/setup overhead.</p>
             </div>

             <div className="space-y-3">
                <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-[0.2em] flex items-center gap-2">
                  <div className="w-1 h-3 bg-rose-500 rounded-full"></div>
                  Run-To-Failure (RTF)
                </h4>
                <div className="bg-slate-800/80 p-5 rounded-2xl border border-slate-700 shadow-inner group-hover:border-rose-500/30 transition-all">
                  <code className="text-[11px] font-mono leading-relaxed block text-rose-300">
                    <span className="text-slate-500">// Unplanned Breakdown Cost</span><br/>
                    Cost = [(Labor × Repair Time × RTF People × AdjustedFails) + (Parts × AdjustedFails) + (Time × ProductionLoss × AdjustedFails)]
                  </code>
                </div>
                <p className="text-[9px] text-slate-500 font-medium">Failures are automatically adjusted based on asset utilization ratio.</p>
             </div>
          </div>
        </div>
      </div>

      {/* Metrics Bento Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all duration-500">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <TrendingUp size={64} />
          </div>
          <div className="text-slate-400 font-black tracking-[0.2em] uppercase text-[10px] mb-4 flex items-center gap-2">
            <div className="w-1 h-4 bg-rose-500 rounded-full"></div>
            Unplanned Corrective Cost
          </div>
          <div className="text-4xl font-black text-slate-900 tracking-tight">{formatCurrency(stats.totalCorrectiveCost)}</div>
          <p className="text-slate-400 text-[10px] mt-2 font-bold uppercase tracking-widest">Base Annual Run-to-Failure</p>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-xl transition-all duration-500">
          <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
            <Calculator size={64} />
          </div>
          <div className="text-slate-400 font-black tracking-[0.2em] uppercase text-[10px] mb-4 flex items-center gap-2">
            <div className="w-1 h-4 bg-indigo-500 rounded-full"></div>
            Predictive Investment
          </div>
          <div className="text-4xl font-black text-slate-900 tracking-tight">{formatCurrency(stats.totalPMCost)}</div>
          <p className="text-slate-400 text-[10px] mt-2 font-bold uppercase tracking-widest">Targeted Strategy Expenses</p>
        </div>

        <div className={`p-6 rounded-[2rem] border shadow-sm relative overflow-hidden group hover:shadow-xl transition-all duration-500 ${stats.netAvoidance >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
          <div className={`absolute top-0 right-0 p-6 opacity-10 ${stats.netAvoidance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
             <TrendingDown size={64} />
          </div>
          <div className={`${stats.netAvoidance >= 0 ? 'text-emerald-600' : 'text-rose-600'} font-black tracking-[0.2em] uppercase text-[10px] mb-4 flex items-center gap-2`}>
            <div className={`w-1 h-4 rounded-full ${stats.netAvoidance >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
            Strategic Net Avoidance
          </div>
          <div className={`text-4xl font-black tracking-tight ${stats.netAvoidance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(stats.netAvoidance)}</div>
          <p className={`text-[10px] mt-2 font-black uppercase tracking-widest ${stats.netAvoidance >= 0 ? 'text-emerald-600/70' : 'text-rose-600/70'}`}>Annual Resource Savings</p>
        </div>

        <div className="bg-indigo-600 p-6 rounded-[2rem] shadow-2xl shadow-indigo-200 relative overflow-hidden group hover:bg-indigo-700 transition-all duration-500 ring-4 ring-indigo-50">
           <div className="absolute top-0 right-0 p-6 opacity-10 text-white">
             <DollarSign size={64} />
          </div>
          <div className="text-indigo-200 font-black tracking-[0.2em] uppercase text-[10px] mb-4 flex items-center gap-2">
            <div className="w-1 h-4 bg-white rounded-full"></div>
            Maintenance ROI (RCM)
          </div>
          <div className="text-4xl font-black text-white tracking-tight">{stats.roi.toFixed(1)}%</div>
          <p className="text-indigo-100/70 text-[10px] mt-2 font-black uppercase tracking-widest">Return on Maintenance Invested</p>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 gap-8">
        {/* Cost Comparison Chart */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 flex flex-col h-[500px]">
           <div className="flex items-center justify-between mb-8">
             <div>
               <h3 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2 uppercase">
                 <BarChart size={20} className="text-indigo-500" />
                 Strategy Comparison Matrix
               </h3>
               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Preventive Intensity vs. Failure Impact</p>
             </div>
             <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Preventive Cost</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Breakdown Cost</span>
                </div>
             </div>
           </div>
           <div className="flex-1 w-full min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94A3B8', fontWeight: 800 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94A3B8', fontWeight: 800 }} tickFormatter={(val) => `$${val/1000}k`} />
                  <RechartsTooltip 
                    cursor={{ fill: '#F8FAFC' }}
                    contentStyle={{ borderRadius: '1.5rem', border: 'none', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)', padding: '1.25rem' }}
                    formatter={(value: number) => formatCurrency(value)}
                    labelStyle={{ fontWeight: 900, fontSize: '12px', textTransform: 'uppercase', color: '#0F172A', marginBottom: '8px', letterSpacing: '0.05em' }}
                  />
                  <Bar dataKey="RunToFailure" name="Run-To-Failure Cost" fill="#EF4444" radius={[6, 6, 0, 0]} maxBarSize={50} />
                  <Bar dataKey="Preventive" name="Preventive Cost" fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
           </div>
        </div>

        </div>

        {/* Component Details Interactive Accordion */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
           <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
             <Table2 className="text-slate-400" size={18} />
             Component Setup & Tuning
           </h3>
           <span className="text-xs font-bold text-slate-500 bg-slate-200/50 px-2.5 py-1 rounded-md">{items.length} items</span>
        </div>
        
        <div className="divide-y divide-slate-100">
          {items.length === 0 ? (
            <div className="p-12 text-center text-slate-500">No RCM items available yet.</div>
          ) : items.map(item => {
            const set = getItemSettings(item);
            const costs = calculateItemCosts(item);
            const isExpanded = expandedItemId === item.id;

            return (
              <div key={item.id} className="transition-all hover:bg-slate-50 duration-200">
                {/* Header / Summary Row */}
                <div 
                  className="px-6 py-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 cursor-pointer"
                  onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                >
                  <div className="flex-1">
                    <h4 className={`font-bold text-lg flex items-center gap-2 transition-colors ${isExpanded ? 'text-indigo-600' : 'text-slate-800'}`}>
                      {item.component} 
                      {item.criticality === 'High' && <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-black">High Criticality</span>}
                    </h4>
                    <p className="text-sm text-slate-500 mt-1 line-clamp-1">
                      <span className="font-medium text-slate-700">Maintenance Task:</span> {item.maintenanceTask} 
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                       <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md border ${item.componentType === 'Electrical' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                         {item.componentType}
                       </span>
                       {item.responsibleGroup && (
                         <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">
                           {item.responsibleGroup}
                         </span>
                       )}
                       {item.inspectionSheet?.responsibility && (
                         <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 flex items-center gap-1">
                           <Users size={10} /> {item.inspectionSheet.responsibility}
                         </span>
                       )}
                       <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                         Interval: {item.interval}
                       </span>
                    </div>
                  </div>
                  
                      <div className="flex flex-wrap md:flex-nowrap items-center gap-6 md:gap-10">
                         <div className="text-right">
                           <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">PM Cost</span>
                           <span className="font-bold text-slate-700">{formatCurrency(costs.pm)}</span>
                         </div>
                         <div className="text-right">
                           <span className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">RTF Cost</span>
                           <span className="font-bold text-slate-700">{formatCurrency(costs.corr)}</span>
                         </div>
                         <div className="text-right md:min-w-[130px] bg-slate-100/50 px-3 py-2 rounded-xl border border-slate-100">
                           <span className={`block text-[10px] font-black uppercase tracking-widest mb-1 ${costs.save >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>Est. Savings</span>
                           <div className="flex items-center justify-end gap-2">
                             <span className={`text-lg font-black tabular-nums ${costs.save >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {costs.save >= 0 ? '+' : ''}{formatCurrency(costs.save)}
                             </span>
                             {localOverrides[item.id] && (
                               <button 
                                 onClick={(e) => { e.stopPropagation(); handleSyncToStudy(item.id); }}
                                 className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md items-center justify-center flex"
                                 title="Save changes to study"
                               >
                                 <Save size={12} />
                               </button>
                             )}
                           </div>
                         </div>
                         <button className={`p-2 rounded-full transition-all duration-300 ${isExpanded ? 'bg-indigo-100 text-indigo-600 rotate-180' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                           <ChevronDown size={20} />
                         </button>
                      </div>
                </div>

                {/* Expanded Settings Form */}
                {isExpanded && (
                  <div className="px-6 py-6 bg-slate-50/50 border-t border-slate-100 flex flex-col lg:flex-row gap-8">
                    {/* Preventive Setup */}
                    <div className="flex-1 bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm relative">
                      <div className="absolute top-0 left-6 -translate-y-1/2 bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1">
                        <Wrench size={12} /> Preventive Setup
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
                        <div>
                          <label className="text-xs font-bold text-slate-600 mb-1.5 block">PM Task Time (Hrs)</label>
                          <input type="number" min="0" step="0.5" value={set.pmHours} onChange={e => updateSetting(item.id, 'pmHours', Number(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 font-bold text-slate-700 outline-none transition-all"/>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-600 mb-1.5 block">Frequency (per Yr)</label>
                          <input type="number" min="0" step="0.5" value={set.pmFreqPerYear} onChange={e => updateSetting(item.id, 'pmFreqPerYear', Number(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 font-bold text-slate-700 outline-none transition-all"/>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-600 mb-1.5 block flex items-center gap-1.5">
                            <Users size={12} className="text-emerald-600"/> People Required
                          </label>
                          <input type="number" min="1" step="1" value={set.pmPeople} onChange={e => updateSetting(item.id, 'pmPeople', Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-emerald-500 font-bold text-slate-700 outline-none transition-all"/>
                        </div>
                        <div className="bg-emerald-50/50 p-3 rounded-xl border border-emerald-100/50">
                           <span className="text-[10px] font-black text-emerald-800 uppercase tracking-widest block mb-1">Total Labor / Yr</span>
                           <span className="text-lg font-black text-emerald-600">{formatCurrency(set.pmHours * set.pmPeople * laborRate * set.pmFreqPerYear)}</span>
                        </div>
                      </div>

                      <div className="mt-6">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Package size={14} className="text-emerald-500" /> PM Replacement Parts
                          </label>
                          <button 
                            onClick={(e) => { e.stopPropagation(); addPart(item.id, 'pm'); }}
                            className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 flex items-center gap-1 border border-emerald-200 px-2.5 py-1 rounded-lg bg-emerald-50 transition-colors"
                          >
                            <Plus size={12} /> Add Part
                          </button>
                        </div>
                        <div className="space-y-2">
                          {set.pmParts.map(part => (
                            <div key={part.id} className="flex items-center gap-3 animate-in slide-in-from-left-2 duration-200">
                              <input 
                                type="text" 
                                value={part.name} 
                                placeholder="Part name"
                                onChange={e => updatePart(item.id, 'pm', part.id, { name: e.target.value })}
                                className="flex-1 px-3 py-1.5 border border-slate-100 rounded-lg bg-slate-50 text-xs font-bold focus:bg-white outline-none"
                              />
                              <div className="relative w-28">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">$</span>
                                <input 
                                  type="number" 
                                  value={part.cost} 
                                  onChange={e => updatePart(item.id, 'pm', part.id, { cost: Number(e.target.value) })}
                                  className="w-full pl-6 pr-3 py-1.5 border border-slate-100 rounded-lg bg-slate-50 text-xs font-bold focus:bg-white outline-none"
                                />
                              </div>
                              <button 
                                onClick={() => removePart(item.id, 'pm', part.id)}
                                className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Run-to-Failure Setup */}
                    <div className="flex-1 bg-white p-5 rounded-2xl border border-red-100 shadow-sm relative">
                      <div className="absolute top-0 left-6 -translate-y-1/2 bg-red-100 text-red-700 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1">
                        <AlertCircle size={12} /> Run-to-Failure
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-2">
                        <div>
                          <label className="text-xs font-bold text-slate-600 mb-1.5 block">Failures / Yr</label>
                          <input type="number" min="0" step="0.5" value={set.failsPerYearWithoutPM} onChange={e => updateSetting(item.id, 'failsPerYearWithoutPM', Number(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-red-500 font-bold text-slate-700 outline-none transition-all"/>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-600 mb-1.5 block">Repair Time (Hrs)</label>
                          <input type="number" min="0" step="0.5" value={set.correctiveHours} onChange={e => updateSetting(item.id, 'correctiveHours', Number(e.target.value))} className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-red-500 font-bold text-slate-700 outline-none transition-all"/>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-600 mb-1.5 block flex items-center gap-1.5">
                            <Users size={12} className="text-rose-600"/> People Required
                          </label>
                          <input type="number" min="1" step="1" value={set.rtfPeople} onChange={e => updateSetting(item.id, 'rtfPeople', Math.max(1, parseInt(e.target.value) || 1))} className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-red-500 font-bold text-slate-700 outline-none transition-all"/>
                        </div>
                        <div className="bg-rose-50/50 p-3 rounded-xl border border-rose-100/50">
                           <span className="text-[10px] font-black text-rose-800 uppercase tracking-widest block mb-1">Total Labor / Yr</span>
                           <span className="text-lg font-black text-rose-600">{formatCurrency(set.correctiveHours * set.rtfPeople * laborRate * set.failsPerYearWithoutPM)}</span>
                        </div>
                      </div>

                      <div className="mt-6">
                        <div className="flex items-center justify-between mb-3">
                          <label className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                            <Package size={14} className="text-rose-500" /> RTF Replacement Parts
                          </label>
                          <button 
                            onClick={(e) => { e.stopPropagation(); addPart(item.id, 'rtf'); }}
                            className="text-[10px] font-black text-rose-600 hover:text-rose-700 flex items-center gap-1 border border-rose-200 px-2.5 py-1 rounded-lg bg-rose-50 transition-colors"
                          >
                            <Plus size={12} /> Add Part
                          </button>
                        </div>
                        <div className="space-y-2">
                          {set.rtfParts.map(part => (
                            <div key={part.id} className="flex items-center gap-3 animate-in slide-in-from-left-2 duration-200">
                              <input 
                                type="text" 
                                value={part.name} 
                                placeholder="Part name"
                                onChange={e => updatePart(item.id, 'rtf', part.id, { name: e.target.value })}
                                className="flex-1 px-3 py-1.5 border border-slate-100 rounded-lg bg-slate-50 text-xs font-bold focus:bg-white outline-none"
                              />
                              <div className="relative w-28">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-[10px]">$</span>
                                <input 
                                  type="number" 
                                  value={part.cost} 
                                  onChange={e => updatePart(item.id, 'rtf', part.id, { cost: Number(e.target.value) })}
                                  className="w-full pl-6 pr-3 py-1.5 border border-slate-100 rounded-lg bg-slate-50 text-xs font-bold focus:bg-white outline-none"
                                />
                              </div>
                              <button 
                                onClick={() => removePart(item.id, 'rtf', part.id)}
                                className="p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

