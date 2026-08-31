
import React, { useState, useRef, useEffect } from 'react';
import { InspectionStep, InspectionSheet } from '../types';
import { getGeminiClient, callWithModelFallback } from '../services/geminiService';
import { 
  X, Send, Sparkles, Plus, CheckCircle2, 
  Loader2, ChevronRight, RotateCcw, 
  Target, Info, ClipboardList, Zap, MessageSquare
} from 'lucide-react';

interface InspectionChatbotProps {
  sheet: InspectionSheet;
  onUpdateSteps: (newSteps: InspectionStep[]) => void;
  language: string;
  componentContext?: string;
  failureModeContext?: string;
  maintenanceTaskContext?: string;
}

interface ProposedStepAction {
  id: string;
  type: 'ADD' | 'UPDATE';
  step: Partial<InspectionStep>;
  reason: string;
  applied?: boolean;
}

interface Message {
  role: 'user' | 'model';
  text: string;
  proposals?: ProposedStepAction[];
}

const FormattedMessage: React.FC<{ text: string; role: 'user' | 'model' }> = ({ text, role }) => {
  const lines = (text || '').split('\n');
  
  return (
    <div className={`space-y-2 ${role === 'model' ? 'text-slate-700' : 'text-white'}`}>
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        const cleanLine = line.replace(/\*\*/g, '').replace(/#/g, '').trim();
        if (!cleanLine) return <div key={idx} className="h-2" />;

        const isQuestion = cleanLine.endsWith('?');

        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
          return (
            <div key={idx} className="flex gap-2 pl-2">
              <ChevronRight size={12} className={`shrink-0 mt-1 ${role === 'model' ? 'text-indigo-400' : 'text-white opacity-50'}`} />
              <span className={`flex-1 text-[13px] font-medium leading-relaxed ${isQuestion ? 'text-indigo-700 font-bold italic' : ''}`}>
                {cleanLine.replace(/^[*|-]\s*/, '')}
              </span>
            </div>
          );
        }

        return (
          <p key={idx} className={`leading-relaxed text-[13px] font-medium ${isQuestion && role === 'model' ? 'bg-indigo-50 p-2 rounded-lg border-l-4 border-indigo-600 text-indigo-900 shadow-sm' : ''}`}>
            {cleanLine}
          </p>
        );
      })}
    </div>
  );
};

export const InspectionChatbot: React.FC<InspectionChatbotProps> = ({ 
  sheet, 
  onUpdateSteps, 
  language,
  componentContext,
  failureModeContext,
  maintenanceTaskContext
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [isOpen, messages, isLoading]);

  const parseAIResponse = (text: string): { cleanText: string, proposals?: ProposedStepAction[] } => {
    const actionRegex = /<ACTION>([\s\S]*?)<\/ACTION>/gi;
    const proposals: ProposedStepAction[] = [];
    let match;

    while ((match = actionRegex.exec(text)) !== null) {
      try {
        let content = match[1].trim();
        content = content.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        
        const raw = JSON.parse(content);
        const actions = Array.isArray(raw) ? raw : [raw];
        
        actions.forEach((a: any) => {
          if (a && typeof a === 'object') {
            const stepData = a.step || a.data || (a.description ? a : null);
            if (stepData && stepData.description) {
              proposals.push({
                id: `step-proposal-${Math.random().toString(36).substr(2, 9)}`,
                type: (a.type as any) || 'ADD',
                reason: a.reason || 'Optimal inspection step for this failure mode.',
                step: stepData,
                applied: false
              });
            }
          }
        });
      } catch (e) {
        console.error("Inspection AI parsing error", e);
      }
    }

    const textWithoutActions = text.replace(/<ACTION>[\s\S]*?<\/ACTION>/gi, '').trim();
    return { cleanText: textWithoutActions, proposals: proposals.length > 0 ? proposals : undefined };
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const ai = getGeminiClient();
      
      const prompt = `
        USER REQUEST: "${userMsg}"
        CONTEXT:
        - Component: ${componentContext || 'Unknown'}
        - Failure Mode: ${failureModeContext || 'General'}
        - Proposed Task (PROPOSED ACTION): ${maintenanceTaskContext || 'General maintenance'}
        - Current Steps: ${JSON.stringify(sheet.steps)}
        - Language: ${language}

        INSPECTION PROTOCOL BOT INSTRUCTIONS:
        1. You are an expert maintenance engineer helping to build inspection sheets (MIRA style).
        2. Propose technical, clear, and actionable inspection steps that directly support the "PROPOSED TASK".
        3. Every step addition or update MUST be wrapped in <ACTION> tags with this JSON structure:
           {
             "type": "ADD" | "UPDATE",
             "reason": "Short technical justification",
             "step": {
               "step": number,
               "description": "Specific action to perform",
               "technique": "Visual, Measurement, NDT, etc.",
               "criteria": "Acceptance criteria / normal condition"
             }
           }
        4. Technical strings in JSON MUST be EXCLUSIVELY in ${language}. No English translations allowed.
        5. Responses outside <ACTION> tags should be mentor-like and technical, generated ONLY in ${language}.
      `;

      const response = await callWithModelFallback(
        ['gemini-3.7-flash', 'gemini-2.5-flash'],
        async (model) => {
          return await ai.models.generateContent({
            model,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
              temperature: 0.4,
              systemInstruction: `You are the Inspection Protocol Assistant. You help create rigorous maintenance procedures EXCLUSIVELY in ${language}. NEVER use English unless the target language is English.`
            }
          });
        }
      );

      const { cleanText, proposals } = parseAIResponse(response.text || "");
      setMessages(prev => [...prev, { 
        role: 'model', 
        text: cleanText || "Proposals generated for the inspection sheet.", 
        proposals 
      }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'model', text: "Service interrupted. Please check connection." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const applyAction = (proposalId: string, messageIndex: number) => {
    const message = messages[messageIndex];
    if (!message || !message.proposals) return;

    const proposal = message.proposals.find(p => p.id === proposalId);
    if (!proposal || proposal.applied || !proposal.step) return;

    const newSteps = [...sheet.steps];
    if (proposal.type === 'ADD') {
      const nextNum = newSteps.length > 0 ? Math.max(...newSteps.map(s => s.step)) + 1 : 1;
      newSteps.push({
        id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        step: (proposal.step.step as number) || nextNum,
        description: proposal.step.description || '',
        technique: proposal.step.technique || 'Visual',
        criteria: proposal.step.criteria || ''
      });
    } else if (proposal.type === 'UPDATE' && proposal.step.step !== undefined) {
      const idx = newSteps.findIndex(s => s.step === proposal.step.step);
      if (idx !== -1) {
        newSteps[idx] = { ...newSteps[idx], ...proposal.step } as InspectionStep;
      }
    }

    // Call the parent update first
    onUpdateSteps(newSteps);

    // Then mark as applied in local state
    setMessages(prevMessages => 
      prevMessages.map((m, idx) => {
        if (idx === messageIndex && m.proposals) {
          return {
            ...m,
            proposals: m.proposals.map(p => p.id === proposalId ? { ...p, applied: true } : p)
          };
        }
        return m;
      })
    );
  };

  return (
    <>
      <div className="absolute top-8 left-1/2 -translate-x-1/2 px-4 z-30">
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2 px-6 py-2.5 rounded-2xl shadow-xl transition-all active:scale-95 border-2 ${isOpen ? 'bg-white text-indigo-600 border-indigo-100' : 'bg-slate-900/40 text-white border-white/20 backdrop-blur-md hover:bg-slate-900/60 hover:border-white/30'}`}
        >
          <MessageSquare size={16} className={isOpen ? 'text-indigo-600' : 'text-indigo-400'} />
          <span className="text-[10px] font-black uppercase tracking-widest">{isOpen ? 'Close MIRA' : 'MIRA Assistant'}</span>
        </button>
      </div>

      {isOpen && (
        <div className="absolute top-24 right-10 z-30 w-80 h-[30rem] bg-white rounded-3xl shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-top-4 duration-300">
          <div className="bg-slate-900 px-5 py-4 flex justify-between items-center text-white shrink-0">
             <div className="flex items-center gap-2">
                <Zap size={16} className="text-indigo-400 fill-indigo-400" />
                <span className="text-[10px] font-black uppercase tracking-widest">Inspection Assistant</span>
             </div>
             <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-white transition-colors"><X size={16} /></button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/30 custom-scrollbar">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center p-6 opacity-40">
                <ClipboardList size={32} className="text-slate-300 mb-2" />
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest leading-tight">Ask me to add inspection steps or refine the criteria.</p>
              </div>
            )}

            {messages.map((m, mIdx) => (
              <div key={mIdx} className={`flex flex-col gap-2 ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`p-3 rounded-2xl text-xs font-medium ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-slate-800 border border-slate-100 rounded-tl-none shadow-sm'}`}>
                  <FormattedMessage text={m.text} role={m.role} />
                </div>

                {m.proposals && m.proposals.length > 0 && (
                  <div className="w-full space-y-2 mt-1">
                    {m.proposals.map((p) => (
                      <div key={p.id} className={`p-4 rounded-2xl border bg-white shadow-xl relative overflow-hidden group/card ${p.applied ? 'border-emerald-200 bg-emerald-50/20' : 'border-indigo-100'}`}>
                        {p.applied && <div className="absolute inset-0 bg-emerald-50/90 backdrop-blur-sm z-10 flex items-center justify-center font-black text-emerald-600 text-[9px] uppercase tracking-widest"><CheckCircle2 size={14} className="mr-2" /> Added</div>}
                        
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-1.5 py-0.5 rounded">Proposal</span>
                          <span className="text-[8px] text-slate-400 font-bold uppercase">{p.type} Step {p.step?.step}</span>
                        </div>

                        <p className="text-[10px] font-black text-slate-900 uppercase leading-snug mb-2">{p.step?.description}</p>
                        <div className="flex flex-wrap gap-1 mb-3">
                           <span className="text-[7px] font-black px-1.5 py-0.5 bg-slate-100 rounded uppercase">{p.step?.technique}</span>
                           <span className="text-[7px] font-black px-1.5 py-0.5 bg-emerald-50 text-emerald-700 rounded uppercase truncate max-w-[120px]">{p.step?.criteria}</span>
                        </div>

                        {!p.applied && (
                          <button 
                            onClick={() => applyAction(p.id, mIdx)}
                            className="w-full py-2 bg-slate-900 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 transition-all flex items-center justify-center gap-2 active:scale-95"
                          >
                            <Plus size={14} /> Add Step
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white px-3 py-2 rounded-xl border border-slate-100 shadow-sm flex items-center gap-2">
                  <Loader2 size={12} className="animate-spin text-indigo-600" />
                  <span className="text-[9px] font-black text-slate-400 uppercase italic">Suggesting...</span>
                </div>
              </div>
            )}
          </div>

          <div className="p-4 bg-white border-t border-slate-50 flex gap-2">
            <input 
              type="text" 
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Refine steps..."
              className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs focus:bg-white focus:border-indigo-600 outline-none transition-all placeholder:text-slate-300 font-medium"
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="p-2 bg-slate-900 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-30 transition-all active:scale-95"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
