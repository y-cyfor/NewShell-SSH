import { create } from 'zustand';
import { TerminalTab } from '../types';

let tabCounter = 0;

// 连接状态跟踪
export interface ConnectionStatus {
  [connId: string]: 'connected' | 'disconnected' | 'connecting' | 'error';
}

interface TerminalState {
  tabs: TerminalTab[];
  activeTabId: string | null;
  connectionStatus: ConnectionStatus;
  addTab: (connId: string, name: string) => string;
  addServerListTab: () => string;
  addAgentTab: (sessionId: string, connId: string, command?: string) => string;
  removeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  initDefaultTabs: () => void;
  setConnectionStatus: (connId: string, status: ConnectionStatus[string]) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  connectionStatus: {},

  addTab: (connId, name) => {
    tabCounter++;
    const id = `tab-${connId}-${tabCounter}-${Date.now()}`;
    const tab: TerminalTab = { id, type: 'ssh', connId, name: `${name} #${tabCounter}` };
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }));
    return id;
  },

  addServerListTab: () => {
    const id = 'server-list-tab';
    const existing = get().tabs.find(t => t.id === id);
    if (existing) {
      set({ activeTabId: id });
      return id;
    }
    
    const tab: TerminalTab = { 
      id, 
      type: 'server-list', 
      name: '服务器列表' 
    };
    set((state) => ({
      tabs: [tab, ...state.tabs],
      activeTabId: id,
    }));
    return id;
  },

  addAgentTab: (sessionId, connId, command) => {
    const id = `agent-${sessionId}-${Date.now()}`;
    const name = command ? `Agent: ${command.substring(0, 20)}...` : `Agent 执行`;
    const tab: TerminalTab = {
      id,
      type: 'agent-exec',
      connId,
      name,
      agentSessionId: sessionId,
    };
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }));
    return id;
  },

  removeTab: (tabId) => {
    if (tabId === 'server-list-tab') {
      return;
    }
    
    set((state) => {
      const tabs = state.tabs.filter((t) => t.id !== tabId);
      let activeTabId = state.activeTabId;
      if (activeTabId === tabId) {
        activeTabId = tabs.length > 0 ? tabs[tabs.length - 1].id : null;
      }
      return { tabs, activeTabId };
    });
  },

  setActiveTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  initDefaultTabs: () => {
    // Only initialize if no tabs exist yet
    set((state) => {
      if (state.tabs.length > 0) return state;
      const serverListTab: TerminalTab = {
        id: 'server-list-tab',
        type: 'server-list',
        name: '服务器列表',
      };
      return {
        tabs: [serverListTab],
        activeTabId: 'server-list-tab',
      };
    });
  },

  setConnectionStatus: (connId, status) => {
    set((state) => ({
      connectionStatus: { ...state.connectionStatus, [connId]: status },
    }));
  },
}));
