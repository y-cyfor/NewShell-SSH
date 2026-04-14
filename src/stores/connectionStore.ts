import { create } from 'zustand';
import { Connection } from '../types';
import api from '../services/api';

const STORAGE_KEY = 'newshell_connections';

function generateId(): string {
  return crypto.randomUUID();
}

function loadFromLocal(): Connection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToLocal(connections: Connection[]) {
  // SEC-1: 过滤敏感字段不存入localStorage
  const safeConnections = connections.map(({ password, private_key, passphrase, ...rest }) => rest);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(safeConnections));
}

interface ConnectionState {
  connections: Connection[];
  loading: boolean;
  loadConnections: () => void;
  addConnection: (conn: Omit<Connection, 'id' | 'created_at' | 'updated_at' | 'synced'>) => void;
  updateConnection: (id: string, conn: Partial<Connection>) => void;
  deleteConnection: (id: string) => void;
  getGroups: () => string[];
  syncToServer: (id: string) => Promise<void>;
  syncFromServer: (id: string) => Promise<void>;
  syncAllToServer: () => Promise<void>;
  syncAllFromServer: () => Promise<void>;
}

export const useConnectionStore = create<ConnectionState>((set, get) => ({
  connections: [],
  loading: false,

  loadConnections: () => {
    const connections = loadFromLocal();
    set({ connections });
  },

  addConnection: (conn) => {
    const now = new Date().toISOString();
    const newConn: Connection = {
      ...conn,
      id: generateId(),
      synced: false,
      created_at: now,
      updated_at: now,
    };
    const connections = [newConn, ...get().connections];
    saveToLocal(connections);
    set({ connections });
  },

  updateConnection: (id, conn) => {
    const connections = get().connections.map((c) =>
      c.id === id ? { ...c, ...conn, updated_at: new Date().toISOString() } : c
    );
    saveToLocal(connections);
    set({ connections });
  },

  deleteConnection: (id) => {
    const connections = get().connections.filter((c) => c.id !== id);
    saveToLocal(connections);
    set({ connections });
  },

  getGroups: () => {
    const groups = new Set(get().connections.map((c) => c.group_name || '默认分组'));
    return Array.from(groups);
  },

  syncToServer: async (id) => {
    const conn = get().connections.find((c) => c.id === id);
    if (!conn) return;
    try {
      // Strip sensitive fields before sending to server
      const { password, private_key, passphrase, ...safeConn } = conn;
      await api.post('/api/connections', safeConn);
      // 同步到服务器不改变 synced 状态，synced 只表示是否从云端同步
      const connections = get().connections.map((c) =>
        c.id === id ? { ...c, updated_at: new Date().toISOString() } : c
      );
      saveToLocal(connections);
      set({ connections });
    } catch (err: any) {
      throw new Error('同步到服务器失败：' + (err.response?.data?.error || err.message));
    }
  },

  syncFromServer: async (id) => {
    try {
      const res = await api.get('/api/connections');
      const serverConns: Connection[] = res.data || [];
      const localConn = get().connections.find((c) => c.id === id);
      if (!localConn) return;

      const serverConn = serverConns.find(
        (sc: Connection) => sc.host === localConn.host && sc.username === localConn.username && sc.port === localConn.port
      );
      if (serverConn) {
        const connections = get().connections.map((c) =>
          c.id === id ? { ...serverConn, id: c.id, synced: true, updated_at: new Date().toISOString() } : c
        );
        saveToLocal(connections);
        set({ connections });
      }
    } catch (err: any) {
      throw new Error('从服务器同步失败: ' + (err.response?.data?.error || err.message));
    }
  },

  syncAllToServer: async () => {
    const localConns = get().connections;
    try {
      for (const conn of localConns) {
        // Strip sensitive fields before sending to server
        const { password, private_key, passphrase, ...safeConn } = conn;
        await api.post('/api/connections', safeConn);
      }
      const connections = localConns.map((c) => ({ ...c, synced: true }));
      saveToLocal(connections);
      set({ connections });
    } catch (err: any) {
      throw new Error('批量同步失败: ' + (err.response?.data?.error || err.message));
    }
  },

  syncAllFromServer: async () => {
    try {
      const res = await api.get('/api/connections');
      const serverConns: Connection[] = res.data || [];
      const localConns = get().connections;

      const merged: Connection[] = [...localConns];
      for (const sc of serverConns) {
        const existingIdx = merged.findIndex(
          (lc) => lc.host === sc.host && lc.username === sc.username && lc.port === sc.port
        );
        if (existingIdx >= 0) {
          merged[existingIdx] = { ...sc, id: merged[existingIdx].id, synced: true, updated_at: new Date().toISOString() };
        } else {
          merged.push({ ...sc, id: sc.id || generateId(), synced: true, updated_at: new Date().toISOString() });
        }
      }

      saveToLocal(merged);
      set({ connections: merged });
    } catch (err: any) {
      throw new Error('从服务器同步失败: ' + (err.response?.data?.error || err.message));
    }
  },
}));
