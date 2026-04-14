import { useEffect, useState, useMemo } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { AddConnectionModal } from './AddConnectionModal';
import { Connection } from '../../types';
import {
  Plus,
  Server,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Trash2,
  Edit2,
  Search,
  Cloud,
  HardDrive,
} from 'lucide-react';

export function ConnectionList() {
  const { connections, loadConnections, deleteConnection } = useConnectionStore();
  const { addTab } = useTerminalStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editConn, setEditConn] = useState<Connection | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadConnections();
  }, []);

  const filteredConnections = useMemo(() => {
    if (!search) return connections;
    const s = search.toLowerCase();
    return connections.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        c.host.toLowerCase().includes(s) ||
        c.username.toLowerCase().includes(s) ||
        (c.remark || '').toLowerCase().includes(s)
    );
  }, [connections, search]);

  const groupedConnections = useMemo(() => {
    const map: Record<string, Connection[]> = {};
    for (const conn of filteredConnections) {
      const g = conn.group_name || '默认分组';
      if (!map[g]) map[g] = [];
      map[g].push(conn);
    }
    return map;
  }, [filteredConnections]);

  const toggleGroup = (group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-secondary)' }}>
      <div className="p-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-semibold bg-clip-text" style={{ background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          连接 ({connections.length})
        </span>
        <button
          onClick={() => setShowAdd(true)}
          className="p-1.5 rounded-lg hover:opacity-80 transition-all"
          style={{ color: 'var(--accent)' }}
          title="添加连接"
        >
          <Plus size={16} />
        </button>
      </div>

      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
          <Search size={14} style={{ color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="搜索连接..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-xs outline-none flex-1"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1">
        {Object.entries(groupedConnections).map(([group, conns]) => (
          <div key={group} className="mb-1">
            <button
              onClick={() => toggleGroup(group)}
              className="flex items-center gap-1.5 w-full px-2.5 py-2 text-xs font-medium rounded-lg mb-0.5 transition-all"
              style={{ color: 'var(--text-secondary)' }}
            >
              {collapsedGroups.has(group) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              <FolderOpen size={12} style={{ color: 'var(--accent)' }} />
              <span className="flex-1 text-left truncate">{group}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>{conns.length}</span>
            </button>
            {!collapsedGroups.has(group) && (
              <div className="ml-1">
                {conns.map((conn) => (
                  <div
                    key={conn.id}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer group mb-1 transition-all"
                    style={{
                      background: 'transparent',
                      border: '1px solid transparent',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-hover)'; e.currentTarget.style.borderColor = 'var(--border-accent)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; }}
                    onClick={() => addTab(conn.id, conn.name)}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform group-hover:scale-110"
                      style={{ background: conn.color || 'var(--accent)' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium truncate">{conn.name}</span>
                        <span title={conn.synced ? '云端' : '本地'}>
                          {conn.synced ? (
                            <Cloud size={10} style={{ color: 'var(--accent)' }} />
                          ) : (
                            <HardDrive size={10} style={{ color: 'var(--text-muted)' }} />
                          )}
                        </span>
                      </div>
                      <div className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {conn.username}@{conn.host}:{conn.port}
                      </div>
                    </div>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditConn(conn);
                        }}
                        className="p-1 rounded-md transition-colors"
                        style={{ color: 'var(--text-secondary)' }}
                        title="编辑"
                      >
                        <Edit2 size={12} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('确定删除此连接?')) {
                            deleteConnection(conn.id);
                          }
                        }}
                        className="p-1 rounded-md transition-colors"
                        style={{ color: 'var(--danger)' }}
                        title="删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        {filteredConnections.length === 0 && (
          <div className="text-center py-10" style={{ color: 'var(--text-secondary)' }}>
            <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--accent-subtle)' }}>
              <Server size={24} style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-xs mb-1">{search ? '未找到匹配的连接' : '暂无连接'}</p>
            {!search && (
              <button
                onClick={() => setShowAdd(true)}
                className="text-xs mt-2 px-4 py-1.5 rounded-lg font-medium transition-all"
                style={{ background: 'var(--accent-gradient)', color: '#fff' }}
              >
                添加连接
              </button>
            )}
          </div>
        )}
      </div>

      {showAdd && <AddConnectionModal onClose={() => setShowAdd(false)} />}
      {editConn && <AddConnectionModal connection={editConn} onClose={() => setEditConn(null)} />}
    </div>
  );
}
