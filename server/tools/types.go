package tools

import (
	"context"
	"time"
)

// ToolParam defines a parameter for a tool
type ToolParam struct {
	Type        string   `json:"type"`
	Description string   `json:"description"`
	Required    bool     `json:"required,omitempty"`
	Enum        []string `json:"enum,omitempty"`
}

// Tool represents a callable tool for the Agent
type Tool struct {
	Name        string               `json:"name"`
	Description string               `json:"description"`
	Parameters  map[string]ToolParam `json:"parameters"`
	Handler     ToolHandler          `json:"-"`
	Category    string               `json:"category"` // "ssh" | "mcp" | "skill" | "builtin"
	IsDangerous bool                 `json:"is_dangerous"`
}

// ToolHandler is the function signature for tool execution
type ToolHandler func(ctx context.Context, params map[string]interface{}, execCtx *ExecutionContext) (*ToolResult, error)

// ExecutionContext provides context for tool execution
type ExecutionContext struct {
	ConnID      string            `json:"conn_id"`
	SessionID   string            `json:"session_id"`
	ToolCallID  string            `json:"tool_call_id"`
	OutputChan  chan<- ToolOutput `json:"-"`
	WSBroadcast func(data string) `json:"-"` // broadcast to agent terminal
}

// ToolResult is the result of a tool execution
type ToolResult struct {
	Success  bool   `json:"success"`
	Output   string `json:"output"`
	ExitCode int    `json:"exit_code,omitempty"`
	Error    string `json:"error,omitempty"`
}

// ToolOutput is a chunk of output streamed during execution
type ToolOutput struct {
	ToolID string `json:"tool_id"`
	Chunk  string `json:"chunk"`
}

// ToolCall represents a tool invocation requested by the LLM
type ToolCall struct {
	ID         string                 `json:"id"`
	Name       string                 `json:"name"`
	Parameters map[string]interface{} `json:"parameters"`
}

// ChatMessage represents a message in the conversation
type ChatMessage struct {
	Role       string     `json:"role"`
	Content    string     `json:"content,omitempty"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
}

// APITool is the tool definition sent to OpenAI-compatible API
type APITool struct {
	Type     string      `json:"type"`
	Function FunctionDef `json:"function"`
}

// FunctionDef is the function definition for OpenAI function calling
type FunctionDef struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Parameters  map[string]interface{} `json:"parameters"`
}

// ToAPITool converts a Tool to the OpenAI API format
func (t *Tool) ToAPITool() APITool {
	properties := make(map[string]interface{})
	required := []string{}

	for name, param := range t.Parameters {
		prop := map[string]interface{}{
			"type":        param.Type,
			"description": param.Description,
		}
		if len(param.Enum) > 0 {
			prop["enum"] = param.Enum
		}
		properties[name] = prop
		if param.Required {
			required = append(required, name)
		}
	}

	return APITool{
		Type: "function",
		Function: FunctionDef{
			Name:        t.Name,
			Description: t.Description,
			Parameters: map[string]interface{}{
				"type":       "object",
				"properties": properties,
				"required":   required,
			},
		},
	}
}

// SSEEvent is the event sent to frontend via SSE
type SSEEvent struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// AgentConfig holds Agent configuration
type AgentConfig struct {
	MaxIterations           int    `json:"max_iterations"`
	DefaultTimeout          int    `json:"default_timeout"` // seconds
	SmartTimeout            bool   `json:"smart_timeout"`
	ConfirmMode             string `json:"confirm_mode"` // "all" | "dangerous" | "none"
	DangerousCommands       string `json:"dangerous_commands"`
	DangerousCommandsCustom string `json:"dangerous_commands_custom"`
	HistoryMode             string `json:"history_mode"` // "persistent" | "session"
}

// DefaultAgentConfig returns default Agent configuration
func DefaultAgentConfig() *AgentConfig {
	return &AgentConfig{
		MaxIterations:           10,
		DefaultTimeout:          60,
		SmartTimeout:            true,
		ConfirmMode:             "dangerous",
		DangerousCommands:       `["rm -rf","shutdown","reboot","mkfs","dd"]`,
		DangerousCommandsCustom: `[]`,
		HistoryMode:             "persistent",
	}
}

// AgentSession represents an Agent conversation session
type AgentSession struct {
	ID        string        `json:"id"`
	ConnID    string        `json:"conn_id"`
	Title     string        `json:"title"`
	Messages  []ChatMessage `json:"messages"`
	CreatedAt time.Time     `json:"created_at"`
	UpdatedAt time.Time     `json:"updated_at"`
}

// AgentMessageDB is the database representation of an agent message
type AgentMessageDB struct {
	ID         int    `json:"id"`
	SessionID  string `json:"session_id"`
	Role       string `json:"role"`
	Content    string `json:"content"`
	ToolCalls  string `json:"tool_calls,omitempty"`
	ToolCallID string `json:"tool_call_id,omitempty"`
	CreatedAt  string `json:"created_at"`
}

// MCPServerConfig holds MCP server configuration
type MCPServerConfig struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Transport string `json:"transport"` // "stdio" | "http"
	Command   string `json:"command,omitempty"`
	Args      string `json:"args,omitempty"` // JSON array
	URL       string `json:"url,omitempty"`
	Enabled   bool   `json:"enabled"`
}

// SkillInfo holds skill metadata
type SkillInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	Version     string `json:"version"`
	Source      string `json:"source"` // "local" | "clawhub"
	Path        string `json:"path"`
	Enabled     bool   `json:"enabled"`
}
