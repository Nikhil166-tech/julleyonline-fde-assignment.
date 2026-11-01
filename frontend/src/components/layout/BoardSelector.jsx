import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  LayoutGrid,
  ChevronDown,
  Check,
  Search,
  Plus,
  Layers,
  Calendar,
  X,
} from 'lucide-react';
import { Dropdown } from '../ui/Dropdown';

export function BoardSelector({
  boards = [],
  currentBoardId,
  onSelectBoard,
  onCreateBoard,
  canCreateBoard = true,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef(null);

  const activeBoard = useMemo(
    () => boards.find((b) => b.id === currentBoardId) || boards[0] || null,
    [boards, currentBoardId]
  );

  // Filter boards based on search query (name or short ID)
  const filteredBoards = useMemo(() => {
    if (!searchQuery.trim()) return boards;
    const q = searchQuery.toLowerCase().trim();
    return boards.filter(
      (b) =>
        b.name.toLowerCase().includes(q) ||
        b.id.toLowerCase().includes(q)
    );
  }, [boards, searchQuery]);

  return (
    <Dropdown
      align="right"
      width="w-80"
      trigger={({ isOpen }) => (
        <button
          type="button"
          data-testid="board-selector-trigger"
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
            isOpen
              ? 'border-brand-500 bg-brand-50/50 text-brand-900 ring-2 ring-brand-100'
              : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs'
          }`}
          title="Switch active board"
        >
          <LayoutGrid className="w-3.5 h-3.5 text-brand-600 shrink-0" />
          <span className="max-w-[130px] sm:max-w-[170px] truncate font-semibold text-slate-800">
            {activeBoard?.name || 'Select Board'}
          </span>
          {boards.length > 1 && (
            <span className="bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded text-[10px] font-mono">
              {boards.length}
            </span>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${
              isOpen ? 'rotate-180 text-brand-600' : ''
            }`}
          />
        </button>
      )}
    >
      {({ close }) => (
        <div data-testid="board-selector-dropdown" className="p-2 space-y-2">
          {/* Header */}
          <div className="flex items-center justify-between px-1.5 pt-0.5">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Switch Board
            </span>
            <span className="text-[11px] font-medium text-slate-400">
              {filteredBoards.length} of {boards.length}
            </span>
          </div>

          {/* Search Input (visible when >= 1 boards) */}
          {boards.length > 0 && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                data-testid="board-search-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search boards by name or ID..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg placeholder-slate-400 text-slate-800 focus:outline-none focus:border-brand-500 focus:bg-white"
                autoFocus
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Scrollable Boards List */}
          <div className="max-h-60 overflow-y-auto space-y-1 pr-0.5">
            {filteredBoards.length > 0 ? (
              filteredBoards.map((b) => {
                const isSelected = b.id === currentBoardId;
                const shortId = b.id.slice(0, 8);
                const columnCount = b.columns?.length ?? b._count?.columns ?? 0;
                const taskCount =
                  b.tasksCount ??
                  b._count?.tasks ??
                  b.columns?.reduce((acc, c) => acc + (c.tasks?.length || 0), 0) ??
                  0;

                return (
                  <button
                    key={b.id}
                    type="button"
                    data-testid={`board-item-${b.id}`}
                    onClick={() => {
                      onSelectBoard(b.id);
                      setSearchQuery('');
                      close();
                    }}
                    className={`w-full flex items-start justify-between p-2 rounded-xl text-left transition-colors ${
                      isSelected
                        ? 'bg-brand-50 border border-brand-200 text-brand-900 shadow-2xs'
                        : 'hover:bg-slate-50 border border-transparent text-slate-700'
                    }`}
                  >
                    <div className="min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-xs truncate text-slate-900">
                          {b.name}
                        </span>
                        {/* Short ID badge to distinguish boards with identical names */}
                        <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-100 text-slate-500 shrink-0">
                          #{shortId}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400">
                        <span>{columnCount} cols</span>
                        <span>•</span>
                        <span>{taskCount} tasks</span>
                        {b.createdAt && (
                          <>
                            <span>•</span>
                            <span>{new Date(b.createdAt).toLocaleDateString()}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <Check data-testid="board-active-check" className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
                    )}
                  </button>
                );
              })
            ) : (
              <div className="py-4 text-center text-xs text-slate-400">
                No boards matching "{searchQuery}"
              </div>
            )}
          </div>

          {/* Create Board Action */}
          {canCreateBoard && (
            <div className="pt-2 border-t border-slate-100">
              <button
                type="button"
                data-testid="board-selector-create-btn"
                onClick={() => {
                  close();
                  if (onCreateBoard) onCreateBoard();
                }}
                className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 font-semibold text-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Board</span>
              </button>
            </div>
          )}
        </div>
      )}
    </Dropdown>
  );
}
