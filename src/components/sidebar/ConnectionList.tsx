import { memo, useEffect, useState, useMemo } from 'react';
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
  Wifi,
  WifiOff,
  Loader,
  Terminal,
  DownloadCloud,
  Check,
  Loader2,
  X,
} from 'lucide-react';

export const ConnectionList = memo(function ConnectionList() {
  const connections = useConnectionStore((s) => s.connections);
  const loadConnections = useConnectionStore((s) => s.loadConnections);
  const deleteConnection = useConnectionStore((s) => s.deleteConnection);
  const addTab = useTerminalStore((s) => s.addTab);
  const connectionStatus = useTerminalStore((s) => s.connectionStatus);
  const [showAdd, setShowAdd] = useState(false);
  const [editConn, setEditConn] = useState<Connection | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [quickConn, setQuickConn] = useState('');
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [sshHosts, setSshHosts] = useState<Array<{ name: string; host: string; port: number; user: string; identity: string }>>([]);
  const [imported, setImported] = useState<Set<string>>(new Set());

  const handleImportSSHConfig = async () => {
    setImporting(true);
    try {
      const res = await fetch('http://localhost:29800/api/connections/import/ssh-config');
      if (res.ok) {
        const data = await res.json();
        setSshHosts(data.hosts || []);
        setShowImport(true);
      }
    } catch (e) {
      console.error('Failed to import SSH config:', e);
    }
    setImporting(false);
  };

  const handleImportHost = async (host: typeof sshHosts[0]) => {
    const { addConnection } = useConnectionStore.getState();
    const connId = `ssh-import-${host.host}-${Date.now()}`;
    addConnection({
      name: host.name,
      host: host.host,
      port: host.port,
      username: host.user,
      auth_type: host.identity ? 'key' : 'password',
      private_key: '',
      group_name: 'SSH Config',
      remark: '从 ~/.ssh/config 导入',
      color: '#8b5cf6',
    });
    setImported((prev) => new Set(prev).add(host.name));
  };

  const handleQuickConnect = () => {
    if (!quickConn.trim()) return;

    // 解析 user@host:port 格式
    const parts = quickConn.trim().match(/^([^@]+)@([^:]+):?(\d+)?$/);
    if (parts) {
      const [, username, host, portStr] = parts;
      const port = portStr ? parseInt(portStr, 10) : 22;
      const name = `${username}@${host}`;
      addTab(`${name}-${Date.now()}`, name);
      // 保存为连接记录
      const { addConnection } = useConnectionStore.getState();
      addConnection({
        name,
        host,
        port,
        username,
        auth_type: 'password',
        password: '',
        group_name: '快速连接',
        remark: '通过快速连接添加',
        color: '#06b6d4',
      });
    }
    setQuickConn('');
  };

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
        <div className="flex items-center gap-1">
          <button
            onClick={handleImportSSHConfig}
            disabled={importing}
            className="p-1.5 rounded-lg hover:opacity-80 transition-all"
            style={{ color: 'var(--accent)' }}
            title="导入 SSH Config"
          >
            {importing ? <Loader2 size={16} className="animate-spin" /> : <DownloadCloud size={16} />}
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="p-1.5 rounded-lg hover:opacity-80 transition-all"
            style={{ color: 'var(--accent)' }}
            title="添加连接"
          >
            <Plus size={16} />
          </button>
        </div>
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

        {/* Quick Connect Bar */}
        <div className="flex items-center gap-2 mt-2 px-3 py-2 rounded-lg" style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent-subtle-border)' }}>
          <Terminal size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <input
            type="text"
            placeholder="快速连接: user@host:port"
            value={quickConn}
            onChange={(e) => setQuickConn(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleQuickConnect(); }}
            className="bg-transparent text-xs outline-none flex-1"
            style={{ color: 'var(--text-primary)' }}
          />
          <button
            onClick={handleQuickConnect}
            className="px-2 py-1 rounded text-xs font-medium transition-all hover:opacity-80"
            style={{ background: 'var(--accent-gradient)', color: '#fff' }}
          >
            连接
          </button>
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
                        {/* 连接状态指示器 */}
                        {connectionStatus[conn.id] && (
                          <span title={{ connected: '已连接', connecting: '连接中', error: '连接错误', disconnected: '未连接' }[connectionStatus[conn.id]]}>
                            {connectionStatus[conn.id] === 'connected' && <Wifi size={10} style={{ color: '#22c55e' }} />}
                            {connectionStatus[conn.id] === 'connecting' && <Loader size={10} className="animate-spin" style={{ color: '#f59e0b' }} />}
                            {connectionStatus[conn.id] === 'error' && <WifiOff size={10} style={{ color: '#ef4444' }} />}
                          </span>
                        )}
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

      {/* SSH Config Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-lg rounded-xl shadow-2xl animate-fade-in"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          >
            <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
              <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>从 SSH Config 导入</span>
              <button onClick={() => setShowImport(false)} className="p-1 rounded-lg hover:bg-white/5 transition-all" style={{ color: 'var(--text-secondary)' }}>
                <X size={18} />
              </button>
            </div>
            <div className="p-4 max-h-[60vh] overflow-y-auto space-y-1">
              {sshHosts.length === 0 ? (
                <p className="text-center py-6 text-xs" style={{ color: 'var(--text-secondary)' }}>未找到任何 SSH 主机配置</p>
              ) : (
                sshHosts.map((host) => (
                  <div
                    key={host.name}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg transition-all"
                    style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{host.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                        {host.user || 'root'}@{host.host}:{host.port}
                        {host.identity && <span className="ml-2">🔑 {host.identity}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleImportHost(host)}
                      disabled={imported.has(host.name)}
                      className="ml-3 px-3 py-1 rounded text-xs font-medium transition-all"
                      style={{
                        background: imported.has(host.name) ? 'transparent' : 'var(--accent-gradient)',
                        color: imported.has(host.name) ? '#22c55e' : '#fff',
                        border: imported.has(host.name) ? '1px solid #22c55e' : 'none',
                      }}
                    >
                      {imported.has(host.name) ? (
                        <span className="flex items-center gap-1"><Check size={12} /> 已导入</span>
                      ) : '导入'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});