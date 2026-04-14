package models

import (
	"log"

	"newshell-server/crypto_util"
	"newshell-server/database"
)

var aiEncKey []byte

func SetAIEncryptionKey(key []byte) {
	aiEncKey = key
}

type AIConfig struct {
	ID               string  `json:"id"`
	UserID           string  `json:"user_id"`
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

var defaultSystemPrompt = `你是一位资深 Linux/Unix 运维专家，精通以下领域：
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
- 用代码块格式化命令，方便复制`

func GetAIConfig(userID string) (*AIConfig, error) {
	var cfg AIConfig
	var uid interface{}
	err := database.DB.QueryRow(
		`SELECT id, COALESCE(user_id,''), COALESCE(api_base,'https://api.openai.com/v1'),
		COALESCE(api_key,''), COALESCE(model,'gpt-4o'), COALESCE(system_prompt,'')
		FROM ai_config WHERE user_id IS NULL OR user_id = ? LIMIT 1`,
		userID).Scan(&cfg.ID, &uid, &cfg.APIBase, &cfg.APIKey, &cfg.Model, &cfg.SystemPrompt)
	if err != nil {
		return &AIConfig{
			APIBase:          "https://api.openai.com/v1",
			Model:            "gpt-4o",
			SystemPrompt:     defaultSystemPrompt,
			Temperature:      0.7,
			MaxTokens:        4096,
			TopP:             1.0,
			FrequencyPenalty: 0,
			PresencePenalty:  0,
		}, nil
	}
	if uid != nil {
		cfg.UserID = uid.(string)
	}
	if cfg.SystemPrompt == "" {
		cfg.SystemPrompt = defaultSystemPrompt
	}
	// SEC-11: Decrypt AI API key
	if aiEncKey != nil && cfg.APIKey != "" {
		decrypted, err := crypto_util.Decrypt(cfg.APIKey, aiEncKey)
		if err != nil {
			log.Printf("Warning: failed to decrypt AI API key: %v", err)
		} else {
			cfg.APIKey = decrypted
		}
	}
	return &cfg, nil
}

func SaveAIConfig(cfg *AIConfig) error {
	if cfg.ID == "" {
		cfg.ID = generateID()
	}
	if cfg.SystemPrompt == "" {
		cfg.SystemPrompt = defaultSystemPrompt
	}

	var userID interface{}
	if cfg.UserID != "" {
		userID = cfg.UserID
	}

	// SEC-11: Encrypt AI API key before saving
	apiKey := cfg.APIKey
	if aiEncKey != nil && apiKey != "" {
		encrypted, err := crypto_util.Encrypt(apiKey, aiEncKey)
		if err != nil {
			log.Printf("Warning: failed to encrypt AI API key: %v", err)
		} else {
			apiKey = encrypted
		}
	}

	_, err := database.DB.Exec(
		`INSERT INTO ai_config (id, user_id, api_base, api_key, model, system_prompt)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET api_base=?, api_key=?, model=?, system_prompt=?`,
		cfg.ID, userID, cfg.APIBase, apiKey, cfg.Model, cfg.SystemPrompt,
		cfg.APIBase, apiKey, cfg.Model, cfg.SystemPrompt)
	return err
}
