package handlers

import (
	"net/http"

	"newshell-server/models"
	"newshell-server/services"

	"github.com/gin-gonic/gin"
)

func Chat(c *gin.Context) {
	var req services.ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("userID")

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")

	if err := services.StreamChat(userID, req.Messages, c.Writer); err != nil {
		c.SSEvent("error", err.Error())
		return
	}
}

// ChatProxy accepts API config from frontend and proxies the LLM request
func ChatProxy(c *gin.Context) {
	var req struct {
		APIBase      string                 `json:"api_base"`
		APIKey       string                 `json:"api_key"`
		Model        string                 `json:"model"`
		SystemPrompt string                 `json:"system_prompt"`
		Messages     []services.ChatMessage `json:"messages"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	cfg := &models.AIConfig{
		APIBase:      req.APIBase,
		APIKey:       req.APIKey,
		Model:        req.Model,
		SystemPrompt: req.SystemPrompt,
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")

	if err := services.StreamChatWithConfig(cfg, req.Messages, c.Writer); err != nil {
		c.SSEvent("error", err.Error())
		return
	}
}

func GetAIConfig(c *gin.Context) {
	userID := c.GetString("userID")
	cfg, err := models.GetAIConfig(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cfg.APIKey != "" && len(cfg.APIKey) > 8 {
		cfg.APIKey = cfg.APIKey[:4] + "****" + cfg.APIKey[len(cfg.APIKey)-4:]
	}
	c.JSON(http.StatusOK, cfg)
}

func SaveAIConfig(c *gin.Context) {
	var cfg models.AIConfig
	if err := c.ShouldBindJSON(&cfg); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	cfg.UserID = c.GetString("userID")

	if err := models.SaveAIConfig(&cfg); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, cfg)
}
