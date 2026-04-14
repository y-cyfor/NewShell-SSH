package services

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"newshell-server/models"
	"newshell-server/tools"
)

// AgentEngine manages the Agent execution loop
type AgentEngine struct {
	config        *models.AgentConfig
	aiConfig      *models.AIConfig
	safetyChecker *tools.SafetyChecker
}

// NewAgentEngine creates a new Agent engine
func NewAgentEngine(config *models.AgentConfig, aiConfig *models.AIConfig) *AgentEngine {
	return &AgentEngine{
		config:        config,
		aiConfig:      aiConfig,
		safetyChecker: tools.GlobalSafetyChecker,
	}
}

// AgentStep represents a single step in the agent execution
type AgentStep struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

// AgentRun runs the agent loop for a single user message
// It sends SSE events through the stepChan
func (ae *AgentEngine) Run(ctx context.Context, sessionID string, connID string, messages []ChatMessage, stepChan chan<- AgentStep) (string, error) {
	// Build available tools
	apiTools := tools.GlobalRegistry.ToAPITools()

	// Build system prompt
	systemPrompt := ae.buildSystemPrompt(connID, apiTools)

	// Prepare messages with system prompt
	allMessages := []ChatMessage{{Role: "system", Content: systemPrompt}}
	allMessages = append(allMessages, messages...)

	// Limit message history
	if len(allMessages) > 21 {
		allMessages = append([]ChatMessage{allMessages[0]}, allMessages[len(allMessages)-20:]...)
	}

	// ReAct loop
	maxIter := ae.config.MaxIterations
	if maxIter <= 0 {
		maxIter = 10
	}

	var finalContent string

	for i := 0; i < maxIter; i++ {
		// Call LLM
		stepChan <- AgentStep{Type: "thinking", Data: map[string]interface{}{
			"iteration": i + 1,
			"max":       maxIter,
		}}

		resp, err := CallLLMWithTools(ae.aiConfig, allMessages, apiTools, func(content string) {
			stepChan <- AgentStep{Type: "text_chunk", Data: content}
		})
		if err != nil {
			return "", fmt.Errorf("LLM调用失败: %v", err)
		}

		// Add assistant message to history
		assistantMsg := ChatMessage{Role: "assistant", Content: resp.Content}
		if len(resp.ToolCalls) > 0 {
			assistantMsg.ToolCalls = ConvertToolCallsToAPI(resp.ToolCalls)
			assistantMsg.Content = resp.Content
		}
		allMessages = append(allMessages, assistantMsg)

		// Save assistant message to DB
		if sessionID != "" {
			toolCallsJSON := ""
			if len(resp.ToolCalls) > 0 {
				if tcBytes, err := json.Marshal(resp.ToolCalls); err == nil {
					toolCallsJSON = string(tcBytes)
				}
			}
			models.SaveAgentMessage(sessionID, "assistant", resp.Content, toolCallsJSON, "")
		}

		// Send text content from this iteration (both intermediate and final)
		if resp.Content != "" {
			isFinal := len(resp.ToolCalls) == 0
			stepChan <- AgentStep{Type: "text", Data: map[string]interface{}{
				"content": resp.Content,
				"isFinal": isFinal,
			}}
		}

		// If no tool calls, this is the final response
		if len(resp.ToolCalls) == 0 {
			finalContent = resp.Content
			break
		}

		// Execute each tool call
		for _, tc := range resp.ToolCalls {
			// Check for dangerous commands
			dangerous, reason, level := ae.checkDangerous(tc)

			if dangerous && ae.config.ConfirmMode != "none" {
				// Send confirmation request
				confirmChan := make(chan bool, 1)
				stepChan <- AgentStep{Type: "confirm_required", Data: map[string]interface{}{
					"toolCallId":  tc.ID,
					"toolName":    tc.Name,
					"command":     extractCommand(tc),
					"reason":      reason,
					"level":       level,
					"confirmChan": confirmChan,
				}}

				// Wait for confirmation
				select {
				case confirmed := <-confirmChan:
					if !confirmed {
						// User rejected
						rejectMsg := ChatMessage{Role: "tool", Content: "用户拒绝执行此命令", ToolCallID: tc.ID}
						allMessages = append(allMessages, rejectMsg)
						stepChan <- AgentStep{Type: "tool_rejected", Data: map[string]interface{}{
							"toolCallId": tc.ID,
						}}
						continue
					}
				case <-ctx.Done():
					return finalContent, ctx.Err()
				}
			}

			// Check if confirm mode is "all"
			if ae.config.ConfirmMode == "all" && !dangerous {
				confirmChan := make(chan bool, 1)
				stepChan <- AgentStep{Type: "confirm_required", Data: map[string]interface{}{
					"toolCallId":  tc.ID,
					"toolName":    tc.Name,
					"command":     extractCommand(tc),
					"reason":      "需要确认执行",
					"level":       "info",
					"confirmChan": confirmChan,
				}}

				select {
				case confirmed := <-confirmChan:
					if !confirmed {
						rejectMsg := ChatMessage{Role: "tool", Content: "用户拒绝执行此命令", ToolCallID: tc.ID}
						allMessages = append(allMessages, rejectMsg)
						stepChan <- AgentStep{Type: "tool_rejected", Data: map[string]interface{}{
							"toolCallId": tc.ID,
						}}
						continue
					}
				case <-ctx.Done():
					return finalContent, ctx.Err()
				}
			}

			// Execute the tool
			log.Printf("[Agent] Executing tool: %s, params: %v", tc.Name, tc.Parameters)
			stepChan <- AgentStep{Type: "tool_start", Data: map[string]interface{}{
				"toolCallId": tc.ID,
				"toolName":   tc.Name,
				"parameters": tc.Parameters,
			}}

			// Create execution context
			outputChan := make(chan tools.ToolOutput, 100)
			execCtx := &tools.ExecutionContext{
				ConnID:     connID,
				SessionID:  sessionID,
				ToolCallID: tc.ID,
				OutputChan: outputChan,
				WSBroadcast: func(data string) {
					// Send to SSE channel
					stepChan <- AgentStep{Type: "terminal_output", Data: data}
					// Also send to WebSocket terminal
					log.Printf("[Agent] WSBroadcast called for session %s, data_len=%d", sessionID, len(data))
					BroadcastToAgentTerminal(sessionID, data)
				},
			}

			// Start output relay
			go func() {
				for out := range outputChan {
					stepChan <- AgentStep{Type: "tool_output", Data: map[string]interface{}{
						"toolCallId": tc.ID,
						"chunk":      out.Chunk,
					}}
				}
			}()

			// Execute
			result, err := tools.GlobalRegistry.Execute(ctx, tc.Name, tc.Parameters, execCtx)
			close(outputChan)

			if err != nil {
				errMsg := fmt.Sprintf("工具执行错误: %v", err)
				toolMsg := ChatMessage{Role: "tool", Content: errMsg, ToolCallID: tc.ID}
				allMessages = append(allMessages, toolMsg)
				stepChan <- AgentStep{Type: "tool_error", Data: map[string]interface{}{
					"toolCallId": tc.ID,
					"error":      errMsg,
				}}
			} else {
				output := result.Output
				if len(output) > 5000 {
					output = output[:5000] + "\n...(输出已截断)"
				}
				toolMsg := ChatMessage{Role: "tool", Content: output, ToolCallID: tc.ID}
				allMessages = append(allMessages, toolMsg)
				stepChan <- AgentStep{Type: "tool_complete", Data: map[string]interface{}{
					"toolCallId": tc.ID,
					"success":    result.Success,
					"exitCode":   result.ExitCode,
					"output":     output,
				}}

				// Save tool result
				if sessionID != "" {
					models.SaveAgentMessage(sessionID, "tool", output, "", tc.ID)
				}
			}
		}
	}

	// Save final assistant message
	if sessionID != "" && finalContent != "" {
		models.SaveAgentMessage(sessionID, "assistant", finalContent, "", "")
	}

	return finalContent, nil
}

// buildSystemPrompt builds the system prompt for the Agent
func (ae *AgentEngine) buildSystemPrompt(connID string, apiTools []tools.APITool) string {
	var serverInfo string
	if connID != "" {
		if conn, err := models.GetConnection(connID); err == nil {
			serverInfo = fmt.Sprintf("\n## 当前目标服务器\n- 名称: %s\n- 地址: %s@%s:%d\n",
				conn.Name, conn.Username, conn.Host, conn.Port)
		}
	}

	// Add enabled skills
	var skillsSection string
	if skills, err := models.GetEnabledSkills(); err == nil && len(skills) > 0 {
		var sb strings.Builder
		sb.WriteString("\n## 可用Skills (工作流模板)\n\n")
		for _, s := range skills {
			sb.WriteString(fmt.Sprintf("### %s\n", s.Name))
			if s.Description != "" {
				sb.WriteString(s.Description + "\n")
			}
			if s.Content != "" {
				sb.WriteString(s.Content + "\n")
			}
		}
		skillsSection = sb.String()
	}

	var toolDefs strings.Builder
	toolDefs.WriteString("\n## 可用工具\n\n")
	for _, t := range apiTools {
		toolDefs.WriteString(fmt.Sprintf("### %s\n%s\n", t.Function.Name, t.Function.Description))
		if params, ok := t.Function.Parameters["properties"].(map[string]interface{}); ok {
			toolDefs.WriteString("参数:\n")
			for name, p := range params {
				if prop, ok := p.(map[string]interface{}); ok {
					desc := ""
					if d, ok := prop["description"].(string); ok {
						desc = d
					}
					reqMark := ""
					if reqs, ok := t.Function.Parameters["required"].([]interface{}); ok {
						for _, r := range reqs {
							if r.(string) == name {
								reqMark = " [必填]"
								break
							}
						}
					}
					toolDefs.WriteString(fmt.Sprintf("  - %s: %s%s\n", name, desc, reqMark))
				}
			}
		}
		toolDefs.WriteString("\n")
	}

	return fmt.Sprintf(`你是 VibeCoding Shell 的 AI 运维Agent。你可以使用工具来帮助用户管理服务器。%s
%s
%s
## 执行规则
1. 仔细分析用户需求，制定执行计划
2. 每次调用一个工具，观察结果后再决定下一步
3. 执行危险操作前必须向用户解释原因
4. 如果命令执行失败，分析错误信息并尝试修复
5. 任务完成后给出结构化的总结

## 安全规则
- 绝对不要执行 rm -rf / 等极端危险命令
- 修改系统配置前先备份原文件
- 敏感信息不要在输出中明文显示

## 输出格式
- 工具调用时: 简洁说明目的
- 执行失败时: 分析原因并给出修复建议
- 最终总结: 使用结构化格式`, serverInfo, skillsSection, toolDefs.String())
}

// checkDangerous checks if a tool call is dangerous
func (ae *AgentEngine) checkDangerous(tc tools.ToolCall) (bool, string, string) {
	cmd := extractCommand(tc)
	if cmd == "" {
		return false, "", ""
	}
	return ae.safetyChecker.Check(cmd)
}

// extractCommand extracts the command string from a tool call
func extractCommand(tc tools.ToolCall) string {
	if tc.Name == "execute_command" {
		if cmd, ok := tc.Parameters["command"].(string); ok {
			return cmd
		}
	}
	if tc.Name == "delete_file" {
		if path, ok := tc.Parameters["path"].(string); ok {
			return "rm " + path
		}
	}
	if tc.Name == "write_file" {
		if path, ok := tc.Parameters["path"].(string); ok {
			return "write " + path
		}
	}
	return ""
}
