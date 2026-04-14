import { Monitor, Minus, Square, X, FolderTree, Settings } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useThemeStore } from '../../stores/themeStore';

interface TitleBarProps {
  onToggleFileTree?: () => void;
  onToggleSettings?: () => void;
  showFileTree?: boolean;
}

export function TitleBar({ onToggleFileTree, onToggleSettings, showFileTree }: TitleBarProps) {
  const [isMaximized, setIsMaximized] = useState(false);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const checkMaximized = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const maximized = await win.isMaximized();
        setIsMaximized(maximized);

        const unlisten = await win.onResized(async () => {
          const max = await win.isMaximized();
          setIsMaximized(max);
        });

        return () => { unlisten(); };
      } catch {}
    };
    checkMaximized();
  }, []);

  const handleMinimize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.minimize();
    } catch (err) {
      console.error('Minimize failed:', err);
    }
  };

  const handleMaximize = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.toggleMaximize();
    } catch (err) {
      console.error('Maximize failed:', err);
    }
  };

  const handleClose = async () => {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      const win = getCurrentWindow();
      await win.close();
    } catch (err) {
      console.error('Close failed:', err);
    }
  };

  return (
    <div
      className="flex h-9 select-none"
      style={{
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* 左侧：可拖动区域 */}
      <div
        className="flex-1 flex items-center px-3 gap-2"
        data-tauri-drag-region
      >
        {/* Logo with gradient */}
        <div className="w-6 h-6 rounded-md flex items-center justify-center"
          style={{ background: 'var(--accent-gradient)', boxShadow: 'var(--shadow-sm)' }}>
          <Monitor size={13} style={{ color: '#fff' }} />
        </div>
        <span className="text-sm font-bold tracking-tight" data-tauri-drag-region
          style={{ background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          NewShell
        </span>
        <span className="text-xs ml-1" style={{ color: 'var(--text-muted)' }}>
          SSH Manager
        </span>
      </div>

      {/* 工具栏按钮 */}
      <div className="flex items-center">
        <TitleBarButton
          icon={<FolderTree size={14} />}
          onClick={onToggleFileTree || (() => {})}
          title="文件树"
          active={showFileTree}
        />
        <div className="w-px h-4 mx-1" style={{ background: 'var(--border)' }} />
        <TitleBarButton
          icon={<Settings size={14} />}
          onClick={onToggleSettings || (() => {})}
          title="设置"
        />
      </div>

      {/* 窗口控制按钮 */}
      <div className="flex items-center">
        <WindowButton
          icon={<Minus size={14} />}
          onClick={handleMinimize}
          title="最小化"
        />
        <WindowButton
          icon={isMaximized ? <Square size={12} /> : <Square size={14} />}
          onClick={handleMaximize}
          title={isMaximized ? "还原" : "最大化"}
        />
        <WindowButton
          icon={<X size={14} />}
          onClick={handleClose}
          title="关闭"
          isClose
        />
      </div>
    </div>
  );
}

function WindowButton({
  icon,
  onClick,
  title,
  isClose
}: {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
  isClose?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-12 h-9 transition-all duration-150"
      style={{
        background: isClose && isHovered
          ? '#e81123'
          : isHovered
            ? 'var(--surface-hover)'
            : 'transparent',
        color: isClose && isHovered
          ? 'white'
          : 'var(--text-secondary)'
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {icon}
    </button>
  );
}

function TitleBarButton({
  icon,
  onClick,
  title,
  active
}: {
  icon: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-8 h-9 transition-all duration-150"
      style={{
        background: active
          ? 'var(--accent-subtle)'
          : isHovered
            ? 'var(--surface-hover)'
            : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-secondary)',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {icon}
    </button>
  );
}
