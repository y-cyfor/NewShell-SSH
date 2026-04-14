import { useState, useEffect } from 'react';
import { FileInfo } from '../../types';
import api from '../../services/api';
import {
  Folder,
  File,
  ChevronRight,
  Home,
  ArrowLeft,
  Trash2,
  FolderPlus,
  RefreshCw,
} from 'lucide-react';

interface Props {
  connId: string;
}

export function FileTreePanel({ connId }: Props) {
  const [path, setPath] = useState('/');
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchFiles = async () => {
    if (!connId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/files/${connId}/list`, { params: { path } });
      setFiles(res.data || []);
    } catch (err: any) {
      setError(err.response?.data?.error || '加载失败');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, [connId, path]);

  const navigateUp = () => {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    setPath('/' + parts.join('/'));
  };

  const navigateTo = (name: string) => {
    const newPath = path === '/' ? `/${name}` : `${path}/${name}`;
    setPath(newPath);
  };

  const goHome = () => setPath('/');

  const handleDelete = async (name: string) => {
    if (!confirm(`确定删除 ${name}?`)) return;
    try {
      const fullPath = path === '/' ? `/${name}` : `${path}/${name}`;
      await api.post(`/api/files/${connId}/delete`, { path: fullPath });
      fetchFiles();
    } catch (err: any) {
      alert('删除失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleMkdir = async () => {
    const name = prompt('新建文件夹名称:');
    if (!name) return;
    try {
      const fullPath = path === '/' ? `/${name}` : `${path}/${name}`;
      await api.post(`/api/files/${connId}/mkdir`, { path: fullPath });
      fetchFiles();
    } catch (err: any) {
      alert('创建失败: ' + (err.response?.data?.error || err.message));
    }
  };

  if (!connId) {
    return (
      <div className="h-full flex items-center justify-center flex-col gap-2" style={{ color: 'var(--text-secondary)', background: 'var(--bg-secondary)' }}>
        <Folder size={24} strokeWidth={1} />
        <p className="text-xs">选择连接后显示文件</p>
      </div>
    );
  }

  const pathParts = path.split('/').filter(Boolean);

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-secondary)' }}>
      {/* Header */}
      <div className="p-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>文件</span>
        <div className="flex gap-1">
          <button onClick={handleMkdir} title="新建文件夹" style={{ color: 'var(--text-secondary)' }}>
            <FolderPlus size={14} />
          </button>
          <button onClick={fetchFiles} title="刷新" style={{ color: 'var(--text-secondary)' }}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-2 py-1.5 text-xs overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
        <button onClick={goHome} className="p-0.5 rounded" style={{ color: 'var(--accent)' }}>
          <Home size={12} />
        </button>
        {path !== '/' && (
          <button onClick={navigateUp} className="p-0.5 rounded" style={{ color: 'var(--text-secondary)' }}>
            <ArrowLeft size={12} />
          </button>
        )}
        {pathParts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight size={10} style={{ color: 'var(--text-secondary)' }} />
            <button
              onClick={() => setPath('/' + pathParts.slice(0, i + 1).join('/'))}
              className="hover:underline"
              style={{ color: 'var(--accent)' }}
            >
              {part}
            </button>
          </span>
        ))}
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="text-xs p-2" style={{ color: 'var(--danger)' }}>{error}</div>
        )}
        {loading ? (
          <div className="text-xs text-center py-4" style={{ color: 'var(--text-secondary)' }}>加载中...</div>
        ) : (
          files.map((file) => (
            <div
              key={file.name}
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer group"
              style={{ borderBottom: '1px solid var(--border)' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-tertiary)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              onClick={() => file.is_dir && navigateTo(file.name)}
            >
              {file.is_dir ? (
                <Folder size={14} style={{ color: 'var(--warning)' }} />
              ) : (
                <File size={14} style={{ color: 'var(--text-secondary)' }} />
              )}
              <span className="text-xs flex-1 truncate">{file.name}</span>
              {!file.is_dir && (
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  {formatSize(file.size)}
                </span>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(file.name);
                }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100"
                style={{ color: 'var(--danger)' }}
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))
        )}
        {!loading && files.length === 0 && !error && (
          <div className="text-xs text-center py-4" style={{ color: 'var(--text-secondary)' }}>
            空目录
          </div>
        )}
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
}
