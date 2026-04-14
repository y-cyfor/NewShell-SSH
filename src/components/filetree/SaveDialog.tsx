import { useState, useEffect, useRef } from 'react';
import { FolderOpen, X, Download } from 'lucide-react';
import { useDownloadSettingsStore } from '../../stores/downloadSettingsStore';

interface SaveDialogProps {
  fileName: string;
  onSave: (path: string, rememberChoice: boolean) => void;
  onCancel: () => void;
}

export function SaveDialog({ fileName, onSave, onCancel }: SaveDialogProps) {
  const { downloadPath, setDownloadPath, setAskBeforeDownload } = useDownloadSettingsStore();
  const [path, setPath] = useState(downloadPath || '');
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSave = () => {
    if (!path.trim()) {
      setError('请输入保存路径');
      return;
    }
    
    // 如果勾选了"下次不再询问"，则保存路径设置
    if (dontAskAgain) {
      setDownloadPath(path.trim());
      setAskBeforeDownload(false);
    }
    
    onSave(path.trim(), dontAskAgain);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onCancel}
    >
      <div 
        className="w-96 rounded-lg shadow-xl overflow-hidden"
        style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div 
          className="flex items-center justify-between px-4 py-3"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-2">
            <Download size={16} style={{ color: 'var(--accent)' }} />
            <span className="text-sm font-medium">保存文件</span>
          </div>
          <button 
            onClick={onCancel} 
            className="p-1 rounded hover:opacity-70"
            style={{ color: 'var(--text-secondary)' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
              文件名
            </label>
            <div 
              className="px-3 py-2 rounded text-sm truncate"
              style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
            >
              {fileName}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>
              保存路径
            </label>
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={path}
                onChange={(e) => {
                  setPath(e.target.value);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                placeholder="输入保存路径，如：C:\Users\Downloads"
                className="flex-1 px-3 py-2 rounded text-sm outline-none"
                style={{ 
                  background: 'var(--bg-primary)', 
                  color: 'var(--text-primary)', 
                  border: `1px solid ${error ? 'var(--danger)' : 'var(--border)'}` 
                }}
              />
            </div>
            {error && (
              <div className="text-xs mt-1" style={{ color: 'var(--danger)' }}>
                {error}
              </div>
            )}
          </div>

          {/* 复选框 */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dontAskAgain}
              onChange={(e) => setDontAskAgain(e.target.checked)}
              className="w-4 h-4 rounded"
              style={{ accentColor: 'var(--accent)' }}
            />
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              下次不再询问（使用此路径作为默认下载位置）
            </span>
          </label>
        </div>

        {/* Footer */}
        <div 
          className="flex justify-end gap-2 px-4 py-3"
          style={{ borderTop: '1px solid var(--border)' }}
        >
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded text-sm"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}
          >
            取消
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded text-sm font-medium"
            style={{ background: 'var(--accent)', color: '#fff' }}
          >
            下载
          </button>
        </div>
      </div>
    </div>
  );
}
