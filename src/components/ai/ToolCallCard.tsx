import { useState } from 'react';
import { ToolCallStep } from '../../types';
import { Clock, Loader, CheckCircle, XCircle, Ban, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

interface Props {
  toolCall: ToolCallStep;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export function ToolCallCard({ toolCall }: Props) {
  const [expanded, setExpanded] = useState(false);

  const statusConfig = {
    pending: { icon: <Clock size={12} />, color: '#f59e0b', label: '等待中' },
    confirming: { icon: <AlertTriangle size={12} />, color: '#f97316', label: '等待确认' },
    executing: { icon: <Loader size={12} className="animate-spin" />, color: '#3b82f6', label: '执行中' },
    completed: { icon: <CheckCircle size={12} />, color: '#22c55e', label: '完成' },
    failed: { icon: <XCircle size={12} />, color: '#ef4444', label: '失败' },
    rejected: { icon: <Ban size={12} />, color: '#6b7280', label: '已拒绝' },
  };

  const config = statusConfig[toolCall.status] || statusConfig.pending;
  const hasOutput = toolCall.output && toolCall.output.trim().length > 0;

  return (
    <div
      className="rounded-lg my-1.5 text-xs transition-all"
      style={{
        background: toolCall.isDangerous ? 'rgba(239,68,68,0.08)' : 'var(--bg-tertiary)',
        border: toolCall.isDangerous ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--border)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 p-2 cursor-pointer"
        onClick={() => hasOutput && setExpanded(!expanded)}
      >
        <span style={{ color: config.color }}>{config.icon}</span>
        <span className="font-medium flex-1 truncate" style={{ color: 'var(--text-primary)' }}>
          {getToolDisplayName(toolCall.toolName)}
        </span>
        {toolCall.isDangerous && (
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>
            ⚠️ 高危
          </span>
        )}
        <span className="text-[10px]" style={{ color: config.color }}>
          {config.label}
        </span>
        {hasOutput && (
          <span style={{ color: 'var(--text-secondary)' }}>
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
        )}
      </div>

      {/* Command */}
      <div className="px-2 pb-1 font-mono" style={{ color: 'var(--text-secondary)' }}>
        <div className="truncate text-[11px]">{getCommandDisplay(toolCall)}</div>
      </div>

      {/* Status bar */}
      <div className="px-2 pb-2">
        {toolCall.status === 'executing' && (
          <div className="text-[10px] flex items-center gap-1" style={{ color: '#3b82f6' }}>
            <Loader size={10} className="animate-spin" />
            耗时 {formatDuration(Date.now() - toolCall.startTime)}
          </div>
        )}
        {(toolCall.status === 'completed' || toolCall.status === 'failed') && toolCall.endTime && (
          <div className="text-[10px]" style={{ color: toolCall.status === 'completed' ? '#22c55e' : '#ef4444' }}>
            {toolCall.status === 'completed' ? '✅' : '❌'} 退出码: {toolCall.exitCode ?? '-'} | 耗时: {formatDuration(toolCall.endTime - toolCall.startTime)}
          </div>
        )}
        {toolCall.status === 'rejected' && (
          <div className="text-[10px]" style={{ color: '#6b7280' }}>用户已拒绝执行</div>
        )}
        {toolCall.reason && toolCall.status === 'confirming' && (
          <div className="text-[10px]" style={{ color: '#f97316' }}>原因: {toolCall.reason}</div>
        )}
      </div>

      {/* Collapsible output */}
      {expanded && hasOutput && (
        <div
          className="mx-2 mb-2 p-2 rounded text-[11px] font-mono overflow-auto max-h-48"
          style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
        >
          <pre className="whitespace-pre-wrap break-all">{toolCall.output}</pre>
        </div>
      )}
    </div>
  );
}

function getToolDisplayName(name: string): string {
  const names: Record<string, string> = {
    execute_command: '🔧 执行命令',
    read_file: '📄 读取文件',
    write_file: '✏️ 写入文件',
    list_directory: '📁 列出目录',
    create_directory: '📂 创建目录',
    delete_file: '🗑️ 删除文件',
    get_system_info: 'ℹ️ 系统信息',
    search_files: '🔍 搜索文件',
  };
  return names[name] || `🔧 ${name}`;
}

function getCommandDisplay(tc: ToolCallStep): string {
  if (tc.parameters?.command) return tc.parameters.command;
  if (tc.parameters?.path) return tc.parameters.path;
  return JSON.stringify(tc.parameters || {});
}
