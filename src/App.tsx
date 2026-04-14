import { useEffect } from 'react';
import { MainLayout } from './components/layout/MainLayout';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { useSyncStore } from './stores/syncStore';
import { useAIConfigStore } from './stores/aiConfigStore';

export default function App() {
  useEffect(() => {
    // Load global sync and AI config state (connections and theme are handled by MainLayout)
    useSyncStore.getState().loadState();
    useAIConfigStore.getState().loadConfig();
    // Apply saved theme on startup
    const saved = localStorage.getItem('newshell_theme') || 'dark';
    document.documentElement.classList.toggle('light', saved === 'light');
  }, []);

  return (
    <ErrorBoundary>
      <MainLayout />
    </ErrorBoundary>
  );
}