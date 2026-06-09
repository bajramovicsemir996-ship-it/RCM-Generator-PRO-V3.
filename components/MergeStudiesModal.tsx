import React, { useState } from 'react';
import { SavedStudy } from '../types';
import { X, GitMerge, CheckSquare, Square, FileText } from 'lucide-react';

interface MergeStudiesModalProps {
  isOpen: boolean;
  onClose: () => void;
  studies: SavedStudy[];
  onMerge: (selectedIds: string[], newName: string) => void;
}

export const MergeStudiesModal: React.FC<MergeStudiesModalProps> = ({ isOpen, onClose, studies, onMerge }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergedName, setMergedName] = useState('Merged Analysis');

  if (!isOpen) return null;

  const toggleStudy = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleMerge = () => {
    if (selectedIds.size < 2) return;
    onMerge(Array.from(selectedIds), mergedName);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 z-[100] flex items-center justify-center p-4 animate-in fade-in">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100 flex flex-col max-h-[85vh]">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 text-indigo-600 rounded-xl">
              <GitMerge size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black text-slate-900 uppercase tracking-tighter">Merge Studies</h3>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Combine multiple analyses into one</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="mb-6">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">New Study Name</label>
            <input 
              type="text" 
              value={mergedName}
              onChange={(e) => setMergedName(e.target.value)}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
              placeholder="e.g., Plant Wide RCM"
            />
          </div>

          <div className="mb-2 flex items-center justify-between">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Studies to Merge</label>
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">{selectedIds.size} Selected</span>
          </div>
          
          <div className="space-y-2 border border-slate-100 rounded-xl p-2 bg-slate-50/50 max-h-60 overflow-y-auto custom-scrollbar">
            {studies.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs font-medium">No saved studies available.</div>
            ) : (
              studies.map(study => (
                <div 
                  key={study.id} 
                  onClick={() => toggleStudy(study.id)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all border ${selectedIds.has(study.id) ? 'bg-white border-indigo-200 shadow-sm' : 'bg-transparent border-transparent hover:bg-slate-100'}`}
                >
                  <div className={`text-${selectedIds.has(study.id) ? 'indigo-600' : 'slate-300'}`}>
                    {selectedIds.has(study.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-slate-700 truncate">{study.name}</div>
                    <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1 mt-0.5">
                      <FileText size={10} /> {study.items.length} items
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 transition-all"
          >
            Cancel
          </button>
          <button 
            onClick={handleMerge}
            disabled={selectedIds.size < 2}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg ${selectedIds.size >= 2 ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200' : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}`}
          >
            <GitMerge size={16} />
            Merge Selected
          </button>
        </div>
      </div>
    </div>
  );
};
