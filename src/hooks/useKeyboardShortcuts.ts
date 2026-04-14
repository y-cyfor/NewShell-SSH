import { useEffect } from 'react';
import { useTerminalStore } from '../stores/terminalStore';

interface ShortcutConfig {
  onToggleSettings?: () => void;
  onToggleFileTree?: () => void;
}

export function useKeyboardShortcuts(config?: ShortcutConfig) {
  const { tabs, activeTabId, removeTab, setActiveTab, addTab } = useTerminalStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrl = e.ctrlKey || e.metaKey;

      // Ctrl+T: 新标签（当前连接的SSH）
      if (isCtrl && e.key === 't') {
        e.preventDefault();
        const activeTab = tabs.find(t => t.id === activeTabId);
        if (activeTab?.connId && activeTab.type === 'ssh') {
          addTab(activeTab.connId, activeTab.name);
        }
      }

      // Ctrl+W: 关闭当前标签
      if (isCtrl && e.key === 'w') {
        e.preventDefault();
        if (activeTabId) {
          removeTab(activeTabId);
        }
      }

      // Ctrl+Tab: 切换到下一个标签
      if (isCtrl && e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        const idx = tabs.findIndex(t => t.id === activeTabId);
        if (idx >= 0 && idx < tabs.length - 1) {
          setActiveTab(tabs[idx + 1].id);
        } else if (tabs.length > 0) {
          setActiveTab(tabs[0].id);
        }
      }

      // Ctrl+Shift+Tab: 切换到上一个标签
      if (isCtrl && e.shiftKey && e.key === 'Tab') {
        e.preventDefault();
        const idx = tabs.findIndex(t => t.id === activeTabId);
        if (idx > 0) {
          setActiveTab(tabs[idx - 1].id);
        } else if (tabs.length > 0) {
          setActiveTab(tabs[tabs.length - 1].id);
        }
      }

      // Ctrl+Shift+P: 快速连接（打开服务器列表）
      if (isCtrl && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        // Toggle server list tab
        const serverTab = tabs.find(t => t.id === 'server-list-tab');
        if (serverTab) {
          setActiveTab('server-list-tab');
        }
      }

      // Ctrl+1/2/3...: 切换到指定标签
      if (isCtrl && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (tabs[idx]) {
          setActiveTab(tabs[idx].id);
        }
      }

      // F11: 全屏 (原生支持，但可以捕获)
      // Escape: 关闭弹窗等 - 由子组件自行处理
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tabs, activeTabId, removeTab, setActiveTab, addTab]);
}
