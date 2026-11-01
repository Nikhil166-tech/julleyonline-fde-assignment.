import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export function ConflictModal({ isOpen, onClose, conflictDetails, onRefresh }) {
  const currentTask = conflictDetails?.currentTask;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Update Conflict (HTTP 409)" maxWidth="max-w-md">
      <div data-testid="conflict-modal" className="space-y-4 text-xs">
        {/* Warning Banner matching approved UI reference */}
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-900">
          <div className="p-1.5 bg-amber-100 rounded-lg text-amber-700 shrink-0">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <p className="font-bold text-sm">Concurrent Edit Detected</p>
            <p className="text-amber-800 leading-relaxed">
              Another collaborator updated this task while you were making changes. To prevent
              overwriting their work, please review their authoritative changes below and refresh.
            </p>
          </div>
        </div>

        {/* Current Server State Snapshot */}
        {currentTask && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between text-slate-500">
              <span className="font-semibold uppercase tracking-wider text-[10px]">
                Authoritative Server State
              </span>
              <span className="font-semibold text-brand-600 bg-brand-50 px-2 py-0.5 rounded text-[11px]">
                v{currentTask.version}
              </span>
            </div>
            <p className="font-bold text-slate-900 text-sm">{currentTask.title}</p>
            {currentTask.description && (
              <p className="text-slate-600 line-clamp-2">{currentTask.description}</p>
            )}
            <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1">
              <span>Priority: <strong className="text-slate-700">{currentTask.priority}</strong></span>
              {currentTask.column && <span>• Column: <strong className="text-slate-700">{currentTask.column.name}</strong></span>}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
          <Button type="button" variant="secondary" size="sm" onClick={onClose}>
            Keep Local State
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            icon={RefreshCw}
            onClick={() => {
              if (onRefresh && currentTask) {
                onRefresh(currentTask);
              }
              onClose();
            }}
          >
            Refresh to Latest Version
          </Button>
        </div>
      </div>
    </Modal>
  );
}
