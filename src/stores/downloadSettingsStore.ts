import { create } from 'zustand';

interface DownloadSettings {
  // 默认下载路径
  downloadPath: string;
  // 每次下载前询问
  askBeforeDownload: boolean;
  // 下载限速 (KB/s, 0表示不限制)
  downloadSpeedLimit: number;
  // 同时下载数 (0表示不限制)
  concurrentDownloads: number;
}

interface DownloadSettingsState extends DownloadSettings {
  setDownloadPath: (path: string) => void;
  setAskBeforeDownload: (ask: boolean) => void;
  setDownloadSpeedLimit: (limit: number) => void;
  setConcurrentDownloads: (count: number) => void;
  loadSettings: () => void;
}

const STORAGE_KEY = 'newshell_download_settings';

function loadFromStorage(): DownloadSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...getDefaultSettings(), ...JSON.parse(stored) };
    }
  } catch {}
  return getDefaultSettings();
}

function getDefaultSettings(): DownloadSettings {
  return {
    downloadPath: '',
    askBeforeDownload: true,
    downloadSpeedLimit: 0,
    concurrentDownloads: 0,
  };
}

function saveToStorage(settings: DownloadSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const useDownloadSettingsStore = create<DownloadSettingsState>((set) => ({
  ...loadFromStorage(),

  setDownloadPath: (path) => {
    set((state) => {
      const newState = { downloadPath: path };
      saveToStorage({ ...state, ...newState });
      return newState;
    });
  },

  setAskBeforeDownload: (ask) => {
    set((state) => {
      const newState = { askBeforeDownload: ask };
      saveToStorage({ ...state, ...newState });
      return newState;
    });
  },

  setDownloadSpeedLimit: (limit) => {
    set((state) => {
      const newState = { downloadSpeedLimit: Math.max(0, Math.min(1000000, limit)) };
      saveToStorage({ ...state, ...newState });
      return newState;
    });
  },

  setConcurrentDownloads: (count) => {
    set((state) => {
      const newState = { concurrentDownloads: Math.max(0, Math.min(100, count)) };
      saveToStorage({ ...state, ...newState });
      return newState;
    });
  },

  loadSettings: () => {
    const settings = loadFromStorage();
    set(settings);
  },
}));
