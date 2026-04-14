package config

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"
	"path/filepath"
	"strconv"
)

type Config struct {
	Port          int
	DBPath        string
	JWTSecret     string
	EncryptionKey string
}

func Load() *Config {
	dataDir := getEnv("NEWSHELL_DATA_DIR", "")
	if dataDir == "" {
		dataDir = getDataDir()
	}
	os.MkdirAll(dataDir, 0755)

	port := 29800
	if p := os.Getenv("NEWSHELL_PORT"); p != "" {
		if v, err := strconv.Atoi(p); err == nil && v > 0 && v < 65536 {
			port = v
		}
	}

	jwtSecret := os.Getenv("NEWSHELL_JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = getOrCreateSecret(dataDir, ".jwt_secret")
	}

	encKey := os.Getenv("NEWSHELL_ENCRYPTION_KEY")
	if encKey == "" {
		encKey = getOrCreateSecret(dataDir, ".enc_key")
	}

	return &Config{
		Port:          port,
		DBPath:        filepath.Join(dataDir, "newshell.db"),
		JWTSecret:     jwtSecret,
		EncryptionKey: encKey,
	}
}

func getDataDir() string {
	home, err := os.UserHomeDir()
	if err != nil {
		log.Printf("Warning: cannot determine home directory: %v, using current directory", err)
		home = "."
	}
	return filepath.Join(home, ".newshell")
}

func generateSecret(n int) string {
	bytes := make([]byte, n)
	if _, err := rand.Read(bytes); err != nil {
		log.Fatalf("Failed to generate random secret: %v", err)
	}
	return hex.EncodeToString(bytes)
}

func getOrCreateSecret(dataDir, filename string) string {
	keyFile := filepath.Join(dataDir, filename)
	data, err := os.ReadFile(keyFile)
	if err == nil && len(data) >= 32 {
		return string(data)
	}
	key := generateSecret(32)
	os.WriteFile(keyFile, []byte(key), 0600)
	return key
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
