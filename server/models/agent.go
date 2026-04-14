package models

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"newshell-server/database"
)

// AgentConfig holds Agent configuration
type AgentConfig struct {
	ID                      int    `json:"id"`
	MaxIterations           int    `json:"max_iterations"`
	DefaultTimeout          int    `json:"default_timeout"`
	SmartTimeout            bool   `json:"smart_timeout"`
	ConfirmMode             string `json:"confirm_mode"`
	DangerousCommands       string `json:"dangerous_commands"`
	DangerousCommandsCustom string `json:"dangerous_commands_custom"`
	HistoryMode             string `json:"history_mode"`
	CreatedAt               string `json:"created_at"`
	UpdatedAt               string `json:"updated_at"`
}

// AgentSession represents an Agent conversation session
type AgentSession struct {
	ID        string `json:"id"`
	ConnID    string `json:"conn_id"`
	Title     string `json:"title"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// AgentMessageDB is the database representation of a message
type AgentMessageDB struct {
	ID         int    `json:"id"`
	SessionID  string `json:"session_id"`
	Role       string `json:"role"`
	Content    string `json:"content"`
	ToolCalls  string `json:"tool_calls,omitempty"`
	ToolCallID string `json:"tool_call_id,omitempty"`
	CreatedAt  string `json:"created_at"`
}

// MCPServerDB is the database representation of an MCP server
type MCPServerDB struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Transport string `json:"transport"`
	Command   string `json:"command"`
	Args      string `json:"args"`
	URL       string `json:"url"`
	Enabled   bool   `json:"enabled"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// SkillDB is the database representation of a skill
type SkillDB struct {
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description"`
	Version     string `json:"version"`
	Source      string `json:"source"` // local|skillhub|clawhub
	Path        string `json:"path"`
	LocalPath   string `json:"local_path"`
	Content     string `json:"content"`
	Icon        string `json:"icon"`
	Author      string `json:"author"`
	Downloads   int    `json:"downloads"`
	Tags        string `json:"tags"` // JSON array
	Enabled     bool   `json:"enabled"`
	InstalledAt string `json:"installed_at"`
	UpdatedAt   string `json:"updated_at"`
}

// SkillMarketItem represents a skill from the market
type SkillMarketItem struct {
	Source      string   `json:"source"`
	Slug        string   `json:"slug"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Version     string   `json:"version"`
	Author      string   `json:"author"`
	Downloads   int      `json:"downloads"`
	Tags        []string `json:"tags"`
	Icon        string   `json:"icon"`
	Installed   bool     `json:"installed"`
	IsUpdate    bool     `json:"is_update"`
}

// SkillDetail represents full skill info from market
type SkillDetail struct {
	Source      string   `json:"source"`
	Slug        string   `json:"slug"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Version     string   `json:"version"`
	Author      string   `json:"author"`
	Downloads   int      `json:"downloads"`
	Tags        []string `json:"tags"`
	Icon        string   `json:"icon"`
	Readme      string   `json:"readme"`
	Content     string   `json:"content"` // SKILL.md content
}

// Agent Config CRUD

func GetAgentConfig() (*AgentConfig, error) {
	var cfg AgentConfig
	err := database.DB.QueryRow(
		`SELECT id, max_iterations, default_timeout, smart_timeout, confirm_mode,
		COALESCE(dangerous_commands,''), COALESCE(dangerous_commands_custom,''),
		COALESCE(history_mode,'persistent'), created_at, updated_at
		FROM agent_config LIMIT 1`,
	).Scan(&cfg.ID, &cfg.MaxIterations, &cfg.DefaultTimeout, &cfg.SmartTimeout,
		&cfg.ConfirmMode, &cfg.DangerousCommands, &cfg.DangerousCommandsCustom,
		&cfg.HistoryMode, &cfg.CreatedAt, &cfg.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return &AgentConfig{
				MaxIterations:           10,
				DefaultTimeout:          60,
				SmartTimeout:            true,
				ConfirmMode:             "dangerous",
				DangerousCommands:       `["rm -rf","shutdown","reboot","mkfs","dd"]`,
				DangerousCommandsCustom: `[]`,
				HistoryMode:             "persistent",
			}, nil
		}
		return nil, err
	}
	return &cfg, nil
}

func SaveAgentConfig(cfg *AgentConfig) error {
	now := time.Now().Format(time.RFC3339)
	cfg.UpdatedAt = now
	_, err := database.DB.Exec(
		`INSERT INTO agent_config (id, max_iterations, default_timeout, smart_timeout,
		confirm_mode, dangerous_commands, dangerous_commands_custom, history_mode, created_at, updated_at)
		VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
		max_iterations=?, default_timeout=?, smart_timeout=?, confirm_mode=?,
		dangerous_commands=?, dangerous_commands_custom=?, history_mode=?, updated_at=?`,
		cfg.MaxIterations, cfg.DefaultTimeout, cfg.SmartTimeout, cfg.ConfirmMode,
		cfg.DangerousCommands, cfg.DangerousCommandsCustom, cfg.HistoryMode, now, now,
		cfg.MaxIterations, cfg.DefaultTimeout, cfg.SmartTimeout, cfg.ConfirmMode,
		cfg.DangerousCommands, cfg.DangerousCommandsCustom, cfg.HistoryMode, now)
	return err
}

// Agent Session CRUD

func CreateAgentSession(id, connID, title string) error {
	now := time.Now().Format(time.RFC3339)
	_, err := database.DB.Exec(
		`INSERT INTO agent_sessions (id, conn_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		id, connID, title, now, now)
	return err
}

func GetAgentSessions() ([]AgentSession, error) {
	rows, err := database.DB.Query(
		`SELECT id, COALESCE(conn_id,''), COALESCE(title,''), created_at, updated_at
		FROM agent_sessions ORDER BY updated_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var sessions []AgentSession
	for rows.Next() {
		var s AgentSession
		if err := rows.Scan(&s.ID, &s.ConnID, &s.Title, &s.CreatedAt, &s.UpdatedAt); err != nil {
			continue
		}
		sessions = append(sessions, s)
	}
	return sessions, nil
}

func GetAgentSession(id string) (*AgentSession, error) {
	var s AgentSession
	err := database.DB.QueryRow(
		`SELECT id, COALESCE(conn_id,''), COALESCE(title,''), created_at, updated_at
		FROM agent_sessions WHERE id = ?`, id,
	).Scan(&s.ID, &s.ConnID, &s.Title, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func DeleteAgentSession(id string) error {
	database.DB.Exec(`DELETE FROM agent_messages WHERE session_id = ?`, id)
	_, err := database.DB.Exec(`DELETE FROM agent_sessions WHERE id = ?`, id)
	return err
}

func UpdateAgentSessionTitle(id, title string) error {
	_, err := database.DB.Exec(
		`UPDATE agent_sessions SET title=?, updated_at=? WHERE id=?`,
		title, time.Now().Format(time.RFC3339), id)
	return err
}

func SaveAgentMessage(sessionID, role, content, toolCalls, toolCallID string) error {
	_, err := database.DB.Exec(
		`INSERT INTO agent_messages (session_id, role, content, tool_calls, tool_call_id) VALUES (?, ?, ?, ?, ?)`,
		sessionID, role, content, toolCalls, toolCallID)
	return err
}

func GetAgentMessages(sessionID string) ([]AgentMessageDB, error) {
	rows, err := database.DB.Query(
		`SELECT id, session_id, role, COALESCE(content,''), COALESCE(tool_calls,''),
		COALESCE(tool_call_id,''), created_at
		FROM agent_messages WHERE session_id = ? ORDER BY created_at ASC`, sessionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var messages []AgentMessageDB
	for rows.Next() {
		var m AgentMessageDB
		if err := rows.Scan(&m.ID, &m.SessionID, &m.Role, &m.Content,
			&m.ToolCalls, &m.ToolCallID, &m.CreatedAt); err != nil {
			continue
		}
		messages = append(messages, m)
	}
	return messages, nil
}

func UpdateSessionTimestamp(sessionID string) error {
	_, err := database.DB.Exec(
		`UPDATE agent_sessions SET updated_at=? WHERE id=?`,
		time.Now().Format(time.RFC3339), sessionID)
	return err
}

// MCP Server CRUD

func CreateMCPServer(s *MCPServerDB) error {
	if s.ID == "" {
		s.ID = generateID()
	}
	now := time.Now().Format(time.RFC3339)
	s.CreatedAt = now
	s.UpdatedAt = now
	_, err := database.DB.Exec(
		`INSERT INTO mcp_servers (id, name, transport, command, args, url, enabled, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		s.ID, s.Name, s.Transport, s.Command, s.Args, s.URL, s.Enabled, now, now)
	return err
}

func GetMCPServers() ([]MCPServerDB, error) {
	rows, err := database.DB.Query(
		`SELECT id, name, transport, COALESCE(command,''), COALESCE(args,''),
		COALESCE(url,''), enabled, created_at, updated_at
		FROM mcp_servers ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var servers []MCPServerDB
	for rows.Next() {
		var s MCPServerDB
		if err := rows.Scan(&s.ID, &s.Name, &s.Transport, &s.Command, &s.Args,
			&s.URL, &s.Enabled, &s.CreatedAt, &s.UpdatedAt); err != nil {
			continue
		}
		servers = append(servers, s)
	}
	return servers, nil
}

func DeleteMCPServer(id string) error {
	_, err := database.DB.Exec(`DELETE FROM mcp_servers WHERE id = ?`, id)
	return err
}

func UpdateMCPServer(s *MCPServerDB) error {
	_, err := database.DB.Exec(
		`UPDATE mcp_servers SET name=?, transport=?, command=?, args=?, url=?, enabled=?, updated_at=?
		WHERE id=?`,
		s.Name, s.Transport, s.Command, s.Args, s.URL, s.Enabled,
		time.Now().Format(time.RFC3339), s.ID)
	return err
}

// Skills CRUD

func CreateSkill(s *SkillDB) error {
	now := time.Now().Format(time.RFC3339)
	_, err := database.DB.Exec(
		`INSERT INTO skills (name, slug, description, version, source, path, local_path, content, icon, author, downloads, tags, enabled, installed_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(name) DO UPDATE SET
		slug=excluded.slug, description=excluded.description, version=excluded.version,
		source=excluded.source, path=excluded.path, local_path=excluded.local_path,
		content=excluded.content, icon=excluded.icon, author=excluded.author,
		downloads=excluded.downloads, tags=excluded.tags, updated_at=excluded.updated_at`,
		s.Name, s.Slug, s.Description, s.Version, s.Source, s.Path, s.LocalPath,
		s.Content, s.Icon, s.Author, s.Downloads, s.Tags, s.Enabled, now, now)
	return err
}

func GetSkills() ([]SkillDB, error) {
	rows, err := database.DB.Query(
		`SELECT name, COALESCE(slug,''), COALESCE(description,''), COALESCE(version,''),
		COALESCE(source,'local'), COALESCE(path,''), COALESCE(local_path,''),
		COALESCE(content,''), COALESCE(icon,''), COALESCE(author,''),
		COALESCE(downloads,0), COALESCE(tags,'[]'), enabled, COALESCE(installed_at,''), COALESCE(updated_at,'')
		FROM skills ORDER BY installed_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var skills []SkillDB
	for rows.Next() {
		var s SkillDB
		if err := rows.Scan(&s.Name, &s.Slug, &s.Description, &s.Version, &s.Source,
			&s.Path, &s.LocalPath, &s.Content, &s.Icon, &s.Author, &s.Downloads,
			&s.Tags, &s.Enabled, &s.InstalledAt, &s.UpdatedAt); err != nil {
			continue
		}
		skills = append(skills, s)
	}
	return skills, nil
}

func GetEnabledSkills() ([]SkillDB, error) {
	rows, err := database.DB.Query(
		`SELECT name, COALESCE(slug,''), COALESCE(description,''), COALESCE(version,''),
		COALESCE(source,'local'), COALESCE(path,''), COALESCE(local_path,''),
		COALESCE(content,''), COALESCE(icon,''), COALESCE(author,''),
		COALESCE(downloads,0), COALESCE(tags,'[]'), enabled, COALESCE(installed_at,''), COALESCE(updated_at,'')
		FROM skills WHERE enabled = 1 ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var skills []SkillDB
	for rows.Next() {
		var s SkillDB
		if err := rows.Scan(&s.Name, &s.Slug, &s.Description, &s.Version, &s.Source,
			&s.Path, &s.LocalPath, &s.Content, &s.Icon, &s.Author, &s.Downloads,
			&s.Tags, &s.Enabled, &s.InstalledAt, &s.UpdatedAt); err != nil {
			continue
		}
		skills = append(skills, s)
	}
	return skills, nil
}

func GetSkill(name string) (*SkillDB, error) {
	var s SkillDB
	err := database.DB.QueryRow(
		`SELECT name, COALESCE(slug,''), COALESCE(description,''), COALESCE(version,''),
		COALESCE(source,'local'), COALESCE(path,''), COALESCE(local_path,''),
		COALESCE(content,''), COALESCE(icon,''), COALESCE(author,''),
		COALESCE(downloads,0), COALESCE(tags,'[]'), enabled, COALESCE(installed_at,''), COALESCE(updated_at,'')
		FROM skills WHERE name = ?`, name,
	).Scan(&s.Name, &s.Slug, &s.Description, &s.Version, &s.Source,
		&s.Path, &s.LocalPath, &s.Content, &s.Icon, &s.Author, &s.Downloads,
		&s.Tags, &s.Enabled, &s.InstalledAt, &s.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func DeleteSkill(name string) error {
	_, err := database.DB.Exec(`DELETE FROM skills WHERE name = ?`, name)
	return err
}

func ToggleSkill(name string, enabled bool) error {
	_, err := database.DB.Exec(`UPDATE skills SET enabled = ?, updated_at = ? WHERE name = ?`,
		enabled, time.Now().Format(time.RFC3339), name)
	return err
}

func UpdateSkill(name string, updates map[string]interface{}) error {
	if len(updates) == 0 {
		return nil
	}
	updates["updated_at"] = time.Now().Format(time.RFC3339)
	setClauses := []string{}
	args := []interface{}{}
	for k, v := range updates {
		setClauses = append(setClauses, fmt.Sprintf("%s = ?", k))
		args = append(args, v)
	}
	args = append(args, name)
	query := fmt.Sprintf("UPDATE skills SET %s WHERE name = ?", joinStr(setClauses, ", "))
	_, err := database.DB.Exec(query, args...)
	return err
}

// Market cache

func SetMarketCache(source, slug string, data string) error {
	_, err := database.DB.Exec(
		`INSERT INTO skill_market_cache (source, slug, data, cached_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(source, slug) DO UPDATE SET data = excluded.data, cached_at = excluded.cached_at`,
		source, slug, data, time.Now().Format(time.RFC3339))
	return err
}

func GetMarketCache(source, slug string) (string, error) {
	var data string
	err := database.DB.QueryRow(
		`SELECT data FROM skill_market_cache WHERE source = ? AND slug = ?`,
		source, slug).Scan(&data)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return data, err
}

func ClearMarketCache(source string) error {
	_, err := database.DB.Exec(`DELETE FROM skill_market_cache WHERE source = ?`, source)
	return err
}

// Helper

func IsSkillInstalled(slug string) (bool, string) {
	var name string
	err := database.DB.QueryRow(`SELECT name FROM skills WHERE slug = ?`, slug).Scan(&name)
	if err != nil {
		return false, ""
	}
	return true, name
}

func joinStr(strs []string, sep string) string {
	result := ""
	for i, s := range strs {
		if i > 0 {
			result += sep
		}
		result += s
	}
	return result
}

func ParseTags(tagsJSON string) []string {
	var tags []string
	if err := json.Unmarshal([]byte(tagsJSON), &tags); err != nil {
		return nil
	}
	return tags
}
