package handlers

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"newshell-server/models"
	"newshell-server/services"
	"newshell-server/tools"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// ModelConfigRequest is the model config sent from frontend
type ModelConfigRequest struct {
	APIBase          string  `json:"api_base"`
	APIKey           string  `json:"api_key"`
	Model            string  `json:"model"`
	SystemPrompt     string  `json:"system_prompt"`
	Temperature      float64 `json:"temperature"`
	MaxTokens        int     `json:"max_tokens"`
	TopP             float64 `json:"top_p"`
	FrequencyPenalty float64 `json:"frequency_penalty"`
	PresencePenalty  float64 `json:"presence_penalty"`
}

// AgentChat handles Agent conversation via SSE
func AgentChat(c *gin.Context) {
	var req struct {
		SessionID   string                 `json:"session_id"`
		ConnID      string                 `json:"conn_id"`
		Messages    []services.ChatMessage `json:"messages"`
		ModelConfig *ModelConfigRequest    `json:"model_config,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Load agent configs
	agentCfg, err := models.GetAgentConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "加载Agent配置失败"})
		return
	}

	// Build AI config - prefer frontend model_config, fallback to database
	var aiCfg *models.AIConfig
	if req.ModelConfig != nil && req.ModelConfig.APIKey != "" {
		aiCfg = &models.AIConfig{
			APIBase:      req.ModelConfig.APIBase,
			APIKey:       req.ModelConfig.APIKey,
			Model:        req.ModelConfig.Model,
			SystemPrompt: req.ModelConfig.SystemPrompt,
			// Model parameters
			Temperature:      req.ModelConfig.Temperature,
			MaxTokens:        req.ModelConfig.MaxTokens,
			TopP:             req.ModelConfig.TopP,
			FrequencyPenalty: req.ModelConfig.FrequencyPenalty,
			PresencePenalty:  req.ModelConfig.PresencePenalty,
		}
	} else {
		aiCfg, err = models.GetAIConfig("")
		if err != nil || aiCfg.APIKey == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请先配置AI模型"})
			return
		}
	}

	// Load custom dangerous patterns
	if agentCfg.DangerousCommandsCustom != "" {
		customPatterns := tools.ParseCustomPatterns(agentCfg.DangerousCommandsCustom)
		tools.GlobalSafetyChecker.SetCustomPatterns(customPatterns)
	}

	// Create or get session
	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = generateID()
		title := "新对话"
		if len(req.Messages) > 0 {
			content := req.Messages[len(req.Messages)-1].Content
			if len(content) > 30 {
				content = content[:30]
			}
			title = content
		}
		models.CreateAgentSession(sessionID, req.ConnID, title)
	}

	// Save user message
	if len(req.Messages) > 0 {
		lastMsg := req.Messages[len(req.Messages)-1]
		if lastMsg.Role == "user" {
			models.SaveAgentMessage(sessionID, "user", lastMsg.Content, "", "")
		}
	}

	// Create agent engine
	engine := services.NewAgentEngine(agentCfg, aiCfg)

	// SSE headers
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "SSE not supported"})
		return
	}

	// Channel for agent steps
	stepChan := make(chan services.AgentStep, 100)
	ctx := c.Request.Context()

	// Run agent in goroutine
	go func() {
		defer close(stepChan)
		finalContent, err := engine.Run(ctx, sessionID, req.ConnID, req.Messages, stepChan)
		if err != nil {
			stepChan <- services.AgentStep{Type: "error", Data: map[string]interface{}{
				"message": err.Error(),
			}}
		}
		_ = finalContent
	}()

	// Stream steps to client
	for step := range stepChan {
		// Handle confirmation steps specially (they need to be handled by the confirm endpoint)
		if step.Type == "confirm_required" {
			data := step.Data.(map[string]interface{})
			confirmChan, _ := data["confirmChan"].(chan bool)

			// Store the confirm channel for this tool call
			toolCallID := data["toolCallId"].(string)
			storeConfirmChannel(sessionID, toolCallID, confirmChan)

			// Send to client
			sendSSE(c.Writer, flusher, step.Type, map[string]interface{}{
				"toolCallId": toolCallID,
				"toolName":   data["toolName"],
				"command":    data["command"],
				"reason":     data["reason"],
				"level":      data["level"],
			})
			continue
		}

		// Send other steps
		sendSSE(c.Writer, flusher, step.Type, step.Data)
	}

	// Update session timestamp
	models.UpdateSessionTimestamp(sessionID)

	// Send done
	sendSSE(c.Writer, flusher, "done", map[string]interface{}{
		"sessionId": sessionID,
	})
	fmt.Fprint(c.Writer, "data: [DONE]\n\n")
	flusher.Flush()
}

func sendSSE(w http.ResponseWriter, flusher http.Flusher, eventType string, data interface{}) {
	jsonData, _ := json.Marshal(map[string]interface{}{
		"type": eventType,
		"data": data,
	})
	fmt.Fprintf(w, "data: %s\n\n", jsonData)
	flusher.Flush()
}

// ConfirmChannelStore stores pending confirmation channels
var confirmChannels = make(map[string]chan bool)

func storeConfirmChannel(sessionID, toolCallID string, ch chan bool) {
	key := sessionID + ":" + toolCallID
	confirmChannels[key] = ch
}

// AgentConfirm handles command confirmation
func AgentConfirm(c *gin.Context) {
	var req struct {
		SessionID  string `json:"session_id"`
		ToolCallID string `json:"tool_call_id"`
		Confirmed  bool   `json:"confirmed"`
		Command    string `json:"command,omitempty"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	key := req.SessionID + ":" + req.ToolCallID
	if ch, ok := confirmChannels[key]; ok {
		ch <- req.Confirmed
		delete(confirmChannels, key)
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	} else {
		c.JSON(http.StatusNotFound, gin.H{"error": "确认请求不存在或已处理"})
	}
}

// AgentCancel handles agent execution cancellation
func AgentCancel(c *gin.Context) {
	var req struct {
		SessionID string `json:"session_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Cancel all pending confirmations for this session
	for key, ch := range confirmChannels {
		if len(key) > len(req.SessionID) && key[:len(req.SessionID)] == req.SessionID {
			ch <- false
			delete(confirmChannels, key)
		}
	}

	c.JSON(http.StatusOK, gin.H{"status": "cancelled"})
}

// GetAgentConfig returns the current agent configuration
func GetAgentConfig(c *gin.Context) {
	cfg, err := models.GetAgentConfig()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cfg)
}

// UpdateAgentConfig updates the agent configuration
func UpdateAgentConfig(c *gin.Context) {
	var cfg models.AgentConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := models.SaveAgentConfig(&cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Update safety checker with custom patterns
	if cfg.DangerousCommandsCustom != "" {
		customPatterns := tools.ParseCustomPatterns(cfg.DangerousCommandsCustom)
		tools.GlobalSafetyChecker.SetCustomPatterns(customPatterns)
	}

	c.JSON(http.StatusOK, cfg)
}

// GetAgentSessions returns all agent sessions
func GetAgentSessions(c *gin.Context) {
	sessions, err := models.GetAgentSessions()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, sessions)
}

// GetAgentSession returns a single agent session
func GetAgentSession(c *gin.Context) {
	id := c.Param("id")
	session, err := models.GetAgentSession(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "会话不存在"})
		return
	}
	c.JSON(http.StatusOK, session)
}

// GetAgentMessages returns messages for a session
func GetAgentMessages(c *gin.Context) {
	id := c.Param("id")
	messages, err := models.GetAgentMessages(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, messages)
}

// DeleteAgentSession deletes an agent session
func DeleteAgentSession(c *gin.Context) {
	id := c.Param("id")
	if err := models.DeleteAgentSession(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// MCP Server handlers

// GetMCPServers returns all MCP servers
func GetMCPServers(c *gin.Context) {
	servers, err := models.GetMCPServers()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, servers)
}

// CreateMCPServer creates a new MCP server
func CreateMCPServer(c *gin.Context) {
	var server models.MCPServerDB
	if err := c.ShouldBindJSON(&server); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := models.CreateMCPServer(&server); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, server)
}

// DeleteMCPServer deletes an MCP server
func DeleteMCPServer(c *gin.Context) {
	id := c.Param("id")
	if err := models.DeleteMCPServer(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// Skills handlers

// GetSkills returns all skills
func GetSkills(c *gin.Context) {
	skills, err := models.GetSkills()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, skills)
}

// InstallSkill installs a skill
func InstallSkill(c *gin.Context) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Version     string `json:"version"`
		Source      string `json:"source"`
		Path        string `json:"path"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	skill := models.SkillDB{
		Name:        req.Name,
		Description: req.Description,
		Version:     req.Version,
		Source:      req.Source,
		Path:        req.Path,
		Enabled:     true,
	}
	if err := models.CreateSkill(&skill); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, skill)
}

// DeleteSkill uninstalls a skill
func DeleteSkill(c *gin.Context) {
	name := c.Param("name")
	if err := services.UninstallSkill(name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "deleted"})
}

// ToggleSkill enables/disables a skill
func ToggleSkill(c *gin.Context) {
	name := c.Param("name")
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := models.ToggleSkill(name, req.Enabled); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// UpdateSkill updates an installed skill
func UpdateSkill(c *gin.Context) {
	name := c.Param("name")
	if err := services.UpdateSkill(name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "updated"})
}

// GetSkillMarket lists skills from a market source
func GetSkillMarket(c *gin.Context) {
	source := c.DefaultQuery("source", "clawhub")
	query := c.DefaultQuery("q", "")
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", "20"))

	result, err := services.ListMarketSkills(source, query, page, pageSize)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, result)
}

// GetSkillMarketDetail gets skill detail from market
func GetSkillMarketDetail(c *gin.Context) {
	source := c.Param("source")
	slug := c.Param("slug")

	detail, err := services.GetSkillDetail(source, slug)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}

	installed, _ := models.IsSkillInstalled(slug)
	item := services.MarketItemFromDetail(detail, installed, false)
	c.JSON(http.StatusOK, item)
}

// InstallSkillFromMarket installs a skill from market
func InstallSkillFromMarket(c *gin.Context) {
	var req struct {
		Source string `json:"source" binding:"required"`
		Slug   string `json:"slug" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := services.InstallSkill(req.Source, req.Slug); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "installed"})
}

// ImportSkill imports a skill from a ZIP file or folder
func ImportSkill(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请选择文件"})
		return
	}
	defer file.Close()

	// Save to temp file
	tmpDir := os.TempDir()
	tmpFile := filepath.Join(tmpDir, header.Filename)
	dst, err := os.Create(tmpFile)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存临时文件失败"})
		return
	}
	defer os.Remove(tmpFile)
	defer dst.Close()

	io.Copy(dst, file)

	// Import based on file type
	if strings.HasSuffix(strings.ToLower(header.Filename), ".zip") {
		if err := services.ImportSkillFromZIP(tmpFile); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	} else {
		// Assume it's a folder path or try to import as folder
		c.JSON(http.StatusBadRequest, gin.H{"error": "请上传ZIP文件"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "imported"})
}

// GetInstalledSkillsWithMarketInfo returns installed skills with market info
func GetInstalledSkillsWithMarketInfo(c *gin.Context) {
	skills, err := services.GetInstalledSkillsWithMarketInfo()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, skills)
}

// AgentTerminalWS handles WebSocket for agent terminal output
func AgentTerminalWS(c *gin.Context) {
	sessionID := c.Param("sessionId")
	log.Printf("[AgentTerminalWS] WebSocket connected for session: %s", sessionID)

	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade failed: %v", err)
		return
	}

	// Register this WebSocket as the terminal output for the session
	// This will close any existing WebSocket for this session
	registerAgentTerminalWS(sessionID, ws)

	// Register broadcaster with services package so commands can send output here
	services.RegisterAgentTerminalBroadcaster(sessionID, func(sid string, data string) {
		msg := map[string]interface{}{
			"type": "agent_output",
			"data": data,
		}
		jsonData, _ := json.Marshal(msg)
		agentTerminalMu.RLock()
		wsConn, ok := agentTerminalWSMap[sid]
		agentTerminalMu.RUnlock()
		if ok {
			wsConn.WriteMessage(websocket.TextMessage, jsonData)
		}
	})

	// Keep connection alive and handle messages
	for {
		_, _, err := ws.ReadMessage()
		if err != nil {
			break
		}
	}

	// Only unregister if this is still the current WebSocket for this session
	agentTerminalMu.Lock()
	currentWS, exists := agentTerminalWSMap[sessionID]
	if exists && currentWS == ws {
		delete(agentTerminalWSMap, sessionID)
		services.UnregisterAgentTerminalBroadcaster(sessionID)
		log.Printf("[AgentTerminalWS] Cleaned up session: %s", sessionID)
	}
	agentTerminalMu.Unlock()

	ws.Close()
}

// Agent terminal WebSocket registry
var (
	agentTerminalWSMap = make(map[string]*websocket.Conn)
	agentTerminalMu    sync.RWMutex
)

func registerAgentTerminalWS(sessionID string, ws *websocket.Conn) {
	agentTerminalMu.Lock()
	defer agentTerminalMu.Unlock()
	if existing, ok := agentTerminalWSMap[sessionID]; ok {
		existing.Close()
	}
	agentTerminalWSMap[sessionID] = ws
}

func unregisterAgentTerminalWS(sessionID string) {
	agentTerminalMu.Lock()
	defer agentTerminalMu.Unlock()
	delete(agentTerminalWSMap, sessionID)
}

// BroadcastToAgentTerminal sends data to the agent terminal WebSocket
func BroadcastToAgentTerminal(sessionID string, data string) {
	agentTerminalMu.RLock()
	ws, ok := agentTerminalWSMap[sessionID]
	agentTerminalMu.RUnlock()

	if ok {
		msg := map[string]interface{}{
			"type": "agent_output",
			"data": data,
		}
		jsonData, _ := json.Marshal(msg)
		ws.WriteMessage(websocket.TextMessage, jsonData)
	}
}

func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}
