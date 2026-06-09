import React, { useState } from 'react';
import { 
  Upload, 
  FileText, 
  Image as ImageIcon, 
  FileSpreadsheet, 
  Trash2, 
  Sparkles, 
  AlertTriangle, 
  Plus, 
  X,
  FileCheck,
  Zap,
  Info,
  Layers,
  Search,
  FileArchive
} from 'lucide-react';
import JSZip from 'jszip';
import { FileData } from '../types';
import { extractTextFromFile } from '../src/lib/fileParser';

interface KnowledgeHubProps {
  filesData: FileData[];
  setFilesData: React.Dispatch<React.SetStateAction<FileData[]>>;
  onExtract: (files: FileData[], type?: 'all' | 'maintenance') => Promise<void>;
  isExtracting: boolean;
  onAnnotate: (file: FileData) => void;
  selectedLanguage: string;
}

export const KnowledgeHub: React.FC<KnowledgeHubProps> = ({
  filesData,
  setFilesData,
  onExtract,
  isExtracting,
  onAnnotate,
  selectedLanguage
}) => {
  const [activeSection, setActiveSection] = useState<'drawings' | 'docs' | 'plans'>('drawings');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const drawingsSection = filesData.filter(f => f.mimeType.startsWith('image/') || f.name.toLowerCase().endsWith('.dwg') || f.name.toLowerCase().endsWith('.pdf') && !f.name.toLowerCase().includes('manual') && !f.name.toLowerCase().includes('plan'));
  const docsSection = filesData.filter(f => (f.mimeType.includes('word') || f.name.toLowerCase().includes('manual') || (f.name.toLowerCase().endsWith('.pdf') && !drawingsSection.includes(f))) && !f.name.toLowerCase().endsWith('.xlsx') && !f.name.toLowerCase().endsWith('.xls'));
  const plansSection = filesData.filter(f => f.mimeType.includes('spreadsheet') || f.name.toLowerCase().endsWith('.xlsx') || f.name.toLowerCase().endsWith('.xls') || f.name.toLowerCase().endsWith('.csv'));

  const processFile = async (file: File, options: { extractZip?: boolean } = {}): Promise<FileData[] | null> => {
    if (file.size > 100 * 1024 * 1024) {
      return null;
    }

    // Individual file pick should NOT auto-extract ZIPs unless explicitly requested or via bulk upload
    if (file.name.toLowerCase().endsWith('.zip') && options.extractZip) {
      const zip = new JSZip();
      try {
        const content = await zip.loadAsync(file);
        const extractedFiles: FileData[] = [];
        const filePromises: Promise<void>[] = [];
        
        Object.keys(content.files).forEach(filename => {
          if (!content.files[filename].dir) {
            filePromises.push(
              content.files[filename].async('blob').then(async (blob) => {
                const subFile = new File([blob], filename);
                const processed = await processFile(subFile, { extractZip: true });
                if (processed) extractedFiles.push(...processed);
              })
            );
          }
        });

        await Promise.all(filePromises);
        return extractedFiles;
      } catch (e) {
        console.error(`Failed to extract zip: ${file.name}`, e);
        return null;
      }
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

      return [{
        name: file.name,
        mimeType: mimeType,
        data: base64 as string,
        extractedText: textContent as string,
        pins: [],
        drawings: []
      }];
    } catch (e) {
      console.error(`Failed to read file: ${file.name}`);
      return null;
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement> | React.DragEvent, options: { extractZip?: boolean } = {}) => {
    let files: File[] = [];
    
    // Check if this was a folder upload (webkitdirectory)
    const isFolderPicker = 'target' in event && (event.target as HTMLInputElement).webkitdirectory;
    const shouldExtract = options.extractZip || isFolderPicker;

    if ('target' in event && (event.target as HTMLInputElement).files) {
      const fileList = (event.target as HTMLInputElement).files;
      if (fileList) files = Array.from(fileList);
    } else if ('dataTransfer' in event) {
      event.preventDefault();
      setIsDragging(false);
      
      const items = event.dataTransfer.items;
      const filePromises: Promise<FileData[] | null>[] = [];

      const traverseFileTree = (item: any) => {
        if (item.isFile) {
          filePromises.push(new Promise((resolve) => {
            item.file((file: File) => {
              processFile(file, { extractZip: shouldExtract }).then(resolve);
            });
          }));
        } else if (item.isDirectory) {
          const dirReader = item.createReader();
          const readEntries = () => {
             dirReader.readEntries((entries: any[]) => {
               for (const entry of entries) {
                 traverseFileTree(entry);
               }
               if (entries.length > 0) readEntries();
             });
          };
          readEntries();
        }
      };

      for (let i = 0; i < items.length; i++) {
        const item = items[i].webkitGetAsEntry();
        if (item) traverseFileTree(item);
      }

      const results = await Promise.all(filePromises);
      const validFiles = results.filter((f): f is FileData[] => f !== null).flat();
      setFilesData(prev => [...prev, ...validFiles]);
      return;
    }

    if (files.length === 0) return;

    const newFiles: FileData[] = [];
    setError(null);

    for (const file of files) {
      const f = await processFile(file, { extractZip: shouldExtract });
      if (f) newFiles.push(...f);
    }

    setFilesData(prev => [...prev, ...newFiles]);
    if ('target' in event && (event.target as any).value) {
      (event.target as any).value = '';
    }
  };

  const handleExtractManual = async (file: FileData) => {
    // If user explicitly wants to extract a ZIP that was uploaded as a file
    setIsDragging(true); // show loading state visually
    try {
      const byteCharacters = atob(file.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/zip' });
      const zipFile = new File([blob], file.name);
      
      const extracted = await processFile(zipFile, { extractZip: true });
      if (extracted) {
        setFilesData(prev => {
          const filtered = prev.filter(f => f.name !== file.name);
          return [...filtered, ...extracted];
        });
      }
    } catch (e) {
      setError("Manual extraction failed.");
    } finally {
      setIsDragging(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const removeFile = (name: string) => {
    setFilesData(prev => prev.filter(f => f.name !== name));
  };

  const clearSection = (sectionFiles: FileData[]) => {
    const namesToRemove = sectionFiles.map(f => f.name);
    setFilesData(prev => prev.filter(f => !namesToRemove.includes(f.name)));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <button 
          onClick={() => setActiveSection('drawings')}
          className={`flex flex-col items-center p-6 rounded-3xl border-2 transition-all group ${activeSection === 'drawings' ? 'bg-indigo-600 border-indigo-600 text-white shadow-xl shadow-indigo-100 scale-[1.02]' : 'bg-white border-slate-100 text-slate-500 hover:border-indigo-200 hover:bg-indigo-50/30'}`}
        >
          <div className={`p-4 rounded-2xl mb-4 transition-all ${activeSection === 'drawings' ? 'bg-white/20 text-white rotate-6' : 'bg-slate-50 group-hover:bg-white group-hover:rotate-6'}`}>
            <ImageIcon size={32} />
          </div>
          <span className="text-sm font-black uppercase tracking-widest text-center">Drawings & Blueprints</span>
          <span className={`text-[10px] mt-2 font-bold uppercase tracking-tighter ${activeSection === 'drawings' ? 'text-indigo-100' : 'text-slate-400'}`}>{drawingsSection.length} JPG/PDF Assets</span>
        </button>

        <button 
          onClick={() => setActiveSection('docs')}
          className={`flex flex-col items-center p-6 rounded-3xl border-2 transition-all group ${activeSection === 'docs' ? 'bg-slate-900 border-slate-900 text-white shadow-xl shadow-slate-200 scale-[1.02]' : 'bg-white border-slate-100 text-slate-500 hover:border-slate-200 hover:bg-slate-50/80'}`}
        >
          <div className={`p-4 rounded-2xl mb-4 transition-all ${activeSection === 'docs' ? 'bg-white/20 text-white -rotate-6' : 'bg-slate-50 group-hover:bg-white group-hover:-rotate-6'}`}>
            <FileText size={32} />
          </div>
          <span className="text-sm font-black uppercase tracking-widest text-center">OEM Manuals & Docs</span>
          <span className={`text-[10px] mt-2 font-bold uppercase tracking-tighter ${activeSection === 'docs' ? 'text-slate-300' : 'text-slate-400'}`}>{docsSection.length} Word/PDF Documents</span>
        </button>

        <button 
          onClick={() => setActiveSection('plans')}
          className={`flex flex-col items-center p-6 rounded-3xl border-2 transition-all group ${activeSection === 'plans' ? 'bg-emerald-600 border-emerald-600 text-white shadow-xl shadow-emerald-100 scale-[1.02]' : 'bg-white border-slate-100 text-slate-500 hover:border-emerald-200 hover:bg-emerald-50/50'}`}
        >
          <div className={`p-4 rounded-2xl mb-4 transition-all ${activeSection === 'plans' ? 'bg-white/20 text-white rotate-3' : 'bg-slate-50 group-hover:bg-white group-hover:rotate-3'}`}>
            <FileSpreadsheet size={32} />
          </div>
          <span className="text-sm font-black uppercase tracking-widest text-center">Current Maintenance Plans</span>
          <span className={`text-[10px] mt-2 font-bold uppercase tracking-tighter ${activeSection === 'plans' ? 'text-emerald-100' : 'text-slate-400'}`}>{plansSection.length} Excel/CSV Plans</span>
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-[2.5rem] shadow-sm overflow-hidden flex flex-col min-h-[500px]">
        <div className="p-10 border-b border-slate-100 flex items-center justify-between bg-slate-50/30">
          <div className="flex items-center gap-5">
            <div className={`p-4 rounded-[1.2rem] shadow-lg ${
              activeSection === 'drawings' ? 'bg-indigo-600 text-white' : 
              activeSection === 'docs' ? 'bg-slate-900 text-white' : 'bg-emerald-600 text-white'
            }`}>
              {activeSection === 'drawings' ? <ImageIcon size={24} /> : 
               activeSection === 'docs' ? <FileText size={24} /> : <FileSpreadsheet size={24} />}
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">
                {activeSection === 'drawings' ? 'Technical Drawings & Schematics' : 
                 activeSection === 'docs' ? 'Knowledge Documents & OEM Materials' : 'Legacy Maintenance Strategies'}
              </h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                {activeSection === 'drawings' ? 'Upload JPG, PNG or PDF drawings for precision annotation' : 
                 activeSection === 'docs' ? 'Ingest manuals, handbooks and technical reports' : 'Upload current Excel/CSV maintenance plans for AI processing'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
             <button 
               onClick={() => clearSection(activeSection === 'drawings' ? drawingsSection : activeSection === 'docs' ? docsSection : plansSection)}
               className="px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-red-500 transition-colors"
             >
               Clear {activeSection}
             </button>
             
             {/* Folder Upload Option */}
             <label className="group flex items-center gap-3 px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all border-2 border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-indigo-200 active:scale-95" title="Bulk upload entire folder structure">
                <Layers size={16} className="group-hover:text-indigo-500 transition-colors" /> Import Folder
                <input 
                  type="file" 
                  webkitdirectory="" 
                  directory="" 
                  multiple 
                  className="hidden" 
                  onChange={(e) => handleFileUpload(e, { extractZip: true })} 
                />
             </label>

             <label className={`group flex items-center gap-3 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all shadow-md active:scale-95 ${
               activeSection === 'drawings' ? 'bg-indigo-600 text-white hover:bg-indigo-700' :
               activeSection === 'docs' ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-emerald-600 text-white hover:bg-emerald-700'
             }`} title="Select specific files (Supports Zip, PDF, Images, Word, Excel)">
                <Plus size={16} className="group-hover:rotate-90 transition-transform duration-300" /> Select Files
                <input type="file" multiple className="hidden" onChange={(e) => handleFileUpload(e)} accept="*" />
             </label>
          </div>
        </div>

        <div 
          className={`flex-1 p-10 transition-all duration-300 relative ${isDragging ? 'bg-indigo-50/50' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={handleFileUpload}
        >
          {isDragging && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-indigo-600/90 text-white pointer-events-none animate-in fade-in zoom-in-95">
              <div className="p-8 bg-white/20 rounded-[3rem] backdrop-blur-md border-2 border-white/30 mb-6 drop-shadow-2xl">
                <Upload size={64} className="animate-bounce" />
              </div>
              <h3 className="text-3xl font-black uppercase tracking-tighter">Sync Everything</h3>
              <p className="text-sm font-bold uppercase tracking-widest mt-2 opacity-80">Drop folders and files to ingest legacy knowledge</p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {(activeSection === 'drawings' ? drawingsSection : activeSection === 'docs' ? docsSection : plansSection).length === 0 ? (
              <div className="col-span-full h-80 flex flex-col items-center justify-center text-center opacity-30 border-2 border-dashed border-slate-100 rounded-3xl">
                <Layers size={48} className="text-slate-300 mb-6" />
                <p className="text-sm font-black uppercase tracking-widest text-slate-400">No {activeSection} detected in cluster</p>
                <p className="text-[10px] text-slate-300 font-bold mt-2 uppercase tracking-tight">Upload files to begin synchronization</p>
              </div>
            ) : (
              (activeSection === 'drawings' ? drawingsSection : activeSection === 'docs' ? docsSection : plansSection).map((file, idx) => (
                <div key={idx} className="group relative bg-white border border-slate-200 rounded-3xl p-5 hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-50/50 transition-all duration-300 animate-in zoom-in-95">
                  <div className="flex items-start justify-between mb-6">
                    <div className={`p-3 rounded-xl ${
                      activeSection === 'drawings' ? 'bg-indigo-50 text-indigo-600' :
                      activeSection === 'docs' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-600'
                    }`}>
                      {activeSection === 'drawings' ? <ImageIcon size={20} /> :
                       activeSection === 'docs' ? <FileText size={20} /> : <FileSpreadsheet size={20} />}
                    </div>
                    <button onClick={() => removeFile(file.name)} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all">
                      <Trash2 size={16} />
                    </button>
                  </div>
                  
                  <div className="mb-6">
                    <h5 className="text-[11px] font-black text-slate-900 uppercase tracking-tight truncate mb-1">{file.name}</h5>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                      {activeSection === 'drawings' ? `${file.pins?.length || 0} Registered Annotations` :
                       activeSection === 'docs' ? 'Full text buffer indexed' : 'Maintenance Schedule Data'}
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      onClick={() => onAnnotate(file)}
                      className={`flex-1 px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                        activeSection === 'drawings' ? 'bg-indigo-600 text-white hover:bg-indigo-700' :
                        activeSection === 'docs' ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-emerald-600 text-white hover:bg-emerald-700'
                      }`}
                    >
                      {activeSection === 'drawings' ? 'Open Annotator' : 'Inspect Details'}
                    </button>
                    {file.name.toLowerCase().endsWith('.zip') && (
                      <button 
                        onClick={() => handleExtractManual(file)}
                        className="px-4 py-2.5 bg-amber-500 text-white hover:bg-amber-600 rounded-xl transition-all flex items-center gap-2"
                        title="Extract ZIP Contents"
                      >
                        <Zap size={14} />
                      </button>
                    )}
                    {activeSection === 'drawings' && !file.name.toLowerCase().endsWith('.zip') && (
                      <button 
                        onClick={() => onAnnotate(file)}
                        className="px-4 py-2.5 bg-slate-50 text-slate-500 hover:bg-slate-100 rounded-xl transition-all"
                      >
                        <Search size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="px-10 py-8 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex -space-x-3">
              {drawingsSection.length > 0 && <div className="w-10 h-10 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center text-indigo-600"><ImageIcon size={16}/></div>}
              {docsSection.length > 0 && <div className="w-10 h-10 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-slate-600"><FileText size={16}/></div>}
              {plansSection.length > 0 && <div className="w-10 h-10 rounded-full bg-emerald-100 border-2 border-white flex items-center justify-center text-emerald-600"><FileSpreadsheet size={16}/></div>}
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Knowledge Coverage: {Math.round(((drawingsSection.length > 0 ? 1 : 0) + (docsSection.length > 0 ? 1 : 0) + (plansSection.length > 0 ? 1 : 0)) / 3 * 100)}%</p>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Ready for multidimensional extraction</p>
            </div>
          </div>

          <div className="flex items-center gap-4 w-full sm:w-auto">
            {activeSection === 'plans' && plansSection.length > 0 && (
              <button 
                onClick={() => onExtract(plansSection, 'maintenance')}
                disabled={isExtracting}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-3 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.1em] transition-all shadow-xl shadow-emerald-100 active:scale-95 border-2 border-emerald-600 bg-white text-emerald-600 hover:bg-emerald-50 ${isExtracting ? 'opacity-50' : ''}`}
              >
                {isExtracting ? <Zap className="animate-pulse" size={16} /> : <Zap size={16} />}
                Extract Maintenance Logic
              </button>
            )}
            <button 
              onClick={() => onExtract(filesData, 'all')}
              disabled={isExtracting || filesData.length === 0}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-3 px-10 py-4 rounded-2xl text-[10px] font-black uppercase tracking-[0.15em] transition-all shadow-xl shadow-indigo-100 active:scale-95 bg-slate-900 text-white hover:bg-slate-800 ${isExtracting ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isExtracting ? <Sparkles className="animate-spin" size={16} /> : <Sparkles size={16} className="text-indigo-400" />}
              {isExtracting ? "Synthesizing Knowledge..." : "Generate Master Context"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl text-red-600 text-[10px] font-black uppercase tracking-widest flex items-center gap-3 animate-in shake-in-from-right">
          <AlertTriangle size={16} />
          {error}
        </div>
      )}

      <div className="bg-indigo-50/50 p-6 rounded-[2rem] border border-indigo-100/50 flex gap-5">
        <div className="bg-white p-3 rounded-2xl shadow-sm text-indigo-600 h-fit">
          <Info size={20} />
        </div>
        <div>
          <h4 className="text-[11px] font-black text-indigo-900 uppercase tracking-widest mb-1">Advanced Knowledge Processing</h4>
          <p className="text-[10px] text-indigo-700/70 font-medium leading-relaxed max-w-2xl">
            The Knowledge Hub organizes technical information into structured clusters. By categorizing drawings, manuals, and legacy plans, the AI can correlate visual annotations with operational standards and historical maintenance data to generate a high-fidelity SAE JA1011 RCM Context.
          </p>
        </div>
      </div>
    </div>
  );
};
