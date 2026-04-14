import { memo, useState, useEffect, useRef, useCallback } from 'react';
import { FileInfo } from '../../types';
import { useFileTransferStore, TransferTask, formatSpeed } from '../../stores/fileTransferStore';
import { useDownloadSettingsStore } from '../../stores/downloadSettingsStore';
import { getFileIcon, getFileType, formatFileSize } from '../../utils/fileIcons';
import { SaveDialog } from './SaveDialog';
import { Download, Trash2, Pause, Play, X, FolderPlus, GripHorizontal, ChevronUp, ChevronDown, Home, ArrowLeft, RefreshCw, Upload, RotateCcw, Clock, Edit2, FileText, Loader2 } from 'lucide-react';
import api from '../../services/api';

interface Props {
  connId: string;
}

interface FileItem extends FileInfo {
  path: string;
  isExpanded?: boolean;
  children?: FileItem[];
}

const MIN_TRANSFER_HEIGHT = 100;
const DEFAULT_TRANSFER_HEIGHT = 180;

export const EnhancedFileTreePanel = memo(function EnhancedFileTreePanel({ connId: rawConnId }: Props) {
  const connId = rawConnId ? rawConnId.replace(/[^\w-]/g, '') : '';
  
  const [path, setPath] = useState('/');
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [showTransfers, setShowTransfers] = useState(true);
  const [transferHeight, setTransferHeight] = useState(DEFAULT_TRANSFER_HEIGHT);
  const [saveDialogFile, setSaveDialogFile] = useState<FileItem | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileItem } | null>(null);
  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [viewingFile, setViewingFile] = useState<{ name: string; content: string; path: string } | null>(null);
  const [editingFile, setEditingFile] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [savingFile, setSavingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const transfers = useFileTransferStore((s) => s.transfers);
  const uploadFile = useFileTransferStore((s) => s.uploadFile);
  const downloadFile = useFileTransferStore((s) => s.downloadFile);
  const pauseTransfer = useFileTransferStore((s) => s.pauseTransfer);
  const resumeTransfer = useFileTransferStore((s) => s.resumeTransfer);
  const removeTransfer = useFileTransferStore((s) => s.removeTransfer);
  
  const askBeforeDownload = useDownloadSettingsStore((s) => s.askBeforeDownload);
  const downloadPath = useDownloadSettingsStore((s) => s.downloadPath);

  // 监听下载事件，自动展开传输面板
  useEffect(() => {
    const handleDownloadStarted = () => {
      setShowTransfers(true);
    };
    window.addEventListener('downloadStarted', handleDownloadStarted);
    return () => window.removeEventListener('downloadStarted', handleDownloadStarted);
  }, []);

  const fetchFiles = useCallback(async (dirPath: string = path) => {
    if (!connId) return;
    
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/api/files/${connId}/list`, { params: { path: dirPath } });
      
      let filesData = res.data;
      if (res.data && res.data.files) {
        filesData = res.data.files;
      } else if (Array.isArray(res.data)) {
        filesData = res.data;
      } else {
        filesData = [];
      }
      
      const fileList: FileItem[] = (filesData || []).map((f: FileInfo) => ({
        ...f,
        path: `${dirPath === '/' ? '' : dirPath}/${f.name}`.replace(/\/+/g, '/'),
        isExpanded: false,
      }));
      fileList.sort((a, b) => {
        if (a.is_dir && !b.is_dir) return -1;
        if (!a.is_dir && b.is_dir) return 1;
        return a.name.localeCompare(b.name);
      });
      setFiles(fileList);
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message || '获取文件列表失败';
      setError(`获取文件列表失败: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  }, [connId, path]);

  useEffect(() => {
    if (connId) {
      fetchFiles();
    }
  }, [connId, fetchFiles]);

  const handleDragStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = transferHeight;

    const handleMouseMove = (ev: MouseEvent) => {
      const dy = startY - ev.clientY;
      setTransferHeight(Math.max(MIN_TRANSFER_HEIGHT, startHeight + dy));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleNavigate = (dir: string) => {
    if (dir === '..') {
      const parts = path.split('/').filter(Boolean);
      parts.pop();
      const newPath = parts.length ? '/' + parts.join('/') : '/';
      setPath(newPath);
      fetchFiles(newPath);
    } else {
      const newPath = path === '/' ? `/${dir}` : `${path}/${dir}`;
      setPath(newPath);
      fetchFiles(newPath);
    }
    setSelectedFile(null);
  };

  const handleFileClick = (file: FileItem) => {
    setSelectedFile(file);
    if (file.is_dir) {
      handleNavigate(file.name);
    }
  };

  const handleFileDoubleClick = async (file: FileItem) => {
    if (file.is_dir) return;
    // 检查是否是文本文件
    const textExtensions = ['.txt', '.log', '.md', '.json', '.yaml', '.yml', '.xml', '.html', '.css', '.js', '.ts', '.tsx', '.jsx', '.sh', '.bash', '.zsh', '.py', '.go', '.rs', '.c', '.cpp', '.h', '.java', '.conf', '.cfg', '.ini', '.env', '.toml', '.sql', '.gitignore', '.dockerfile', '.makefile', 'makefile', '.properties', '.plist', '.vue', '.svelte'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const isText = textExtensions.includes(ext) || !ext || file.name.startsWith('.');

    if (!isText) {
      // 非文本文件直接下载
      handleDownload(file);
      return;
    }

    setViewingFile({ name: file.name, content: '加载中...', path: file.path });
    try {
      const res = await api.get(`/api/files/${connId}/download`, {
        params: { path: file.path },
        responseType: 'text',
      });
      setViewingFile({ name: file.name, content: res.data, path: file.path });
      setEditedContent(res.data);
      setEditingFile(false);
    } catch (err: any) {
      setViewingFile({ name: file.name, content: `加载失败: ${err.response?.data?.error || err.message}`, path: file.path });
    }
  };

  const handleSaveFile = async () => {
    if (!viewingFile) return;
    setSavingFile(true);
    try {
      const blob = new Blob([editedContent], { type: 'text/plain' });
      const formData = new FormData();
      formData.append('file', blob, viewingFile.name);
      formData.append('path', viewingFile.path);
      await api.post(`/api/files/${connId}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setViewingFile({ ...viewingFile, content: editedContent });
      setEditingFile(false);
    } catch (err: any) {
      alert('保存失败: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingFile(false);
    }
  };

  const handleUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setShowTransfers(true);
    for (const file of files) {
      try {
        await uploadFile(connId, path, file);
      } catch (err: any) {
        console.error('Upload failed:', err);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    fetchFiles();
  };

  const handleDownload = (file: FileItem) => {
    if (!file.is_dir) {
      if (askBeforeDownload) {
        // 显示保存对话框
        setSaveDialogFile(file);
      } else {
        // 直接下载到默认路径
        downloadFile(connId, file.path, downloadPath);
      }
    }
  };

  const handleSaveDialogSave = (path: string, rememberChoice: boolean) => {
    if (saveDialogFile) {
      downloadFile(connId, saveDialogFile.path, path);
      setSaveDialogFile(null);
    }
  };

  const handleSaveDialogCancel = () => {
    setSaveDialogFile(null);
  };

  const handleDelete = async (file: FileItem) => {
    if (!confirm(`确定删除 ${file.name}？`)) return;
    
    try {
      await api.post(`/api/files/${connId}/delete`, { path: file.path });
      fetchFiles();
    } catch (err: any) {
      setError(err.response?.data?.error || '删除失败');
    }
  };

  const handleCreateFolder = async () => {
    const name = prompt('请输入文件夹名称');
    if (!name) return;
    
    const folderPath = path === '/' ? `/${name}` : `${path}/${name}`;
    try {
      await api.post(`/api/files/${connId}/mkdir`, { path: folderPath });
      fetchFiles();
    } catch (err: any) {
      setError(err.response?.data?.error || '创建文件夹失败');
    }
  };

  const allTransfers = transfers.filter(t => t.connId === connId);

  const handleRename = async (file: FileItem) => {
    const newName = prompt('请输入新名称', file.name);
    if (!newName || newName === file.name) return;

    const oldPath = file.path;
    const newPath = path === '/' ? `/${newName}` : `${path}/${newName}`;
    try {
      await api.post(`/api/files/${connId}/rename`, { old_path: oldPath, new_path: newPath });
      fetchFiles();
    } catch (err: any) {
      setError(err.response?.data?.error || '重命名失败');
    }
  };

  const handleFileContextMenu = (e: React.MouseEvent, file: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, file });
  };

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-secondary)' }}
      onClick={() => setContextMenu(null)}>
      {/* Save Dialog */}
      {saveDialogFile && (
        <SaveDialog
          fileName={saveDialogFile.name}
          onSave={handleSaveDialogSave}
          onCancel={handleSaveDialogCancel}
        />
      )}

      {/* Header */}
      <div className="p-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="text-xs font-semibold bg-clip-text" style={{ background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          文件管理
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCreateFolder}
            className="p-1 rounded-lg hover:bg-white/5 transition-all"
            style={{ color: 'var(--text-secondary)' }}
            title="新建文件夹"
          >
            <FolderPlus size={14} />
          </button>
          <button
            onClick={handleUpload}
            className="p-1 rounded-lg hover:bg-white/5 transition-all"
            style={{ color: 'var(--accent)' }}
            title="上传文件"
          >
            <Upload size={14} />
          </button>
          <button
            onClick={() => fetchFiles()}
            className="p-1 rounded-lg hover:bg-white/5 transition-all"
            style={{ color: 'var(--text-secondary)' }}
            title="刷新"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Breadcrumb Path Navigation */}
      <div className="px-2 py-1.5 flex items-center gap-1 text-xs overflow-x-auto whitespace-nowrap" style={{ background: 'var(--bg-primary)', borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={() => handleNavigate('..')}
          className="p-1 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
          style={{ color: 'var(--text-secondary)' }}
          title="返回上级"
        >
          <ArrowLeft size={12} />
        </button>
        <button
          onClick={() => handleNavigate('/')}
          className="p-1 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
          style={{ color: path === '/' ? 'var(--accent)' : 'var(--text-secondary)' }}
          title="根目录"
        >
          <Home size={12} />
        </button>
        <div className="flex items-center gap-0.5 flex-1 min-w-0">
          {path.split('/').filter(Boolean).map((segment, idx) => {
            const buildPath = '/' + path.split('/').filter(Boolean).slice(0, idx + 1).join('/');
            return (
              <span key={buildPath} className="flex items-center gap-0.5 flex-shrink-0">
                <span style={{ color: 'var(--text-muted)' }}>/</span>
                <button
                  onClick={() => { setPath(buildPath); fetchFiles(buildPath); }}
                  className="px-1 py-0.5 rounded hover:bg-white/5 transition-colors"
                  style={{ color: buildPath === path ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {segment}
                </button>
              </span>
            );
          })}
          {path === '/' && <span style={{ color: 'var(--text-muted)' }}>/</span>}
        </div>
        <button
          onClick={() => fetchFiles()}
          className="p-1 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
          style={{ color: 'var(--text-secondary)' }}
          title="刷新"
        >
          <RefreshCw size={12} />
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-2 py-1 text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--danger)' }}>
          {error}
          <button onClick={() => setError('')} className="ml-2">×</button>
        </div>
      )}

      {/* File List */}
      <div className="flex-1 overflow-auto p-1" style={{ minHeight: 0 }}>
        {loading ? (
          <div className="text-center py-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
            加载中...
          </div>
        ) : files.length === 0 ? (
          <div className="text-center py-4 text-xs" style={{ color: 'var(--text-secondary)' }}>
            空目录
          </div>
        ) : (
          <div className="space-y-0.5">
            {files.map((file) => (
              <FileRow
                key={file.path}
                file={file}
                isSelected={selectedFile?.path === file.path}
                onClick={() => handleFileClick(file)}
                onDoubleClick={() => handleFileDoubleClick(file)}
                onDownload={() => handleDownload(file)}
                onDelete={() => handleDelete(file)}
                onContextMenu={(e) => handleFileContextMenu(e, file)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Transfer Area - Resizable, always visible */}
      <div style={{ borderTop: '1px solid var(--border)' }}>
        {/* Drag handle */}
        <div
          className="flex items-center justify-center h-2 cursor-ns-resize hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
          onMouseDown={handleDragStart}
        >
          <GripHorizontal size={10} />
        </div>

        {/* Transfer header */}
        <div
          className="px-2 py-1.5 text-xs font-medium flex items-center justify-between cursor-pointer"
          style={{ color: 'var(--text-secondary)', background: 'var(--bg-primary)', borderTop: '1px solid var(--border)' }}
          onClick={() => setShowTransfers(!showTransfers)}
        >
          <span>文件传输 {allTransfers.length > 0 ? `(${allTransfers.length})` : ''}</span>
          <span>{showTransfers ? <ChevronUp size={12} /> : <ChevronDown size={12} />}</span>
        </div>

        {/* Transfer list */}
        {showTransfers && (
          <div
            className="overflow-auto"
            style={{
              height: `${transferHeight}px`,
              background: 'var(--bg-primary)',
            }}
          >
            {allTransfers.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs" style={{ color: 'var(--text-secondary)' }}>
                暂无传输任务
              </div>
            ) : (
              allTransfers.map((transfer) => (
                <TransferItem
                  key={transfer.id}
                  transfer={transfer}
                  onPause={() => pauseTransfer(transfer.id)}
                  onResume={() => resumeTransfer(transfer.id)}
                  onCancel={() => removeTransfer(transfer.id)}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* File Viewer Modal */}
      {viewingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
          <div
            className="w-full max-w-3xl rounded-xl shadow-2xl animate-fade-in overflow-hidden"
            style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', maxHeight: '85vh' }}
          >
            <div className="flex items-center justify-between p-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2">
                <FileText size={14} style={{ color: 'var(--accent)' }} />
                <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{viewingFile.name}</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setEditingFile(true); }}
                  disabled={editingFile}
                  className="px-2 py-1 rounded text-xs font-medium transition-all"
                  style={{
                    color: editingFile ? 'var(--accent)' : 'var(--text-secondary)',
                    background: editingFile ? 'var(--accent-subtle)' : 'transparent',
                  }}
                >
                  <Edit2 size={12} />
                </button>
                <button onClick={() => setViewingFile(null)} className="p-1 rounded-lg hover:bg-white/5 transition-all" style={{ color: 'var(--text-secondary)' }}>
                  <X size={16} />
                </button>
              </div>
            </div>
            <div className="p-3 overflow-auto" style={{ maxHeight: '70vh' }}>
              {editingFile ? (
                <textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  className="w-full rounded-lg p-3 font-mono text-xs outline-none resize-none"
                  style={{
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-primary)',
                    minHeight: '50vh',
                    tabSize: 2,
                  }}
                />
              ) : (
                <pre
                  className="font-mono text-xs whitespace-pre-wrap"
                  style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
                >
                  {viewingFile.content}
                </pre>
              )}
            </div>
            {editingFile && (
              <div className="flex gap-2 p-3" style={{ borderTop: '1px solid var(--border)' }}>
                <button
                  onClick={() => { setEditingFile(false); setEditedContent(viewingFile.content); }}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
                >
                  取消
                </button>
                <button
                  onClick={handleSaveFile}
                  disabled={savingFile}
                  className="flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5"
                  style={{ background: 'var(--accent-gradient)', color: '#fff' }}
                >
                  {savingFile ? <Loader2 size={14} className="animate-spin" /> : <Edit2 size={14} />}
                  保存
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* File Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 py-1.5 rounded-lg shadow-lg"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            minWidth: '150px',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border)',
            backdropFilter: 'blur(8px)',
          }}
          onClick={() => setContextMenu(null)}
        >
          {!contextMenu.file.is_dir && (
            <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
              style={{ color: 'var(--text-primary)' }}
              onClick={() => { handleDownload(contextMenu.file); setContextMenu(null); }}>
              <Download size={12} /> 下载
            </button>
          )}
          <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
            style={{ color: 'var(--text-primary)' }}
            onClick={() => { handleRename(contextMenu.file); setContextMenu(null); }}>
            <Edit2 size={12} /> 重命名
          </button>
          <button className="w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 transition-colors flex items-center gap-2"
            style={{ color: 'var(--danger)' }}
            onClick={() => { handleDelete(contextMenu.file); setContextMenu(null); }}>
            <Trash2 size={12} /> 删除
          </button>
        </div>
      )}
    </div>
  );
});

const FileRow = memo(function FileRow({
  file,
  isSelected,
  onClick,
  onDoubleClick,
  onDownload,
  onDelete,
  onContextMenu
}: {
  file: FileItem;
  isSelected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
  onDownload: () => void;
  onDelete: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer group"
      style={{
        background: isSelected ? 'var(--bg-tertiary)' : 'transparent',
      }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="flex-shrink-0">
        {getFileIcon(file.name, file.is_dir, 16)}
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-xs truncate" style={{ color: 'var(--text-primary)' }}>
          {file.name}
        </div>
        <div className="text-xs truncate" style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>
          {getFileType(file.name, file.is_dir)}
          {!file.is_dir && file.size !== undefined && ` · ${formatFileSize(file.size)}`}
        </div>
      </div>

      {showActions && (
        <div className="flex items-center gap-1 flex-shrink-0">
          {!file.is_dir && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownload();
              }}
              className="p-0.5 rounded"
              style={{ color: 'var(--accent)' }}
              title="下载"
            >
              <Download size={12} />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-0.5 rounded"
            style={{ color: 'var(--danger)' }}
            title="删除"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
});

const TransferItem = memo(function TransferItem({
  transfer, 
  onPause, 
  onResume, 
  onCancel 
}: { 
  transfer: TransferTask;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}) {
  const progress = transfer.totalSize > 0 
    ? Math.round((transfer.transferred / transfer.totalSize) * 100) 
    : 0;

  const handleRedownload = () => {
    if (transfer.blobUrl) {
      const a = document.createElement('a');
      a.href = transfer.blobUrl;
      a.download = transfer.fileName;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        if (a.parentNode) a.parentNode.removeChild(a);
      }, 100);
    }
  };

  return (
    <div className="px-2 py-1.5 text-xs" style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          {transfer.type === 'upload' ? (
            <Upload size={12} style={{ color: 'var(--accent)' }} />
          ) : transfer.status === 'waiting' ? (
            <Clock size={12} style={{ color: 'var(--warning)' }} />
          ) : (
            <Download size={12} style={{ color: 'var(--success)' }} />
          )}
          <span className="truncate" style={{ color: 'var(--text-primary)' }}>
            {transfer.fileName}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {transfer.status === 'transferring' && (
            <button
              onClick={onPause}
              className="p-0.5 rounded"
              style={{ color: 'var(--text-secondary)' }}
              title="暂停"
            >
              <Pause size={10} />
            </button>
          )}
          {transfer.status === 'paused' && (
            <button
              onClick={onResume}
              className="p-0.5 rounded"
              style={{ color: 'var(--accent)' }}
              title="继续"
            >
              <Play size={10} />
            </button>
          )}
          {transfer.status === 'completed' && transfer.blobUrl && (
            <button
              onClick={handleRedownload}
              className="p-0.5 rounded"
              style={{ color: 'var(--accent)' }}
              title="重新保存"
            >
              <RotateCcw size={10} />
            </button>
          )}
          {transfer.status !== 'completed' && (
            <button
              onClick={onCancel}
              className="p-0.5 rounded"
              style={{ color: 'var(--danger)' }}
              title="取消"
            >
              <X size={10} />
            </button>
          )}
          {transfer.status === 'completed' && (
            <button
              onClick={onCancel}
              className="p-0.5 rounded"
              style={{ color: 'var(--text-secondary)' }}
              title="清除"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${progress}%`,
              background: transfer.status === 'error' 
                ? 'var(--danger)' 
                : transfer.status === 'completed' 
                  ? 'var(--success)' 
                  : 'var(--accent)',
            }}
          />
        </div>
        <span style={{ color: 'var(--text-secondary)', width: '60px', textAlign: 'right' }}>
          {transfer.status === 'completed' ? '完成' : 
           transfer.status === 'error' ? `失败${transfer.error ? `: ${transfer.error}` : ''}` :
           transfer.status === 'paused' ? '暂停' :
           transfer.status === 'waiting' ? '等待中' :
           transfer.status === 'pending' ? '准备中' :
           formatSpeed(transfer.speed)}
        </span>
      </div>
      
      <div className="flex justify-between mt-0.5" style={{ color: 'var(--text-secondary)', fontSize: '10px' }}>
        <span>{formatFileSize(transfer.transferred)} / {formatFileSize(transfer.totalSize)}</span>
        <span>{progress}%</span>
      </div>
    </div>
  );
});