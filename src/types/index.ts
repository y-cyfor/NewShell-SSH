export interface Connection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_type: 'password' | 'key' | 'agent';
  password?: string;
  private_key?: string;
  passphrase?: string;
  group_name: string;
  remark: string;
  color: string;
  synced: boolean;
  created_at: string;
  updated_at: string;
  // 新增字段
  server_config?: ServerConfig;
  last_connected?: string;
}

export interface ServerConfig {
  cpu_cores: number;
  memory_total: number; // MB
  os: string;
  kernel: string;
  hostname: string;
  updated_at: string;
}

export interface AIConfig {
  api_base: string;
  api_key: string;
  model: string;
  system_prompt: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface FileInfo {
  name: string;
  size: number;
  is_dir: boolean;
  mode: string;
}

export interface SysInfo {
  hostname: string;
  os: string;
  uptime: string;
  cpu: string;
  mem_used: string;
  mem_total: string;
  disk: string;
  disk_info: string;
  disk_details: string;
  net_rx: string;
  net_tx: string;
}

export interface ExtendedSysInfo extends SysInfo {
  // 负载信息
  load_average?: [number, number, number];
  
  // 网络信息
  network_interfaces?: NetworkInterface[];
  
  // 磁盘信息
  disk_partitions?: DiskPartition[];
  
  // 进程信息
  processes?: ProcessInfo[];
}

export interface NetworkInterface {
  name: string; // eth0, wlan0
  rx_speed: number; // bytes/s
  tx_speed: number;
  rx_total: number;
  tx_total: number;
}

export interface DiskPartition {
  mount_point: string;
  size: number;
  used: number;
  available: number;
  use_percent: number;
}

export interface ProcessInfo {
  pid: number;
  name: string;
  user: string;
  memory: number; // bytes
  memory_percent: number;
  cpu_percent: number;
  command: string;
}

export interface TerminalTab {
  id: string;
  type: 'ssh' | 'server-list' | 'agent-exec';
  connId?: string;
  name: string;
  agentSessionId?: string;
}

export interface SyncState {
  serverUrl: string;
  token: string;
  username: string;
  isLoggedIn: boolean;
}

export interface ServerGroup {
  id: string;
  name: string;
  order: number;
  color?: string;
  connections: string[]; // connection IDs
}

export interface ActivityBarItem {
  id: 'servers' | 'ai';
  icon: string;
  title: string;
  badge?: number;
}

// Agent types
export type AgentMode = 'chat' | 'agent';

export interface AgentConfig {
  id: number;
  max_iterations: number;
  default_timeout: number;
  smart_timeout: boolean;
  confirm_mode: 'all' | 'dangerous' | 'none';
  dangerous_commands: string;
  dangerous_commands_custom: string;
  history_mode: 'persistent' | 'session';
  created_at: string;
  updated_at: string;
}

export interface AgentSession {
  id: string;
  conn_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface AgentMessageDB {
  id: number;
  session_id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  tool_calls?: string;
  tool_call_id?: string;
  created_at: string;
}

export interface ToolCallStep {
  id: string;
  toolName: string;
  parameters: Record<string, any>;
  status: 'pending' | 'confirming' | 'executing' | 'completed' | 'failed' | 'rejected';
  output?: string;
  exitCode?: number;
  startTime: number;
  endTime?: number;
  isDangerous: boolean;
  reason?: string;
  level?: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  toolCalls?: ToolCallStep[];
  isThinking?: boolean;
  isStreaming?: boolean;
  isFinal?: boolean;
  iteration?: number;
  // New: task steps for plan display
  taskSteps?: TaskStep[];
}

export interface TaskStep {
  id: string;
  description: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  toolCallId?: string;  // Associated tool call
}

export interface MCPServerConfig {
  id: string;
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string;
  url?: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SkillInfo {
  name: string;
  description: string;
  version: string;
  source: 'local' | 'clawhub';
  path: string;
  enabled: boolean;
  installed_at: string;
}

export interface SSEAgentEvent {
  type: string;
  data: any;
}

// ==================== Skill Market ====================

export interface SkillMarketItem {
  source: 'skillhub' | 'clawhub';
  slug: string;
  name: string;
  description: string;
  version: string;
  author: string;
  downloads: number;
  tags: string[];
  icon: string;
  installed: boolean;
  is_update: boolean;
}

export interface SkillDetail {
  source: string;
  slug: string;
  name: string;
  description: string;
  version: string;
  author: string;
  downloads: number;
  tags: string[];
  icon: string;
  readme: string;
  content: string;
}

export interface MarketListResponse {
  items: SkillMarketItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface LocalSkill {
  name: string;
  slug: string;
  description: string;
  version: string;
  source: string;
  path: string;
  local_path: string;
  content: string;
  icon: string;
  author: string;
  downloads: number;
  tags: string;
  enabled: boolean;
  installed_at: string;
  updated_at: string;
}

// ==================== Model Configuration ====================

export interface ModelConfig {
  id: string;
  provider: string;           // 服务商ID
  baseUrl: string;
  apiKey: string;
  modelName: string;
  temperature: number;        // 0-2, default 0.7
  maxTokens: number;          // default 4096
  topP: number;               // 0-1, default 1
  frequencyPenalty: number;   // -2~2, default 0
  presencePenalty: number;    // -2~2, default 0
  isDefault: boolean;
  createdAt: string;
}

export interface ProviderPreset {
  id: string;
  name: string;
  nameEn: string;
  baseUrl: string;
  icon: string;
  models: string[];
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { id: 'custom', name: '自定义', nameEn: 'Custom', baseUrl: '', icon: '⚙️', models: [] },
  { id: 'alibaba', name: '阿里云', nameEn: 'Alibaba', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', icon: '🅰️', models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long', 'qwen-math-plus'] },
  { id: 'bailian', name: '阿里云百炼', nameEn: 'Bailian', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', icon: '💎', models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long'] },
  { id: 'volcengine', name: '火山方舟', nameEn: 'Volcengine', baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', icon: '🌋', models: ['doubao-pro-32k', 'doubao-lite-32k', 'doubao-pro-128k'] },
  { id: 'openai', name: 'OpenAI', nameEn: 'OpenAI', baseUrl: 'https://api.openai.com/v1', icon: '🤖', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] },
  { id: 'deepseek', name: 'DeepSeek', nameEn: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', icon: '🐋', models: ['deepseek-chat', 'deepseek-coder'] },
  { id: 'xiaomi', name: '小米', nameEn: 'Xiaomi', baseUrl: 'https://api.xiaomi.com/v1', icon: '📱', models: ['MiLM-6B'] },
  { id: 'zhipu', name: '智谱', nameEn: 'Zhipu', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', icon: '🧠', models: ['glm-4', 'glm-4-flash', 'glm-4v'] },
  { id: 'kimi', name: 'KIMI', nameEn: 'KIMI', baseUrl: 'https://api.moonshot.cn/v1', icon: '🌙', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'] },
  { id: 'minimax', name: 'MiniMax', nameEn: 'MiniMax', baseUrl: 'https://api.minimax.chat/v1', icon: '⚡', models: ['abab6.5-chat', 'abab5.5-chat'] },
  { id: 'tencent', name: '腾讯云', nameEn: 'Tencent', baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1', icon: '🐧', models: ['hunyuan-pro', 'hunyuan-standard', 'hunyuan-lite'] },
];

export const MODEL_PARAM_LABELS: Record<string, { label: string; labelEn: string; desc: string; min: number; max: number; step: number; default: number }> = {
  temperature: { label: '温度', labelEn: 'Temperature', desc: '控制输出随机性，值越高输出越多样', min: 0, max: 2, step: 0.1, default: 0.7 },
  maxTokens: { label: '最大Token', labelEn: 'Max Tokens', desc: '单次回复最大token数量', min: 1, max: 128000, step: 1, default: 4096 },
  topP: { label: '核采样', labelEn: 'Top P', desc: '控制词汇选择的概率范围', min: 0, max: 1, step: 0.01, default: 1 },
  frequencyPenalty: { label: '频率惩罚', labelEn: 'Frequency Penalty', desc: '降低重复词汇的出现频率', min: -2, max: 2, step: 0.1, default: 0 },
  presencePenalty: { label: '存在惩罚', labelEn: 'Presence Penalty', desc: '鼓励模型讨论新话题', min: -2, max: 2, step: 0.1, default: 0 },
};

// Helper to create a default model config
export function createDefaultModel(provider: string = 'custom'): ModelConfig {
  const preset = PROVIDER_PRESETS.find(p => p.id === provider) || PROVIDER_PRESETS[0];
  return {
    id: `model-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    provider,
    baseUrl: preset.baseUrl,
    apiKey: '',
    modelName: preset.models[0] || '',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
    isDefault: false,
    createdAt: new Date().toISOString(),
  };
}
