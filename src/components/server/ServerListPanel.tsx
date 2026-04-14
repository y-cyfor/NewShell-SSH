import { useEffect, useState, useMemo } from 'react';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { useGroupStore } from '../../stores/groupStore';
import { AddConnectionModal } from '../sidebar/AddConnectionModal';
import { Connection, ServerGroup } from '../../types';
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
  Link,
  Unlink,
  MoreVertical,
  FolderPlus,
  Edit,
} from 'lucide-react';

export function ServerListPanel() {
  const { connections, loadConnections, deleteConnection, syncToServer } = useConnectionStore();
  const { addTab } = useTerminalStore();
  const { groups, loadGroups, createGroup, renameGroup, deleteGroup, addConnectionToGroup, removeConnectionFromGroup } = useGroupStore();
  const [showAdd, setShowAdd] = useState(false);
  const [editConn, setEditConn] = useState<Connection | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [editGroup, setEditGroup] = useState<ServerGroup | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; connId: string } | null>(null);

  useEffect(() => {
    loadConnections();
    loadGroups();
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

  const handleConnect = async (conn: Connection) => {
    // 清理连接ID，移除可能的特殊字符
    const cleanConnId = conn.id.replace(/[^\w-]/g, '');
    
    // 先同步连接到服务器，确保数据库中有连接信息
    if (!conn.synced) {
      try {
        await syncToServer(cleanConnId);
      } catch (err) {
        // 即使同步失败，也继续尝试连接
      }
    }
    addTab(cleanConnId, conn.name);
  };

  const handleCreateGroup = () => {
    if (newGroupName.trim()) {
      createGroup(newGroupName.trim());
      setNewGroupName('');
      setShowNewGroup(false);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, connId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, connId });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-secondary)' }} onClick={closeContextMenu}>
      {/* Header */}
      <div className="p-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-semibold bg-clip-text" style={{ background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          服务器列表 ({connections.length})
        </span>
        <div className="flex gap-1">
          <button
            onClick={() => setShowNewGroup(true)}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-all"
            style={{ color: 'var(--text-secondary)' }}
            title="新建分组"
          >
            <FolderPlus size={14} />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-all"
            style={{ color: 'var(--accent)' }}
            title="添加连接"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>

      {/* New Group Input */}
      {showNewGroup && (
        <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="分组名称"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              className="flex-1 text-xs px-2 py-1 rounded"
              style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
              autoFocus
            />
            <button
              onClick={handleCreateGroup}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--accent)', color: '#fff' }}
            >
              创建
            </button>
            <button
              onClick={() => setShowNewGroup(false)}
              className="text-xs px-2 py-1 rounded"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="px-3 pb-2 pt-2">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
          <Search size={14} style={{ color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="搜索服务器..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-xs outline-none flex-1"
            style={{ color: 'var(--text-primary)' }}
          />
        </div>
      </div>

      {/* Connection List */}
      <div className="flex-1 overflow-y-auto px-1">
        {/* 按分组显示 */}
        {Object.entries(groupedConnections).map(([groupName, conns]) => (
          <div key={groupName} className="mb-1">
            <button
              onClick={() => toggleGroup(groupName)}
              className="flex items-center gap-1.5 w-full px-2.5 py-2 text-xs font-medium rounded-lg mb-0.5 transition-all"
              style={{ color: 'var(--text-secondary)' }}
            >
              {collapsedGroups.has(groupName) ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
              <FolderOpen size={12} style={{ color: 'var(--accent)' }} />
              <span className="flex-1 text-left truncate">{groupName}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>{conns.length}</span>
            </button>
            {!collapsedGroups.has(groupName) && (
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
                    onClick={() => handleConnect(conn)}
                    onContextMenu={(e) => handleContextMenu(e, conn.id)}
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
                      {conn.server_config && (
                        <div className="text-xs truncate mt-0.5" style={{ color: 'var(--text-secondary)', opacity: 0.7 }}>
                          {conn.server_config.cpu_cores}核 / {conn.server_config.memory_total}MB / {conn.server_config.os}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleConnect(conn);
                        }}
                        className="p-1 rounded-md transition-colors"
                        style={{ color: 'var(--accent)' }}
                        title="连接"
                      >
                        <Link size={12} />
                      </button>
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
            <p className="text-xs mb-1">{search ? '未找到匹配的服务器' : '暂无服务器'}</p>
            {!search && (
              <button
                onClick={() => setShowAdd(true)}
                className="text-xs mt-2 px-4 py-1.5 rounded-lg font-medium transition-all"
                style={{ background: 'var(--accent-gradient)', color: '#fff' }}
              >
                添加服务器
              </button>
            )}
          </div>
        )}
      </div>

      {/* Table View */}
      <div className="flex-1 overflow-auto p-3" style={{ display: 'none' }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="text-left py-2 px-2">名称</th>
              <th className="text-left py-2 px-2">IP地址</th>
              <th className="text-left py-2 px-2">用户名</th>
              <th className="text-left py-2 px-2">创建时间</th>
              <th className="text-left py-2 px-2">备注</th>
              <th className="text-left py-2 px-2">配置</th>
              <th className="text-left py-2 px-2">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredConnections.map((conn) => (
              <tr
                key={conn.id}
                className="cursor-pointer hover:opacity-80"
                style={{ borderBottom: '1px solid var(--border)' }}
                onClick={() => handleConnect(conn)}
              >
                <td className="py-2 px-2">{conn.name}</td>
                <td className="py-2 px-2">{conn.host}</td>
                <td className="py-2 px-2">{conn.username}</td>
                <td className="py-2 px-2">{new Date(conn.created_at).toLocaleDateString()}</td>
                <td className="py-2 px-2">{conn.remark || '-'}</td>
                <td className="py-2 px-2">
                  {conn.server_config ? (
                    <span style={{ color: 'var(--text-secondary)' }}>
                      {conn.server_config.cpu_cores}核 / {conn.server_config.memory_total}MB
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-secondary)' }}>-</span>
                  )}
                </td>
                <td className="py-2 px-2">
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleConnect(conn);
                      }}
                      className="p-1 rounded"
                      style={{ color: 'var(--accent)' }}
                      title="连接"
                    >
                      <Link size={12} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditConn(conn);
                      }}
                      className="p-1 rounded"
                      style={{ color: 'var(--text-secondary)' }}
                      title="编辑"
                    >
                      <Edit2 size={12} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showAdd && <AddConnectionModal onClose={() => setShowAdd(false)} />}
      {editConn && <AddConnectionModal connection={editConn} onClose={() => setEditConn(null)} />}
      
      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 py-1 rounded shadow-lg"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
          }}
        >
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80"
            style={{ color: 'var(--text-primary)' }}
            onClick={() => {
              const conn = connections.find(c => c.id === contextMenu.connId);
              if (conn) handleConnect(conn);
              closeContextMenu();
            }}
          >
            连接
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80"
            style={{ color: 'var(--text-primary)' }}
            onClick={() => {
              const conn = connections.find(c => c.id === contextMenu.connId);
              if (conn) setEditConn(conn);
              closeContextMenu();
            }}
          >
            编辑
          </button>
          <button
            className="w-full text-left px-3 py-1.5 text-xs hover:opacity-80"
            style={{ color: 'var(--danger)' }}
            onClick={() => {
              if (confirm('确定删除此连接?')) {
                deleteConnection(contextMenu.connId);
              }
              closeContextMenu();
            }}
          >
            删除
          </button>
        </div>
      )}
    </div>
  );
}
