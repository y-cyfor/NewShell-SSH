import { create } from 'zustand';
import { SyncState } from '../types';
import api from '../services/api';

const STORAGE_KEY = 'newshell_sync';

function loadFromLocal(): SyncState {
  return {
    serverUrl: localStorage.getItem('newshell_sync_url') || 'http://localhost:29800',
    token: localStorage.getItem('newshell_sync_token') || '',
    username: localStorage.getItem('newshell_sync_user') || '',
    isLoggedIn: !!localStorage.getItem('newshell_sync_token'),
  };
}

interface SyncStore extends SyncState {
  loading: boolean;
  loadState: () => void;
  setServerUrl: (url: string) => void;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useSyncStore = create<SyncStore>((set) => ({
  ...loadFromLocal(),
  loading: false,

  loadState: () => {
    set(loadFromLocal());
  },

  setServerUrl: (url) => {
    const normalized = url.replace(/\/+$/, '');
    localStorage.setItem('newshell_sync_url', normalized);
    set({ serverUrl: normalized });
  },

  login: async (username, password) => {
    set({ loading: true });
    try {
      const res = await api.post('/api/auth/login', { username, password });
      const { token } = res.data;
      localStorage.setItem('newshell_sync_token', token);
      localStorage.setItem('newshell_sync_user', username);
      set({ token, username, isLoggedIn: true });
    } finally {
      set({ loading: false });
    }
  },

  register: async (username, password) => {
    set({ loading: true });
    try {
      const res = await api.post('/api/auth/register', { username, password });
      const { token } = res.data;
      localStorage.setItem('newshell_sync_token', token);
      localStorage.setItem('newshell_sync_user', username);
      set({ token, username, isLoggedIn: true });
    } finally {
      set({ loading: false });
    }
  },

  logout: () => {
    localStorage.removeItem('newshell_sync_token');
    localStorage.removeItem('newshell_sync_user');
    set({ token: '', username: '', isLoggedIn: false });
  },
}));
