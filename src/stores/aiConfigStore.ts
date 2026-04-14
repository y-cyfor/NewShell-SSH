import { create } from 'zustand';
import { ModelConfig, createDefaultModel } from '../types';

const STORAGE_KEY = 'newshell_ai_config_v2';
const OLD_STORAGE_KEY = 'newshell_ai_config';

const DEFAULT_SYSTEM_PROMPT = `你是一位资深 Linux/Unix 运维专家，精通以下领域：
1. Linux 系统管理 (CentOS/Ubuntu/Debian)
2. Shell 脚本编写 (Bash/Zsh)
3. Docker/Kubernetes 容器编排
4. Nginx/Apache 等 Web 服务器配置
5. MySQL/PostgreSQL/Redis 等数据库运维
6. 网络诊断与安全加固
7. CI/CD 流水线设计

请用简洁、专业的语言回答用户问题。当给出命令时：
- 说明命令的作用和潜在风险
- 标注需要 root 权限的命令
- 提供命令的替代方案（如有）
- 用代码块格式化命令，方便复制`;

interface AIConfigData {
  models: ModelConfig[];
  defaultModelId: string;
  systemPrompt: string;
}

interface AIConfigState {
  models: ModelConfig[];
  defaultModelId: string;
  systemPrompt: string;
  loadConfig: () => void;
  addModel: (model: Omit<ModelConfig, 'id' | 'createdAt'>) => void;
  updateModel: (id: string, partial: Partial<ModelConfig>) => void;
  deleteModel: (id: string) => void;
  setDefaultModel: (id: string) => void;
  getDefaultModel: () => ModelConfig | undefined;
  updateSystemPrompt: (prompt: string) => void;
}

function loadFromLocal(): AIConfigData {
  try {
    // Try loading v2 format
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw);
      if (data.models && Array.isArray(data.models)) {
        return {
          models: data.models,
          defaultModelId: data.defaultModelId || '',
          systemPrompt: data.systemPrompt || DEFAULT_SYSTEM_PROMPT,
        };
      }
    }

    // Migrate from v1 format
    const oldRaw = localStorage.getItem(OLD_STORAGE_KEY);
    if (oldRaw) {
      const oldData = JSON.parse(oldRaw);
      const model = createDefaultModel('custom');
      model.baseUrl = oldData.api_base || 'https://api.openai.com/v1';
      model.apiKey = oldData.api_key || '';
      model.modelName = oldData.model || 'gpt-4o';
      model.isDefault = true;
      return {
        models: [model],
        defaultModelId: model.id,
        systemPrompt: oldData.system_prompt || DEFAULT_SYSTEM_PROMPT,
      };
    }
  } catch {}

  // Default: one empty custom model
  const defaultModel = createDefaultModel('custom');
  defaultModel.isDefault = true;
  return {
    models: [defaultModel],
    defaultModelId: defaultModel.id,
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
  };
}

function saveToLocal(data: AIConfigData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export const useAIConfigStore = create<AIConfigState>((set, get) => ({
  models: [],
  defaultModelId: '',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,

  loadConfig: () => {
    const data = loadFromLocal();
    set(data);
  },

  addModel: (modelData) => {
    const model: ModelConfig = {
      ...modelData,
      id: `model-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    set((state) => {
      const models = [...state.models, model];
      // If first model, set as default
      if (models.length === 1) {
        model.isDefault = true;
      }
      const data: AIConfigData = {
        models,
        defaultModelId: models.find(m => m.isDefault)?.id || state.defaultModelId,
        systemPrompt: state.systemPrompt,
      };
      saveToLocal(data);
      return { models, defaultModelId: data.defaultModelId };
    });
  },

  updateModel: (id, partial) => {
    set((state) => {
      const models = state.models.map(m => m.id === id ? { ...m, ...partial } : m);
      const data: AIConfigData = { models, defaultModelId: state.defaultModelId, systemPrompt: state.systemPrompt };
      saveToLocal(data);
      return { models };
    });
  },

  deleteModel: (id) => {
    set((state) => {
      if (state.models.length <= 1) return state; // Keep at least one model
      const models = state.models.filter(m => m.id !== id);
      let defaultModelId = state.defaultModelId;
      // If deleted model was default, set first as default
      if (defaultModelId === id) {
        models[0].isDefault = true;
        defaultModelId = models[0].id;
      }
      const data: AIConfigData = { models, defaultModelId, systemPrompt: state.systemPrompt };
      saveToLocal(data);
      return { models, defaultModelId };
    });
  },

  setDefaultModel: (id) => {
    set((state) => {
      const models = state.models.map(m => ({ ...m, isDefault: m.id === id }));
      const data: AIConfigData = { models, defaultModelId: id, systemPrompt: state.systemPrompt };
      saveToLocal(data);
      return { models, defaultModelId: id };
    });
  },

  getDefaultModel: () => {
    const state = get();
    return state.models.find(m => m.id === state.defaultModelId) || state.models[0];
  },

  updateSystemPrompt: (prompt) => {
    set((state) => {
      const data: AIConfigData = { models: state.models, defaultModelId: state.defaultModelId, systemPrompt: prompt };
      saveToLocal(data);
      return { systemPrompt: prompt };
    });
  },
}));
