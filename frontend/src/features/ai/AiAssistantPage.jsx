import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api/client';
import {
  Bot,
  Send,
  Sparkles,
  AlertCircle,
  Clock,
  CheckCircle2,
  Layers,
  Shield,
  Loader2,
  Trash2,
  ArrowRight,
} from 'lucide-react';

const SUGGESTED_PROMPTS = [
  'Which tasks are overdue?',
  'What are the most urgent tasks?',
  "Summarize today's activities",
  'Show tasks that are still pending',
  'Summarize work completed by this team',
  "Summarize a selected board's progress",
];

export function AiAssistantPage() {
  const { activeOrg, activeTenant } = useAuth();
  const [boards, setBoards] = useState([]);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const abortControllerRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Scroll to bottom when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Load boards for the active tenant
  useEffect(() => {
    let isSubscribed = true;

    async function loadBoards() {
      if (!activeTenant?.id) return;
      try {
        const res = await api.get('/boards');
        if (isSubscribed && res?.data) {
          setBoards(res.data);
        }
      } catch (err) {
        console.error('Failed to load boards for AI selector:', err);
      }
    }

    loadBoards();

    return () => {
      isSubscribed = false;
    };
  }, [activeTenant?.id]);

  // Strict tenant-switch isolation: cancel in-flight requests, clear history & reset board
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setMessages([]);
    setSelectedBoardId('');
    setError(null);
    setLoading(false);
  }, [activeTenant?.id]);

  const handleSendMessage = async (textToSend) => {
    const query = (textToSend || inputMessage).trim();
    if (!query || loading) return;

    // Reset input
    setInputMessage('');
    setError(null);

    // Append user message
    const userMsgId = `user-${Date.now()}`;
    const userMsg = {
      id: userMsgId,
      sender: 'user',
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    // Setup abort controller for in-flight cancellation
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const payload = {
        message: query,
        boardId: selectedBoardId || undefined,
      };

      const res = await api.post('/ai/chat', payload, { signal: controller.signal });

      if (res?.data) {
        const aiMsg = {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: res.data.answer,
          toolsUsed: res.data.toolsUsed || [],
          contextMeta: res.data.contextMeta || {},
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        };
        setMessages((prev) => [...prev, aiMsg]);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('AI request aborted due to tenant switch or navigation');
        return;
      }
      setError(err.message || 'Unable to connect to AI Assistant service.');
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] bg-slate-900 text-slate-100 overflow-hidden">
      {/* Top Banner / Workspace Context Bar */}
      <div className="bg-slate-800/80 border-b border-slate-700/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-white tracking-tight">AI Kanban Assistant</h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Shield className="w-3 h-3" />
                Read-Only
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Workspace: <span className="text-slate-200 font-medium">{activeTenant?.name || 'General Workspace'}</span>
              {activeOrg?.name && <span className="text-slate-500"> ({activeOrg.name})</span>}
            </p>
          </div>
        </div>

        {/* Board Scope Selector & Action Controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="ai-board-select" className="text-xs text-slate-400 font-medium">
              Board Scope:
            </label>
            <select
              id="ai-board-select"
              value={selectedBoardId}
              onChange={(e) => setSelectedBoardId(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-lg px-3 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-brand-500"
            >
              <option value="">All Tenant Boards ({boards.length})</option>
              {boards.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors text-xs flex items-center gap-1.5"
              title="Clear chat history"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Conversation Stream */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto py-8 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shadow-inner">
              <Sparkles className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">How can I assist your team today?</h2>
            <p className="text-sm text-slate-400 mb-6">
              I can analyze your active board progress, identify overdue tasks, summarize recent changes, and surface team priorities in real time.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left max-w-xl mx-auto">
              {SUGGESTED_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSendMessage(prompt)}
                  className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 hover:border-brand-500/40 text-xs text-slate-300 hover:text-white transition-all group cursor-pointer"
                >
                  <span className="line-clamp-1">{prompt}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-brand-400 shrink-0 ml-2 transition-transform group-hover:translate-x-0.5" />
                </button>
              ))}
            </div>

            <div className="mt-8 flex items-center justify-center gap-2 text-[11px] text-slate-500">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>Read-only assistant. Cannot modify or delete your Kanban cards or workflows.</span>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'ai' && (
                  <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-xs ${
                    msg.sender === 'user'
                      ? 'bg-brand-600 text-white rounded-tr-xs'
                      : 'bg-slate-800/90 border border-slate-700/70 text-slate-200 rounded-tl-xs'
                  }`}
                >
                  {/* Message Content */}
                  <div className="whitespace-pre-wrap leading-relaxed text-[13px] prose prose-invert prose-sm max-w-none">
                    {msg.text}
                  </div>

                  {/* AI Metadata & Tools Used Footer */}
                  {msg.sender === 'ai' && (
                    <div className="mt-3 pt-2.5 border-t border-slate-700/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-slate-500 font-medium">Tools:</span>
                            {msg.toolsUsed.map((tool, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 rounded-md bg-slate-700/60 text-slate-300 font-mono text-[10px] border border-slate-600/40"
                              >
                                {tool}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-slate-500">
                        {msg.contextMeta?.totalTasks !== undefined && (
                          <span>{msg.contextMeta.totalTasks} tasks analyzed</span>
                        )}
                        <span>{msg.timestamp}</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex items-center gap-3 text-slate-400 text-xs">
                <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0">
                  <Loader2 className="w-4 h-4 animate-spin" />
                </div>
                <div className="flex items-center gap-1.5 bg-slate-800/50 px-3.5 py-2 rounded-xl border border-slate-700/40">
                  <span className="animate-pulse">Analyzing workspace tasks and activity history...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Error Alert Banner */}
      {error && (
        <div className="mx-6 mb-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-rose-300 font-medium cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Input Area */}
      <div className="p-4 bg-slate-800/90 border-t border-slate-700/70 shrink-0">
        <div className="max-w-3xl mx-auto flex items-end gap-2.5">
          <div className="flex-1 relative">
            <textarea
              rows={1}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about this workspace (e.g. Which tasks are overdue?)..."
              disabled={loading}
              className="w-full bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-xl px-4 py-3 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-brand-500 resize-none transition-all disabled:opacity-50"
            />
          </div>

          <button
            onClick={() => handleSendMessage()}
            disabled={!inputMessage.trim() || loading}
            className="h-[42px] px-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:hover:bg-brand-600 text-white text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer shrink-0 shadow-xs"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            <span className="hidden sm:inline">Ask</span>
          </button>
        </div>
      </div>
    </div>
  );
}
export default AiAssistantPage;
