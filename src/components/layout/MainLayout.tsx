import { memo, useEffect, useState, useRef, useCallback } from "react";
import { TitleBar } from "./TitleBar";
import { ActivityBar } from "./ActivityBar";
import { SidebarPanel } from "./SidebarPanel";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { TerminalTabs } from "../terminal/TerminalTabs";
import { EnhancedFileTreePanel } from "../filetree/EnhancedFileTreePanel";
import { ExtendedSysInfoPanel } from "../sysinfo/ExtendedSysInfoPanel";
import { SettingsPanel } from "../settings/SettingsPanel";
import { useConnectionStore } from "../../stores/connectionStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { useThemeStore } from "../../stores/themeStore";
import { useActivityStore } from "../../stores/activityStore";
import { useGroupStore } from "../../stores/groupStore";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

const MIN_SIDEBAR_WIDTH = 340;
const MAX_SIDEBAR_WIDTH = 500;

export const MainLayout = memo(function MainLayout() {
  const [showSettings, setShowSettings] = useState(false);
  const [showFileTree, setShowFileTree] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const sidebarWidthRef = useRef(sidebarWidth);
  useEffect(() => {
    sidebarWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  const tabs = useTerminalStore((s) => s.tabs);
  const activeTabId = useTerminalStore((s) => s.activeTabId);
  const initDefaultTabs = useTerminalStore((s) => s.initDefaultTabs);
  const loadConnections = useConnectionStore((s) => s.loadConnections);
  const loadGroups = useGroupStore((s) => s.loadGroups);
  const theme = useThemeStore((s) => s.theme);

  // Global keyboard shortcuts
  useKeyboardShortcuts({
    onToggleSettings: () => setShowSettings(!showSettings),
    onToggleFileTree: () => setShowFileTree(!showFileTree),
  });

  // Initialize tabs, connections, groups, and font settings on mount
  useEffect(() => {
    initDefaultTabs();
    loadConnections();
    loadGroups();

    // 初始化系统字体和字号
    const systemFont = localStorage.getItem('newshell_system_font');
    const fontSize = localStorage.getItem('newshell_font_size');

    if (systemFont && systemFont !== 'inherit') {
      document.documentElement.style.setProperty('--system-font', `'${systemFont}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`);
    }
    if (fontSize) {
      document.documentElement.style.fontSize = `${fontSize}px`;
    }
  }, []);

  // Load saved sidebar width
  useEffect(() => {
    const saved = localStorage.getItem('newshell_sidebar_width');
    if (saved) {
      const w = parseInt(saved, 10);
      if (w >= MIN_SIDEBAR_WIDTH && w <= MAX_SIDEBAR_WIDTH) {
        setSidebarWidth(w);
      }
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = sidebarWidth;
  }, [sidebarWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    const delta = e.clientX - startXRef.current;
    const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(MAX_SIDEBAR_WIDTH, startWidthRef.current + delta));
    setSidebarWidth(newWidth);
  }, [isResizing]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
    const width = sidebarWidthRef.current;
    if (width) {
      localStorage.setItem('newshell_sidebar_width', String(width));
    }
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden" style={{ background: "var(--bg-primary)", color: "var(--text-primary)" }}>
      <TitleBar
        onToggleSettings={() => setShowSettings(!showSettings)}
        onToggleFileTree={() => setShowFileTree(!showFileTree)}
        showFileTree={showFileTree}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar */}
        <ActivityBar
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Sidebar with resize handle */}
        <div className="flex flex-none relative" style={{ width: sidebarCollapsed ? 0 : sidebarWidth, transition: isResizing ? 'none' : 'width 0.2s', overflow: 'hidden' }}>
          <div ref={sidebarRef} className="h-full overflow-hidden" style={{ width: sidebarWidth, borderRight: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
            <SidebarPanel />
          </div>

          {/* Resize handle */}
          {!sidebarCollapsed && (
            <div
              className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10 transition-colors"
              onMouseDown={handleMouseDown}
              style={{ background: isResizing ? 'var(--accent-gradient)' : 'transparent' }}
            />
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden">
          <PanelGroup direction="horizontal">
            <Panel defaultSize={75} minSize={50}>
              <PanelGroup direction="horizontal">
                <Panel defaultSize={showFileTree ? 75 : 100} minSize={40}>
                  <div className="h-full flex flex-col" style={{ background: "var(--terminal-bg)" }}>
                    <TerminalTabs />
                  </div>
                </Panel>

                {showFileTree && (
                  <>
                    <PanelResizeHandle />
                    <Panel defaultSize={25} minSize={15} maxSize={50}>
                      <div className="h-full overflow-hidden" style={{ borderRight: "1px solid var(--border)" }}>
                        <EnhancedFileTreePanel connId={activeTab?.connId || ""} />
                      </div>
                    </Panel>
                  </>
                )}
              </PanelGroup>
            </Panel>

            <PanelResizeHandle />

            <Panel defaultSize={25} minSize={15} maxSize={40}>
              <div className="h-full overflow-auto" style={{
                background: 'var(--bg-secondary)',
                borderLeft: '1px solid var(--border)',
              }}>
                <ExtendedSysInfoPanel connId={activeTab?.connId || ""} />
              </div>
            </Panel>
          </PanelGroup>
        </div>
      </div>

      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
});
