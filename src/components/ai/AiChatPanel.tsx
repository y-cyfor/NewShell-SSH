import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage, TaskStep, ToolCallStep, PROVIDER_PRESETS } from "../../types";
import { useAIConfigStore } from "../../stores/aiConfigStore";
import { useAgentStore } from "../../stores/agentStore";
import { useConnectionStore } from "../../stores/connectionStore";
import { useTerminalStore } from "../../stores/terminalStore";
import { getBaseUrl } from "../../services/api";
import { agentChat, agentConfirm, agentCancel, getAgentMessages } from "../../services/agentService";
import { ConfirmDialog } from "./ConfirmDialog";
import { AgentSessionList } from "./AgentSessionList";
import { Send, RotateCcw, Bot, MessageSquare, History, X, Loader, CheckCircle, XCircle, Circle, ChevronDown, ChevronRight, Clock, Sparkles } from "lucide-react";

const PRESET_QUESTIONS = [
  "如何查看端口占用?", "如何查看进程列表?", "如何查看磁盘空间?",
  "如何查找大文件?", "如何重启 Docker 服务?", "如何查看系统日志?",
];

// Fix malformed markdown tables (all on one line)
function fixMarkdownTables(text: string): string {
  // Match table where all rows are concatenated on one line
  // Pattern: | header | |---| | row1 | | row2 |
  // The separator line contains only -, :, |, and spaces
  const sepRegex = /\|\s*[-:]+\s*\|/;
  const sepMatch = text.match(sepRegex);
  if (!sepMatch) return text;

  const sepIndex = text.indexOf(sepMatch[0]);
  
  // Find the full separator line (may span multiple |---| segments)
  let sepEnd = sepIndex;
  while (sepEnd < text.length) {
    // Find next | that starts a non-separator cell (contains non -/:/space chars)
    const nextPipe = text.indexOf('|', sepEnd + 1);
    if (nextPipe === -1) break;
    const afterPipe = text.substring(nextPipe + 1);
    // Check if this is still part of separator (only contains -, :, |, space)
    const cellEnd = afterPipe.indexOf('|');
    if (cellEnd === -1) break;
    const cell = afterPipe.substring(0, cellEnd);
    if (/^[\s-:]+$/.test(cell)) {
      sepEnd = nextPipe + 1 + cellEnd;
    } else {
      break;
    }
  }
  // Include the final |
  const finalPipe = text.indexOf('|', sepEnd);
  if (finalPipe !== -1 && finalPipe - sepEnd < 5) {
    sepEnd = finalPipe + 1;
  }

  const headerLine = text.substring(0, sepIndex).trim();
  const separatorLine = text.substring(sepIndex, sepEnd).trim();
  const rest = text.substring(sepEnd).trim();
  
  if (!rest || !headerLine) return text;

  // Count columns from header
  const headerCells = headerLine.split('|').filter((c: string) => c.trim().length > 0);
  const colCount = headerCells.length;
  if (colCount === 0) return text;

  // Split rest into individual cells
  const allCells = rest.split('|').filter((c: string) => c.trim().length > 0);

  // Group cells into rows
  const rows: string[] = [];
  for (let i = 0; i < allCells.length; i += colCount) {
    const rowCells = allCells.slice(i, i + colCount);
    if (rowCells.length === colCount) {
      rows.push('| ' + rowCells.map((c: string) => c.trim()).join(' | ') + ' |');
    }
  }

  if (rows.length === 0) return text;

  return `${headerLine}\n${separatorLine}\n${rows.join('\n')}`;
}

// Fix H1 headers that might be stripped
function fixMarkdownHeaders(text: string): string {
  // Ensure # headers have proper spacing after #
  return text.replace(/^(#{1,6})(\S)/gm, '$1 $2');
}

function preprocessMarkdown(text: string): string {
  return fixMarkdownHeaders(fixMarkdownTables(text));
}

interface StreamMessage {
  id: string;
  type: 'user' | 'ai_thinking' | 'tool_call' | 'ai_text' | 'ai_final';
  content: string;
  toolCall?: ToolCallStep;
  isStreaming?: boolean;
}

export function AiChatPanel() {
  const aiConfigStore = useAIConfigStore();
  const agentStore = useAgentStore();
  const connections = useConnectionStore((s) => s.connections);
  const { addAgentTab } = useTerminalStore();

  // Traditional chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Agent state
  const [agentInput, setAgentInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [streamMessages, setStreamMessages] = useState<StreamMessage[]>([]);
  const [taskSteps, setTaskSteps] = useState<TaskStep[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isAgentMode = agentStore.mode === 'agent';
  const currentLoading = isAgentMode ? agentStore.isRunning : chatLoading;

  // Get current model
  const currentModel = aiConfigStore.models.find(m => m.id === agentStore.selectedModelId)
    || aiConfigStore.models.find(m => m.isDefault)
    || aiConfigStore.models[0];

  // Initialize selectedModelId if empty
  useEffect(() => {
    if (!agentStore.selectedModelId && aiConfigStore.models.length > 0) {
      const defaultModel = aiConfigStore.models.find(m => m.isDefault) || aiConfigStore.models[0];
      agentStore.setSelectedModelId(defaultModel.id);
    }
  }, [aiConfigStore.models]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [streamMessages, taskSteps, chatMessages]);

  // ============ Traditional Chat ============
  const sendChatMessage = async (text?: string) => {
    const content = text || chatInput;
    if (!content.trim() || chatLoading) return;
    if (!currentModel?.apiKey) {
      setChatMessages(prev => [...prev, { role: "user", content: content.trim() }, { role: "assistant", content: "请先配置 AI 模型（设置 → AI 配置 → 模型）" }]);
      setChatInput(""); return;
    }

    const userMsg: ChatMessage = { role: "user", content: content.trim() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput("");
    setChatLoading(true);
    setChatMessages([...newMessages, { role: "assistant", content: "" }]);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);

    try {
      const baseUrl = getBaseUrl();
      const response = await fetch(`${baseUrl}/api/ai/chat-proxy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_base: currentModel.baseUrl,
          api_key: currentModel.apiKey,
          model: currentModel.modelName,
          system_prompt: aiConfigStore.systemPrompt,
          messages: newMessages.slice(-20),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`API ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");
      const decoder = new TextDecoder();
      let accumulated = "", buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed?.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") break;
          try {
            const text = JSON.parse(data);
            if (typeof text === "string" && text.length > 0) {
              accumulated += text;
              setChatMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: accumulated }; return u; });
            }
          } catch {
            if (data.length > 0) {
              accumulated += data;
              setChatMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: accumulated }; return u; });
            }
          }
        }
      }
    } catch (err: any) {
      setChatMessages(prev => { const u = [...prev]; u[u.length - 1] = { role: "assistant", content: err.name === "AbortError" ? "超时" : `错误: ${err.message}` }; return u; });
    } finally {
      clearTimeout(timeoutId);
      setChatLoading(false);
    }
  };

  // ============ Agent Mode ============
  const sendAgentMessage = async (text?: string) => {
    const content = text || agentInput;
    if (!content.trim() || agentStore.isRunning) return;
    if (!currentModel?.apiKey) { setStreamMessages([{ id: 'err', type: 'ai_final', content: '请先配置 AI 模型' }]); setAgentInput(""); return; }
    if (!agentStore.currentConnId) { setStreamMessages([{ id: 'err', type: 'ai_final', content: '请先选择目标服务器' }]); setAgentInput(""); return; }

    const sessionId = agentStore.currentSessionId || `session-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).substr(2, 9)}`;
    agentStore.setCurrentSessionId(sessionId);

    setStreamMessages(prev => [...prev, { id: `user-${Date.now()}`, type: 'user', content: content.trim() }]);
    setAgentInput("");
    setTaskSteps([]);

    addAgentTab(sessionId, agentStore.currentConnId, 'Agent执行');
    agentStore.setRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      await agentChat({
        session_id: sessionId,
        conn_id: agentStore.currentConnId,
        messages: [{ role: 'user', content: content.trim() }],
        model_config: {
          api_base: currentModel.baseUrl,
          api_key: currentModel.apiKey,
          model: currentModel.modelName,
          temperature: currentModel.temperature,
          max_tokens: currentModel.maxTokens,
          top_p: currentModel.topP,
          frequency_penalty: currentModel.frequencyPenalty,
          presence_penalty: currentModel.presencePenalty,
        },
        signal: controller.signal,
        onEvent: handleAgentEvent,
      });
    } catch (err: any) {
      setStreamMessages(prev => [...prev, { id: `err-${Date.now()}`, type: 'ai_final', content: err.name === 'AbortError' ? '执行已取消' : `错误: ${err.message}` }]);
    } finally {
      agentStore.setRunning(false);
      abortRef.current = null;
    }
  };

  const handleAgentEvent = (event: any) => {
    const { type, data } = event;
    switch (type) {
      case 'thinking':
        setStreamMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.type === 'ai_thinking') return [...prev.slice(0, -1), { ...last, content: `思考中... (第${data?.iteration || 1}步)` }];
          return [...prev, { id: `think-${Date.now()}`, type: 'ai_thinking', content: `思考中... (第${data?.iteration || 1}步)` }];
        });
        break;

      case 'text_chunk':
        setStreamMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.type === 'ai_text' && last.isStreaming) return [...prev.slice(0, -1), { ...last, content: last.content + (data || ''), isStreaming: true }];
          const filtered = prev.filter(m => m.type !== 'ai_thinking');
          return [...filtered, { id: `ai-${Date.now()}`, type: 'ai_text', content: data || '', isStreaming: true }];
        });
        break;

      case 'text':
        setStreamMessages(prev => {
          const filtered = prev.filter(m => m.type !== 'ai_thinking' && !(m.type === 'ai_text' && m.isStreaming));
          if (data?.isFinal) return [...filtered, { id: `final-${Date.now()}`, type: 'ai_final', content: data?.content || '' }];
          return [...filtered, { id: `int-${Date.now()}`, type: 'ai_text', content: data?.content || '', isStreaming: false }];
        });
        break;

      case 'tool_start': {
        const toolId = data?.toolCallId;
        setTaskSteps(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(s => s.status === 'pending' && !s.toolCallId);
          if (idx >= 0) updated[idx] = { ...updated[idx], status: 'executing', toolCallId: toolId };
          return updated;
        });
        setStreamMessages(prev => [...prev, {
          id: `tool-${toolId}`, type: 'tool_call', content: '',
          toolCall: { id: toolId, toolName: data?.toolName, parameters: data?.parameters || {}, status: 'executing', startTime: Date.now(), isDangerous: false, output: '' }
        }]);
        break;
      }

      case 'tool_output': {
        const outId = data?.toolCallId;
        setStreamMessages(prev => prev.map(m => {
          if (m.type === 'tool_call' && m.toolCall && m.toolCall.id === outId) {
            return { ...m, toolCall: { ...m.toolCall, output: (m.toolCall.output || '') + (data?.chunk || '') } };
          }
          return m;
        }));
        break;
      }

      case 'tool_complete': {
        const compId = data?.toolCallId;
        setStreamMessages(prev => prev.map(m => {
          if (m.type === 'tool_call' && m.toolCall && m.toolCall.id === compId) {
            return { ...m, toolCall: { ...m.toolCall, status: data?.success ? 'completed' : 'failed', exitCode: data?.exitCode, output: data?.output || m.toolCall.output, endTime: Date.now() } };
          }
          return m;
        }));
        setTaskSteps(prev => prev.map(s => s.toolCallId === compId ? { ...s, status: data?.success ? 'completed' : 'failed' } : s));
        break;
      }

      case 'tool_error': {
        const errId = data?.toolCallId;
        setStreamMessages(prev => prev.map(m => {
          if (m.type === 'tool_call' && m.toolCall && m.toolCall.id === errId) {
            return { ...m, toolCall: { ...m.toolCall, status: 'failed', output: data?.error, endTime: Date.now() } };
          }
          return m;
        }));
        setTaskSteps(prev => prev.map(s => s.toolCallId === errId ? { ...s, status: 'failed' } : s));
        break;
      }

      case 'confirm_required':
        agentStore.setPendingConfirm({ toolCallId: data?.toolCallId, toolName: data?.toolName, command: data?.command, reason: data?.reason, level: data?.level });
        break;

      case 'error':
        setStreamMessages(prev => [...prev, { id: `err-${Date.now()}`, type: 'ai_final', content: `错误: ${data?.message}` }]);
        break;

      case 'done':
        agentStore.setCurrentSessionId(data?.sessionId);
        agentStore.setRunning(false);
        break;
    }
  };

  const handleConfirm = async (command: string) => {
    const pending = agentStore.pendingConfirm;
    if (!pending || !agentStore.currentSessionId) return;
    agentStore.setPendingConfirm(null);
    await agentConfirm({ session_id: agentStore.currentSessionId, tool_call_id: pending.toolCallId, confirmed: true, command });
  };

  const handleCancelConfirm = async () => {
    const pending = agentStore.pendingConfirm;
    if (!pending || !agentStore.currentSessionId) return;
    agentStore.setPendingConfirm(null);
    await agentConfirm({ session_id: agentStore.currentSessionId, tool_call_id: pending.toolCallId, confirmed: false });
  };

  const handleCancel = async () => {
    if (abortRef.current) abortRef.current.abort();
    if (agentStore.currentSessionId) await agentCancel(agentStore.currentSessionId);
    agentStore.setRunning(false);
  };

  const handleSelectSession = async (session: any) => {
    agentStore.setCurrentSessionId(session.id);
    agentStore.setCurrentConnId(session.conn_id);
    try {
      const dbMessages = await getAgentMessages(session.id);
      setStreamMessages(dbMessages.map((m: any, i: number) => ({ id: `hist-${i}`, type: m.role === 'user' ? 'user' : 'ai_final', content: m.content })));
    } catch { setStreamMessages([]); }
    setShowHistory(false);
  };

  const clearAll = () => {
    if (isAgentMode) { setStreamMessages([]); setTaskSteps([]); agentStore.clearMessages(); }
    else setChatMessages([]);
  };

  // Get provider icon
  const providerIcon = currentModel ? (PROVIDER_PRESETS.find(p => p.id === currentModel.provider)?.icon || '⚙️') : '⚙️';

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--bg-secondary)" }}>
      {/* Header */}
      <div className="flex items-center justify-between p-2 px-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'var(--accent-gradient)' }}>
            <Bot size={12} style={{ color: "#fff" }} />
          </div>
          <span className="text-xs font-semibold bg-clip-text" style={{ background: "var(--accent-gradient)", WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>AI 助手</span>
          {currentLoading && <span className="text-xs animate-pulse px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-subtle)', color: "var(--accent)" }}>执行中...</span>}
        </div>
        <div className="flex items-center gap-1">
          {isAgentMode && <button onClick={() => setShowHistory(!showHistory)} title="历史" className="p-1 rounded-lg hover:bg-white/5 transition-all" style={{ color: "var(--text-secondary)" }}><History size={14} /></button>}
          <button onClick={clearAll} title="清空" className="p-1 rounded-lg hover:bg-white/5 transition-all" style={{ color: "var(--text-secondary)" }}><RotateCcw size={14} /></button>
        </div>
      </div>

      {/* Session history */}
      {showHistory && isAgentMode && (
        <div className="h-40 flex-shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
          <AgentSessionList currentSessionId={agentStore.currentSessionId} onSelectSession={handleSelectSession}
            onNewSession={() => { setStreamMessages([]); setTaskSteps([]); agentStore.clearMessages(); setShowHistory(false); }} />
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {/* Chat mode empty */}
        {!isAgentMode && chatMessages.length === 0 && (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-xl mx-auto mb-3 flex items-center justify-center" style={{ background: 'var(--accent-subtle)' }}>
              <Sparkles size={22} style={{ color: 'var(--accent)' }} />
            </div>
            <p className="text-xs mb-3" style={{ color: "var(--text-secondary)" }}>AI 运维助手</p>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {PRESET_QUESTIONS.map((q) => <button key={q} onClick={() => sendChatMessage(q)} className="text-xs px-3 py-1.5 rounded-lg transition-all hover:scale-105" style={{ background: "var(--bg-tertiary)", color: "var(--text-secondary)", border: '1px solid var(--border)' }}>{q}</button>)}
            </div>
          </div>
        )}

        {/* Chat messages */}
        {!isAgentMode && chatMessages.map((msg, idx) => (
          <div key={idx} className="animate-fade-in">
            {msg.role === "user" ? (
              <div className="flex justify-end mb-2">
                <div className="max-w-[85%] px-3.5 py-2.5 rounded-xl text-xs" style={{ background: "var(--accent-gradient)", color: "#fff", boxShadow: 'var(--shadow-sm)' }}>{msg.content}</div>
              </div>
            ) : (
              <div className="text-xs mb-2" style={{ color: "var(--text-primary)" }}>
                {!msg.content ? <div className="typing-indicator"><span /><span /><span /></div> : <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{preprocessMarkdown(msg.content)}</ReactMarkdown></div>}
              </div>
            )}
          </div>
        ))}

        {/* Agent mode empty */}
        {isAgentMode && streamMessages.length === 0 && (
          <div className="text-center py-4">
            <p className="text-xs mb-2" style={{ color: "var(--text-secondary)" }}>AI Agent - 自动执行命令</p>
            <p className="text-[10px]" style={{ color: "var(--text-secondary)" }}>选择目标服务器后输入需求</p>
          </div>
        )}

        {/* Agent stream messages */}
        {isAgentMode && streamMessages.map((msg) => (
          <div key={msg.id} className="animate-fade-in">
            {msg.type === 'user' && (
              <div className="flex justify-end mb-3">
                <div className="max-w-[85%] px-3.5 py-2.5 rounded-xl text-xs" style={{ background: "var(--accent-gradient)", color: "#fff", boxShadow: 'var(--shadow-sm)' }}>{msg.content}</div>
              </div>
            )}
            {msg.type === 'ai_thinking' && (
              <div className="flex items-center gap-2 text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
                <Loader size={12} className="animate-spin" /><span>{msg.content}</span>
              </div>
            )}
            {msg.type === 'ai_text' && (
              <div className="text-xs mb-2" style={{ color: msg.isStreaming ? 'rgba(var(--text-primary-rgb, 30,41,59), 0.6)' : 'var(--text-primary)' }}>
                {msg.isStreaming ? <div className="whitespace-pre-wrap">{msg.content}</div> : <div className="markdown-body"><ReactMarkdown remarkPlugins={[remarkGfm]}>{preprocessMarkdown(msg.content)}</ReactMarkdown></div>}
              </div>
            )}
            {msg.type === 'tool_call' && msg.toolCall && <ToolCallCardInline toolCall={msg.toolCall} />}
            {msg.type === 'ai_final' && (
              <div className="text-xs mb-2 markdown-body" style={{ color: 'var(--text-primary)' }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{preprocessMarkdown(msg.content)}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Task steps */}
      {isAgentMode && taskSteps.length > 0 && (
        <div className="px-3 py-2 border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)', maxHeight: '150px', overflowY: 'auto' }}>
          {taskSteps.map((step) => (
            <div key={step.id} className="flex items-center gap-2 text-[11px] py-[3px]"
              style={{ textDecoration: step.status === 'completed' ? 'line-through' : 'none', opacity: step.status === 'completed' ? 0.5 : 1 }}>
              {step.status === 'pending' && <Circle size={8} fill="#6b7280" style={{ color: '#6b7280' }} />}
              {step.status === 'executing' && <Loader size={10} className="animate-spin" style={{ color: '#22c55e' }} />}
              {step.status === 'completed' && <CheckCircle size={10} style={{ color: '#22c55e' }} />}
              {step.status === 'failed' && <XCircle size={10} style={{ color: '#ef4444' }} />}
              <span className="truncate" style={{ color: step.status === 'failed' ? '#ef4444' : 'var(--text-primary)' }}>{step.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-2.5 border-t" style={{ borderColor: 'var(--border)', background: 'var(--bg-primary)' }}>
        <div className="flex gap-2">
          <input type="text" value={isAgentMode ? agentInput : chatInput}
            onChange={(e) => isAgentMode ? setAgentInput(e.target.value) : setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (isAgentMode ? sendAgentMessage() : sendChatMessage())}
            placeholder={isAgentMode ? "输入服务器管理需求..." : "输入运维问题..."}
            className="flex-1 px-3.5 py-2.5 rounded-xl text-xs outline-none focus:ring-1 transition-all"
            style={{ background: "var(--bg-secondary)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            disabled={currentLoading} />
          <button onClick={() => isAgentMode ? (currentLoading ? handleCancel() : sendAgentMessage()) : sendChatMessage()}
            className="px-3.5 py-2.5 rounded-xl font-medium transition-all flex items-center justify-center"
            style={{ background: isAgentMode && currentLoading ? 'var(--danger-gradient)' : "var(--accent-gradient)", color: "#fff", boxShadow: 'var(--shadow-sm)' }}>
            {isAgentMode && currentLoading ? <X size={14} /> : <Send size={14} />}
          </button>
        </div>
      </div>

      {/* Bottom controls: Mode + Model selector */}
      <div className="flex items-center gap-2 px-2.5 pb-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-primary)', paddingTop: '6px' }}>
        <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <button onClick={() => agentStore.setMode('chat')} className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium transition-all"
            style={{ background: !isAgentMode ? 'var(--accent-subtle)' : 'transparent', color: !isAgentMode ? 'var(--accent)' : 'var(--text-secondary)' }}>
            <MessageSquare size={10} /> 对话
          </button>
          <button onClick={() => agentStore.setMode('agent')} className="flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium transition-all"
            style={{ background: isAgentMode ? 'var(--accent-subtle)' : 'transparent', color: isAgentMode ? 'var(--accent)' : 'var(--text-secondary)' }}>
            <Bot size={10} /> Agent
          </button>
        </div>

        {isAgentMode && (
          <select value={agentStore.currentConnId} onChange={(e) => agentStore.setCurrentConnId(e.target.value)}
            className="text-[10px] px-1 py-0.5 rounded outline-none max-w-[100px]"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            <option value="">服务器...</option>
            {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}

        <div className="ml-auto flex items-center gap-1">
          <span className="text-sm">{providerIcon}</span>
          <select value={agentStore.selectedModelId} onChange={(e) => agentStore.setSelectedModelId(e.target.value)}
            className="text-[10px] px-1 py-0.5 rounded outline-none"
            style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            {aiConfigStore.models.map(m => {
              const p = PROVIDER_PRESETS.find(pr => pr.id === m.provider) || PROVIDER_PRESETS[0];
              return <option key={m.id} value={m.id}>{m.modelName || '未命名'} {p.icon}</option>;
            })}
          </select>
        </div>
      </div>

      {/* Confirm Dialog */}
      {agentStore.pendingConfirm && (
        <ConfirmDialog toolName={agentStore.pendingConfirm.toolName} command={agentStore.pendingConfirm.command}
          reason={agentStore.pendingConfirm.reason} level={agentStore.pendingConfirm.level}
          onConfirm={handleConfirm} onCancel={handleCancelConfirm} />
      )}
    </div>
  );
}

// Inline Tool Call Card
function ToolCallCardInline({ toolCall }: { toolCall: ToolCallStep }) {
  const [expanded, setExpanded] = useState(false);
  const output = toolCall.output || '';
  const hasOutput = output.trim().length > 0;

  const statusColor = toolCall.status === 'completed' ? '#22c55e' : toolCall.status === 'failed' ? '#ef4444' : toolCall.status === 'executing' ? '#3b82f6' : '#f59e0b';
  const statusIcon = toolCall.status === 'completed' ? <CheckCircle size={12} /> : toolCall.status === 'failed' ? <XCircle size={12} /> : toolCall.status === 'executing' ? <Loader size={12} className="animate-spin" /> : <Clock size={12} />;

  const formatDuration = (ms: number) => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
  const duration = toolCall.endTime ? formatDuration(toolCall.endTime - toolCall.startTime) : formatDuration(Date.now() - toolCall.startTime);
  const commandDisplay = toolCall.parameters?.command || toolCall.parameters?.path || toolCall.toolName;

  return (
    <div className="mb-2 rounded-lg text-xs overflow-hidden" style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-white/5 transition-all" onClick={() => hasOutput && setExpanded(!expanded)}>
        <span style={{ color: statusColor }}>{statusIcon}</span>
        <span className="font-mono flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{commandDisplay}</span>
        <span className="text-[10px]" style={{ color: statusColor }}>
          {toolCall.status === 'executing' ? `执行中 ${duration}` : toolCall.status === 'completed' ? `完成 ${duration}` : toolCall.status === 'failed' ? '失败' : ''}
        </span>
        {hasOutput && (expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
      </div>
      {expanded && hasOutput && (
        <div className="mx-2 mb-2 p-2 rounded font-mono text-[11px] max-h-48 overflow-auto whitespace-pre-wrap break-all"
          style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
          {output}
        </div>
      )}
    </div>
  );
}
