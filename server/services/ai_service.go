package services

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"newshell-server/models"
	"newshell-server/tools"
)

// APIToolCall is the OpenAI-compatible format for tool calls in messages
type APIToolCall struct {
	ID       string              `json:"id"`
	Type     string              `json:"type"`
	Function APIToolCallFunction `json:"function"`
}

type APIToolCallFunction struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type ChatMessage struct {
	Role       string        `json:"role"`
	Content    string        `json:"content,omitempty"`
	ToolCalls  []APIToolCall `json:"tool_calls,omitempty"`
	ToolCallID string        `json:"tool_call_id,omitempty"`
}

type ChatRequest struct {
	Messages []ChatMessage `json:"messages"`
}

// ConvertToolCallToAPI converts internal ToolCall to API format
func ConvertToolCallToAPI(tc tools.ToolCall) APIToolCall {
	argsJSON, _ := json.Marshal(tc.Parameters)
	return APIToolCall{
		ID:   tc.ID,
		Type: "function",
		Function: APIToolCallFunction{
			Name:      tc.Name,
			Arguments: string(argsJSON),
		},
	}
}

// ConvertToolCallsToAPI converts a slice of ToolCalls to API format
func ConvertToolCallsToAPI(tcs []tools.ToolCall) []APIToolCall {
	result := make([]APIToolCall, len(tcs))
	for i, tc := range tcs {
		result[i] = ConvertToolCallToAPI(tc)
	}
	return result
}

type chatAPIRequest struct {
	Model            string          `json:"model"`
	Messages         []ChatMessage   `json:"messages"`
	Stream           bool            `json:"stream"`
	Tools            []tools.APITool `json:"tools,omitempty"`
	ToolChoice       interface{}     `json:"tool_choice,omitempty"`
	Temperature      *float64        `json:"temperature,omitempty"`
	MaxTokens        *int            `json:"max_tokens,omitempty"`
	TopP             *float64        `json:"top_p,omitempty"`
	FrequencyPenalty *float64        `json:"frequency_penalty,omitempty"`
	PresencePenalty  *float64        `json:"presence_penalty,omitempty"`
}

type chatAPIResponse struct {
	Choices []struct {
		Delta struct {
			Content   string          `json:"content"`
			ToolCalls []toolCallDelta `json:"tool_calls,omitempty"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
}

type toolCallDelta struct {
	Index    int    `json:"index"`
	ID       string `json:"id"`
	Type     string `json:"type"`
	Function struct {
		Name      string `json:"name"`
		Arguments string `json:"arguments"`
	} `json:"function"`
}

func doLLMRequest(apiBase, apiKey, model string, messages []ChatMessage, writer io.Writer) error {
	if apiBase == "" || apiKey == "" {
		return fmt.Errorf("API base URL and API key are required")
	}

	url := strings.TrimRight(apiBase, "/") + "/chat/completions"
	reqBody := chatAPIRequest{Model: model, Messages: messages, Stream: true}
	jsonData, _ := json.Marshal(reqBody)

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	req, _ := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "text/event-stream")

	client := &http.Client{
		Transport: &http.Transport{DisableCompression: true},
	}

	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("API request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	flusher, hasFlusher := writer.(http.Flusher)
	scanner := bufio.NewScanner(resp.Body)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}
		var apiResp chatAPIResponse
		if err := json.Unmarshal([]byte(data), &apiResp); err != nil {
			continue
		}
		if len(apiResp.Choices) > 0 {
			content := apiResp.Choices[0].Delta.Content
			if content != "" {
				fmt.Fprintf(writer, "data: %q\n\n", content)
				if hasFlusher {
					flusher.Flush()
				}
			}
		}
	}

	fmt.Fprint(writer, "data: [DONE]\n\n")
	if hasFlusher {
		flusher.Flush()
	}

	return scanner.Err()
}

func StreamChat(userID string, messages []ChatMessage, writer io.Writer) error {
	cfg, err := models.GetAIConfig(userID)
	if err != nil {
		return err
	}
	allMessages := []ChatMessage{{Role: "system", Content: cfg.SystemPrompt}}
	allMessages = append(allMessages, messages...)
	if len(allMessages) > 21 {
		allMessages = append([]ChatMessage{allMessages[0]}, allMessages[len(allMessages)-20:]...)
	}
	return doLLMRequest(cfg.APIBase, cfg.APIKey, cfg.Model, allMessages, writer)
}

func StreamChatWithConfig(cfg *models.AIConfig, messages []ChatMessage, writer io.Writer) error {
	allMessages := []ChatMessage{{Role: "system", Content: cfg.SystemPrompt}}
	allMessages = append(allMessages, messages...)
	if len(allMessages) > 21 {
		allMessages = append([]ChatMessage{allMessages[0]}, allMessages[len(allMessages)-20:]...)
	}
	return doLLMRequest(cfg.APIBase, cfg.APIKey, cfg.Model, allMessages, writer)
}

// LLMResponse is the parsed response from LLM with tool call support
type LLMResponse struct {
	Content      string
	ToolCalls    []tools.ToolCall
	FinishReason string
}

// LLMChunkCallback is called during streaming for each content chunk
type LLMChunkCallback func(content string)

// CallLLMWithTools calls the LLM with tool definitions and returns the full response
func CallLLMWithTools(cfg *models.AIConfig, messages []ChatMessage, apiTools []tools.APITool, chunkCb LLMChunkCallback) (*LLMResponse, error) {
	if cfg.APIBase == "" || cfg.APIKey == "" {
		return nil, fmt.Errorf("API base URL and API key are required")
	}

	url := strings.TrimRight(cfg.APIBase, "/") + "/chat/completions"
	reqBody := chatAPIRequest{
		Model:    cfg.Model,
		Messages: messages,
		Stream:   true,
		Tools:    apiTools,
	}
	if len(apiTools) > 0 {
		reqBody.ToolChoice = "auto"
	}

	// Apply model parameters
	if cfg.Temperature > 0 {
		t := cfg.Temperature
		reqBody.Temperature = &t
	}
	if cfg.MaxTokens > 0 {
		mt := cfg.MaxTokens
		reqBody.MaxTokens = &mt
	}
	if cfg.TopP > 0 {
		tp := cfg.TopP
		reqBody.TopP = &tp
	}
	if cfg.FrequencyPenalty != 0 {
		fp := cfg.FrequencyPenalty
		reqBody.FrequencyPenalty = &fp
	}
	if cfg.PresencePenalty != 0 {
		pp := cfg.PresencePenalty
		reqBody.PresencePenalty = &pp
	}

	jsonData, err := json.Marshal(reqBody)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithTimeout(context.Background(), 300*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)
	req.Header.Set("Accept", "text/event-stream")

	client := &http.Client{
		Transport: &http.Transport{DisableCompression: true},
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("API request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("API error %d: %s", resp.StatusCode, string(body))
	}

	result := &LLMResponse{}

	// Use separate maps to accumulate streaming tool call data
	type streamingToolCall struct {
		ID      string
		Name    string
		ArgsStr string // Accumulate raw arguments string
	}
	toolCallMap := make(map[int]*streamingToolCall)

	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var apiResp chatAPIResponse
		if err := json.Unmarshal([]byte(data), &apiResp); err != nil {
			continue
		}

		if len(apiResp.Choices) == 0 {
			continue
		}

		choice := apiResp.Choices[0]

		if choice.Delta.Content != "" {
			result.Content += choice.Delta.Content
			if chunkCb != nil {
				chunkCb(choice.Delta.Content)
			}
		}

		// Accumulate tool calls - arguments come in chunks
		for _, tc := range choice.Delta.ToolCalls {
			if existing, ok := toolCallMap[tc.Index]; ok {
				// Append ID and Name (only first chunk has them typically)
				if tc.ID != "" {
					existing.ID = tc.ID
				}
				if tc.Function.Name != "" {
					existing.Name = tc.Function.Name
				}
				// Accumulate arguments string
				existing.ArgsStr += tc.Function.Arguments
			} else {
				toolCallMap[tc.Index] = &streamingToolCall{
					ID:      tc.ID,
					Name:    tc.Function.Name,
					ArgsStr: tc.Function.Arguments,
				}
			}
		}

		if choice.FinishReason != "" {
			result.FinishReason = choice.FinishReason
		}
	}

	// Convert accumulated tool calls to final format
	for _, stc := range toolCallMap {
		params := make(map[string]interface{})
		if stc.ArgsStr != "" {
			if err := json.Unmarshal([]byte(stc.ArgsStr), &params); err != nil {
				log.Printf("Failed to parse tool call arguments: %v, raw: %s", err, stc.ArgsStr)
			}
		}
		result.ToolCalls = append(result.ToolCalls, tools.ToolCall{
			ID:         stc.ID,
			Name:       stc.Name,
			Parameters: params,
		})
	}

	return result, scanner.Err()
}

func parseJSONSafe(s string) map[string]interface{} {
	var result map[string]interface{}
	if err := json.Unmarshal([]byte(s), &result); err != nil {
		return make(map[string]interface{})
	}
	return result
}

func mergeParams(existing map[string]interface{}, partial string) map[string]interface{} {
	if existing == nil {
		existing = make(map[string]interface{})
	}
	var partialMap map[string]interface{}
	if err := json.Unmarshal([]byte(partial), &partialMap); err != nil {
		return existing
	}
	for k, v := range partialMap {
		existing[k] = v
	}
	return existing
}
