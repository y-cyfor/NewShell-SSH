import { memo, useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { createAgentTerminalWS } from '../../services/agentService';
import { useTerminalTheme } from '../../hooks/useTerminalTheme';
import '@xterm/xterm/css/xterm.css';

interface Props {
  sessionId: string;
  isActive: boolean;
}

export const AgentTerminalPanel = memo(function AgentTerminalPanel({ sessionId, isActive }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      cursorBlink: false,
      cursorStyle: 'block',
      fontSize: parseInt(localStorage.getItem('newshell_font_size') || '14', 10),
      fontFamily: localStorage.getItem('newshell_terminal_font') || "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
      scrollback: 10000,
      allowTransparency: false,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    try {
      term.loadAddon(new WebglAddon());
    } catch {
      // WebGL not available
    }

    term.open(containerRef.current);
    fitAddon.fit();

    term.write('\x1b[36m=== Agent 执行终端 ===\x1b[0m\r\n');
    term.write('\x1b[90m等待命令执行...\x1b[0m\r\n\r\n');

    const ws = createAgentTerminalWS(sessionId, (data) => {
      term.write(data);
    });

    wsRef.current = ws;
    termRef.current = term;
    fitRef.current = fitAddon;

    const handleResize = () => {
      try { fitAddon.fit(); } catch {}
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      term.dispose();
      ws.close();
      termRef.current = null;
      wsRef.current = null;
      fitRef.current = null;
    };
  }, [sessionId]);

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
