import { create } from 'zustand';
import { ServerGroup } from '../types';

const STORAGE_KEY = 'newshell_groups';

function generateId(): string {
  return `group-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2, 9)}`;
}

function loadFromLocal(): ServerGroup[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch {}
  // 默认分组
  return [
    {
      id: 'default',
      name: '默认分组',
      order: 0,
      connections: [],
    },
  ];
}

function saveToLocal(groups: ServerGroup[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
}

interface GroupState {
  groups: ServerGroup[];
  loadGroups: () => void;
  createGroup: (name: string) => string;
  renameGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  moveConnection: (connId: string, fromGroupId: string, toGroupId: string) => void;
  addConnectionToGroup: (connId: string, groupId: string) => void;
  removeConnectionFromGroup: (connId: string, groupId: string) => void;
  reorderGroups: (groupIds: string[]) => void;
  getGroupByName: (name: string) => ServerGroup | undefined;
  getGroupById: (id: string) => ServerGroup | undefined;
}

export const useGroupStore = create<GroupState>((set, get) => ({
  groups: [],

  loadGroups: () => {
    const groups = loadFromLocal();
    set({ groups });
  },

  createGroup: (name: string) => {
    const id = generateId();
    const groups = get().groups;
    const newGroup: ServerGroup = {
      id,
      name,
      order: groups.length,
      connections: [],
    };
    const newGroups = [...groups, newGroup];
    saveToLocal(newGroups);
    set({ groups: newGroups });
    return id;
  },

  renameGroup: (id: string, name: string) => {
    const groups = get().groups.map((g) =>
      g.id === id ? { ...g, name } : g
    );
    saveToLocal(groups);
    set({ groups });
  },

  deleteGroup: (id: string) => {
    if (id === 'default') {
      return;
    }
    const groups = get().groups.filter((g) => g.id !== id);
    saveToLocal(groups);
    set({ groups });
  },

  moveConnection: (connId: string, fromGroupId: string, toGroupId: string) => {
    const groups = get().groups.map((g) => {
      if (g.id === fromGroupId) {
        return {
          ...g,
          connections: g.connections.filter((id) => id !== connId),
        };
      }
      if (g.id === toGroupId && !g.connections.includes(connId)) {
        return {
          ...g,
          connections: [...g.connections, connId],
        };
      }
      return g;
    });
    saveToLocal(groups);
    set({ groups });
  },

  addConnectionToGroup: (connId: string, groupId: string) => {
    const groups = get().groups.map((g) => {
      if (g.id === groupId && !g.connections.includes(connId)) {
        return {
          ...g,
          connections: [...g.connections, connId],
        };
      }
      return g;
    });
    saveToLocal(groups);
    set({ groups });
  },

  removeConnectionFromGroup: (connId: string, groupId: string) => {
    const groups = get().groups.map((g) => {
      if (g.id === groupId) {
        return {
          ...g,
          connections: g.connections.filter((id) => id !== connId),
        };
      }
      return g;
    });
    saveToLocal(groups);
    set({ groups });
  },

  reorderGroups: (groupIds: string[]) => {
    const groups = get().groups
      .map((g) => {
        const order = groupIds.indexOf(g.id);
        return order !== -1 ? { ...g, order } : g;
      })
      .sort((a, b) => a.order - b.order);
    saveToLocal(groups);
    set({ groups });
  },

  getGroupByName: (name: string) => {
    return get().groups.find((g) => g.name === name);
  },

  getGroupById: (id: string) => {
    return get().groups.find((g) => g.id === id);
  },
}));
