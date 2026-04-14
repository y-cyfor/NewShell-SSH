package database

import (
	"database/sql"
	"log"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

func Init(dbPath string) error {
	var err error
	DB, err = sql.Open("sqlite", dbPath)
	if err != nil {
		return err
	}

	DB.SetMaxOpenConns(1)
	return migrate()
}

func migrate() error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			username TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS connections (
			id TEXT PRIMARY KEY,
			user_id TEXT,
			name TEXT NOT NULL,
			host TEXT NOT NULL,
			port INTEGER DEFAULT 22,
			username TEXT NOT NULL,
			auth_type TEXT NOT NULL DEFAULT 'password',
			password_enc TEXT,
			private_key TEXT,
			passphrase TEXT,
			group_name TEXT DEFAULT '默认分组',
			remark TEXT,
			color TEXT DEFAULT '#3b82f6',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			sync_version INTEGER DEFAULT 0,
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,
		`CREATE TABLE IF NOT EXISTS sync_meta (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS ai_config (
			id TEXT PRIMARY KEY,
			user_id TEXT,
			api_base TEXT DEFAULT 'https://api.openai.com/v1',
			api_key TEXT,
			model TEXT DEFAULT 'gpt-4o',
			system_prompt TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_connections_user_id ON connections(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_connections_group ON connections(group_name)`,
		// Agent tables
		`CREATE TABLE IF NOT EXISTS agent_config (
			id INTEGER PRIMARY KEY DEFAULT 1,
			max_iterations INTEGER DEFAULT 10,
			default_timeout INTEGER DEFAULT 60,
			smart_timeout BOOLEAN DEFAULT 1,
			confirm_mode TEXT DEFAULT 'dangerous',
			dangerous_commands TEXT DEFAULT '["rm -rf","shutdown","reboot","mkfs","dd"]',
			dangerous_commands_custom TEXT DEFAULT '[]',
			history_mode TEXT DEFAULT 'persistent',
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS agent_sessions (
			id TEXT PRIMARY KEY,
			conn_id TEXT,
			title TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (conn_id) REFERENCES connections(id) ON DELETE SET NULL
		)`,
		`CREATE TABLE IF NOT EXISTS agent_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT NOT NULL,
			role TEXT NOT NULL,
			content TEXT,
			tool_calls TEXT,
			tool_call_id TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (session_id) REFERENCES agent_sessions(id) ON DELETE CASCADE
		)`,
		`CREATE INDEX IF NOT EXISTS idx_agent_messages_session ON agent_messages(session_id)`,
		`CREATE TABLE IF NOT EXISTS mcp_servers (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			transport TEXT NOT NULL,
			command TEXT,
			args TEXT,
			url TEXT,
			enabled BOOLEAN DEFAULT 1,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS skills (
			name TEXT PRIMARY KEY,
			slug TEXT,
			description TEXT,
			version TEXT,
			source TEXT DEFAULT 'local',
			path TEXT,
			local_path TEXT,
			content TEXT,
			icon TEXT,
			author TEXT,
			downloads INTEGER DEFAULT 0,
			tags TEXT DEFAULT '[]',
			enabled BOOLEAN DEFAULT 1,
			installed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		// Market cache
		`CREATE TABLE IF NOT EXISTS skill_market_cache (
			source TEXT,
			slug TEXT,
			data TEXT,
			cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			PRIMARY KEY (source, slug)
		)`,
	}

	for _, m := range migrations {
		if _, err := DB.Exec(m); err != nil {
			log.Printf("Migration error: %v\nSQL: %s", err, m)
			return err
		}
	}

	// Add new columns to skills table if they don't exist
	alterSQLs := []string{
		`ALTER TABLE skills ADD COLUMN slug TEXT`,
		`ALTER TABLE skills ADD COLUMN local_path TEXT`,
		`ALTER TABLE skills ADD COLUMN content TEXT`,
		`ALTER TABLE skills ADD COLUMN icon TEXT`,
		`ALTER TABLE skills ADD COLUMN author TEXT`,
		`ALTER TABLE skills ADD COLUMN downloads INTEGER DEFAULT 0`,
		`ALTER TABLE skills ADD COLUMN tags TEXT DEFAULT '[]'`,
		`ALTER TABLE skills ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`,
	}
	for _, sql := range alterSQLs {
		DB.Exec(sql) // Ignore errors for duplicate columns
	}

	// PERF-9: SQLite WAL mode for better concurrent performance
	DB.Exec("PRAGMA journal_mode=WAL;")
	DB.Exec("PRAGMA synchronous=NORMAL;")
	DB.Exec("PRAGMA cache_size=-2000;")
	DB.Exec("PRAGMA temp_store=MEMORY;")
	DB.SetMaxOpenConns(4)
	DB.SetMaxIdleConns(4)

	return nil
}
