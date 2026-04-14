import { create } from 'zustand';

interface FontSettings {
  uiFont: string;
  terminalFont: string;
  fontSize: number;
}

interface FontSettingsState extends FontSettings {
  setUIFont: (font: string) => void;
  setTerminalFont: (font: string) => void;
  setFontSize: (size: number) => void;
  loadSettings: () => void;
}

const STORAGE_KEY = 'newshell_font_settings';

// 内置推荐字体
export const BUILTIN_FONTS = [
  { name: '阿里巴巴普惠体', value: 'Alibaba PuHuiTi, sans-serif' },
  { name: 'MiSans', value: 'MiSans, sans-serif' },
  { name: 'Noto Sans SC', value: 'Noto Sans SC, sans-serif' },
  { name: 'Source Han Sans', value: 'Source Han Sans SC, sans-serif' },
  { name: 'HarmonyOS Sans', value: 'HarmonyOS Sans SC, sans-serif' },
  { name: 'LXGW WenKai', value: 'LXGW WenKai, sans-serif' },
];

// 内置等宽字体
export const BUILTIN_MONO_FONTS = [
  { name: 'JetBrains Mono', value: 'JetBrains Mono, monospace' },
  { name: 'Fira Code', value: 'Fira Code, monospace' },
  { name: 'Cascadia Code', value: 'Cascadia Code, monospace' },
  { name: 'Source Code Pro', value: 'Source Code Pro, monospace' },
  { name: 'Menlo', value: 'Menlo, monospace' },
  { name: 'Consolas', value: 'Consolas, monospace' },
  { name: 'monospace', value: 'monospace' },
];

function loadFromStorage(): FontSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...getDefaultSettings(), ...JSON.parse(stored) };
    }
  } catch {}
  return getDefaultSettings();
}

function getDefaultSettings(): FontSettings {
  return {
    uiFont: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    terminalFont: '"Cascadia Code", "Fira Code", "JetBrains Mono", monospace',
    fontSize: 14,
  };
}

function saveToStorage(settings: FontSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  // 同时保存单个key，供终端和MainLayout直接读取
  localStorage.setItem('newshell_font_size', String(settings.fontSize));
  localStorage.setItem('newshell_terminal_font', settings.terminalFont);
  localStorage.setItem('newshell_system_font', settings.uiFont);
  // 应用到DOM
  document.documentElement.style.fontSize = `${settings.fontSize}px`;
}

export const useFontSettingsStore = create<FontSettingsState>((set) => ({
  ...loadFromStorage(),

  setUIFont: (font) => {
    set((state) => {
      const newState = { uiFont: font };
      const merged = { ...state, ...newState };
      saveToStorage(merged);
      document.documentElement.style.setProperty('--system-font', `'${font}'`);
      return newState;
    });
  },

  setTerminalFont: (font) => {
    set((state) => {
      const newState = { terminalFont: font };
      const merged = { ...state, ...newState };
      saveToStorage(merged);
      return newState;
    });
  },

  setFontSize: (size) => {
    set((state) => {
      const newState = { fontSize: Math.max(10, Math.min(30, size)) };
      const merged = { ...state, ...newState };
      saveToStorage(merged);
      return newState;
    });
  },

  loadSettings: () => {
    const settings = loadFromStorage();
    localStorage.setItem('newshell_font_size', String(settings.fontSize));
    localStorage.setItem('newshell_terminal_font', settings.terminalFont);
    localStorage.setItem('newshell_system_font', settings.uiFont);
    document.documentElement.style.fontSize = `${settings.fontSize}px`;
    set(settings);
  },
}));
