package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"newshell-server/config"
	"newshell-server/crypto_util"
	"newshell-server/database"
	"newshell-server/handlers"
	"newshell-server/models"
	"newshell-server/services"
	"newshell-server/tools"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	cfg := config.Load()

	addr := fmt.Sprintf(":%d", cfg.Port)
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		log.Printf("Port %d is already in use, trying port %d...", cfg.Port, cfg.Port+1)
		cfg.Port = cfg.Port + 1
		addr = fmt.Sprintf(":%d", cfg.Port)
		ln, err = net.Listen("tcp", addr)
		if err != nil {
			log.Fatalf("Port %d is also in use: %v", cfg.Port, err)
		}
		log.Printf("Successfully bound to port %d", cfg.Port)
	}
	ln.Close()

	if err := database.Init(cfg.DBPath); err != nil {
		log.Fatalf("Failed to init database: %v", err)
	}

	handlers.SetJWTSecret(cfg.JWTSecret)
	handlers.SetEncryptionKey(cfg.EncryptionKey)
	services.SetEncryptionKey(cfg.EncryptionKey)
	models.SetAIEncryptionKey(crypto_util.DeriveKey(cfg.EncryptionKey))

	// Initialize Agent subsystem
	services.InitSSHExecutor()
	tools.InitBuiltinTools()

	gin.SetMode(gin.ReleaseMode)
	r := gin.Default()

	r.Use(cors.New(cors.Config{
		AllowAllOrigins:  true,
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok", "version": "0.2.0"})
	})

	api := r.Group("/api")
	{
		// Auth with rate limiting
		auth := api.Group("/auth")
		auth.Use(handlers.RateLimitMiddleware())
		auth.POST("/login", handlers.Login)
		auth.POST("/register", handlers.Register)
	}

	core := api.Group("")
	core.Use(handlers.OptionalAuthMiddleware())
	{
		core.GET("/connections", handlers.GetConnections)
		core.POST("/connections", handlers.CreateConnection)
		core.PUT("/connections/:id", handlers.UpdateConnection)
		core.DELETE("/connections/:id", handlers.DeleteConnection)

		core.GET("/files/:id/list", handlers.ListFiles)
		core.GET("/files/:id/download", handlers.DownloadFile)
		core.POST("/files/:id/upload", handlers.UploadFile)
		core.POST("/files/:id/mkdir", handlers.CreateDir)
		core.POST("/files/:id/delete", handlers.DeleteFile)
		core.POST("/files/:id/rename", handlers.RenameFile)

		core.GET("/sysinfo/:id", handlers.GetSysInfo)
		core.GET("/sysinfo/:id/extended", handlers.GetExtendedSysInfo)
		core.GET("/connections/:id/config", handlers.GetServerConfig)

		core.POST("/ai/chat-proxy", handlers.ChatProxy)
		core.POST("/ai/chat", handlers.Chat)
		core.GET("/ai/config", handlers.GetAIConfig)
		core.PUT("/ai/config", handlers.SaveAIConfig)

		// Agent endpoints
		core.POST("/agent/chat", handlers.AgentChat)
		core.POST("/agent/confirm", handlers.AgentConfirm)
		core.POST("/agent/cancel", handlers.AgentCancel)
		core.GET("/agent/config", handlers.GetAgentConfig)
		core.PUT("/agent/config", handlers.UpdateAgentConfig)
		core.GET("/agent/sessions", handlers.GetAgentSessions)
		core.GET("/agent/sessions/:id", handlers.GetAgentSession)
		core.GET("/agent/sessions/:id/messages", handlers.GetAgentMessages)
		core.DELETE("/agent/sessions/:id", handlers.DeleteAgentSession)

		// MCP endpoints
		core.GET("/agent/mcp/servers", handlers.GetMCPServers)
		core.POST("/agent/mcp/servers", handlers.CreateMCPServer)
		core.DELETE("/agent/mcp/servers/:id", handlers.DeleteMCPServer)

		// Skills endpoints
		core.GET("/agent/skills", handlers.GetSkills)
		core.GET("/agent/skills/installed", handlers.GetInstalledSkillsWithMarketInfo)
		core.DELETE("/agent/skills/:name", handlers.DeleteSkill)
		core.PUT("/agent/skills/:name/toggle", handlers.ToggleSkill)
		core.PUT("/agent/skills/:name/update", handlers.UpdateSkill)

		// Skill import
		core.POST("/agent/skills/import", handlers.ImportSkill)
	}

	sync := api.Group("")
	sync.Use(handlers.AuthMiddleware())
	{
		sync.POST("/sync/pull", handlers.PullSync)
		sync.POST("/sync/push", handlers.PushSync)
	}

	r.GET("/ws/terminal/:id", handlers.TerminalWS)
	r.GET("/ws/agent-terminal/:sessionId", handlers.AgentTerminalWS)
	r.GET("/ws/sysinfo/:id", handlers.SysInfoWS)

	log.Printf("NewShell server starting on %s", addr)
	srv := &http.Server{
		Addr:    addr,
		Handler: r,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down server...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Fatal("Server forced to shutdown: ", err)
	}
	log.Println("Server exited")
}
