import { memo } from 'react';
import { useActivityStore } from '../../stores/activityStore';
import { Server, MessageSquare, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

interface ActivityBarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export const ActivityBar = memo(function ActivityBar({ sidebarCollapsed, onToggleSidebar }: ActivityBarProps) {
  const activeIcon = useActivityStore((s) => s.activeIcon);
  const toggleIcon = useActivityStore((s) => s.toggleIcon);

  return (
    <div
      className="flex flex-col items-center py-2 gap-1"
      style={{
        width: '40px',
        background: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border)',
        boxShadow: 'var(--shadow-sm)',
        zIndex: 10,
      }}
    >
      {/* 收起/展开侧边栏按钮 */}
      <button
        onClick={onToggleSidebar}
        title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
        className="flex items-center justify-center w-10 h-10 transition-all duration-200"
        style={{ color: 'var(--text-secondary)' }}
      >
        <div className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200"
          style={{
            background: 'var(--surface-hover)',
          }}>
          {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </div>
      </button>

      {/* 分隔线 */}
      <div className="w-5 h-px my-1" style={{ background: 'var(--border)' }} />

      {/* 服务器列表按钮 */}
      <ActivityBarButton
        icon={<Server size={18} />}
        title="服务器列表"
        isActive={activeIcon === 'servers'}
        onClick={() => toggleIcon('servers')}
      />
      {/* AI助手按钮 */}
      <ActivityBarButton
        icon={<MessageSquare size={18} />}
        title="AI助手"
        isActive={activeIcon === 'ai'}
        onClick={() => toggleIcon('ai')}
      />
    </div>
  );
});

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
      className="relative flex items-center justify-center w-10 h-10 transition-all duration-200"
      style={{
        color: isActive ? 'var(--accent)' : 'var(--text-secondary)',
      }}
    >
      {/* 左侧激活指示器 - gradient */}
      {isActive && (
        <div
          className="absolute left-0 w-0.5 h-5 rounded-r"
          style={{ background: 'var(--accent-gradient)' }}
        />
      )}
      <div
        className="w-8 h-8 flex items-center justify-center rounded-lg transition-all duration-200"
        style={{
          background: isActive ? 'var(--accent-subtle)' : 'transparent',
        }}
      >
        {icon}
      </div>
    </button>
  );
}
