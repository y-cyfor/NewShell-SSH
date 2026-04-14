package handlers

import (
	"bufio"
	"fmt"
	"net/http"
	"os"
	"os/user"
	"path/filepath"
	"strconv"
	"strings"

	"newshell-server/crypto_util"
	"newshell-server/models"

	"github.com/gin-gonic/gin"
)

var encKey []byte

func SetEncryptionKey(key string) {
	encKey = crypto_util.DeriveKey(key)
}

func GetConnections(c *gin.Context) {
	userID := c.GetString("userID")
	connections, err := models.GetConnections(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if connections == nil {
		connections = []models.Connection{}
	}
	c.JSON(http.StatusOK, connections)
}

func CreateConnection(c *gin.Context) {
	var conn models.Connection
	if err := c.ShouldBindJSON(&conn); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Encrypt sensitive fields
	if encKey != nil {
		if conn.Password != "" {
			if enc, err := crypto_util.Encrypt(conn.Password, encKey); err == nil {
				conn.Password = enc
			}
		}
		if conn.PrivateKey != "" {
			if enc, err := crypto_util.Encrypt(conn.PrivateKey, encKey); err == nil {
				conn.PrivateKey = enc
			}
		}
		if conn.Passphrase != "" {
			if enc, err := crypto_util.Encrypt(conn.Passphrase, encKey); err == nil {
				conn.Passphrase = enc
			}
		}
	}

	if err := models.CreateConnection(&conn); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, conn)
}

func UpdateConnection(c *gin.Context) {
	id := c.Param("id")
	var conn models.Connection
	if err := c.ShouldBindJSON(&conn); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	conn.ID = id

	// Encrypt sensitive fields
	if encKey != nil {
		if conn.Password != "" {
			if enc, err := crypto_util.Encrypt(conn.Password, encKey); err == nil {
				conn.Password = enc
			}
		}
		if conn.PrivateKey != "" {
			if enc, err := crypto_util.Encrypt(conn.PrivateKey, encKey); err == nil {
				conn.PrivateKey = enc
			}
		}
		if conn.Passphrase != "" {
			if enc, err := crypto_util.Encrypt(conn.Passphrase, encKey); err == nil {
				conn.Passphrase = enc
			}
		}
	}

	if err := models.UpdateConnection(&conn); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, conn)
}

func DeleteConnection(c *gin.Context) {
	id := c.Param("id")
	if err := models.DeleteConnection(id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// ImportSSHConfig 解析 ~/.ssh/config 并返回连接列表
func ImportSSHConfig(c *gin.Context) {
	// 获取当前用户的 SSH config 路径
	usr, err := user.Current()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to get current user"})
		return
	}

	sshDir := filepath.Join(usr.HomeDir, ".ssh")
	configPath := filepath.Join(sshDir, "config")

	// 如果 ~/.ssh/config 不存在，尝试 /etc/ssh/ssh_config
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		configPath = "/etc/ssh/ssh_config"
		if _, err := os.Stat(configPath); os.IsNotExist(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "SSH config file not found"})
			return
		}
	}

	file, err := os.Open(configPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("failed to open SSH config: %v", err)})
		return
	}
	defer file.Close()

	type sshHost struct {
		Name       string `json:"name"`
		Host       string `json:"host"`
		Port       int    `json:"port"`
		User       string `json:"user"`
		Identity   string `json:"identity"`
	}

	var hosts []sshHost
	var current *sshHost

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		parts := strings.SplitN(line, " ", 2)
		if len(parts) < 2 {
			continue
		}

		key := strings.ToLower(parts[0])
		value := strings.TrimSpace(parts[1])

		switch key {
		case "host":
			if current != nil && current.Host != "" {
				hosts = append(hosts, *current)
			}
			current = &sshHost{Name: value, Host: value, Port: 22}
		case "hostname":
			if current != nil {
				current.Host = value
			}
		case "port":
			if current != nil {
				if p, err := strconv.Atoi(value); err == nil {
					current.Port = p
				}
			}
		case "user":
			if current != nil {
				current.User = value
			}
		case "identityfile":
			if current != nil {
				current.Identity = strings.Trim(value, `"`)
			}
		}
	}

	if current != nil && current.Host != "" {
		hosts = append(hosts, *current)
	}

	if len(hosts) == 0 {
		c.JSON(http.StatusOK, gin.H{"hosts": []sshHost{}})
		return
	}

	c.JSON(http.StatusOK, gin.H{"hosts": hosts})
}
