import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Plus, MoreHorizontal, Trash2, Edit2, AlertCircle } from 'lucide-react';
import { SortableTaskCard } from './SortableTaskCard';
import { Dropdown } from '../../components/ui/Dropdown';
import { useAuth } from '../../context/AuthContext';

export function KanbanColumn({
  column,
  tasks = [],
  selectedTaskId,
  onSelectTask,
  onAddTaskToColumn,
  onRenameColumn,
  onDeleteColumn,
}) {
  const { effectiveRole } = useAuth();
  const [isEditing, setIsEditing] = useState(false);
  const [nameInput, setNameInput] = useState(column.name);
  const [columnError, setColumnError] = useState('');

  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: {
      type: 'Column',
      column,
    },
  });

  const canManageColumn = effectiveRole === 'ORG_ADMIN' || effectiveRole === 'TENANT_ADMIN';

  const handleRenameSubmit = (e) => {
    e.preventDefault();
    if (nameInput.trim() && nameInput.trim() !== column.name) {
      onRenameColumn(column.id, nameInput.trim());
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    setColumnError('');
    if (tasks.length > 0) {
      setColumnError(`Cannot delete column containing ${tasks.length} task(s). Move or delete tasks first.`);
      setTimeout(() => setColumnError(''), 4000);
      return;
    }
    onDeleteColumn(column.id);
  };

  return (
    <div
      ref={setNodeRef}
      data-column-name={column.name}
      className={`w-72 shrink-0 flex flex-col bg-slate-100/70 border rounded-2xl p-3 max-h-full transition-colors ${
        isOver ? 'border-brand-500 bg-brand-50/20' : 'border-slate-200/80'
      }`}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-2 h-2 rounded-full bg-brand-500 shrink-0" />
          {isEditing ? (
            <form onSubmit={handleRenameSubmit} className="flex-1">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={handleRenameSubmit}
                autoFocus
                className="w-full text-xs font-bold px-1.5 py-0.5 border border-brand-400 rounded bg-white"
              />
            </form>
          ) : (
            <h3
              onDoubleClick={() => canManageColumn && setIsEditing(true)}
              className="text-xs font-bold text-slate-800 uppercase tracking-wider truncate cursor-pointer"
              title="Double click to rename"
            >
              {column.name}
            </h3>
          )}
          <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 text-[11px] font-semibold flex items-center justify-center shrink-0">
            {tasks.length}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => onAddTaskToColumn(column.id)}
            className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md transition-colors"
            title="Add task to column"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {canManageColumn && (
            <Dropdown
              align="right"
              width="w-40"
              trigger={
                <button
                  className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-md transition-colors"
                  title="Column actions"
                >
                  <MoreHorizontal className="w-3.5 h-3.5" />
                </button>
              }
            >
              {({ close }) => (
                <div className="p-1 space-y-0.5 text-xs">
                  <button
                    onClick={() => {
                      setIsEditing(true);
                      close();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-slate-700 hover:bg-slate-50 text-left"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Rename</span>
                  </button>
                  <button
                    onClick={() => {
                      handleDelete();
                      close();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-rose-600 hover:bg-rose-50 text-left"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                    <span>Delete Column</span>
                  </button>
                </div>
              )}
            </Dropdown>
          )}
        </div>
      </div>

      {columnError && (
        <div className="mb-2 p-2 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-700 flex items-start gap-1.5 animate-in fade-in">
          <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>{columnError}</span>
        </div>
      )}

      {/* Task Stack */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-[120px]">
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              isSelected={selectedTaskId === task.id}
              onClick={() => onSelectTask(task)}
            />
          ))}
        </SortableContext>
        {tasks.length === 0 && (
          <div className="h-24 border border-dashed border-slate-300/80 rounded-xl flex items-center justify-center text-[11px] text-slate-400 select-none">
            Drop task here
          </div>
        )}
      </div>
    </div>
  );
}
