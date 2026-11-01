import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PriorityBadge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { MessageSquare, Calendar } from 'lucide-react';

export function SortableTaskCard({ task, isSelected, onClick }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    data: {
      type: 'Task',
      task,
    },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      data-testid="task-card"
      data-task-id={task.id}
      className={`bg-white p-3.5 rounded-xl border border-slate-200 shadow-card hover:shadow-md hover:border-brand-300 transition-all cursor-grab active:cursor-grabbing select-none group ${
        isSelected ? 'ring-2 ring-brand-500 border-transparent' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-xs font-semibold text-slate-800 group-hover:text-brand-700 leading-snug break-words">
          {task.title}
        </p>
        <span className="text-[10px] text-slate-400 shrink-0 font-mono">
          v{task.version}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
        <PriorityBadge priority={task.priority} />
        {task.dueDate && (
          <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
            <Calendar className="w-2.5 h-2.5 text-slate-400" />
            {new Date(task.dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400">
        <span className="text-[10px] text-slate-400 font-medium">
          pos: {task.position}
        </span>
        {task.assignee ? (
          <Avatar
            name={task.assignee.name}
            email={task.assignee.email}
            avatarUrl={task.assignee.avatarUrl}
            size="xs"
          />
        ) : (
          <span className="text-[10px] text-slate-300 italic">Unassigned</span>
        )}
      </div>
    </div>
  );
}
