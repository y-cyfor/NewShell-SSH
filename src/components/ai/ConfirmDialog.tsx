import { useState } from 'react';
import { ShieldAlert, AlertTriangle } from 'lucide-react';

interface Props {
  toolName: string;
  command: string;
  reason: string;
  level: string;
  onConfirm: (command: string) => void;
  onCancel: () => void;
}

export function ConfirmDialog({ toolName, command, reason, level, onConfirm, onCancel }: Props) {
  const [modifiedCommand, setModifiedCommand] = useState(command);

  const isCritical = level === 'critical';
  const isDangerous = level === 'critical' || level === 'warning';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div
        className="rounded-lg p-5 w-[440px] animate-fade-in shadow-2xl"
        style={{ background: 'var(--bg-secondary)', border: `1px solid ${isCritical ? 'rgba(239,68,68,0.5)' : 'var(--border)'}` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 mb-4">
          {isDangerous ? (
            <ShieldAlert size={22} style={{ color: isCritical ? '#ef4444' : '#f97316' }} />
          ) : (
            <AlertTriangle size={22} style={{ color: '#3b82f6' }} />
          )}
          <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            {isCritical ? '危险操作确认' : isDangerous ? '警告操作确认' : '操作确认'}
          </span>
        </div>

        <div className="text-xs mb-3 p-2 rounded" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
          <div className="mb-1">工具: <span style={{ color: 'var(--text-primary)' }}>{toolName}</span></div>
          <div>原因: <span style={{ color: isCritical ? '#ef4444' : '#f97316' }}>{reason}</span></div>
        </div>

        <div className="mb-4">
          <label className="text-xs mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>
            命令内容 (可修改后执行):
          </label>
          <input
            value={modifiedCommand}
            onChange={(e) => setModifiedCommand(e.target.value)}
            className="w-full px-3 py-2 rounded text-xs font-mono outline-none"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2.5 rounded text-xs font-medium transition-colors"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
          >
            取消执行
          </button>
          <button
            onClick={() => onConfirm(modifiedCommand)}
            className="flex-1 px-3 py-2.5 rounded text-xs font-medium text-white transition-colors"
            style={{ background: isCritical ? '#ef4444' : '#3b82f6' }}
          >
            确认执行
          </button>
        </div>
      </div>
    </div>
  );
}
