import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { useThemeStore } from '../stores/themeStore';
import { useFontSettingsStore } from '../stores/fontSettingsStore';

const DARK_THEME = {
  background: '#0c0c0c',
  foreground: '#e2e8f0',
  cursor: '#3b82f6',
  cursorAccent: '#0c0c0c',
  selectionBackground: '#3b82f680',
  black: '#1e293b',
  red: '#ef4444',
  green: '#22c55e',
  yellow: '#f59e0b',
  blue: '#3b82f6',
  magenta: '#8b5cf6',
  cyan: '#06b6d4',
  white: '#e2e8f0',
  brightBlack: '#475569',
  brightRed: '#f87171',
  brightGreen: '#4ade80',
  brightYellow: '#fbbf24',
  brightBlue: '#60a5fa',
  brightMagenta: '#a78bfa',
  brightCyan: '#22d3ee',
  brightWhite: '#f8fafc',
};

const LIGHT_THEME = {
  background: '#EAEAEF',
  foreground: '#1e293b',
  cursor: '#2563eb',
  cursorAccent: '#EAEAEF',
  selectionBackground: '#d0d0d8',
  black: '#1e293b',
  red: '#dc2626',
  green: '#16a34a',
  yellow: '#d97706',
  blue: '#2563eb',
  magenta: '#7c3aed',
  cyan: '#0891b2',
  white: '#f1f5f9',
  brightBlack: '#475569',
  brightRed: '#dc2626',
  brightGreen: '#16a34a',
  brightYellow: '#d97706',
  brightBlue: '#3b82f6',
  brightMagenta: '#a855f7',
  brightCyan: '#0d9488',
  brightWhite: '#f8fafc',
};

/**
 * Sync terminal theme and font with global settings.
 * Works for any component that holds a Terminal ref.
 */
export function useTerminalTheme(termRef: React.RefObject<Terminal | null>, defaultFontSize = 14) {
  const terminalFont = useFontSettingsStore((s) => s.terminalFont);
  const terminalFontSize = useFontSettingsStore((s) => s.fontSize);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const applyTheme = (theme: string) => {
      term.options.theme = theme === 'light' ? LIGHT_THEME : DARK_THEME;
    };

    // Initial theme apply
    applyTheme(useThemeStore.getState().theme);

    // Subscribe to theme changes
    const unsubscribe = useThemeStore.subscribe((state) => {
      applyTheme(state.theme);
    });

    return () => {
      unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync font when settings change
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontFamily = terminalFont;
  }, [terminalFont, termRef]);

  // Sync font size when settings change
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.fontSize = terminalFontSize || defaultFontSize;
  }, [terminalFontSize, defaultFontSize, termRef]);
}
