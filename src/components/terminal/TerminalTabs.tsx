import { useState, useRef, useEffect, memo } from 'react';
import { useTerminalStore } from '../../stores/terminalStore';
import { TerminalPanel } from './TerminalPanel';
import { AgentTerminalPanel } from './AgentTerminalPanel';
import { ServerListPanel } from '../server/ServerListPanel';
import { SnippetsPanel } from './SnippetsPanel';
import { X, Plus, Bot, Code } from 'lucide-react';

export const TerminalTabs = memo(function TerminalTabs() {
  const tabs = useTerminalStore((s) => s.tabs);
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const setActiveTab = useTerminalStore((s) => s.setActiveTab);
  const removeTab = useTerminalStore((s) => s.removeTab);
  const addTab = useTerminalStore((s) => s.addTab);
  const [showSnippets, setShowSnippets] = useState(false);
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const terminalInputRef = useRef<HTMLInputElement>(null);

  const handleNewTab = () => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (activeTab && activeTab.type === 'ssh' && activeTab.connId) {
      addTab(activeTab.connId, activeTab.name);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tab Bar */}
      <div
        className="flex items-center gap-0 overflow-x-auto"
        style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="flex items-center gap-1.5 px-3 py-1.5 cursor-pointer text-xs whitespace-nowrap group relative"
            style={{
              background: tab.id === activeTabId ? 'var(--terminal-bg)' : 'transparent',
              color: tab.id === activeTabId ? 'var(--text-primary)' : 'var(--text-secondary)',
              transition: 'background 0.15s, color 0.15s',
            }}
            onClick={() => setActiveTab(tab.id)}
          >
            {/* Active gradient indicator */}
            {tab.id === activeTabId && (
              <div className="absolute top-0 left-0 right-0 h-0.5 rounded-full" style={{ background: 'var(--accent-gradient)' }} />
            )}
            {tab.type === 'agent-exec' && <Bot size={11} style={{ color: tab.id === activeTabId ? 'var(--accent)' : 'var(--text-secondary)' }} />}
            <span className="max-w-[120px] truncate">{tab.name}</span>
            {tab.type !== 'server-list' && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeTab(tab.id);
                }}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 transition-all"
                style={{ color: 'var(--text-secondary)' }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => setShowSnippets(true)}
          className="px-2 py-1.5 transition-colors hover:opacity-80"
          style={{ color: 'var(--text-secondary)' }}
          title="命令片段"
        >
          <Code size={14} />
        </button>
        <button
          onClick={handleNewTab}
          className="px-2 py-1.5 transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          title="新建标签 (Ctrl+T)"
        >
          <Plus size={14} />
        </button>
      </div>

      {/* Tab Panels */}
      <div className="flex-1 relative">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className="absolute inset-0"
            style={{ display: tab.id === activeTabId ? 'block' : 'none' }}
          >
            {tab.id === activeTabId && (
              tab.type === 'server-list' ? (
                <ServerListPanel />
              ) : tab.type === 'agent-exec' && tab.agentSessionId ? (
                <AgentTerminalPanel sessionId={tab.agentSessionId} isActive={true} />
              ) : tab.type === 'ssh' && tab.connId ? (
                <TerminalPanel connId={tab.connId} isActive={true} />
              ) : (
                <div className="h-full flex items-center justify-center" style={{ color: 'var(--text-secondary)' }}>
                  无效的标签页
                </div>
              )
            )}
          </div>
        ))}
      </div>
      {showSnippets && (
        <SnippetsPanel
          onClose={() => setShowSnippets(false)}
          onInsert={(command) => {
            // 找到当前活动终端，通过 store 发送命令
            // 这里需要找到对应的 Terminal ref
            window.dispatchEvent(new CustomEvent('terminal-insert', { detail: command }));
          }}
        />
      )}
    </div>
  );
});
