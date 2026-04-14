import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AgentConfig, AgentSession, AgentMessage, ToolCallStep, TaskStep } from '../types';

interface AgentState {
  mode: 'chat' | 'agent';
  config: AgentConfig;
  currentSessionId: string | null;
  currentConnId: string;
  selectedModelId: string;  // 当前选中的模型ID
  messages: AgentMessage[];
  isRunning: boolean;
  pendingConfirm: {
    toolCallId: string;
    toolName: string;
    command: string;
    reason: string;
    level: string;
  } | null;

  // Actions
  setMode: (mode: 'chat' | 'agent') => void;
  setConfig: (config: Partial<AgentConfig>) => void;
  setCurrentConnId: (connId: string) => void;
  setCurrentSessionId: (sessionId: string | null) => void;
  setSelectedModelId: (modelId: string) => void;
  addMessage: (msg: AgentMessage) => void;
  updateLastMessage: (updater: (msg: AgentMessage) => AgentMessage) => void;
  setMessages: (msgs: AgentMessage[]) => void;
  clearMessages: () => void;
  setRunning: (running: boolean) => void;
  setPendingConfirm: (confirm: AgentState['pendingConfirm']) => void;

  // Tool call management
  addToolCallToLastMessage: (toolCall: ToolCallStep) => void;
  updateToolCall: (toolCallId: string, updates: Partial<ToolCallStep>) => void;

  // Task step management
  setTaskStepsForLastMessage: (steps: TaskStep[]) => void;
  updateTaskStep: (stepId: string, updates: Partial<TaskStep>) => void;
}

const defaultConfig: AgentConfig = {
  id: 1,
  max_iterations: 10,
  default_timeout: 60,
  smart_timeout: true,
  confirm_mode: 'dangerous',
  dangerous_commands: '["rm -rf","shutdown","reboot","mkfs","dd"]',
  dangerous_commands_custom: '[]',
  history_mode: 'persistent',
  created_at: '',
  updated_at: '',
};

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      mode: 'chat',
      config: defaultConfig,
      currentSessionId: null,
      currentConnId: '',
      selectedModelId: '',
      messages: [],
      isRunning: false,
      pendingConfirm: null,

      setMode: (mode) => set({ mode }),
      setConfig: (config) => set((s) => ({ config: { ...s.config, ...config } })),
      setCurrentConnId: (connId) => set({ currentConnId: connId }),
      setCurrentSessionId: (sessionId) => set({ currentSessionId: sessionId }),
      setSelectedModelId: (modelId) => set({ selectedModelId: modelId }),

      addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),

      updateLastMessage: (updater) => set((s) => {
        if (s.messages.length === 0) return s;
        const msgs = [...s.messages];
        msgs[msgs.length - 1] = updater(msgs[msgs.length - 1]);
        return { messages: msgs };
      }),

      setMessages: (msgs) => set({ messages: msgs }),
      clearMessages: () => set({ messages: [], currentSessionId: null }),
      setRunning: (running) => set({ isRunning: running }),
      setPendingConfirm: (confirm) => set({ pendingConfirm: confirm }),

      addToolCallToLastMessage: (toolCall) => set((s) => {
        if (s.messages.length === 0) return s;
        const msgs = [...s.messages];
        const last = { ...msgs[msgs.length - 1] };
        last.toolCalls = [...(last.toolCalls || []), toolCall];
        msgs[msgs.length - 1] = last;
        return { messages: msgs };
      }),

      updateToolCall: (toolCallId, updates) => set((s) => {
        const msgs = s.messages.map(msg => {
          if (!msg.toolCalls) return msg;
          const toolCalls = msg.toolCalls.map(tc =>
            tc.id === toolCallId ? { ...tc, ...updates } : tc
          );
          return { ...msg, toolCalls };
        });
        return { messages: msgs };
      }),

      setTaskStepsForLastMessage: (steps) => set((s) => {
        if (s.messages.length === 0) return s;
        const msgs = [...s.messages];
        const last = { ...msgs[msgs.length - 1] };
        last.taskSteps = steps;
        msgs[msgs.length - 1] = last;
        return { messages: msgs };
      }),

      updateTaskStep: (stepId, updates) => set((s) => {
        const msgs = s.messages.map(msg => {
          if (!msg.taskSteps) return msg;
          const taskSteps = msg.taskSteps.map(step =>
            step.id === stepId ? { ...step, ...updates } : step
          );
          return { ...msg, taskSteps };
        });
        return { messages: msgs };
      }),
    }),
    {
      name: 'newshell_agent_state',
      partialize: (state) => ({
        mode: state.mode,
        currentConnId: state.currentConnId,
        selectedModelId: state.selectedModelId,
        config: state.config,
      }),
    }
  )
);
