package models

import (
	"crypto/rand"
	"encoding/hex"
	"time"

	"newshell-server/database"
)

type Connection struct {
	ID          string `json:"id"`
	UserID      string `json:"user_id"`
	Name        string `json:"name"`
	Host        string `json:"host"`
	Port        int    `json:"port"`
	Username    string `json:"username"`
	AuthType    string `json:"auth_type"`
	Password    string `json:"password,omitempty"`
	PrivateKey  string `json:"private_key,omitempty"`
	Passphrase  string `json:"passphrase,omitempty"`
	GroupName   string `json:"group_name"`
	Remark      string `json:"remark"`
	Color       string `json:"color"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
	SyncVersion int    `json:"sync_version"`
}

func generateID() string {
	bytes := make([]byte, 16)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

func GetConnections(userID string) ([]Connection, error) {
	var rows interface {
		Scan(dest ...interface{}) error
		Next() bool
		Close() error
	}

	var rs, err = database.DB.Query(
		`SELECT id, COALESCE(user_id,''), name, host, port, username, auth_type,
		COALESCE(password_enc,''), COALESCE(private_key,''), COALESCE(passphrase,''),
		COALESCE(group_name,'默认分组'), COALESCE(remark,''), COALESCE(color,'#3b82f6'),
		created_at, updated_at, sync_version FROM connections
		WHERE user_id IS NULL OR user_id = ? ORDER BY created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	rows = rs
	defer rows.Close()

	var connections []Connection
	rs2 := rs
	for rs2.Next() {
		var c Connection
		err := rs2.Scan(&c.ID, &c.UserID, &c.Name, &c.Host, &c.Port, &c.Username,
			&c.AuthType, &c.Password, &c.PrivateKey, &c.Passphrase,
			&c.GroupName, &c.Remark, &c.Color, &c.CreatedAt, &c.UpdatedAt, &c.SyncVersion)
		if err != nil {
			continue
		}
		if c.UserID == "" {
			c.UserID = ""
		}
		connections = append(connections, c)
	}
	return connections, nil
}

func GetConnection(id string) (*Connection, error) {
	var c Connection
	var userID string
	err := database.DB.QueryRow(
		`SELECT id, COALESCE(user_id,''), name, host, port, username, auth_type,
		COALESCE(password_enc,''), COALESCE(private_key,''), COALESCE(passphrase,''),
		COALESCE(group_name,'默认分组'), COALESCE(remark,''), COALESCE(color,'#3b82f6'),
		created_at, updated_at, sync_version FROM connections WHERE id = ?`, id,
	).Scan(&c.ID, &userID, &c.Name, &c.Host, &c.Port, &c.Username,
		&c.AuthType, &c.Password, &c.PrivateKey, &c.Passphrase,
		&c.GroupName, &c.Remark, &c.Color, &c.CreatedAt, &c.UpdatedAt, &c.SyncVersion)
	if err != nil {
		return nil, err
	}
	c.UserID = userID
	return &c, nil
}

func CreateConnection(c *Connection) error {
	if c.ID == "" {
		c.ID = generateID()
	}
	now := time.Now().Format(time.RFC3339)
	c.CreatedAt = now
	c.UpdatedAt = now
	if c.GroupName == "" {
		c.GroupName = "默认分组"
	}
	if c.Color == "" {
		c.Color = "#3b82f6"
	}
	if c.Port == 0 {
		c.Port = 22
	}

	var userID interface{}
	if c.UserID != "" {
		userID = c.UserID
	}

	// 使用INSERT OR REPLACE：如果ID已存在则替换，否则插入
	_, err := database.DB.Exec(
		`INSERT OR REPLACE INTO connections (id, user_id, name, host, port, username, auth_type,
		password_enc, private_key, passphrase, group_name, remark, color, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		c.ID, userID, c.Name, c.Host, c.Port, c.Username, c.AuthType,
		c.Password, c.PrivateKey, c.Passphrase, c.GroupName, c.Remark, c.Color,
		c.CreatedAt, c.UpdatedAt)
	return err
}

func UpdateConnection(c *Connection) error {
	c.UpdatedAt = time.Now().Format(time.RFC3339)

	var userID interface{}
	if c.UserID != "" {
		userID = c.UserID
	}

	_, err := database.DB.Exec(
		`UPDATE connections SET name=?, host=?, port=?, username=?, auth_type=?,
		password_enc=?, private_key=?, passphrase=?, group_name=?, remark=?, color=?,
		updated_at=?, user_id=? WHERE id=?`,
		c.Name, c.Host, c.Port, c.Username, c.AuthType,
		c.Password, c.PrivateKey, c.Passphrase, c.GroupName, c.Remark, c.Color,
		c.UpdatedAt, userID, c.ID)
	return err
}

func DeleteConnection(id string) error {
	_, err := database.DB.Exec(`DELETE FROM connections WHERE id = ?`, id)
	return err
}
