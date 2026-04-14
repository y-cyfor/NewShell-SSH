import { getBaseUrl } from './api';
import { AgentConfig, AgentSession, AgentMessageDB, MCPServerConfig, SkillInfo, SSEAgentEvent, ModelConfig } from '../types';

const BASE = () => getBaseUrl();

// Agent Chat - SSE streaming
export async function agentChat(params: {
  session_id?: string;
  conn_id: string;
  messages: { role: string; content: string }[];
  model_config?: {
    api_base: string;
    api_key: string;
    model: string;
    temperature: number;
    max_tokens: number;
    top_p: number;
    frequency_penalty: number;
    presence_penalty: number;
  };
  onEvent: (event: SSEAgentEvent) => void;
  signal?: AbortSignal;
}) {
  const { session_id, conn_id, messages, model_config, onEvent, signal } = params;

  const body: any = { session_id, conn_id, messages };
  if (model_config) {
    body.model_config = model_config;
  }

  const response = await fetch(`${BASE()}/api/agent/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const err = await response.text().catch(() => '');
    throw new Error(`Agent API error ${response.status}: ${err}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') return;

      try {
        const event: SSEAgentEvent = JSON.parse(data);
        onEvent(event);
      } catch {
        // ignore parse errors
      }
    }
  }
}

// Confirm command execution
export async function agentConfirm(params: {
  session_id: string;
  tool_call_id: string;
  confirmed: boolean;
  command?: string;
}) {
  const res = await fetch(`${BASE()}/api/agent/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  return res.json();
}

// Cancel agent execution
export async function agentCancel(sessionId: string) {
  const res = await fetch(`${BASE()}/api/agent/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  return res.json();
}

// Config
export async function getAgentConfig(): Promise<AgentConfig> {
  const res = await fetch(`${BASE()}/api/agent/config`);
  return res.json();
}

export async function updateAgentConfig(config: Partial<AgentConfig>) {
  const res = await fetch(`${BASE()}/api/agent/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return res.json();
}

// Sessions
export async function getAgentSessions(): Promise<AgentSession[]> {
  const res = await fetch(`${BASE()}/api/agent/sessions`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function getAgentSession(id: string): Promise<AgentSession> {
  const res = await fetch(`${BASE()}/api/agent/sessions/${id}`);
  return res.json();
}

export async function getAgentMessages(sessionId: string): Promise<AgentMessageDB[]> {
  const res = await fetch(`${BASE()}/api/agent/sessions/${sessionId}/messages`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function deleteAgentSession(id: string) {
  const res = await fetch(`${BASE()}/api/agent/sessions/${id}`, { method: 'DELETE' });
  return res.json();
}

// MCP
export async function getMCPServers(): Promise<MCPServerConfig[]> {
  try {
    const res = await fetch(`${BASE()}/api/agent/mcp/servers`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function createMCPServer(server: Partial<MCPServerConfig>) {
  const res = await fetch(`${BASE()}/api/agent/mcp/servers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(server),
  });
  return res.json();
}

export async function deleteMCPServer(id: string) {
  const res = await fetch(`${BASE()}/api/agent/mcp/servers/${id}`, { method: 'DELETE' });
  return res.json();
}

// Skills
export async function getSkills(): Promise<SkillInfo[]> {
  try {
    const res = await fetch(`${BASE()}/api/agent/skills`);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function installSkill(skill: Partial<SkillInfo>) {
  const res = await fetch(`${BASE()}/api/agent/skills/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(skill),
  });
  return res.json();
}

export async function deleteSkill(name: string) {
  const res = await fetch(`${BASE()}/api/agent/skills/${name}`, { method: 'DELETE' });
  return res.json();
}

// Agent terminal WebSocket
export function createAgentTerminalWS(
  sessionId: string,
  onData: (data: string) => void
): WebSocket {
  const baseUrl = BASE().replace('http', 'ws');
  const ws = new WebSocket(`${baseUrl}/ws/agent-terminal/${sessionId}`);

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'agent_output') {
        onData(msg.data);
      }
    } catch {
      // ignore
    }
  };

  return ws;
}
