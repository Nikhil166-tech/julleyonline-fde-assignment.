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
  ChevronDown,
  ChevronRight,
  Lock,
  Globe,
  AlertTriangle,
  Calendar,
  User,
  Info,
} from 'lucide-react';

const SUGGESTED_PROMPTS = [
  'Which tasks are overdue?',
  'What are the most urgent tasks?',
  "Summarize today's activities",
  'Show tasks that are still pending',
  'Summarize work completed by this team',
  "Summarize a selected board's progress",
];

/**
 * Safe, robust inline Markdown parser.
 * Renders paragraphs, headings, bullet lists, bold (**text**), italic (*text*),
 * code (`code`), and blockquotes (> quote) without raw HTML injection.
 */
function FormattedMarkdown({ content }) {
  if (!content) return null;

  const lines = content.split('\n');
  const elements = [];
  let currentList = [];

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`list-${elements.length}`} className="my-2 space-y-1.5 list-none pl-1">
          {currentList.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-slate-200">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400 mt-2 shrink-0" />
              <span className="flex-1 leading-relaxed">{renderInlineMarkdown(item)}</span>
            </li>
          ))}
        </ul>
      );
      currentList = [];
    }
  };

  const renderInlineMarkdown = (text) => {
    // Split by inline code, bold, italic
    const parts = [];
    let remaining = text;
    let keyIdx = 0;

    // Pattern for `code`, **bold**, *italic*
    const inlineRegex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
    let match;
    let lastIndex = 0;

    while ((match = inlineRegex.exec(remaining)) !== null) {
      if (match.index > lastIndex) {
        parts.push(remaining.substring(lastIndex, match.index));
      }
      const token = match[0];
      if (token.startsWith('`') && token.endsWith('`')) {
        parts.push(
          <code
            key={keyIdx++}
            className="px-1.5 py-0.5 rounded bg-slate-900/80 text-brand-300 font-mono text-[11px] border border-slate-700/60"
          >
            {token.slice(1, -1)}
          </code>
        );
      } else if (token.startsWith('**') && token.endsWith('**')) {
        parts.push(
          <strong key={keyIdx++} className="font-semibold text-white">
            {token.slice(2, -2)}
          </strong>
        );
      } else if (token.startsWith('*') && token.endsWith('*')) {
        parts.push(
          <em key={keyIdx++} className="italic text-slate-300">
            {token.slice(1, -1)}
          </em>
        );
      }
      lastIndex = inlineRegex.lastIndex;
    }

    if (lastIndex < remaining.length) {
      parts.push(remaining.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Heading (e.g. ### Title)
    if (trimmed.startsWith('### ')) {
      flushList();
      elements.push(
        <h3 key={`h3-${i}`} className="text-sm font-semibold text-white mt-3 mb-1.5 tracking-tight flex items-center gap-1.5">
          {renderInlineMarkdown(trimmed.replace(/^###\s+/, ''))}
        </h3>
      );
      continue;
    }

    // Bullet items
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      currentList.push(trimmed.slice(2));
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      flushList();
      elements.push(
        <div
          key={`quote-${i}`}
          className="my-2 p-2.5 rounded-lg bg-slate-800/60 border-l-2 border-brand-500 text-xs text-slate-300 italic"
        >
          {renderInlineMarkdown(trimmed.slice(2))}
        </div>
      );
      continue;
    }

    // Regular paragraph
    flushList();
    elements.push(
      <p key={`p-${i}`} className="my-1.5 leading-relaxed text-slate-200">
        {renderInlineMarkdown(trimmed)}
      </p>
    );
  }

  flushList();
  return <div className="space-y-1">{elements}</div>;
}

/**
 * Priority Badge Helper
 */
function PriorityBadge({ priority }) {
  const p = (priority || '').toUpperCase();
  const styles = {
    URGENT: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    HIGH: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    MEDIUM: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    LOW: 'bg-slate-700/50 text-slate-300 border-slate-600/40',
  };
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide border uppercase ${
        styles[p] || styles.LOW
      }`}
    >
      {p || 'NORMAL'}
    </span>
  );
}

/**
 * Specialized Response Presentation Widgets
 */
function StructuredAnswerWidget({ responseType, structuredData, dataScope }) {
  if (!structuredData) return null;

  // 1. Overdue Summary Widget
  if (responseType === 'overdue_summary') {
    const {
      tasksAnalyzed = 0,
      overdueCount = 0,
      tasksWithDueDates = 0,
      tasksWithoutDueDates = 0,
      tasks = [],
    } = structuredData;

    return (
      <div className="mt-3 space-y-3">
        {/* Metric Cards */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-700/50">
            <span className="text-[10px] text-slate-400 block font-medium">Analyzed Tasks</span>
            <span className="text-sm font-bold text-white">{tasksAnalyzed}</span>
          </div>
          <div
            className={`p-2 rounded-xl border ${
              overdueCount > 0
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            }`}
          >
            <span className="text-[10px] block font-medium opacity-80">Overdue</span>
            <span className="text-sm font-bold">{overdueCount}</span>
          </div>
          <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-700/50">
            <span className="text-[10px] text-slate-400 block font-medium">With Due Date</span>
            <span className="text-sm font-bold text-slate-200">{tasksWithDueDates}</span>
          </div>
        </div>

        {/* Case A Notice: Zero Due Dates Configured */}
        {tasksWithDueDates === 0 && tasksAnalyzed > 0 && (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2 text-xs text-amber-300">
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
            <span>
              No due dates are set on any task in this workspace. Set due dates on your Kanban cards to enable deadline monitoring.
            </span>
          </div>
        )}

        {/* Overdue Task Cards List */}
        {tasks.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Overdue Items:
            </span>
            {tasks.map((t) => (
              <div
                key={t.id}
                className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/70 hover:border-slate-600 transition-colors flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <PriorityBadge priority={t.priority} />
                  <span className="text-xs font-medium text-white truncate">{t.title}</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400 shrink-0">
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700/60">
                    {t.column}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-medium text-[10px] border border-rose-500/30">
                    {t.daysPastDue}d overdue
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 2. Board Summary Widget
  if (responseType === 'board_summary') {
    const total = structuredData.total_tasks || 0;
    const completed = structuredData.completed_tasks || 0;
    const pending = structuredData.pending_tasks || 0;
    const overdue = structuredData.overdue_tasks || 0;
    const pct = structuredData.completion_percentage || 0;
    const byColumn = structuredData.by_column || {};

    return (
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-700/50">
            <span className="text-[10px] text-slate-400 block font-medium">Total</span>
            <span className="text-sm font-bold text-white">{total}</span>
          </div>
          <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-700/50">
            <span className="text-[10px] text-slate-400 block font-medium">Pending</span>
            <span className="text-sm font-bold text-amber-400">{pending}</span>
          </div>
          <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-700/50">
            <span className="text-[10px] text-slate-400 block font-medium">Completed</span>
            <span className="text-sm font-bold text-emerald-400">{completed} ({pct}%)</span>
          </div>
          <div className="p-2 rounded-xl bg-slate-900/60 border border-slate-700/50">
            <span className="text-[10px] text-slate-400 block font-medium">Overdue</span>
            <span className={`text-sm font-bold ${overdue > 0 ? 'text-rose-400' : 'text-slate-300'}`}>{overdue}</span>
          </div>
        </div>

        {/* Column breakdown */}
        {Object.keys(byColumn).length > 0 && (
          <div className="p-2.5 rounded-xl bg-slate-900/50 border border-slate-800 text-xs">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
              Column Distribution:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(byColumn).map(([col, cnt]) => (
                <span
                  key={col}
                  className="px-2 py-1 rounded-lg bg-slate-800/90 border border-slate-700 text-slate-300 text-[11px] flex items-center gap-1.5"
                >
                  <span className="font-medium text-white">{col}:</span>
                  <span className="text-brand-400 font-semibold">{cnt}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. Task List Widget
  if (responseType === 'task_list') {
    const tasks = structuredData.tasks || [];
    if (tasks.length === 0) return null;

    return (
      <div className="mt-3 space-y-1.5">
        {tasks.map((t) => (
          <div
            key={t.id}
            className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700/70 hover:border-slate-600 transition-colors flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <PriorityBadge priority={t.priority} />
              <span className="text-xs font-medium text-white truncate">{t.title}</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-400 shrink-0">
              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] border border-slate-700/60">
                {t.column}
              </span>
              {t.dueDate && (
                <span className="text-[10px] text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  {t.dueDate.slice(0, 10)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // 4. Activity Summary Widget
  if (responseType === 'activity_summary') {
    const activities = structuredData.activities || [];
    if (activities.length === 0) return null;

    return (
      <div className="mt-3 space-y-1.5">
        {activities.slice(0, 5).map((a) => (
          <div
            key={a.id}
            className="p-2 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-2 text-xs"
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-6 h-6 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center font-bold text-[10px] shrink-0">
                {a.actor?.[0]?.toUpperCase() || 'U'}
              </div>
              <span className="text-slate-200 font-medium truncate">{a.actor}</span>
              <span className="text-slate-400 text-[11px] truncate">
                {a.action?.replace('_', ' ').toLowerCase()}
              </span>
            </div>
            <span className="text-[10px] text-slate-500 shrink-0">
              {new Date(a.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // 5. Scope Notice Widget (Case B)
  if (responseType === 'scope_notice') {
    return (
      <div className="mt-2.5 p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-xs flex items-start gap-2.5">
        <Globe className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-indigo-200 block mb-0.5">Workspace Boundary Enforced</span>
          <p className="text-indigo-300/80 leading-relaxed text-[11px]">
            {structuredData.reason || 'To view other workspaces, switch your active tenant using the workspace selector.'}
          </p>
        </div>
      </div>
    );
  }

  // 6. Security Notice Widget (Case C)
  if (responseType === 'security_notice') {
    return (
      <div className="mt-2.5 p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 text-xs flex items-start gap-2.5">
        <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold text-amber-200 block mb-0.5">Credential Protection Active</span>
          <p className="text-amber-300/80 leading-relaxed text-[11px]">
            {structuredData.reason || 'User passwords and private security credentials cannot be retrieved or revealed.'}
          </p>
        </div>
      </div>
    );
  }

  return null;
}

export function AiAssistantPage() {
  const { activeOrg, activeTenant } = useAuth();
  const [boards, setBoards] = useState([]);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expandedDetails, setExpandedDetails] = useState({});

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
    setExpandedDetails({});
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
          responseType: res.data.responseType || 'general_answer',
          text: res.data.answer,
          structuredData: res.data.structuredData || null,
          toolsUsed: res.data.toolsUsed || [],
          recordsAnalyzed: res.data.recordsAnalyzed,
          dataScope: res.data.dataScope || activeTenant?.name || 'Workspace',
          confidence: res.data.confidence || 'high',
          generation: res.data.generation || { source: 'local', model: null, fallbackUsed: false },
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
    // Enter without Shift sends the message; Shift+Enter creates a new line
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearChat = () => {
    setMessages([]);
    setError(null);
    setExpandedDetails({});
  };

  const toggleDetails = (msgId) => {
    setExpandedDetails((prev) => ({
      ...prev,
      [msgId]: !prev[msgId],
    }));
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-4rem)] bg-slate-900 text-slate-100 overflow-hidden">
      {/* Top Banner / Workspace Context Bar */}
      <div className="bg-slate-800/80 border-b border-slate-700/60 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-semibold text-white tracking-tight">AI Kanban Assistant</h1>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Shield className="w-3 h-3" />
                Read-Only
              </span>
            </div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1.5 flex-wrap">
              <span>Workspace:</span>
              <span className="text-slate-200 font-medium">{activeTenant?.name || 'General Workspace'}</span>
              {activeOrg?.name && <span className="text-slate-500">({activeOrg.name})</span>}
            </p>
          </div>
        </div>

        {/* Board Scope Selector & Action Controls */}
        <div className="flex items-center gap-2.5 ml-auto sm:ml-0">
          <div className="flex items-center gap-1.5">
            <label htmlFor="ai-board-select" className="text-xs text-slate-400 font-medium hidden md:inline">
              Scope:
            </label>
            <select
              id="ai-board-select"
              value={selectedBoardId}
              onChange={(e) => setSelectedBoardId(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-xs text-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-hidden focus:ring-1 focus:ring-brand-500"
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
              className="px-2.5 py-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 rounded-lg transition-colors text-xs flex items-center gap-1.5 border border-slate-700/50"
              title="Clear conversation"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Conversation Stream */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6 space-y-6">
        {messages.length === 0 ? (
          <div className="max-w-2xl mx-auto py-8 text-center">
            <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shadow-inner">
              <Sparkles className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-semibold text-white mb-2">How can I assist your team today?</h2>
            <p className="text-xs sm:text-sm text-slate-400 mb-6 max-w-md mx-auto">
              Ask about overdue deadlines, active sprint progress, urgent priorities, or recent team activity across this workspace.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-left max-w-xl mx-auto">
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
              <span>Read-only assistant. Cannot mutate or delete cards, workflows, or tenant settings.</span>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-5">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'ai' && (
                  <div className="w-8 h-8 rounded-lg bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shrink-0 mt-0.5">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[90%] sm:max-w-[85%] rounded-2xl px-4 py-3.5 text-xs sm:text-sm shadow-xs ${
                    msg.sender === 'user'
                      ? 'bg-brand-600 text-white rounded-tr-xs'
                      : 'bg-slate-800/95 border border-slate-700/70 text-slate-200 rounded-tl-xs'
                  }`}
                >
                  {/* Message Content with clean Markdown parser */}
                  <div className="leading-relaxed">
                    <FormattedMarkdown content={msg.text} />
                  </div>

                  {/* Specialized Structured Presentation Widget */}
                  {msg.sender === 'ai' && (
                    <StructuredAnswerWidget
                      responseType={msg.responseType}
                      structuredData={msg.structuredData}
                      dataScope={msg.dataScope}
                    />
                  )}

                  {/* Clean AI Metadata & Subtle Expandable Disclosure Footer */}
                  {msg.sender === 'ai' && (
                    <div className="mt-3 pt-2.5 border-t border-slate-700/50 flex flex-col gap-1.5 text-[11px] text-slate-400">
                      {/* Subtle fallback indicator when fallbackUsed is true */}
                      {msg.generation?.fallbackUsed && (
                        <div
                          data-testid="ai-fallback-indicator"
                          className="flex items-center gap-1.5 text-[11px] text-amber-400/90 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-md mb-1 w-fit"
                        >
                          <Info className="w-3.5 h-3.5 shrink-0" />
                          <span>Answered using local workspace analysis.</span>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 text-slate-400">
                          {msg.recordsAnalyzed !== null && msg.recordsAnalyzed !== undefined && msg.recordsAnalyzed > 0 && (
                            <span className="font-medium text-slate-300">
                              {msg.recordsAnalyzed} tasks analyzed
                            </span>
                          )}
                          <span>• Scope: {msg.dataScope}</span>
                          <span>• {msg.timestamp}</span>
                        </div>

                        {/* Subtle Expandable Tool Details Disclosure */}
                        {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                          <button
                            onClick={() => toggleDetails(msg.id)}
                            className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <span>How this answer was generated</span>
                            {expandedDetails[msg.id] ? (
                              <ChevronDown className="w-3 h-3 text-slate-400" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-slate-400" />
                            )}
                          </button>
                        )}
                      </div>

                      {/* Expanded Technical Tool Details */}
                      {expandedDetails[msg.id] && (
                        <div className="mt-1.5 p-2 rounded-lg bg-slate-900/60 border border-slate-800 text-[10px] space-y-1">
                          {msg.generation && (
                            <div className="flex items-center gap-1.5" data-testid="ai-generation-source">
                              <span className="text-slate-400">Generation Source:</span>
                              <span className="font-medium text-slate-300">
                                {msg.generation.source === 'llm'
                                  ? `Gemini (${msg.generation.model || 'gemini-2.5-flash'})`
                                  : msg.generation.fallbackUsed
                                  ? `Local Deterministic Fallback`
                                  : msg.generation.source === 'guardrail'
                                  ? 'Security Guardrail'
                                  : 'Local Deterministic Engine'}
                              </span>
                            </div>
                          )}
                          {msg.toolsUsed && msg.toolsUsed.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">Allowlisted Tools:</span>
                              {msg.toolsUsed.map((tool, i) => (
                                <span
                                  key={i}
                                  className="px-1.5 py-0.5 rounded bg-slate-800 text-brand-300 font-mono border border-slate-700/70"
                                >
                                  {tool}
                                </span>
                              ))}
                            </div>
                          )}
                          <div className="text-slate-500">
                            Confidence: <span className="text-slate-300 capitalize">{msg.confidence}</span>
                          </div>
                        </div>
                      )}
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
        <div className="mx-4 sm:mx-6 mb-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between gap-2">
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

      {/* Input Composer Area */}
      <div className="p-3 sm:p-4 bg-slate-800/90 border-t border-slate-700/70 shrink-0">
        <div className="max-w-3xl mx-auto flex items-end gap-2.5">
          <div className="flex-1 relative">
            <textarea
              rows={2}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question about this workspace (e.g. Which tasks are overdue?)... [Enter to send, Shift+Enter for newline]"
              disabled={loading}
              className="w-full bg-slate-900 border border-slate-700 focus:border-brand-500 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:ring-1 focus:ring-brand-500 resize-none transition-all disabled:opacity-50"
            />
          </div>

          <button
            data-testid="ai-ask-btn"
            onClick={() => handleSendMessage()}
            disabled={!inputMessage.trim() || loading}
            className="h-[44px] px-4 rounded-xl bg-brand-600 hover:bg-brand-500 disabled:opacity-50 disabled:hover:bg-brand-600 text-white text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer shrink-0 shadow-xs"
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
