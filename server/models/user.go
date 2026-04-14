package models

import (
	"crypto/rand"
	"encoding/hex"
	"time"

	"newshell-server/database"

	"golang.org/x/crypto/bcrypt"
)

type User struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

func RegisterUser(username, password string) (*User, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	id := generateID()
	now := time.Now().Format(time.RFC3339)

	_, err = database.DB.Exec(
		`INSERT INTO users (id, username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
		id, username, string(hash), now, now)
	if err != nil {
		return nil, err
	}

	return &User{ID: id, Username: username, CreatedAt: now, UpdatedAt: now}, nil
}

func AuthenticateUser(username, password string) (*User, error) {
	var user User
	var hash string
	err := database.DB.QueryRow(
		`SELECT id, username, password_hash, created_at, updated_at FROM users WHERE username = ?`,
		username).Scan(&user.ID, &user.Username, &hash, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return nil, err
	}

	if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)); err != nil {
		return nil, err
	}

	return &user, nil
}

func GetUserByID(id string) (*User, error) {
	var user User
	err := database.DB.QueryRow(
		`SELECT id, username, created_at, updated_at FROM users WHERE id = ?`,
		id).Scan(&user.ID, &user.Username, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func generateUserID() string {
	bytes := make([]byte, 16)
	rand.Read(bytes)
	return hex.EncodeToString(bytes)
}

// Reuse generateID from connection.go
func init() {
	_ = generateUserID // ensure import
}
