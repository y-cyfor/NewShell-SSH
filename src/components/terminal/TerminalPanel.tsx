import { memo, useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { SearchAddon } from '@xterm/addon-search';
import { createTerminalWS, sendInput, sendResize } from '../../services/wsService';
import { useConnectionStore } from '../../stores/connectionStore';
import { highlightTerminalOutput } from '../../utils/terminalHighlighter';
import { useTerminalTheme } from '../../hooks/useTerminalTheme';
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
  const [ready, setReady] = useState(false);

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

    term.open(containerRef.current);
    fitAddon.fit();

    term.write('\x1b[33mConnecting to ' + conn.host + ':' + conn.port + '...\x1b[0m\r\n');

    const ws = createTerminalWS(
      connId,
      conn,
      (data) => {
        // 应用IP/URL高亮
        const highlightedData = highlightTerminalOutput(term, data);
        term.write(highlightedData);
      },
      () => sendResize(ws, term.cols, term.rows),
      (err) => {
        // SSH connection error
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
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ display: isActive ? 'block' : 'none' }}
    />
  );
});
