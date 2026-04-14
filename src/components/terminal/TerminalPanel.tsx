import { memo, useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { createTerminalWS, sendInput, sendResize } from '../../services/wsService';
import { useConnectionStore } from '../../stores/connectionStore';
import { useTerminalStore } from '../../stores/terminalStore';
import { highlightTerminalOutput } from '../../utils/terminalHighlighter';
import { useTerminalTheme } from '../../hooks/useTerminalTheme';
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react';
import '@xterm/xterm/css/xterm.css';

interface Props {
  connId: string;
  isActive: boolean;
}

export const TerminalPanel = memo(function TerminalPanel({ connId: rawConnId, isActive }: Props) {
  // 清理连接ID，移除可能的特殊字符
  const connId = rawConnId ? rawConnId.replace(/[^\w-]/g, '') : '';

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const [ready, setReady] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResultIndex, setSearchResultIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleSearch = useCallback((term: string) => {
    if (!searchRef.current || !termRef.current) return;
    if (term) {
      const found = searchRef.current.findNext(term);
      if (found) {
        setSearchResultIndex(prev => prev + 1);
      } else {
        // 如果找不到，从头开始搜索
        searchRef.current.findPrevious(term);
      }
    } else {
      searchRef.current.clearDecorations();
      setSearchResultIndex(-1);
    }
  }, []);

  const handleSearchPrev = useCallback(() => {
    if (!searchRef.current || !searchTerm) return;
    searchRef.current.findPrevious(searchTerm);
    setSearchResultIndex(prev => prev - 1);
  }, [searchTerm]);

  const handleSearchNext = useCallback(() => {
    if (!searchRef.current || !searchTerm) return;
    searchRef.current.findNext(searchTerm);
    setSearchResultIndex(prev => prev + 1);
  }, [searchTerm]);

  // Global keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        setShowSearch(prev => !prev);
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false);
        searchRef.current?.clearDecorations();
        setSearchTerm('');
        setSearchResultIndex(-1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showSearch]);

  // Focus search input when opened
  useEffect(() => {
    if (showSearch && searchInputRef.current) {
      searchInputRef.current.focus();
      searchInputRef.current.select();
    }
  }, [showSearch]);

  // Initialize once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const connections = useConnectionStore.getState().connections;
    const conn = connections.find((c) => c.id === connId);
    if (!conn) {
      return;
    }

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: parseInt(localStorage.getItem('newshell_font_size') || '14', 10),
      fontFamily: localStorage.getItem('newshell_terminal_font') || "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      scrollback: 5000,
      allowTransparency: false,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available
    }
    term.loadAddon(searchAddon);
    searchRef.current = searchAddon;

    term.open(containerRef.current);
    fitAddon.fit();

    term.write('\x1b[33mConnecting to ' + conn.host + ':' + conn.port + '...\x1b[0m\r\n');

    const { setConnectionStatus } = useTerminalStore.getState();
    setConnectionStatus(connId, 'connecting');

    const ws = createTerminalWS(
      connId,
      conn,
      (data) => {
        // 应用IP/URL高亮
        const highlightedData = highlightTerminalOutput(term, data);
        term.write(highlightedData);
      },
      () => {
        sendResize(ws, term.cols, term.rows);
        setConnectionStatus(connId, 'connected');
      },
      (err) => {
        setConnectionStatus(connId, 'error');
      }
    );

    wsRef.current = ws;
    termRef.current = term;
    fitRef.current = fitAddon;

    const onData = term.onData((data) => sendInput(ws, data));
    const onResize = term.onResize(({ cols, rows }) => sendResize(ws, cols, rows));

    const handleResize = () => {
      try { fitAddon.fit(); } catch {}
    };
    window.addEventListener('resize', handleResize);

    setReady(true);

    return () => {
      window.removeEventListener('resize', handleResize);
      onData.dispose();
      onResize.dispose();
      term.dispose();
      ws.close();
      termRef.current = null;
      wsRef.current = null;
      fitRef.current = null;
      searchRef.current = null;
      useTerminalStore.getState().setConnectionStatus(connId, 'disconnected');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit when becoming visible
  useEffect(() => {
    if (isActive && fitRef.current) {
      setTimeout(() => {
        try { fitRef.current?.fit(); } catch {}
      }, 50);
    }
  }, [isActive]);

  // Sync theme and font with global settings
  useTerminalTheme(termRef, 14);

  return (
    <div className="h-full w-full relative" style={{ display: isActive ? 'block' : 'none' }}>
      <div ref={containerRef} className="h-full w-full" />

      {/* Search Bar */}
      {showSearch && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg shadow-lg"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', backdropFilter: 'blur(8px)', minWidth: '280px' }}>
          <Search size={14} style={{ color: 'var(--text-secondary)' }} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); handleSearch(e.target.value); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.shiftKey ? handleSearchPrev() : handleSearchNext(); }
            }}
            placeholder="搜索终端内容..."
            className="text-xs outline-none bg-transparent flex-1"
            style={{ color: 'var(--text-primary)' }}
          />
          {searchTerm && (
            <div className="flex items-center gap-0.5">
              <button onClick={handleSearchPrev} className="p-0.5 rounded hover:bg-white/10 transition-colors"
                style={{ color: 'var(--text-secondary)' }} title="上一个">
                <ChevronUp size={12} />
              </button>
              <button onClick={handleSearchNext} className="p-0.5 rounded hover:bg-white/10 transition-colors"
                style={{ color: 'var(--text-secondary)' }} title="下一个">
                <ChevronDown size={12} />
              </button>
            </div>
          )}
          <button onClick={() => { setShowSearch(false); searchRef.current?.clearDecorations(); setSearchTerm(''); setSearchResultIndex(-1); }}
            className="p-0.5 rounded hover:bg-white/10 transition-colors"
            style={{ color: 'var(--text-secondary)' }}>
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
});
