import { useActivityStore } from '../../stores/activityStore';
import { ConnectionList } from '../sidebar/ConnectionList';
import { AiChatPanel } from '../ai/AiChatPanel';

export function SidebarPanel() {
  const { activeIcon } = useActivityStore();

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-secondary)' }}>
      {activeIcon === 'servers' ? (
        <ConnectionList />
      ) : (
        <AiChatPanel />
      )}
    </div>
  );
}
