import { useState } from 'react';
import {
  X,
  Code,
  ChevronDown,
  ChevronRight,
  Copy,
  Plus,
  Trash2,
  TerminalSquare,
} from 'lucide-react';

export interface Snippet {
  id: string;
  name: string;
  command: string;
  category: string;
}

const DEFAULT_SNIPPETS: Snippet[] = [
  { id: 's1', name: '磁盘使用', command: 'df -h', category: '系统' },
  { id: 's2', name: '内存使用', command: 'free -h', category: '系统' },
  { id: 's3', name: 'CPU 信息', command: 'lscpu | head -20', category: '系统' },
  { id: 's4', name: '系统负载', command: 'top -bn1 | head -5', category: '系统' },
  { id: 's5', name: '网络接口', command: 'ip addr show', category: '网络' },
  { id: 's6', name: 'DNS 配置', command: 'cat /etc/resolv.conf', category: '网络' },
  { id: 's7', name: '开放端口', command: 'ss -tlnp', category: '网络' },
  { id: 's8', name: '最近登录', command: 'last -10', category: '系统' },
  { id: 's9', name: 'Docker 容器', command: 'docker ps -a', category: 'Docker' },
  { id: 's10', name: 'Docker 镜像', command: 'docker images', category: 'Docker' },
  { id: 's11', name: '日志追踪', command: 'tail -f /var/log/syslog', category: '日志' },
  { id: 's12', name: '进程排行', command: 'ps aux --sort=-%mem | head -15', category: '系统' },
];

interface Props {
  onInsert: (command: string) => void;
  onClose: () => void;
}

export function SnippetsPanel({ onInsert, onClose }: Props) {
  const [category, setCategory] = useState<string>('全部');
  const [snippets, setSnippets] = useState<Snippet[]>(() => {
    const saved = localStorage.getItem('newshell_snippets');
    return saved ? JSON.parse(saved) : DEFAULT_SNIPPETS;
  });

  const categories = ['全部', ...new Set(snippets.map((s) => s.category))];
  const filtered = category === '全部' ? snippets : snippets.filter((s) => s.category === category);

  const handleInsert = (command: string) => {
    onInsert(command);
    onClose();
  };

  const handleDelete = (id: string) => {
    const next = snippets.filter((s) => s.id !== id);
    setSnippets(next);
    localStorage.setItem('newshell_snippets', JSON.stringify(next));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div
        className="w-full max-w-xl rounded-xl shadow-2xl animate-fade-in overflow-hidden"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', maxHeight: '80vh' }}
      >
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-gradient)' }}>
              <Code size={15} style={{ color: '#fff' }} />
            </div>
            <span className="font-semibold text-sm">命令片段</span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/5 transition-all" style={{ color: 'var(--text-secondary)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Category tabs */}
        <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all"
              style={{
                background: category === cat ? 'var(--accent-subtle)' : 'transparent',
                color: category === cat ? 'var(--accent)' : 'var(--text-secondary)',
                border: category === cat ? '1px solid var(--accent-subtle-border)' : '1px solid transparent',
              }}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="p-3 overflow-y-auto" style={{ maxHeight: '50vh' }}>
          <div className="space-y-1.5">
            {filtered.map((snippet) => (
              <div
                key={snippet.id}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg group transition-all"
                style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
              >
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleInsert(snippet.command)}>
                  <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{snippet.name}</div>
                  <div
                    className="text-xs mt-0.5 font-mono truncate"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    {snippet.command}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(snippet.command);
                    }}
                    className="p-1 rounded transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    title="复制"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    onClick={() => handleDelete(snippet.id)}
                    className="p-1 rounded transition-colors"
                    style={{ color: 'var(--danger)' }}
                    title="删除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-3 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>点击片段插入命令，或复制后粘贴到终端</span>
          <button
            onClick={() => {
              const name = prompt('片段名称:');
              if (!name) return;
              const command = prompt('命令内容:');
              if (!command) return;
              const newSnippet: Snippet = {
                id: `custom-${Date.now()}`,
                name,
                command,
                category: '自定义',
              };
              const next = [...snippets, newSnippet];
              setSnippets(next);
              localStorage.setItem('newshell_snippets', JSON.stringify(next));
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-all"
            style={{ background: 'var(--accent-gradient)', color: '#fff' }}
          >
            <Plus size={12} /> 添加自定义
          </button>
        </div>
      </div>
    </div>
  );
}
