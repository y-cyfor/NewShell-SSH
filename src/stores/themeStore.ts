import { create } from 'zustand';

type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

function applyTheme(theme: Theme) {
  if (theme === 'light') {
    document.documentElement.classList.add('light');
  } else {
    document.documentElement.classList.remove('light');
  }
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (localStorage.getItem('newshell_theme') as Theme) || 'dark',

  toggleTheme: () => {
    set((state) => {
      const newTheme = state.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('newshell_theme', newTheme);
      applyTheme(newTheme);
      return { theme: newTheme };
    });
  },

  setTheme: (theme) => {
    localStorage.setItem('newshell_theme', theme);
    applyTheme(theme);
    set({ theme });
  },
}));