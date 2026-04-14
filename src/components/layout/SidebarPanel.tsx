import { memo } from 'react';
import { useActivityStore } from '../../stores/activityStore';
import { ConnectionList } from '../sidebar/ConnectionList';
import { AiChatPanel } from '../ai/AiChatPanel';

export const SidebarPanel = memo(function SidebarPanel() {
  const activeIcon = useActivityStore((s) => s.activeIcon);

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-secondary)' }}>
      {activeIcon === 'servers' ? (
        <ConnectionList />
      ) : (
        <AiChatPanel />
      )}
    </div>
  );
});
