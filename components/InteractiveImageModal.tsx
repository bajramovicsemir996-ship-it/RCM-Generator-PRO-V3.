import React, { useState, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, Maximize, Expand, Frame, MapPin, MessageSquare, Plus, Trash2, Edit3, FileCode, PenTool, Circle, Square, MousePointer, RotateCw } from 'lucide-react';
import { ImagePin, FileData, DrawingShape } from '../types';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { Document, Page, pdfjs } from 'react-pdf';

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface InteractiveImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: FileData;
  onUpdateFile: (updatedFile: FileData) => void;
}

export const InteractiveImageModal: React.FC<InteractiveImageModalProps> = ({ 
  isOpen, 
  onClose, 
  file,
  onUpdateFile
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastMoveTimestamp, setLastMoveTimestamp] = useState(0);
  const [selectedPinId, setSelectedPinId] = useState<string | null>(null);
  const [isAddingPin, setIsAddingPin] = useState(false);
  const [drawMode, setDrawMode] = useState<'none' | 'freehand' | 'circle' | 'rectangle'>('none');
  const [currentDrawing, setCurrentDrawing] = useState<DrawingShape | null>(null);
  const [activeColor, setActiveColor] = useState<string>('#ef4444'); // Default red
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [parsedHtml, setParsedHtml] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 });
  const [rotation, setRotation] = useState(0);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1); // 1-100 range for slider

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const modalWrapperRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const hasFitFile = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setPosition({ x: 0, y: 0 });
      setSelectedPinId(null);
      setIsAddingPin(false);
      setDrawMode('none');
      setCurrentDrawing(null);
      hasFitFile.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      setContainerSize({ w: entries[0].contentRect.width, h: entries[0].contentRect.height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [isOpen]);

  const fitToScreen = () => {
    if (containerSize.w && containerSize.h) {
      const dw = file.mimeType.startsWith('image/') ? imageSize.w : 850;
      const dh = file.mimeType.startsWith('image/') ? imageSize.h : 1100;
      if (dw && dh) {
        const fitScale = Math.min(containerSize.w / dw, containerSize.h / dh) * 0.95;
        setScale(Math.max(0.1, fitScale));
        setPosition({ x: 0, y: 0 });
      }
    }
  };

  useEffect(() => {
    if (isOpen && containerSize.w > 0) {
      const dw = file.mimeType.startsWith('image/') ? imageSize.w : 850;
      const dh = file.mimeType.startsWith('image/') ? imageSize.h : 1100;
      if (dw && dh) {
        const fitKey = `${file.name}-${isFullscreen}`;
        if (hasFitFile.current !== fitKey) {
          fitToScreen();
          hasFitFile.current = fitKey;
        }
      }
    }
  }, [isOpen, containerSize.w, containerSize.h, isFullscreen, imageSize.w, imageSize.h, file.name]);

  useEffect(() => {
    if (file && !file.mimeType.startsWith('image/') && file.data) {
      setParsedHtml(null);
      
      try {
        const byteCharacters = atob(file.data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const arrayBuffer = byteArray.buffer;
        
        const blob = new Blob([byteArray], { type: file.mimeType });
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        
        const isWord = file.name.endsWith('.docx') || file.mimeType.includes('wordprocessingml');
        const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv') || file.mimeType.includes('spreadsheetml');
        
        if (isWord) {
          setIsParsing(true);
          mammoth.convertToHtml({ arrayBuffer })
            .then(result => {
              setParsedHtml(`<div class="doc-preview p-8 bg-white text-slate-900 h-full">
                <style>
                  .doc-preview h1 { font-size: 2em; font-weight: bold; margin-top: 0.67em; margin-bottom: 0.67em; }
                  .doc-preview h2 { font-size: 1.5em; font-weight: bold; margin-top: 0.83em; margin-bottom: 0.83em; }
                  .doc-preview h3 { font-size: 1.17em; font-weight: bold; margin-top: 1em; margin-bottom: 1em; }
                  .doc-preview p { margin-top: 1em; margin-bottom: 1em; }
                  .doc-preview ul { list-style-type: disc; padding-left: 40px; margin-top: 1em; margin-bottom: 1em; }
                  .doc-preview ol { list-style-type: decimal; padding-left: 40px; margin-top: 1em; margin-bottom: 1em; }
                  .doc-preview table { border-collapse: collapse; width: 100%; margin-top: 1em; margin-bottom: 1em; }
                  .doc-preview td, .doc-preview th { border: 1px solid #cbd5e1; padding: 8px; }
                </style>
                ${result.value}
              </div>`);
            })
            .catch(err => {
              console.error("Mammoth error", err);
              setParsedHtml(`<div class="p-8 text-red-500">Failed to render Word document. Please download to view.</div>`);
            })
            .finally(() => setIsParsing(false));
        } else if (isExcel) {
          setIsParsing(true);
          try {
            const wb = XLSX.read(arrayBuffer, { type: 'array' });
            const sheetName = wb.SheetNames[0];
            const html = XLSX.utils.sheet_to_html(wb.Sheets[sheetName], { header: '' });
            setParsedHtml(`<div class="excel-preview p-8 bg-white text-slate-900 overflow-auto">
              <style>
                .excel-preview table { width: 100%; border-collapse: collapse; }
                .excel-preview td, .excel-preview th { border: 1px solid #cbd5e1; padding: 4px 8px; font-size: 14px; }
              </style>
              ${html}
            </div>`);
          } catch(e) {
             setParsedHtml(`<div class="p-8 text-red-500">Failed to render Excel document.</div>`);
          }
          setIsParsing(false);
        }

        return () => URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Failed to create blob for file preview", error);
      }
    } else {
        setBlobUrl(null);
        setParsedHtml(null);
    }
  }, [file?.data, file?.mimeType, file?.name]);

  useEffect(() => {
    setRotation(0);
  }, [file?.name]);

  if (!isOpen) return null;

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev * 1.5, 20));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev / 1.5, 0.1));
  };

  const handleZoomSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setZoomLevel(val);
    // Linear to Exponential mapping for smoother feel
    const newScale = 0.1 * Math.pow(1.5, val / 10);
    setScale(newScale);
  };

  const handleReset = () => {
    fitToScreen();
    setRotation(0);
    setZoomLevel(10);
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      modalWrapperRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable fullscreen: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const getMappedCoords = (clientX: number, clientY: number, rect: DOMRect) => {
    let x = ((clientX - rect.left) / rect.width) * 100;
    let y = ((clientY - rect.top) / rect.height) * 100;
    
    // Adjust coordinates based on rotation
    const rot = ((rotation % 360) + 360) % 360;
    if (rot === 90) {
      return { x: y, y: 100 - x };
    } else if (rot === 180) {
      return { x: 100 - x, y: 100 - y };
    } else if (rot === 270) {
      return { x: 100 - y, y: x };
    }
    return { x, y };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (drawMode !== 'none' && imgRef.current) {
      const rect = imgRef.current.getBoundingClientRect();
      const coords = getMappedCoords(e.clientX, e.clientY, rect);
      if (coords.x >= 0 && coords.x <= 100 && coords.y >= 0 && coords.y <= 100) {
        setIsDragging(false);
        setCurrentDrawing({
          id: `draw-${Date.now()}`,
          type: drawMode as any,
          color: activeColor,
          strokeWidth: 3,
          points: [coords]
        });
        return;
      }
    }
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    setLastMoveTimestamp(Date.now());
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (drawMode !== 'none' && currentDrawing && imgRef.current) {
      const rect = imgRef.current.getBoundingClientRect();
      const coords = getMappedCoords(e.clientX, e.clientY, rect);
      
      if (drawMode === 'freehand') {
        setCurrentDrawing({
          ...currentDrawing,
          points: [...currentDrawing.points, coords]
        });
      } else if (drawMode === 'circle' || drawMode === 'rectangle') {
        setCurrentDrawing({
          ...currentDrawing,
          points: [currentDrawing.points[0], coords]
        });
      }
      return;
    }

    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
      setLastMoveTimestamp(Date.now());
    }
  };

  const onMouseUp = (e: React.MouseEvent) => {
    if (currentDrawing) {
      const updatedFile = {
        ...file,
        drawings: [...(file.drawings || []), currentDrawing]
      };
      onUpdateFile(updatedFile);
      setCurrentDrawing(null);
      return;
    }

    const wasClick = Date.now() - lastMoveTimestamp < 200;
    setIsDragging(false);

    if (wasClick && isAddingPin && imgRef.current && containerRef.current) {
      const rect = imgRef.current.getBoundingClientRect();
      const coords = getMappedCoords(e.clientX, e.clientY, rect);

      if (coords.x >= 0 && coords.x <= 100 && coords.y >= 0 && coords.y <= 100) {
        const newPin: ImagePin = {
          id: `pin-${Date.now()}`,
          x: coords.x,
          y: coords.y,
          note: 'New technical annotation...'
        };
        const updatedFile = {
          ...file,
          pins: [...(file.pins || []), newPin]
        };
        onUpdateFile(updatedFile);
        setSelectedPinId(newPin.id);
        setIsAddingPin(false);
      }
    }
  };

  const onMouseLeave = () => {
    if (currentDrawing) {
      const updatedFile = {
        ...file,
        drawings: [...(file.drawings || []), currentDrawing]
      };
      onUpdateFile(updatedFile);
      setCurrentDrawing(null);
    }
    setIsDragging(false);
  };

  const handleUpdatePinNote = (id: string, note: string) => {
    const updatedPins = (file.pins || []).map(p => p.id === id ? { ...p, note } : p);
    onUpdateFile({ ...file, pins: updatedPins });
  };

  const handleDeletePin = (id: string) => {
    const updatedPins = (file.pins || []).map(p => p.id === id ? { ...p, note: '' } : p).filter(p => p.id !== id);
    onUpdateFile({ ...file, pins: updatedPins });
    if (selectedPinId === id) setSelectedPinId(null);
  };

  return (
    <div ref={modalWrapperRef} className={`fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-xl animate-in fade-in duration-300 ${isFullscreen ? 'p-0' : 'p-4'}`}>
      <div className={`bg-slate-900 shadow-2xl w-full flex flex-col animate-in zoom-in-95 duration-300 border-slate-700/50 ${isFullscreen ? 'h-screen rounded-none max-w-full border-0' : 'max-w-[95vw] h-[90vh] overflow-hidden rounded-[2.5rem] border'}`}>
        <div className="px-8 py-6 flex justify-between items-center text-white shrink-0 border-b border-slate-800 bg-slate-900/50 backdrop-blur-md relative z-10">
          <div className="flex items-center gap-6">
            <div className="p-3 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 shadow-inner">
              <Frame size={24} className="text-emerald-400" />
            </div>
            <div>
              <h3 className="font-black text-xl tracking-tighter uppercase leading-none text-white">Interactive Engineering Workbench</h3>
              <p className="text-[10px] text-emerald-400 font-black uppercase tracking-[0.2em] mt-1.5 flex items-center gap-2">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
                P&ID Live Context Injection
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-800 rounded-xl p-1 shadow-inner border border-slate-700">
               <button onClick={() => { setDrawMode('none'); setIsAddingPin(false); }} className={`p-2.5 rounded-lg transition-all ${drawMode === 'none' && !isAddingPin ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="Pan / Select"><MousePointer size={18}/></button>
               <button onClick={() => { setDrawMode('freehand'); setIsAddingPin(false); }} className={`p-2.5 rounded-lg transition-all ${drawMode === 'freehand' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="Draw Freehand"><PenTool size={18}/></button>
               <button onClick={() => { setDrawMode('circle'); setIsAddingPin(false); }} className={`p-2.5 rounded-lg transition-all ${drawMode === 'circle' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="Draw Circle"><Circle size={18}/></button>
               <button onClick={() => { setDrawMode('rectangle'); setIsAddingPin(false); }} className={`p-2.5 rounded-lg transition-all ${drawMode === 'rectangle' ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`} title="Draw Rectangle"><Square size={18}/></button>
            </div>
            
            {drawMode !== 'none' && (
              <div className="flex bg-slate-800 rounded-xl p-1 shadow-inner border border-slate-700 items-center">
                 {['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ffffff'].map(color => (
                   <button 
                     key={color} 
                     onClick={() => setActiveColor(color)} 
                     className={`w-7 h-7 rounded-lg m-0.5 flex items-center justify-center transition-all ${activeColor === color ? 'bg-slate-700 ring-2 ring-white scale-110 relative z-10' : 'hover:scale-110'}`}
                   >
                     <div className="w-3.5 h-3.5 rounded-full shadow-inner" style={{ backgroundColor: color }} />
                   </button>
                 ))}
                 <div className="w-px h-6 bg-slate-700 mx-2" />
                 <button 
                   onClick={() => onUpdateFile({ ...file, drawings: [] })}
                   className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-all"
                   title="Clear All Drawings"
                 >
                   <Trash2 size={16} />
                 </button>
              </div>
            )}
            
            <div className="flex bg-slate-800 rounded-xl p-2 shadow-inner border border-slate-700 items-center gap-4">
               <button onClick={handleZoomOut} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all" title="Zoom Out"><ZoomOut size={16}/></button>
               <input 
                 type="range" 
                 min="1" 
                 max="100" 
                 value={zoomLevel} 
                 onChange={handleZoomSliderChange}
                 className="w-32 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
               />
               <button onClick={handleZoomIn} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all" title="Zoom In"><ZoomIn size={16}/></button>
               <div className="w-px h-6 bg-slate-700" />
               <button onClick={handleReset} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all" title="Reset View"><Maximize size={16}/></button>
               <button onClick={() => setRotation(r => r + 90)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-all" title="Rotate 90°"><RotateCw size={16}/></button>
            </div>
            
            <button 
              onClick={() => { setIsAddingPin(!isAddingPin); setDrawMode('none'); }}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isAddingPin ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}
            >
              <Plus size={16} /> {isAddingPin ? 'Click to Place Pin' : 'Add Annotation'}
            </button>

            <button onClick={handleToggleFullscreen} className={`p-3 text-slate-400 hover:text-white rounded-2xl transition-all border border-transparent shadow-xl ${isFullscreen ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : 'bg-white/5 hover:bg-slate-700'}`} title="Toggle Fullscreen">
              <Expand size={24} />
            </button>

            <button onClick={onClose} className="p-3 bg-white/5 text-slate-400 hover:bg-red-500/10 hover:text-red-400 rounded-2xl transition-all border border-transparent hover:border-red-500/20 shadow-xl">
              <X size={24} />
            </button>
          </div>
        </div>
        
        <div className="flex-1 flex overflow-hidden">
          {/* Main Viewer Area */}
          <div 
            ref={containerRef}
            className={`flex-1 overflow-hidden relative bg-slate-950 flex items-center justify-center ${isAddingPin || drawMode !== 'none' ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'}`}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseLeave}
            onWheel={(e) => {
              if (e.deltaY < 0) handleZoomIn();
              else handleZoomOut();
            }}
          >
            <div className="relative" style={{ 
              transform: `translate(${position.x}px, ${position.y}px)`, 
              transition: isDragging ? 'none' : 'transform 0.4s cubic-bezier(0.23, 1, 0.32, 1)' 
            }}>
              <div style={{ 
                transform: `rotate(${rotation}deg)`, 
                transition: 'transform 0.3s ease', 
                transformOrigin: 'center' 
              }} className="relative flex">
                {file.mimeType.startsWith('image/') ? (
                  <img 
                    ref={imgRef}
                    draggable={false}
                    src={`data:${file.mimeType};base64,${file.data}`} 
                    alt={file.name} 
                    onLoad={(e) => setImageSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                    className="shadow-[0_0_100px_rgba(0,0,0,0.5)] rounded-sm ring-1 ring-white/5" 
                    style={{ 
                      width: imageSize.w ? `${imageSize.w * scale}px` : 'auto', 
                      height: imageSize.h ? `${imageSize.h * scale}px` : 'auto',
                      maxWidth: 'none'
                    }}
                  />
                ) : (
                  <div 
                    ref={imgRef as any}
                    className="bg-white shadow-[0_0_100px_rgba(0,0,0,0.5)] rounded-sm ring-1 ring-white/5 relative overflow-hidden"
                    style={{ width: `${850 * scale}px`, height: `${1100 * scale}px` }}
                  >
                    <div className={`w-full h-full overflow-auto bg-slate-50 ${isDragging || isAddingPin || drawMode !== 'none' ? 'pointer-events-none select-none' : ''}`}>
                      {isParsing ? (
                        <div className="w-full h-full flex items-center justify-center text-slate-500 font-bold uppercase tracking-widest text-xs">
                          <ZoomIn size={16} className="mr-2 animate-spin" /> Analyzing Document...
                        </div>
                      ) : parsedHtml ? (
                        <div dangerouslySetInnerHTML={{ __html: parsedHtml }} className="w-full h-full" />
                      ) : blobUrl && file.mimeType === 'application/pdf' ? (
                        <div className="w-full h-full text-slate-900 bg-slate-100 flex flex-col items-center custom-scrollbar">
                           <Document
                             file={blobUrl}
                             onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                             className="flex flex-col items-center gap-4 py-8"
                             loading={
                               <div className="flex items-center justify-center p-12 text-slate-500 font-bold uppercase tracking-widest text-xs">
                                 <ZoomIn size={16} className="mr-2 animate-spin" /> Loading PDF...
                               </div>
                             }
                           >
                             {Array.from(new Array(numPages || 0), (el, index) => (
                               <Page 
                                 key={`page_${index + 1}`} 
                                 pageNumber={index + 1} 
                                 width={800}
                                 renderTextLayer={false} 
                                 renderAnnotationLayer={false}
                                 className="shadow-xl"
                               />
                             ))}
                           </Document>
                        </div>
                      ) : blobUrl ? (
                        <object 
                          data={blobUrl} 
                          type={file.mimeType}
                          className="w-full h-full border-0 bg-white" 
                          title={file.name}
                        >
                          <iframe src={blobUrl} className="w-full h-full border-0 bg-white" title={file.name} />
                        </object>
                      ) : null}
                    </div>
                    {(isDragging || isAddingPin || drawMode !== 'none') && (
                      <div className="absolute inset-0 z-10" />
                    )}
                  </div>
                )}
                
                {/* Drawings */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                  {[...(file.drawings || []), currentDrawing].filter(Boolean).map((drawing) => {
                    if (!drawing) return null;
                    if (drawing.type === 'freehand') {
                      const pathData = drawing.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
                      // To use % directly in svg path, we need to map the coordinates using viewBox or scale, 
                      // but standard SVG paths don't support % directly. 
                      // Instead, we will scale the SVG viewBox to 0 0 100 100, so 1 SVG unit = 1% of container.
                      return <path key={drawing.id} d={pathData} stroke={drawing.color} strokeWidth={drawing.strokeWidth} fill="none" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />;
                    }
                    if (drawing.type === 'circle' && drawing.points.length === 2) {
                      const p1 = drawing.points[0];
                      const p2 = drawing.points[1];
                      const dx = p1.x - p2.x;
                      const dy = p1.y - p2.y;
                      const r = Math.sqrt(dx * dx + dy * dy);
                      return <ellipse key={drawing.id} cx={p1.x} cy={p1.y} rx={r} ry={r} stroke={drawing.color} strokeWidth={drawing.strokeWidth} fill="none" vectorEffect="non-scaling-stroke" />;
                    }
                    if (drawing.type === 'rectangle' && drawing.points.length === 2) {
                      const p1 = drawing.points[0];
                      const p2 = drawing.points[1];
                      const x = Math.min(p1.x, p2.x);
                      const y = Math.min(p1.y, p2.y);
                      const w = Math.abs(p1.x - p2.x);
                      const h = Math.abs(p1.y - p2.y);
                      return <rect key={drawing.id} x={x} y={y} width={w} height={h} stroke={drawing.color} strokeWidth={drawing.strokeWidth} fill="none" vectorEffect="non-scaling-stroke" />;
                    }
                    return null;
                  })}
                </svg>

                {/* Image Pins */}
                {(file.pins || []).map((pin) => (
                  <div 
                    key={pin.id}
                    className={`absolute group/pin cursor-pointer transition-transform hover:scale-110 active:scale-95 ${selectedPinId === pin.id ? 'z-30' : 'z-20'}`}
                    style={{ left: `${pin.x}%`, top: `${pin.y}%`, transform: `translate(-50%, -50%)` }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPinId(pin.id);
                    }}
                  >
                    <div className={`relative flex items-center justify-center w-8 h-8 rounded-full border-2 shadow-2xl transition-all ${selectedPinId === pin.id ? 'bg-emerald-500 border-white scale-125' : 'bg-slate-900/80 backdrop-blur-md border-emerald-500 hover:border-white'}`}>
                      <MapPin size={16} className={selectedPinId === pin.id ? 'text-white' : 'text-emerald-400'} />
                    </div>
                    {selectedPinId === pin.id && (
                      <div className="absolute top-full mt-4 left-1/2 -translate-x-1/2 p-3 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg shadow-2xl whitespace-nowrap animate-in slide-in-from-top-2">
                         Active Sync Point
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Instruction Overlay */}
            {!isAddingPin && (file.pins?.length || 0) === 0 && (
              <div className="absolute bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 bg-white/5 backdrop-blur border border-white/10 rounded-2xl pointer-events-none text-slate-400 text-xs font-bold uppercase tracking-widest flex items-center gap-4 animate-pulse">
                <Edit3 size={16} className="text-indigo-400" />
                Click "Add Annotation" to inject technical context into the schematic
              </div>
            )}
          </div>

          {/* Side Panel for Annotations */}
          <div className="w-96 bg-slate-800/30 backdrop-blur-md border-l border-slate-700/50 flex flex-col shrink-0">
            <div className="p-6 border-b border-slate-700/50 bg-slate-900/20 flex items-center justify-between">
              <div>
                <h4 className="font-black text-xs uppercase tracking-[0.2em] text-slate-400">Context Annotations</h4>
                <p className="text-[10px] text-slate-500 font-bold mt-1">({(file.pins || []).length} Points Registered)</p>
              </div>
              <MessageSquare size={18} className="text-slate-600" />
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
              {(file.pins || []).length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-40">
                  <div className="w-16 h-16 rounded-3xl bg-slate-700/30 flex items-center justify-center mb-4">
                    <MapPin size={24} className="text-slate-500" />
                  </div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 leading-relaxed">No specific context injections recorded for this drawing yet.</p>
                </div>
              ) : (
                file.pins?.map((pin) => (
                  <div 
                    key={pin.id} 
                    className={`p-4 rounded-2xl border transition-all duration-300 ${selectedPinId === pin.id ? 'bg-emerald-500/10 border-emerald-500/30 shadow-lg scale-[1.02]' : 'bg-slate-800/40 border-slate-700/50 hover:border-slate-600'}`}
                    onClick={() => setSelectedPinId(pin.id)}
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className={`p-1.5 rounded-lg ${selectedPinId === pin.id ? 'bg-emerald-500 text-white' : 'bg-slate-700 text-emerald-400'}`}>
                          <MapPin size={12} />
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-300">Point {pin.id.split('-')[1].slice(-4)}</span>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDeletePin(pin.id); }}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                    <textarea 
                      value={pin.note}
                      onChange={(e) => handleUpdatePinNote(pin.id, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-full bg-slate-900/50 border border-slate-700/50 rounded-xl p-3 text-xs text-slate-300 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/50 transition-all resize-none h-24 placeholder:italic"
                      placeholder="Describe technical context, failure history, or critical tolerances here..."
                    />
                  </div>
                ))
              )}
            </div>
            
            <div className="p-6 bg-slate-900/40 border-t border-slate-700/50">
               <div className="p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                  <p className="text-[9px] font-black uppercase tracking-[0.15em] text-indigo-400 mb-2 flex items-center gap-2"><Plus size={10}/> Intelligence Note</p>
                  <p className="text-[10px] text-slate-400 leading-relaxed font-medium italic">These annotations are injected directly into the Gemini model as high-weight operational constraints during synthesis.</p>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
