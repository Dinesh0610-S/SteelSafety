import { useState } from 'react';
import { MessageSquare, Send, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';

interface Citation {
  source: string;
  title: string;
  content: string;
  score: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  loading?: boolean;
}

interface ChatPanelProps {
  selectedZoneId: string | null;
  selectedZoneName: string;
}

const SUGGESTED_QUERIES = [
  { label: "Why is Gas Collection Main critical?", text: "Why is Gas Collection Main critical right now?", zoneId: "zone_gcm" },
  { label: "What does OISD say about hot work?", text: "What does OISD say about hot-work gas checks?" },
  { label: "Tell me about H2S odor fatigue.", text: "What are the risks of H2S odor fatigue?" },
];

export function ChatPanel({ selectedZoneId, selectedZoneName }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: "Hello! I am your SteelSafe Safety Officer RAG Agent. Ask me about active zone hazards, permit requirements, or safety compliance documents (OISD, Factories Act).",
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedCitationId, setExpandedCitationId] = useState<string | null>(null);

  const handleSend = async (text: string, forceZoneId?: string) => {
    if (!text.trim() || loading) return;

    const userMsgId = Date.now().toString();
    const userMsg: Message = { id: userMsgId, role: 'user', content: text };
    
    const botMsgId = (Date.now() + 1).toString();
    const botMsg: Message = { id: botMsgId, role: 'assistant', content: '', loading: true };

    setMessages(prev => [...prev, userMsg, botMsg]);
    setInput('');
    setLoading(true);

    const activeZone = forceZoneId || selectedZoneId;

    try {
      const response = await fetch('/api/v1/chat/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: text,
          zone_id: activeZone || undefined
        })
      });

      if (!response.ok) {
        throw new Error('RAG server connection error');
      }

      const data = await response.json();
      
      setMessages(prev => prev.map(m => {
        if (m.id === botMsgId) {
          return {
            ...m,
            content: data.answer,
            citations: data.citations || [],
            loading: false
          };
        }
        return m;
      }));
    } catch (e) {
      setMessages(prev => prev.map(m => {
        if (m.id === botMsgId) {
          return {
            ...m,
            content: "Error: Failed to fetch compliance answer. Please verify the backend is running.",
            loading: false
          };
        }
        return m;
      }));
    } finally {
      setLoading(false);
    }
  };

  const toggleCitation = (msgId: string) => {
    setExpandedCitationId(expandedCitationId === msgId ? null : msgId);
  };

  return (
    <div className="card-soft-base p-5 flex flex-col h-[560px]">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-theme-border pb-3 mb-3">
        <div className="p-2 rounded-xl bg-theme-accent-bg border border-theme-accent-light">
          <MessageSquare className="h-4.5 w-4.5 text-theme-accent" />
        </div>
        <div>
          <h2 className="text-xs font-bold text-theme-text tracking-wide uppercase">Safety Compliance RAG</h2>
          <p className="text-[10px] text-theme-text-muted font-semibold">Dual-Mode Grounded Assistant</p>
        </div>
      </div>

      {/* Messages Window */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3.5 scrollbar-thin">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col max-w-[92%] ${
              msg.role === 'user' ? 'self-end items-end ml-auto' : 'self-start items-start mr-auto'
            }`}
          >
            <div
              className={`p-3 rounded-2xl text-xs leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-theme-accent text-white rounded-tr-none shadow-md shadow-theme-accent/20'
                  : 'bg-theme-bg text-theme-text border border-theme-border rounded-tl-none shadow-sm'
              }`}
            >
              {msg.loading ? (
                <div className="flex items-center gap-1.5 py-1">
                  <span className="h-1.5 w-1.5 bg-theme-accent/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 bg-theme-accent/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 bg-theme-accent/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              ) : (
                msg.content
              )}
            </div>

            {/* Citations Box */}
            {msg.citations && msg.citations.length > 0 && (
              <div className="mt-1.5 w-full text-[10px] px-1">
                <button
                  onClick={() => toggleCitation(msg.id)}
                  className="flex items-center gap-1 text-theme-accent hover:text-theme-accent-hover font-bold transition-colors"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  <span>{msg.citations.length} regulatory citations</span>
                  {expandedCitationId === msg.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>

                {expandedCitationId === msg.id && (
                  <div className="mt-2 bg-theme-card border border-theme-border rounded-2xl p-3 space-y-2 text-theme-text-secondary shadow-md animate-slideDown">
                    {msg.citations.map((cit, idx) => (
                      <div key={idx} className="border-b border-theme-border-muted pb-2 last:border-b-0 last:pb-0">
                        <div className="flex justify-between items-center text-[9px] text-theme-accent font-bold mb-1">
                          <span>{cit.source}</span>
                          <span className="text-[8px] bg-theme-accent-bg px-2 py-0.5 rounded-full border border-theme-accent-light font-extrabold">
                            Match: {(cit.score * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-[9px] leading-relaxed italic bg-theme-bg-alt p-2 rounded-xl border border-theme-border text-theme-text-muted font-medium">
                          "{cit.content.length > 140 ? cit.content.substring(0, 140) + '...' : cit.content}"
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Suggested Questions Pills */}
      <div className="my-2.5 border-t border-theme-border pt-2 flex flex-wrap gap-1">
        {SUGGESTED_QUERIES.map((sq, i) => (
          <button
            key={i}
            onClick={() => handleSend(sq.text, sq.zoneId)}
            disabled={loading}
            className="text-[9px] bg-theme-card border border-theme-border hover:bg-theme-card-hover text-theme-text-secondary hover:text-theme-text font-semibold px-2.5 py-1 rounded-full transition-all text-left flex items-center gap-1 disabled:opacity-50 disabled:pointer-events-none shadow-sm active:scale-[0.98]"
          >
            <span>{sq.label}</span>
          </button>
        ))}
      </div>

      {/* Input controls */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend(input);
        }}
        className="flex gap-2 border-t border-theme-border pt-3"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={selectedZoneId ? `Query ${selectedZoneName}...` : "Ask a safety question..."}
          disabled={loading}
          className="flex-1 bg-theme-bg-alt border border-theme-border focus:bg-theme-card focus:border-theme-accent focus:outline-none rounded-2xl px-3.5 py-2 text-xs text-theme-text placeholder-theme-text-muted disabled:opacity-50 shadow-inner"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="p-2.5 bg-theme-accent hover:bg-theme-accent-hover disabled:bg-theme-bg-alt text-white disabled:text-theme-text-muted rounded-2xl transition-all shadow-md disabled:shadow-none active:scale-[0.98]"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
