import { useState, useEffect } from 'react';
import { useThemeStore } from '../../stores/themeStore';
import { useSyncStore } from '../../stores/syncStore';
import { useAIConfigStore } from '../../stores/aiConfigStore';
import { useDownloadSettingsStore } from '../../stores/downloadSettingsStore';
import { useFontSettingsStore, BUILTIN_FONTS, BUILTIN_MONO_FONTS } from '../../stores/fontSettingsStore';
import { useAgentStore } from '../../stores/agentStore';
import { getAgentConfig, updateAgentConfig, getMCPServers, createMCPServer, deleteMCPServer } from '../../services/agentService';
import { ModelConfig, PROVIDER_PRESETS, MODEL_PARAM_LABELS, createDefaultModel, MCPServerConfig } from '../../types';
import { SkillMarketPanel } from '../ai/SkillMarketPanel';
import { X, Settings, Palette, Folder, CloudUpload, Sparkles, Cpu, Bot, Check, Plus, Trash2, Star, Plug, Package, LogIn, LogOut, Store } from 'lucide-react';

interface Props {
  onClose: () => void;
}

type TabId = 'general' | 'file' | 'model' | 'agent' | 'sync';

interface TabItem {
  id: TabId;
  label: string;
  icon: React.ReactNode;
  indent?: boolean;
  isHeader?: boolean;
}

const TAB_ITEMS: TabItem[] = [
  { id: 'general', label: '主题外观', icon: <Palette size={14} /> },
  { id: 'file', label: '文件管理', icon: <Folder size={14} /> },
  { id: 'model', label: 'AI 配置', icon: <Sparkles size={14} />, isHeader: true },
  { id: 'model', label: '模型', icon: <Cpu size={12} />, indent: true },
  { id: 'agent', label: 'Agent 设置', icon: <Bot size={12} />, indent: true },
  { id: 'sync', label: '同步管理', icon: <CloudUpload size={14} /> },
];

export function SettingsPanel({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('general');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="flex rounded-lg shadow-xl animate-fade-in overflow-hidden"
        style={{ width: '700px', height: '520px', background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}>

        {/* Left Sidebar */}
        <div className="flex flex-col py-4 w-44 flex-shrink-0" style={{ background: 'var(--bg-primary)', borderRight: '1px solid var(--border)' }}>
          <div className="px-4 pb-4 flex items-center gap-2">
            <Settings size={16} style={{ color: 'var(--accent)' }} />
            <span className="font-semibold text-sm">设置</span>
          </div>
          <div className="flex-1 flex flex-col gap-0.5 px-2">
            {TAB_ITEMS.map((tab, idx) => {
              if (tab.isHeader) {
                return (
                  <div key={`h-${idx}`} className="flex items-center gap-2 px-3 py-2 mt-2 mb-0.5 text-xs font-medium"
                    style={{ color: 'var(--text-secondary)', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
                    {tab.icon} {tab.label}
                  </div>
                );
              }
              return (
                <button key={`${tab.id}-${idx}`} onClick={() => setActiveTab(tab.id)}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded text-xs transition-colors"
                  style={{
                    background: activeTab === tab.id ? 'var(--accent)' : 'transparent',
                    color: activeTab === tab.id ? '#fff' : 'var(--text-secondary)',
                    paddingLeft: tab.indent ? '28px' : '12px',
                    fontSize: tab.indent ? '11px' : '13px',
                  }}>
                  {tab.icon} <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 overflow-y-auto px-6 py-5" style={{ scrollbarWidth: 'thin' }}>
            {activeTab === 'general' && <GeneralTab />}
            {activeTab === 'file' && <FileTab />}
            {activeTab === 'model' && <ModelSettingsTab />}
            {activeTab === 'agent' && <AgentSettingsTab />}
            {activeTab === 'sync' && <SyncTab />}
          </div>
          <div className="flex items-center justify-end gap-1.5 px-4 py-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-primary)' }}>
            <button onClick={onClose} className="px-3 py-1 rounded text-xs flex items-center gap-1" style={{ background: 'var(--bg-tertiary)', color: 'var(--text-primary)' }}>
              <X size={12} /> 关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== General Tab ====================
function GeneralTab() {
  const themeStore = useThemeStore();
  const fontStore = useFontSettingsStore();
  const selectStyle = { background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>主题外观</h3>

      <div>
        <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>主题</label>
        <select value={themeStore.theme} onChange={(e) => themeStore.setTheme(e.target.value as any)}
          className="w-full px-3 py-1.5 rounded text-xs outline-none" style={selectStyle}>
          <option value="dark">暗色</option>
          <option value="light">亮色</option>
        </select>
      </div>

      <div>
        <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>系统字体</label>
        <select value={fontStore.uiFont} onChange={(e) => fontStore.setUIFont(e.target.value)}
          className="w-full px-3 py-1.5 rounded text-xs outline-none" style={selectStyle}>
          <option value="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">系统默认</option>
          {BUILTIN_FONTS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>命令行字体</label>
        <select value={fontStore.terminalFont} onChange={(e) => fontStore.setTerminalFont(e.target.value)}
          className="w-full px-3 py-1.5 rounded text-xs outline-none" style={selectStyle}>
          {BUILTIN_MONO_FONTS.map(f => <option key={f.value} value={f.value}>{f.name}</option>)}
        </select>
      </div>

      <div>
        <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>字号</label>
        <select value={fontStore.fontSize} onChange={(e) => fontStore.setFontSize(parseInt(e.target.value))}
          className="w-full px-3 py-1.5 rounded text-xs outline-none" style={selectStyle}>
          {Array.from({ length: 21 }, (_, i) => i + 10).map(s => <option key={s} value={s}>{s}px</option>)}
        </select>
      </div>
    </div>
  );
}

// ==================== File Tab ====================
function FileTab() {
  const ds = useDownloadSettingsStore();
  const inputStyle = { background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>文件管理</h3>

      <div>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>默认下载路径</label>
        <input type="text" value={ds.downloadPath} onChange={(e) => ds.setDownloadPath(e.target.value)}
          placeholder="留空则保存到默认位置" className="w-full px-3 py-1.5 rounded text-xs outline-none" style={inputStyle} />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={ds.askBeforeDownload} onChange={(e) => ds.setAskBeforeDownload(e.target.checked)}
          style={{ accentColor: 'var(--accent)' }} />
        <span className="text-xs" style={{ color: 'var(--text-primary)' }}>每次下载前询问</span>
      </label>

      <div>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>下载限速 (KB/s)</label>
        <input type="number" value={ds.downloadSpeedLimit || ''} onChange={(e) => ds.setDownloadSpeedLimit(parseInt(e.target.value) || 0)}
          placeholder="留空不限制" className="w-full px-3 py-1.5 rounded text-xs outline-none" style={inputStyle} />
      </div>

      <div>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>同时下载数</label>
        <input type="number" value={ds.concurrentDownloads || ''} onChange={(e) => ds.setConcurrentDownloads(parseInt(e.target.value) || 0)}
          placeholder="留空不限制" className="w-full px-3 py-1.5 rounded text-xs outline-none" style={inputStyle} />
      </div>
    </div>
  );
}

// ==================== Model Settings Tab ====================
function ModelSettingsTab() {
  const aiStore = useAIConfigStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addProvider, setAddProvider] = useState('custom');
  const editingModel = aiStore.models.find(m => m.id === editingId);

  const handleAdd = () => {
    const model = createDefaultModel(addProvider);
    aiStore.addModel(model);
    setEditingId(model.id);
    setShowAdd(false);
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <Cpu size={14} /> 模型配置
      </h3>

      <div className="space-y-1.5">
        {aiStore.models.map((model) => {
          const provider = PROVIDER_PRESETS.find(p => p.id === model.provider) || PROVIDER_PRESETS[0];
          return (
            <div key={model.id} className="flex items-center gap-2 p-2 rounded cursor-pointer"
              style={{
                background: editingId === model.id ? 'var(--accent)' : 'var(--bg-tertiary)',
                border: '1px solid', borderColor: model.isDefault ? 'var(--accent)' : 'var(--border)',
              }}
              onClick={() => setEditingId(editingId === model.id ? null : model.id)}>
              <span className="text-base">{provider.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate" style={{ color: editingId === model.id ? '#fff' : 'var(--text-primary)' }}>
                  {model.modelName || '未设置模型名'}
                </div>
                <div className="text-[10px]" style={{ color: editingId === model.id ? 'rgba(255,255,255,0.7)' : 'var(--text-secondary)' }}>
                  {provider.name} {model.isDefault && '⭐'}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); aiStore.setDefaultModel(model.id); }}
                className="p-1 rounded" title="设为默认"
                style={{ color: model.isDefault ? '#f59e0b' : 'var(--text-secondary)' }}>
                <Star size={12} fill={model.isDefault ? '#f59e0b' : 'none'} />
              </button>
              {aiStore.models.length > 1 && (
                <button onClick={(e) => { e.stopPropagation(); aiStore.deleteModel(model.id); if (editingId === model.id) setEditingId(null); }}
                  className="p-1 rounded" style={{ color: 'var(--text-secondary)' }}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {showAdd ? (
        <div className="p-3 rounded space-y-2" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
          <label className="text-xs font-medium block" style={{ color: 'var(--text-secondary)' }}>选择服务商</label>
          <select value={addProvider} onChange={(e) => setAddProvider(e.target.value)}
            className="w-full px-2 py-1 rounded text-xs outline-none"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            {PROVIDER_PRESETS.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
          </select>
          <div className="flex gap-2">
            <button onClick={() => setShowAdd(false)} className="flex-1 px-2 py-1 rounded text-xs"
              style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>取消</button>
            <button onClick={handleAdd} className="flex-1 px-2 py-1 rounded text-xs text-white"
              style={{ background: 'var(--accent)' }}>添加</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded text-xs"
          style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
          <Plus size={12} /> 添加模型
        </button>
      )}

      {editingModel && <ModelEditor model={editingModel} onUpdate={(partial) => aiStore.updateModel(editingModel.id, partial)} />}

      <div>
        <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>System Prompt</label>
        <textarea value={aiStore.systemPrompt} onChange={(e) => aiStore.updateSystemPrompt(e.target.value)} rows={4}
          className="w-full px-3 py-2 rounded text-xs outline-none resize-none"
          style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
      </div>
    </div>
  );
}

// ==================== Model Editor ====================
function ModelEditor({ model, onUpdate }: { model: ModelConfig; onUpdate: (partial: Partial<ModelConfig>) => void }) {
  const inputStyle = { background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

  return (
    <div className="p-3 rounded space-y-3" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
      <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>模型详情</div>

      <div>
        <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>服务商</label>
        <select value={model.provider} onChange={(e) => {
          const preset = PROVIDER_PRESETS.find(p => p.id === e.target.value) || PROVIDER_PRESETS[0];
          onUpdate({ provider: e.target.value, baseUrl: preset.baseUrl, modelName: preset.models[0] || model.modelName });
        }} className="w-full px-2 py-1 rounded text-xs outline-none" style={inputStyle}>
          {PROVIDER_PRESETS.map(p => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
        </select>
      </div>

      <div>
        <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>Base URL</label>
        <input type="text" value={model.baseUrl} onChange={(e) => onUpdate({ baseUrl: e.target.value })}
          className="w-full px-2 py-1 rounded text-xs outline-none" style={inputStyle} />
      </div>

      <div>
        <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>API Key</label>
        <input type="password" value={model.apiKey} onChange={(e) => onUpdate({ apiKey: e.target.value })}
          className="w-full px-2 py-1 rounded text-xs outline-none" style={inputStyle} />
      </div>

      <div>
        <label className="text-[10px] mb-1 block" style={{ color: 'var(--text-secondary)' }}>模型名称</label>
        <input type="text" value={model.modelName} onChange={(e) => onUpdate({ modelName: e.target.value })}
          className="w-full px-2 py-1 rounded text-xs outline-none" style={inputStyle} placeholder="如 gpt-4o" />
        {(() => {
          const preset = PROVIDER_PRESETS.find(p => p.id === model.provider);
          if (!preset?.models.length) return null;
          return (
            <div className="flex flex-wrap gap-1 mt-1">
              {preset.models.map(m => (
                <button key={m} onClick={() => onUpdate({ modelName: m })}
                  className="px-1.5 py-0.5 rounded text-[10px]"
                  style={{ background: model.modelName === m ? 'var(--accent)' : 'var(--bg-primary)', color: model.modelName === m ? '#fff' : 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  {m}
                </button>
              ))}
            </div>
          );
        })()}
      </div>

      {(['temperature', 'maxTokens', 'topP', 'frequencyPenalty', 'presencePenalty'] as const).map((key) => {
        const config = MODEL_PARAM_LABELS[key];
        const value = model[key];
        return (
          <div key={key}>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{config.label} ({config.labelEn})</label>
              <div className="flex items-center gap-1">
                <input type="number" value={value} min={config.min} max={config.max} step={config.step}
                  onChange={(e) => onUpdate({ [key]: parseFloat(e.target.value) || config.default })}
                  className="w-16 px-1 py-0.5 rounded text-[10px] text-center outline-none" style={inputStyle} />
                <button onClick={() => onUpdate({ [key]: config.default })} className="text-[10px] px-1 py-0.5 rounded"
                  style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>重置</button>
              </div>
            </div>
            <input type="range" min={config.min} max={config.max} step={config.step} value={value}
              onChange={(e) => onUpdate({ [key]: parseFloat(e.target.value) })} className="w-full h-1" style={{ accentColor: 'var(--accent)' }} />
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>{config.desc}</div>
          </div>
        );
      })}
    </div>
  );
}

// ==================== Agent Settings Tab ====================
function AgentSettingsTab() {
  const agentStore = useAgentStore();
  const [agentConfig, setAgentConfig] = useState(agentStore.config);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<'general' | 'mcp' | 'skills'>('general');
  const [mcpServers, setMcpServers] = useState<MCPServerConfig[]>([]);
  const [showAddMCP, setShowAddMCP] = useState(false);
  const [newMCP, setNewMCP] = useState({ name: '', transport: 'stdio' as 'stdio' | 'http', command: '', url: '' });
  const inputStyle = { background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

  useEffect(() => {
    loadMCP();
  }, []);

  const loadMCP = async () => { try { setMcpServers(await getMCPServers()); } catch { setMcpServers([]); } };

  const handleSave = async () => {
    await updateAgentConfig(agentConfig);
    agentStore.setConfig(agentConfig);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleAddMCP = async () => {
    if (!newMCP.name) return;
    await createMCPServer({ name: newMCP.name, transport: newMCP.transport, command: newMCP.command, url: newMCP.url, enabled: true });
    setNewMCP({ name: '', transport: 'stdio', command: '', url: '' });
    setShowAddMCP(false);
    loadMCP();
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <Bot size={14} /> Agent 设置
      </h3>

      <div className="flex gap-1 mb-4">
        {([
          { id: 'general', label: '执行设置', icon: <Settings size={11} /> },
          { id: 'mcp', label: 'MCP 服务器', icon: <Plug size={11} /> },
          { id: 'skills', label: 'Skills', icon: <Package size={11} /> },
        ] as const).map(tab => (
          <button key={tab.id} onClick={() => setActiveSection(tab.id)}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px]"
            style={{ background: activeSection === tab.id ? 'var(--accent)' : 'var(--bg-tertiary)', color: activeSection === tab.id ? '#fff' : 'var(--text-secondary)' }}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {activeSection === 'general' && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium mb-2 block" style={{ color: 'var(--text-secondary)' }}>执行确认模式</label>
            <div className="space-y-1.5">
              {[
                { value: 'none', label: '全自动', desc: '直接执行所有命令' },
                { value: 'dangerous', label: '仅高危确认', desc: '仅高危命令需要确认（推荐）' },
                { value: 'all', label: '每步确认', desc: '每个命令都需要确认' },
              ].map(opt => (
                <label key={opt.value} className="flex items-center gap-2 cursor-pointer p-1.5 rounded"
                  style={{ background: agentConfig.confirm_mode === opt.value ? 'var(--bg-tertiary)' : 'transparent' }}>
                  <input type="radio" name="confirm_mode" value={opt.value} checked={agentConfig.confirm_mode === opt.value}
                    onChange={() => setAgentConfig({ ...agentConfig, confirm_mode: opt.value as any })} style={{ accentColor: 'var(--accent)' }} />
                  <div>
                    <div className="text-xs" style={{ color: 'var(--text-primary)' }}>{opt.label}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{opt.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: 'var(--text-secondary)' }}>最大循环次数</label>
            <input type="number" value={agentConfig.max_iterations}
              onChange={(e) => setAgentConfig({ ...agentConfig, max_iterations: parseInt(e.target.value) || 10 })}
              min={1} max={50} className="w-full px-3 py-1.5 rounded text-xs outline-none" style={inputStyle} />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={agentConfig.smart_timeout}
              onChange={(e) => setAgentConfig({ ...agentConfig, smart_timeout: e.target.checked })}
              style={{ accentColor: 'var(--accent)' }} />
            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>智能超时</span>
          </label>

          <button onClick={handleSave} className="w-full px-4 py-2 rounded text-xs font-medium flex items-center justify-center gap-2"
            style={{ background: saved ? 'var(--success)' : 'var(--accent)', color: '#fff' }}>
            <Check size={14} /> {saved ? '已保存' : '保存'}
          </button>
        </div>
      )}

      {activeSection === 'mcp' && (
        <div className="space-y-3">
          <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>MCP服务器为Agent提供额外工具能力</div>
          {mcpServers.length === 0 && <div className="text-center py-4 text-xs" style={{ color: 'var(--text-secondary)' }}>暂无MCP服务器</div>}
          {mcpServers.map(s => (
            <div key={s.id} className="flex items-center gap-2 p-2 rounded" style={{ background: 'var(--bg-tertiary)' }}>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>{s.name}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{s.transport} | {s.enabled ? '✅ 启用' : '❌ 禁用'}</div>
              </div>
              <button onClick={async () => { if (window.confirm(`确定删除 MCP 服务器 "${s.name}"?`)) { await deleteMCPServer(s.id); loadMCP(); } }} style={{ color: 'var(--text-secondary)' }}><Trash2 size={12} /></button>
            </div>
          ))}
          {showAddMCP ? (
            <div className="p-3 rounded space-y-2" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
              <input placeholder="名称" value={newMCP.name} onChange={e => setNewMCP({ ...newMCP, name: e.target.value })}
                className="w-full px-2 py-1 rounded text-xs outline-none" style={inputStyle} />
              <select value={newMCP.transport} onChange={e => setNewMCP({ ...newMCP, transport: e.target.value as any })}
                className="w-full px-2 py-1 rounded text-xs outline-none" style={inputStyle}>
                <option value="stdio">stdio</option>
                <option value="http">HTTP</option>
              </select>
              {newMCP.transport === 'stdio' ? (
                <input placeholder="启动命令" value={newMCP.command} onChange={e => setNewMCP({ ...newMCP, command: e.target.value })}
                  className="w-full px-2 py-1 rounded text-xs outline-none" style={inputStyle} />
              ) : (
                <input placeholder="URL" value={newMCP.url} onChange={e => setNewMCP({ ...newMCP, url: e.target.value })}
                  className="w-full px-2 py-1 rounded text-xs outline-none" style={inputStyle} />
              )}
              <div className="flex gap-2">
                <button onClick={() => setShowAddMCP(false)} className="flex-1 px-2 py-1 rounded text-xs" style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}>取消</button>
                <button onClick={handleAddMCP} className="flex-1 px-2 py-1 rounded text-xs text-white" style={{ background: 'var(--accent)' }}>添加</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAddMCP(true)}
              className="w-full flex items-center justify-center gap-1 px-3 py-2 rounded text-xs"
              style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
              <Plus size={12} /> 添加 MCP 服务器
            </button>
          )}
        </div>
      )}

      {activeSection === 'skills' && (
        <SkillMarketPanel />
      )}
    </div>
  );
}

// ==================== Sync Tab ====================
function SyncTab() {
  const syncStore = useSyncStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const inputStyle = { background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' };

  const handleLogin = async () => {
    setError('');
    try {
      await syncStore.login(username, password);
      setUsername('');
      setPassword('');
    } catch (err: any) {
      setError(err.message || '登录失败');
    }
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        <CloudUpload size={14} className="inline mr-1.5" style={{ verticalAlign: 'middle' }} />
        同步管理
      </h3>

      <div>
        <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>服务器地址</label>
        <input type="text" value={syncStore.serverUrl} onChange={(e) => syncStore.setServerUrl(e.target.value)}
          className="w-full px-3 py-1.5 rounded text-xs outline-none" style={inputStyle} />
      </div>

      {syncStore.isLoggedIn ? (
        <div className="space-y-3">
          <div className="px-3 py-2 rounded text-xs" style={{ background: 'var(--bg-tertiary)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>已登录: </span>
            <span style={{ color: 'var(--text-primary)' }}>{syncStore.username}</span>
          </div>
          <button onClick={() => syncStore.logout()}
            className="w-full px-3 py-1.5 rounded text-xs flex items-center justify-center gap-1"
            style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}>
            <LogOut size={12} /> 退出登录
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>用户名</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="输入用户名"
              className="w-full px-3 py-1.5 rounded text-xs outline-none" style={inputStyle} />
          </div>
          <div>
            <label className="text-xs font-medium mb-1 block" style={{ color: 'var(--text-secondary)' }}>密码</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="输入密码"
              className="w-full px-3 py-1.5 rounded text-xs outline-none" style={inputStyle} />
          </div>
          {error && <div className="text-xs" style={{ color: '#ef4444' }}>{error}</div>}
          <button onClick={handleLogin} disabled={syncStore.loading || !username || !password}
            className="w-full px-3 py-1.5 rounded text-xs flex items-center justify-center gap-1"
            style={{ background: 'var(--accent)', color: '#fff', opacity: syncStore.loading || !username || !password ? 0.5 : 1 }}>
            <LogIn size={12} /> {syncStore.loading ? '登录中...' : '登录'}
          </button>
        </div>
      )}
    </div>
  );
}
