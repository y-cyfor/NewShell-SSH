import { useState, useEffect } from 'react';
import { AgentSession } from '../../types';
import { getAgentSessions, deleteAgentSession } from '../../services/agentService';
import { MessageSquare, Trash2, Clock } from 'lucide-react';

interface Props {
  currentSessionId: string | null;
  onSelectSession: (session: AgentSession) => void;
  onNewSession: () => void;
}

export function AgentSessionList({ currentSessionId, onSelectSession, onNewSession }: Props) {
  const [sessions, setSessions] = useState<AgentSession[]>([]);
  const [loading, setLoading] = useState(false);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const data = await getAgentSessions();
      setSessions(data || []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('确定删除此对话?')) return;
    await deleteAgentSession(id);
    loadSessions();
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      if (diff < 60000) return '刚刚';
      if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
      return d.toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-secondary)' }}>
      <div className="p-2 px-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          <MessageSquare size={12} className="inline mr-1.5" style={{ verticalAlign: 'middle' }} />
          Agent 历史对话
        </span>
        <button
          onClick={onNewSession}
          className="text-xs px-2 py-0.5 rounded"
          style={{ background: 'var(--accent)', color: '#fff' }}
        >
          新建
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-4 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
            加载中...
          </div>
        )}

        {!loading && sessions.length === 0 && (
          <div className="p-4 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
            暂无历史对话
          </div>
        )}

        {sessions.map((session) => (
          <div
            key={session.id}
            onClick={() => onSelectSession(session)}
            className="flex items-center gap-2 px-3 py-2 cursor-pointer group transition-colors"
            style={{
              background: session.id === currentSessionId ? 'var(--bg-tertiary)' : 'transparent',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <MessageSquare size={12} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
            <div className="flex-1 min-w-0">
              <div className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>
                {session.title || '未命名对话'}
              </div>
              <div className="text-[10px] flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                <Clock size={9} />
                {formatDate(session.updated_at)}
              </div>
            </div>
            <button
              onClick={(e) => handleDelete(e, session.id)}
              className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ color: 'var(--text-secondary)' }}
            >
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
