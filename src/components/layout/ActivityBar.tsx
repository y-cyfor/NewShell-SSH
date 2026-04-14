import { useActivityStore } from '../../stores/activityStore';
import { Server, MessageSquare, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface ActivityBarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function ActivityBar({ sidebarCollapsed, onToggleSidebar }: ActivityBarProps) {
  const { activeIcon, toggleIcon } = useActivityStore();

  return (
    <div
      className="flex flex-col items-center py-2 gap-1"
      style={{
        width: '40px',
        background: 'var(--bg-primary)',
        borderRight: '1px solid var(--border)',
      }}
    >
      {/* 收起/展开侧边栏按钮 */}
      <button
        onClick={onToggleSidebar}
        title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
        className="flex items-center justify-center w-10 h-10 transition-colors"
        style={{ color: 'var(--text-secondary)' }}
      >
        <div className="w-8 h-8 flex items-center justify-center rounded transition-colors hover:bg-opacity-50">
          {sidebarCollapsed ? <PanelLeftOpen size={20} /> : <PanelLeftClose size={20} />}
        </div>
      </button>
      
      {/* 分隔线 */}
      <div className="w-6 h-px my-1" style={{ background: 'var(--border)' }} />
      
      {/* 服务器列表按钮 */}
      <ActivityBarButton
        icon={<Server size={20} />}
        title="服务器列表"
        isActive={activeIcon === 'servers'}
        onClick={() => toggleIcon('servers')}
      />
      {/* AI助手按钮 */}
      <ActivityBarButton
        icon={<MessageSquare size={20} />}
        title="AI助手"
        isActive={activeIcon === 'ai'}
        onClick={() => toggleIcon('ai')}
      />
    </div>
  );
}

function ActivityBarButton({
  icon,
  title,
  isActive,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="relative flex items-center justify-center w-10 h-10 transition-colors"
      style={{
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
      }}
    >
      {/* 左侧激活指示器 */}
      {isActive && (
        <div
          className="absolute left-0 w-0.5 h-6 rounded-r"
          style={{ background: 'var(--accent)' }}
        />
      )}
      <div
        className="w-8 h-8 flex items-center justify-center rounded transition-colors"
        style={{
          background: isActive ? 'var(--bg-tertiary)' : 'transparent',
        }}
      >
        {icon}
      </div>
    </button>
  );
}
